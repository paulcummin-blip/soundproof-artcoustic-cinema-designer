import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
let source = await fs.readFile(new URL("../src/components/state/conditionalDesignSave.js", import.meta.url), "utf8");
source = source.replace(/import \{ base44 \}[^\n]+\n/, "const base44 = {};\n").replace(/import \{ stableStringify \}[^\n]+\n/, "const stableStringify = v => JSON.stringify(v);\n");
const {saveDesignConditionally, saveSharedConditionally, assertDesignUnchanged, DESIGN_CONFLICT} =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const copy = v => structuredClone(v);
function fixture() {
  const rows = {
    Project:{id:"p", account_id:"a", updated_date:"1", room_width:4},
    ProjectVersion:{id:"v", project_id:"p", account_id:"a", updated_date:"1", design_state:{seats:4, screen:55}}
  };
  const baseline = () => ({project:copy(rows.Project),version:copy(rows.ProjectVersion)});
  let seq=1, calls=0, beforeWrite=null, lost=false, failed=false;
  const entities = Object.fromEntries(Object.keys(rows).map(kind=>[kind,{
    filter:async()=>[copy(rows[kind])],
    updateMany:async(query,update)=>{
      calls++;
      if(beforeWrite){const fn=beforeWrite;beforeWrite=null;await fn(rows[kind]);}
      if(failed){failed=false;throw new Error("offline");}
      if(Object.entries(query).some(([k,v])=>rows[kind][k]!==v)) return {updated:0};
      rows[kind]={...rows[kind],...copy(update.$set),updated_date:String(++seq)};
      if(lost){lost=false;throw new Error("lost reply");}
      return {updated:1};
    }
  }]));
  return {rows,baseline,client:{entities},get calls(){return calls;},
    race(fn){beforeWrite=fn;},loseReply(){lost=true;},fail(){failed=true;}};
}
test("ordinary saves advance the loaded baseline without a schema field",async()=>{
 const f=fixture(), b=f.baseline();
 await saveDesignConditionally(b,{seats:5,screen:55},()=>{},f.client);
 await saveDesignConditionally(b,{seats:5,screen:60},()=>{},f.client);
 assert.deepEqual(f.rows.ProjectVersion.design_state,{seats:5,screen:60}); assert.equal(f.calls,2);
});
test("stale full state is rejected and the newer design survives",async()=>{
 const f=fixture(), a=f.baseline(), b=f.baseline();
 await saveDesignConditionally(b,{seats:6,screen:55},()=>{},f.client);
 await assert.rejects(saveDesignConditionally(a,{seats:4,screen:65},()=>{},f.client),{code:DESIGN_CONFLICT});
 assert.equal(f.rows.ProjectVersion.design_state.seats,6);assert.equal(f.calls,1);
});
test("a change between read and write loses the atomic claim",async()=>{
 const f=fixture(),b=f.baseline();
 f.race(row=>{row.updated_date="2";row.design_state={seats:6,screen:55};});
 await assert.rejects(saveDesignConditionally(b,{seats:4,screen:65},()=>{},f.client),{code:DESIGN_CONFLICT});
 assert.equal(f.rows.ProjectVersion.design_state.seats,6);
});
test("two concurrent callers cannot both replace the same revision",async()=>{
 const f=fixture(),a=f.baseline(),b=f.baseline();
 const results=await Promise.allSettled([
 saveDesignConditionally(a,{seats:5,screen:55},()=>{},f.client),
 saveDesignConditionally(b,{seats:4,screen:65},()=>{},f.client)]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.find(x=>x.status==="rejected").reason.code,DESIGN_CONFLICT);
});
test("lost successful reply reconciles without duplicate writing",async()=>{
 const f=fixture(),b=f.baseline(); f.loseReply();
 await saveDesignConditionally(b,{seats:5,screen:55},()=>{},f.client);
 assert.equal(f.calls,1);assert.equal(b.version.design_state.seats,5);
});
test("definite failure permits safe retry",async()=>{
 const f=fixture(),b=f.baseline();f.fail();
 await assert.rejects(saveDesignConditionally(b,{seats:5,screen:55},()=>{},f.client),/offline/);
 await saveDesignConditionally(b,{seats:5,screen:55},()=>{},f.client);
 assert.equal(f.rows.ProjectVersion.design_state.seats,5);
});
test("metadata-only version changes do not invalidate the design",async()=>{
 const f=fixture(),b=f.baseline();f.rows.ProjectVersion.version_name="Renamed";f.rows.ProjectVersion.updated_date="7";
 await saveDesignConditionally(b,{seats:5,screen:55},()=>{},f.client);
 assert.equal(f.rows.ProjectVersion.version_name,"Renamed");
});
test("scope changes abort before any write",async()=>{
 const f=fixture(),b=f.baseline();
 await assert.rejects(saveDesignConditionally(b,{seats:5},()=>{throw new Error("scope changed");},f.client),/scope changed/);
 assert.equal(f.calls,0);
});
test("wrong account or project is rejected",async()=>{
 for(const key of ["account_id","project_id"]){
 const f=fixture(),b=f.baseline();f.rows.ProjectVersion[key]="other";
 await assert.rejects(saveDesignConditionally(b,{seats:5},()=>{},f.client),{code:DESIGN_CONFLICT});assert.equal(f.calls,0);}
});
test("ADI preflight rejects an external design change before writing settings",async()=>{
 const f=fixture(),b=f.baseline();f.rows.ProjectVersion.design_state.seats=6;
 await assert.rejects(assertDesignUnchanged(b,"p","v",f.client),{code:DESIGN_CONFLICT});assert.equal(f.calls,0);
});
test("shared room updates are conditional too",async()=>{
 const f=fixture(),a=f.baseline(),b=f.baseline();
 await saveSharedConditionally(b,{room_width:5},()=>{},f.client);
 await assert.rejects(saveSharedConditionally(a,{room_width:6},()=>{},f.client),{code:DESIGN_CONFLICT});
 assert.equal(f.rows.Project.room_width,5);
});
test("a conflict after a shared save identifies the partial outcome",async()=>{
 const f=fixture(),b=f.baseline();
 await saveSharedConditionally(b,{room_width:5},()=>{},f.client);
 f.rows.ProjectVersion.design_state.seats=6;
 await assert.rejects(saveDesignConditionally(b,{seats:4,screen:65},()=>{},f.client),/Shared room changes.*already completed/);
});
test("repeated Retry never overwrites a latched conflict",async()=>{
 const f=fixture(),b=f.baseline();f.rows.ProjectVersion.design_state.seats=6;
 for(let i=0;i<3;i++)await assert.rejects(saveDesignConditionally(b,{seats:4,screen:65},()=>{},f.client),{code:DESIGN_CONFLICT});
 assert.equal(f.calls,0);
});
