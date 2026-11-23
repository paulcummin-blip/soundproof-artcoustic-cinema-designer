import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseContextItems,mergeContextItems,buildContextRecord} from '../base44/shared/designContext/designContextModel.js';
import {contextRevision,persistedContextContains,readContextRecord} from '../base44/shared/designContext/designContextPersistence.js';
const source=readFileSync('base44/functions/saveDesignContext/entry.ts','utf8').replace(/^import[\s\S]*?from '[^']+';\n/gm,'').replace('export default async function(req)','return async function(req)');
let record,mode,writeCount=0,checks=0;
const user={id:'u',email:'test@example.com'};
const base44={auth:{me:async()=>user},entities:{Project:{get:async()=>({id:'p',account_id:'acct'})},ProjectVersion:{get:async()=>({id:'v',project_id:'p'})},DesignContext:{
filter:async()=>mode==='malformed'?{}:{items:record?[record]:[]},
create:async data=>{writeCount++;if(mode==='throw')throw Error('network failure');if(mode==='unsuccessful')return{ok:false};if(mode==='no-readback')return{id:'ctx'};record={id:'ctx',...data};return record},
update:async(id,data)=>{writeCount++;if(mode==='throw')throw Error('network failure');if(mode==='unsuccessful')return{ok:false};if(mode==='stale')return{id};record={...record,...data};return record}
}}};
const handler=new Function('createClientFromRequest','resolveAccountAccess','normaliseContextItems','mergeContextItems','buildContextRecord','contextRevision','persistedContextContains','readContextRecord',source)(()=>base44,async()=>({allowed:true,capabilities:{soundProof:true}}),normaliseContextItems,mergeContextItems,buildContextRecord,contextRevision,persistedContextContains,readContextRecord);
const saved={question_id:'saved',question:'Why retain?',area:'seating',status:'answered',answer:'Keep access to the door.',decision_fingerprint:'fp0'};
const answer={question_id:'new',question:'Why here?',area:'subwoofers',status:'answered',answer:'The front and rear locations are intended to moderate room modes.',decision_fingerprint:'fp1'};
const call=()=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({project_id:'p',version_id:'v',context_items:[answer]})}));
for(mode of ['throw','unsuccessful','stale','malformed']){record={id:'ctx',project_id:'p',version_id:'v',context_items:[saved],updated_at:'old'};const response=await call();assert.ok(response.status>=400,mode);checks++;assert.ok(!(await response.json()).verified,mode);checks++;}
mode='no-readback';record=null;assert.equal((await call()).status,409);checks++;
mode='success';record={id:'ctx',project_id:'p',version_id:'v',context_items:[saved],updated_at:'old'};const response=await call(),data=await response.json();assert.equal(response.status,200);checks++;assert.equal(data.context_revision,contextRevision(record));checks++;assert.equal(data.verified,true);checks++;assert.ok(record.context_items.some(i=>i.answer===saved.answer));checks++;assert.ok(record.context_items.some(i=>i.answer===answer.answer));checks++;
for(const bad of [undefined,{}, {ok:false}, {items:[{id:'wrong',project_id:'other',version_id:'v',context_items:[]}]}]){
await assert.rejects(()=>readContextRecord({DesignContext:{filter:async()=>bad}},'p','v'));checks++;
}
console.log(checks+' actual save-handler and read-back assertions passed (isolated in-memory records only)');
