import {test} from "node:test";
import assert from "node:assert/strict";
import {saveCompletedPlan, sameCompletedPlan} from "../src/components/room/bass/optimiserPlan/completedPlanSave.js";
const plan={projectId:"p",versionId:"v",designFingerprint:"fp",run:{runId:"r",startedAt:"2026-11-19T10:00:00Z"},levers:{delay:{recommended:7}},applied:{delay:false}};
function fixture(overrides={}) {
  let row={id:"v",project_id:"p",design_state:{geometry:{x:1},optimiser_plan:null}};
  let writes=0;
  const args={projectId:"p",versionId:"v",plan,current:()=>true,
    readVersion:async()=>row,writePlan:async p=>{writes++; row={...row,design_state:{...row.design_state,optimiser_plan:p}}},...overrides};
  return {args, get row(){return row}, get writes(){return writes}, set row(v){row=v}};
}
test("save verifies complete plan; geometry and unapplied recommendations survive",async()=>{
 const f=fixture(); await saveCompletedPlan(f.args);
 assert.equal(f.writes,1); assert.deepEqual(f.row.design_state.geometry,{x:1});
 assert.deepEqual(f.row.design_state.optimiser_plan,plan);
});
test("exact readback is reused without any second write",async()=>{
 const f=fixture(); await saveCompletedPlan(f.args); const r=await saveCompletedPlan(f.args);
 assert.equal(r.reused,true); assert.equal(f.writes,1);
});
test("lost write acknowledgement recovers by exact readback",async()=>{
 const f=fixture(); const write=f.args.writePlan; f.args.writePlan=async p=>{await write(p);throw new Error("network acknowledgement lost")};
 const r=await saveCompletedPlan(f.args); assert.equal(r.acknowledgementRecovered,true); assert.equal(f.writes,1);
});
test("rejected write preserves exact rejection",async()=>{
 const f=fixture({writePlan:async()=>{throw new Error("403 denied")}});
 await assert.rejects(saveCompletedPlan(f.args),/403 denied/);
});
test("successful acknowledgement with missing plan is a failure",async()=>{
 const f=fixture({writePlan:async()=>{}}); await assert.rejects(saveCompletedPlan(f.args),/readback did not contain/);
});
test("timeout with successful write is recovered by readback",async()=>{
 const f=fixture({deadlineMs:5}); const write=f.args.writePlan;
 f.args.writePlan=async p=>{await write(p);return new Promise(()=>{})};
 const r=await saveCompletedPlan(f.args); assert.equal(r.acknowledgementRecovered,true);
});
test("timeout without a write remains an error",async()=>{
 const f=fixture({deadlineMs:5,writePlan:async()=>new Promise(()=>{})});
 await assert.rejects(saveCompletedPlan(f.args),/plan-version-update timed out/);
});
test("wrong version readback cannot report success or write",async()=>{
 const f=fixture({readVersion:async()=>({id:"other",project_id:"p"})});
 await assert.rejects(saveCompletedPlan(f.args),/identity does not match/);assert.equal(f.writes,0);
});
test("newer saved run is never overwritten by a retry",async()=>{
 const f=fixture();f.row.design_state.optimiser_plan={...plan,run:{runId:"new",startedAt:"2026-11-19T11:00:00Z"}};
 await assert.rejects(saveCompletedPlan(f.args),/newer optimisation/);assert.equal(f.writes,0);
});
test("design change during readback preserves failure",async()=>{
 let current=true; const f=fixture({current:()=>current});
 const write=f.args.writePlan;f.args.writePlan=async p=>{await write(p);current=false};
 await assert.rejects(saveCompletedPlan(f.args),/design changed/);
});
test("matching run ID alone cannot accept missing recommendations",()=>{
 assert.equal(sameCompletedPlan({...plan,levers:{}},plan),false);
});
