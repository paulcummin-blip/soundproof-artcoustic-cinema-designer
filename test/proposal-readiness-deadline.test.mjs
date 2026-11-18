import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { runReadinessRead } from '../src/components/proposal/sourceAuthority/proposalReadDeadline.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
async function moduleFor(path, mocks, jsx=false) {
  const context=vm.createContext({console:{warn(){},error(){}},setTimeout,clearTimeout});
  const code=jsx ? transformSync(read(path),{loader:'jsx',format:'esm'}).code : read(path);
  const module=new vm.SourceTextModule(code,{context});
  await module.link(name=>{
    assert.ok(name in mocks,'Unexpected import '+name);
    return new vm.SyntheticModule(Object.keys(mocks[name]),function(){
      for(const [key,value] of Object.entries(mocks[name]))this.setExport(key,value);
    },{context});
  });
  await module.evaluate();return module.namespace;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('A backend failure is named and never returned as missing evidence',async()=>{
  await assert.rejects(runReadinessRead('published engineering',async()=>({status:'read_failed',error:'503 service unavailable'}),50),
    error=>error.code==='PROPOSAL_READ_FAILED' && /published engineering.*503/.test(error.message));
});
test('A never-settling request ends with the exact operation, not a spinner',async()=>{
  await assert.rejects(runReadinessRead('completed calculation cache',()=>new Promise(()=>{}),10),
    error=>error.code==='PROPOSAL_READ_TIMEOUT' && error.operation==='completed calculation cache');
});
test('A late completion cannot replace the timeout result',async()=>{
  const pending=deferred();const run=runReadinessRead('Project Report snapshot',()=>pending.promise,10);
  await assert.rejects(run,/Project Report snapshot/);
  pending.resolve({available:true});await tick();await assert.rejects(run,/Project Report snapshot/);
});
test('Retry invalidation replaces a shared stalled calculation-cache request',async()=>{
  let reads=0;const pending=deferred();
  const mod=await moduleFor('src/components/state/projectReadCache.js',{
    '@/api/base44Client':{base44:{entities:{ProjectAnalysisCache:{filter:()=>++reads===1?pending.promise:Promise.resolve([{id:'cache-current'}])}}}}
  });
  const first=mod.readProjectAnalysisCacheRecord('p1','v1');
  await assert.rejects(runReadinessRead('completed calculation cache',()=>first,10),/calculation cache/);
  mod.invalidateProjectAnalysisCacheRead('p1','v1');
  const next=await mod.readProjectAnalysisCacheRecord('p1','v1');
  assert.equal(next.id,'cache-current');assert.equal(reads,2);
  pending.resolve([{id:'late-old'}]);await tick();
  assert.equal((await mod.readProjectAnalysisCacheRecord('p1','v1')).id,'cache-current');
});

async function readinessFixture(blocked=null) {
  const state=[],effects=[],invalidated=[];
  let failure=blocked;
  const request=(name,value)=>name===failure?new Promise(()=>{}):Promise.resolve(value);
  const project={id:'p1',active_version_id:'v1'};
  const version={id:'v1',version_name:'Original Design',published_fingerprint:'eng-current',design_state:{}};
  const report={id:'saved-report',source_fingerprints:{engineeringFingerprint:'eng-frozen'}};
  const speaker={id:'stored-speaker-pdf',source_fingerprints:{engineeringFingerprint:'eng-frozen'}};
  const authority={
    READINESS_STATE:{CHECKING:'checking'},
    resolveCalculationAuthority:()=>({fingerprint:'cal-current'}),
    resolveSavedReportCell:input=>({current:!!input.saved,state:input.saved?'current':'missing',savedId:input.saved?.id}),
    resolveVersionReadinessRow:input=>({...input,project:input.cells.project,speakerDesign:input.cells.speaker_design}),
    versionDisplayName:v=>v.version_name
  };
  const mod=await moduleFor('src/components/proposal/sourceAuthority/useProposalReadiness.js',{
    react:{useState:value=>{const i=state.length;state.push(value);return [value,next=>{state[i]=typeof next==='function'?next(state[i]):next;}];},
      useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value})},
    '@/api/base44Client':{base44:{entities:{
      Project:{filter:()=>request('project details',[project])},
      ProjectVersion:{filter:()=>request('design versions',[version])},
      ReportSnapshot:{filter:()=>request('Project Report snapshot',[report])},
      ProjectAssetExport:{filter:()=>request('Speaker Design export',[speaker])}
    }}},
    '@/components/engineering/versionedEngineeringAuthority':{
      fetchDurablePublication:(p,v,options)=>request(options?.engineeringFingerprint?'frozen engineering publication':'published engineering',{publication:{engineering_fingerprint:options?.engineeringFingerprint||'eng-current'},status:'published'}),
      invalidateDurablePublicationRead:(...args)=>invalidated.push(['publication',...args]),
      buildDurableSnapshot:()=>({}),extractEngineeringSummary:()=>({})
    },
    '@/components/report/reportSnapshotAuthority':{currentSourceFingerprints:()=>({engineeringFingerprint:'eng-current'})},
    '@/components/state/designReviewHandoff':{readSeatPriorityFingerprint:()=>null},
    '@/components/state/projectReadCache':{
      readProjectAnalysisCacheRecord:()=>request('completed calculation cache',{}),
      invalidateProjectRead:(...args)=>invalidated.push(['project',...args]),
      invalidateProjectVersionRead:(...args)=>invalidated.push(['version',...args]),
      invalidateProjectAnalysisCacheRead:(...args)=>invalidated.push(['cache',...args])
    },
    './proposalReadDeadline':{runReadinessRead:(label,read)=>runReadinessRead(label,read,15)},
    './reportSourceSignal':{subscribeReportSourceStored:()=>()=>{}},
    '@/components/report/reportSnapshotCanonical':{selectCanonicalReportSnapshotsByKey:()=>new Map([['v1::project',report]])},
    '@/lib/canonicalVersionSelection':{selectCanonicalVersions:()=>({byId:new Map([['v1',version]])})},
    '@/components/report/designIdentityComparison':{engineeringDifferenceIsPresentationOnly:()=>true,proposalEvidenceDifferenceIsSafe:()=>true},
    './proposalReadinessAuthority':authority,
    './speakerDesignChecklistReadiness':{selectStoredSpeakerDesign:()=>speaker,resolveSpeakerDesignCell:input=>({current:!!input.stored,state:'current',storedId:input.stored?.id})},
    '@/components/report/speakerDesign/speakerDesignGenerationStatus':{
      getSpeakerDesignGenerationError:()=>null,isPreparingSpeakerDesign:()=>false,subscribeSpeakerDesignGenerationStatus:()=>()=>{}
    }
  });
  const hook=mod.useProposalReadiness({projectId:'p1',versionIds:['v1']});
  effects.forEach(fn=>fn());
  return {state,hook,invalidated,rerun:()=>{failure=null;effects.at(-1)();}};
}
for(const operation of ['project details','design versions','Project Report snapshot','published engineering','completed calculation cache','Speaker Design export','frozen engineering publication']){
  test('The readiness hook releases loading and names a stalled '+operation,async()=>{
    const f=await readinessFixture(operation);await wait(35);
    assert.equal(f.state[1],false);assert.match(f.state[2],new RegExp(operation));assert.equal(f.state[0].length,0);
    f.hook.retry();
    assert.ok(f.invalidated.some(x=>x[0]==='publication'&&x[2]==='v1'));
    assert.ok(f.invalidated.some(x=>x[0]==='cache'&&x[2]==='v1'));
    f.rerun();await wait(5);
    assert.equal(f.state[1],false);assert.equal(f.state[2],null);
    assert.equal(f.state[0][0].project.savedId,'saved-report');
    assert.equal(f.state[0][0].speakerDesign.storedId,'stored-speaker-pdf');
  });
}
test('A no-row read failure renders its specific error and Retry in Step 3',async()=>{
  const mod=await moduleFor('src/components/proposal/sourceAuthority/ProjectDocumentsStatus.jsx',{
    react:{default:React},'lucide-react':{Check:()=>null,Loader2:()=>null},
    '@/components/report/typography/reportTypography':{REPORT_FONT_HEADING:'sans-serif',REPORT_FONT_BODY:'sans-serif'},
    '@/components/report/proposalReportContext':{withProposalContext:x=>x},
    '@/components/proposal/sourceAuthority/proposalReadinessAuthority':{READINESS_REPORT_LABEL:'Project Report',READINESS_STATE:{CURRENT:'current',STALE:'stale',INCOMPLETE:'incomplete',MISSING:'missing',UNAVAILABLE:'unavailable',CHECKING:'checking'},buildProjectReportAction:()=>null},
    '@/components/proposal/sourceAuthority/speakerDesignChecklistReadiness':{SPEAKER_DESIGN_LABEL:'Speaker Design'}
  },true);
  const html=renderToStaticMarkup(React.createElement(mod.default,{gate:{rows:[],checking:false,readError:'Could not read published engineering: 503'},onRetry:()=>{}}));
  assert.match(html,/role="alert"/);assert.match(html,/published engineering: 503/);assert.match(html,/Retry document check/);assert.doesNotMatch(html,/Updating/);
});
