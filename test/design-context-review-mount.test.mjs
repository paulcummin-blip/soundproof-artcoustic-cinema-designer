import {register} from 'node:module';
import assert from 'node:assert/strict';
register('./_mount-loader.mjs',import.meta.url);
const {installBrowserGlobals}=await import('../src/test/mocks/browserGlobals.mjs');installBrowserGlobals();
const cache=new Map();window.sessionStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
const {base44}=await import('../src/test/mocks/base44ClientMock.mjs');
const {contextRevision}=await import('../base44/shared/designContext/designContextPersistence.js');
const React=await import('react');const {default:Renderer,act}=await import('react-test-renderer');
const {useDesignContextReview}=await import('@/components/adi/designContext/useDesignContextReview');
const q={question_id:'q1',question:'Why?',area:'seating',decision_fingerprint:'fp1'};
const answer={...q,status:'answered',answer:'Leave space for a bar behind the seats.'};
let record=null,mode='success',discoverFail=false,release,log=[];
base44.entities={DesignContext:{filter:async()=>mode==='read-error'?Promise.reject(new Error('read failed')):record?[record]:[]}};
base44.functions={invoke:async(name,payload)=>{
log.push(name);
if(name==='discoverDesignContextQuestions'){if(discoverFail)throw Error('discovery failed');return{data:{ok:true,questions:[q],saved_items:record?.context_items||[]}};}
if(mode==='delay')await new Promise(r=>release=r);
if(mode==='throw')throw Error('save failed');
if(mode==='unsuccessful')return{data:{ok:false}};
if(mode==='unverified')return{data:{ok:true,saved:true}};
const next={id:'ctx',project_id:'proj',version_id:'v1',updated_at:'2026-11-23',context_items:payload.context_items};
if(mode!=='stale')record=next;
return{data:{ok:true,saved:true,verified:true,context_revision:contextRevision(next)}};
}};
async function mount(){let api;function Host(){api=useDesignContextReview({projectId:'proj',versionId:'v1'});return null;}
let tree;await act(async()=>{tree=Renderer.create(React.createElement(Host));});return{get api(){return api},tree};}
async function start(h){let settled=false,result;let promise;await act(async()=>{promise=h.api.review().then(r=>{settled=true;result=r;return r});});
return{promise,get settled(){return settled},get result(){return result}};}
let passed=0;function check(v,msg){assert.ok(v,msg);passed++;}
for(const failure of ['throw','unsuccessful','unverified','stale','read-error']){
record=null;mode=failure;const h=await mount();const r=await start(h);const identity=h.api.Dialog;
await act(async()=>{await h.api.proceed([answer]);});
check(!r.settled,failure+' cannot release writer');check(h.api.isReviewing,failure+' keeps dialog open');check(!!h.api.error,failure+' shows error');check(identity===h.api.Dialog,'dialog stable');check(cache.size===1,'draft retained');
mode='success';await act(async()=>{await h.api.proceed([answer]);});check(r.settled&&r.result.contextRevision===contextRevision(record),'retry confirms revision');check(cache.size===0,'draft cleared after confirmed save');act(()=>h.tree.unmount());
}
record=null;mode='delay';const h=await mount();const r=await start(h);let saving;await act(async()=>{saving=h.api.proceed([answer]);});
check(!r.settled,'delayed save blocks writer');check(h.api.Dialog().props.isSaving,'saving state visible');
await act(async()=>{await h.api.proceed([answer]);});check(!r.settled,'double click cannot bypass');
await act(async()=>{release();await saving;});check(r.result.contextRevision===contextRevision(record),'delayed success confirmed');act(()=>h.tree.unmount());
record=null;mode='throw';const a=await mount();await start(a);await act(async()=>a.api.proceed([answer]));act(()=>a.tree.unmount());
const b=await mount();const br=await start(b);check(b.api.Dialog().props.draftRows[0].answer===answer.answer,'failed draft survives reload');
mode='success';await act(async()=>b.api.proceed(b.api.Dialog().props.draftRows));check(br.settled,'reload retry resolves');
act(()=>b.tree.unmount());const c=await mount();await start(c);check(c.api.Dialog().props.savedItems[0].answer===answer.answer,'saved answer survives reload');act(()=>c.tree.unmount());
discoverFail=true;const d=await mount();const dr=await start(d);check(!dr.settled&&d.api.isReviewing,'discovery failure blocks generation');discoverFail=false;await act(async()=>d.api.proceed([]));check(!dr.settled&&!d.api.Dialog().props.isDiscovering,'discovery retry opens review');act(()=>d.tree.unmount());check((await dr.promise)===false,'unmount cancels');
record=null;mode='success';const e=await mount();const er=await start(e);log=[];await act(async()=>e.api.proceed([{...q,status:'skipped'}]));check(!log.includes('saveDesignContext'),'skip does not create context');check(er.result.contextRevision==='dc2:none','no-context revision confirmed');act(()=>e.tree.unmount());
console.log(passed+' persistence lifecycle assertions passed');
