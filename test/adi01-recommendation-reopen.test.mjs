import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import Renderer, {act} from "react-test-renderer";
import { prepareStage1Context, evaluateCandidate } from "@/components/room/bass/stage1/stage1CandidateEvaluation";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS as physicsOptions } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";
import { syncStage1PlacementCache } from "@/components/room/bass/stage1/stage1PlacementPersistence";

const require=createRequire(import.meta.url);
const project="adi01-test", version="v1";
const ctx={roomDims:{widthM:4.5,lengthM:6,heightM:2.4},rspPosition:{x:2.25,y:3,z:1.2},
  seatingPositions:[{id:"s1",x:2.25,y:3,z:1.2,priority:"primary"}],physicsOptions};

// Keep the real recommendation hook, hydration, scheduler and response repair.
// Isolate the entity transport, active project and downstream product assessment.
const stubs={
  "@/api/base44Client":"export const base44={entities:{get Stage1PlacementCache(){return globalThis.adi01TestEntity}}};",
  "@/components/state/project-session":'export const useActiveProjectId=()=>"adi01-test";',
  "../stage2/useStage2PlacementOptimiser":'const idle={status:"idle"}; export const useStage2PlacementOptimiser=()=>idle;',
  "../best-layout/bestSubLayoutLiveInputs":"export const useBestSubLayoutLiveInputs=()=>null;",
};
const bundle=(await build({stdin:{resolveDir:process.cwd(),contents:`
  export {useEvaluatedPlacementRecommendations as useRec} from "@/components/room/bass/bda/useEvaluatedPlacementRecommendations";
  export {stage1PlacementController as controller} from "@/components/room/bass/stage1/stage1PlacementStore";`},
  alias:{"@":process.cwd()+"/src"}, platform:"node",format:"cjs",bundle:true,write:false,
  external:["react"],logLevel:"silent",loader:{".js":"jsx"},define:{"import.meta.env":"{}","import.meta.url":JSON.stringify(import.meta.url)},
  plugins:[{name:"fixture-boundaries",setup(b){
    b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path]}));
  }}]})).outputFiles[0].text;

test("fresh runtime reuses persisted cards; model and P14 keep discovery; one failed worker can retry",async t=>{
  const prepared=prepareStage1Context(ctx), fingerprint=prepared.fingerprint+"|rec:1,2,4";
  const results={};
  for (const [field,q] of [["one_sub_result",1],["two_sub_result",2],["four_sub_result",4]]) {
    const sources=Array.from({length:q},(_,i)=>({xNorm:(i+1)/(q+1),yNorm:i%2}));
    const candidate={id:"fixture-"+q,familyId:"RP22_C",sources};
    const {screening,responseEvidence}=evaluateCandidate(candidate,prepared,{pointsPerOctave:32,returnResponseEvidence:true});
    results[field]={quantity:q,status:"complete",candidateCount:q,aProhibitionValidation:"PASS",recommendationId:candidate.id,
      finalists:[{...candidate,screening,responseEvidence}]};
  }
  let row, reads=0, searches=0, workerStarts=0, evaluations=0, failOnce=true;
  globalThis.adi01TestEntity={
    filter:async()=>{reads++;return row?[structuredClone(row)]:[];},
    create:async p=>{row={id:"fixture",...structuredClone(p)};},
    updateMany:async(query,{$set})=>{
      for(const [k,v] of Object.entries(query)) assert.deepEqual(row[k],v);
      for(const [key,v] of Object.entries($set)){
        const parts=key.split("."),field=parts.pop();parts.reduce((o,k)=>o[k],row)[field]=structuredClone(v);
      }
      return {updated:1};
    }
  };
  assert.ok(await syncStage1PlacementCache(project,version,fingerprint,results,null,globalThis.adi01TestEntity));
  const previousWorker=globalThis.Worker;
  globalThis.Worker=class{
    constructor(){workerStarts++;this.handlers={};}
    addEventListener(name,callback){this.handlers[name]=callback;}
    postMessage(m){queueMicrotask(()=>{
      if(m.type==="init"){this.context=prepareStage1Context(m.context);this.handlers.message({data:{type:"ready",requestId:m.requestId}});return;}
      evaluations++;
      if(failOnce){failOnce=false;this.handlers.error({message:"Fixture response worker interrupted"});return;}
      const result=evaluateCandidate(m.candidate,this.context,m);
      this.handlers.message({data:{type:"complete",requestId:m.requestId,result}});
    });}
    terminate(){}
  };
  t.after(()=>{globalThis.Worker=previousWorker;delete globalThis.adi01TestEntity;});
  let view,rec;
  const start=async()=>{
    const module={exports:{}};
    new Function("require","module","exports",bundle)(require,module,module.exports);
    const {useRec,controller}=module.exports;
    controller.schedule=()=>{searches++;};
    function Panel({model,level}){
      rec=useRec({...ctx,frontSubsCfg:{model},subwooferInstances:[],appState:{activeVersionId:version,
        splConfig:{selectedP14TargetBasis:"minimum",selectedP14Level:level}}});return null;
    }
    await act(async()=>{view=Renderer.create(React.createElement(Panel,{model:null,level:null}));});
    return Panel;
  };
  const close=async()=>{await act(async()=>view.unmount());};
  const Panel=await start();
  assert.equal(rec.stage1Status,"complete");
  const original=rec.stage1Options.map(o=>o.evidenceKey);
  for(const [model,level] of [["sub2-12",2],["sub4-12",4]]){
    await act(async()=>view.update(React.createElement(Panel,{model,level})));
    assert.deepEqual(rec.stage1Options.map(o=>o.evidenceKey),original);
  }
  assert.equal(workerStarts,0);assert.equal(searches,0);await close();
  for(const copy of [row,row.completed_by_fingerprint[fingerprint]])copy.two_sub_result.finalists[0].responseEvidence=null;
  await start();
  assert.equal(rec.stage1Status,"incomplete");
  assert.match(rec.stage1Previews.repairs[2].error,/interrupted/);
  assert.equal(rec.stage1Previews.repairs[2].active,false);
  assert.deepEqual(rec.stage1Previews.previews.map(v=>v.evidenceKey),[original[0],original[2]]);
  await act(async()=>rec.stage1Previews.repairs[2].retry());
  assert.equal(rec.stage1Status,"complete");
  assert.equal(evaluations,2);assert.equal(workerStarts,2);
  await close();await start();assert.equal(rec.stage1Status,"complete");
  assert.equal(evaluations,2);assert.equal(workerStarts,2);assert.equal(searches,0);assert.ok(reads>=3);
  await close();
});
