import test from "node:test";
import assert from "node:assert/strict";
import { createConfirmationPool } from "../src/components/room/bass/improveBassV2/v2ConfirmationPool.js";
import { runBoundedConfirmations } from "../src/components/room/bass/improveBassV2/runBoundedConfirmations.js";
import { V2WorkerError } from "../src/components/room/bass/improveBassV2/improveBassV2WorkerLifecycle.js";

class WorkerMock extends EventTarget {
  calls=[]; stopped=false;
  constructor(mode="ok"){super();this.mode=mode;}
  postMessage(data){
    this.calls.push(data);
    queueMicrotask(()=>{
      if(this.mode==="startup-error" || (this.mode==="job-error" && data.phase==="confirmation")){
        this.dispatchEvent(new Event("error")); return;
      }
      if(this.mode==="hang" || (this.mode==="job-hang" && data.phase==="confirmation")) return;
      this.dispatchEvent(new MessageEvent("message",{data:{requestId:data.requestId,type:"complete",result:data.value??true}}));
    });
  }
  terminate(){this.stopped=true;}
}
function pool(mode, extra={}){
  const workers=[];
  const p=createConfirmationPool({size:3,startupTimeoutMs:20,
    createWorker:()=>{const w=new WorkerMock(mode);workers.push(w);return w;},...extra});
  return {p,workers};
}
test("startup acknowledged before candidate; successful jobs run once",async()=>{
  const {p,workers}=pool("ok");
  const batch=await runBoundedConfirmations({jobs:[1,2,3,4,5],maxConcurrency:3,
    runFn:async value=>({result:await p.runConfirmation({value})})});
  assert.deepEqual(batch.results.map(r=>r.result),[1,2,3,4,5]);
  assert.equal(workers.flatMap(w=>w.calls).filter(c=>c.phase==="confirmation").length,5);
  assert.ok(workers.every(w=>w.calls[0].phase==="integration-context"));
  p.terminateAll();
});
test("early module startup error ends pool before first confirmation",async()=>{
  const {p,workers}=pool("startup-error");
  await new Promise(r=>setTimeout(r,1));
  await assert.rejects(p.ensureReady(),{name:"V2WorkerError"});
  await assert.rejects(p.runConfirmation({}),{name:"V2WorkerError"});
  assert.ok(workers.every(w=>w.stopped && w.calls.length===1));
});
test("missing startup acknowledgement is bounded",async()=>{
  const {p,workers}=pool("hang");
  await assert.rejects(p.ensureReady(),{name:"TimeoutError"});
  assert.ok(workers.every(w=>w.stopped));
});
test("fatal worker failure stops queue and never reuses dead workers",async()=>{
  const {p,workers}=pool("job-error");
  await assert.rejects(runBoundedConfirmations({jobs:Array(20).fill({}),maxConcurrency:3,
    runFn:job=>p.runConfirmation(job)}),{name:"V2WorkerError"});
  assert.ok(workers.every(w=>w.stopped));
  assert.ok(workers.flatMap(w=>w.calls).filter(c=>c.phase==="confirmation").length<=3);
});
test("pool termination settles active and queued promises",async()=>{
  const {p,workers}=pool("job-hang");
  await p.ensureReady();
  const jobs=Array.from({length:5},()=>p.runConfirmation({}));
  const settled=Promise.allSettled(jobs);
  await new Promise(r=>setTimeout(r,1));
  p.terminateAll(new V2WorkerError("test infrastructure failure"));
  assert.ok((await settled).every(r=>r.status==="rejected"&&r.reason.name==="V2WorkerError"));
  assert.ok(workers.every(w=>w.stopped));
});
test("already aborted batch dispatches nothing and settles",async()=>{
  const result=await runBoundedConfirmations({jobs:[{}],isAborted:()=>true,runFn:()=>assert.fail("dispatched")});
  assert.equal(result.stats.jobsStarted,0);
});

test("external cancellation terminates all pool workers",async()=>{
  const controller=new AbortController();
  const {p,workers}=pool("job-hang",{signal:controller.signal});
  await p.ensureReady();
  const job=p.runConfirmation({});
  const rejected=assert.rejects(job,{name:"AbortError"});
  controller.abort();
  await rejected;
  assert.ok(workers.every(w=>w.stopped));
  assert.equal(await p.acquire(),null);
});
