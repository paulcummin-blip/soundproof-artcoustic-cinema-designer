import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { Worker as NodeWorker } from 'node:worker_threads';
import { once } from 'node:events';

// Execute the real worker/controller modules. Only the expensive engine is
// substituted for deliberate error/cancel injection in the routing matrix.
// The final test also runs the unmodified engine in a real worker thread.
const workerPath = 'src/components/room/bass/stage1/stage1Placement.worker.js';
const workerBundle = (await build({entryPoints:[workerPath],bundle:true,write:false,format:'iife',platform:'node',plugins:[{
  name:'isolated-acoustic-fixture',setup(b){
    b.onResolve({filter:/stage1PlacementEngine$/},()=>({path:'engine',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const runFullStage1Search = args => globalThis.runFixture(args);'}));
  }
}]})).outputFiles[0].text;
const storeBundle = (await build({entryPoints:['src/components/room/bass/stage1/stage1PlacementStore.js'],bundle:true,write:false,format:'iife',globalName:'store',platform:'node',define:{'import.meta.url':JSON.stringify(new URL('../src/components/room/bass/stage1/stage1PlacementStore.js',import.meta.url).href)},plugins:[{
  name:'no-external-persistence',setup(b){
    b.onResolve({filter:/stage1PlacementPersistence$/},()=>({path:'persistence',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const syncStage1PlacementCache = async () => {};'}));
  }
}]})).outputFiles[0].text;
const job = (id='A',fp='fp-A')=>({requestId:id,generationId:id,fingerprint:fp,payload:{roomDims:{widthM:3,lengthM:4,heightM:2.4},rspPosition:{x:1.5,y:2.5,z:1.2},seatingPositions:[]}});
function workerModule(runFixture=()=>({results:{two_sub_result:{fixture:true}}})) {
  const messages=[],self={postMessage:m=>messages.push(m)};
  vm.runInNewContext(workerBundle,{self,runFixture});
  return {self,messages,send:data=>self.onmessage({data})};
}
function controllerFixture() {
  const workers=[],publications=[];
  class Worker {
    constructor(){this.terminated=false;this.messages=[];workers.push(this);}
    postMessage(m){if(this.throwPost)throw Error('post failure');assert.equal(this.terminated,false);this.messages.push(m);}
    terminate(){this.terminated=true;}
    emit(type='complete',data={}){const request=this.messages.findLast(m=>!m.type);this.onmessage({data:{...request,type,result:{results:{two_sub_result:{id:request.requestId}}},...data}});}
  }
  const ctx=vm.createContext({Worker,URL,performance,setTimeout,clearTimeout});
  vm.runInContext(storeBundle,ctx);
  const {stage1PlacementController:c,getStage1State:get,subscribeStage1,markStage1Updating}=ctx.store;
  c.persist=(...args)=>publications.push(args);
  const start=(fp='fp-A',projectId='isolated')=>{markStage1Updating(projectId,fp);c.start({projectId,fingerprint:fp,payload:job().payload});return c.worker;};
  return {c,get,start,workers,publications,subscribeStage1};
}
const nap=ms=>new Promise(r=>setTimeout(r,ms));

test('A: actual module first complete then second complete on the same dispatcher',()=>{
  const w=workerModule(),handler=w.self.onmessage;
  w.send(job());w.send(job('B','fp-B'));
  assert.equal(w.self.onmessage,handler);
  assert.deepEqual(w.messages.map(x=>[x.requestId,x.type]),[['A','complete'],['B','complete']]);
});
test('B/E: job-owned cancellation resets; late A cancel during B cannot cancel B',()=>{
  let n=0,w;
  w=workerModule(({generationId})=>{n++;w.send({type:'cancel',requestId:'A'});assert.equal(generationId.cancelled,n===1);return {results:{}};});
  w.send(job());w.send(job('B'));
  assert.deepEqual(w.messages.map(x=>[x.requestId,x.type]),[['A','cancelled'],['B','complete']]);
});
test('F: actual module error settles; next valid request completes',()=>{
  let n=0;const w=workerModule(()=>{if(n++===0)throw Error('deliberate fixture failure');return {results:{}};});
  w.send(job());w.send(job('B'));
  assert.equal(w.messages[0].type,'error');assert.match(w.messages[0].error,/deliberate/);assert.equal(w.messages[1].type,'complete');
});
test('control messages are not jobs; valid following request still completes',()=>{
  const w=workerModule();w.send({type:'cancel',requestId:'old'});w.send(job());w.send({type:'cancel',requestId:'A'});w.send(job('B'));
  assert.deepEqual(w.messages.map(x=>x.type),['complete','complete']);
});
test('A/H: controller reuses completed live worker and publishes once per request',()=>{
  const x=controllerFixture(),a=x.start();a.emit();const b=x.start('fp-B');assert.equal(a,b);b.emit();b.emit();
  assert.equal(x.get('isolated').status,'complete');assert.equal(x.publications.length,2);assert.equal(x.workers.length,1);x.c.dispose();assert.equal(a.terminated,true);
});
test('C/G/H: three Cancel restore restart cycles replace terminated workers without duplicate publication',()=>{
  const x=controllerFixture();
  for(let i=0;i<3;i++){
    const a=x.start(),oldRequest=a.messages[0];x.c.cancelActive();
    assert.equal(a.terminated,true);assert.equal(x.c.worker,null);assert.equal(x.c.activeRequest,null);
    assert.equal(x.get('isolated').status,'cancelled');assert.equal(x.get('isolated').isUpdating,false);
    const b=x.start();assert.notEqual(a,b);a.emit('complete',oldRequest);assert.equal(x.get('isolated').status,'updating');b.emit();b.emit();assert.equal(x.get('isolated').status,'complete');
  }
  assert.equal(x.publications.length,3);assert.equal(x.workers.length,4);x.c.dispose();assert.ok(x.workers.every(w=>w.terminated));
});
test('D: latest scheduled request terminates active A; old progress, completion, error cannot publish over B',async()=>{
  const x=controllerFixture(),a=x.start();
  x.c.schedule({projectId:'new-project',fingerprint:'fp-B',payload:job().payload,delay:0});
  assert.equal(a.terminated,true);assert.equal(x.get('isolated').status,'stale');await nap(20);
  const b=x.c.worker;assert.notEqual(a,b);
  a.emit('progress');a.emit('complete');a.onerror({message:'late error A'});
  assert.equal(x.get('new-project').status,'updating');assert.ok(x.c.activeRequest);
  b.emit();assert.equal(x.publications.length,1);assert.equal(x.get('new-project').status,'complete');x.c.dispose();
});
test('fingerprint and request checks reject stale terminal messages',()=>{
  const x=controllerFixture(),w=x.start();w.emit('complete',{fingerprint:'old'});w.emit('complete',{requestId:'old'});
  assert.equal(x.publications.length,0);assert.equal(x.get('isolated').status,'updating');w.emit();assert.equal(x.publications.length,1);x.c.dispose();
});
test('matching cancelled terminal releases controller and ends updating',()=>{
  const x=controllerFixture(),w=x.start();w.emit('cancelled');assert.equal(x.get('isolated').status,'cancelled');assert.equal(x.get('isolated').isUpdating,false);assert.equal(x.c.activeRequest,null);
  assert.equal(x.start(),w);w.emit();assert.equal(x.get('isolated').status,'complete');x.c.dispose();
});
test('F: worker-reported job error allows live-worker reuse',()=>{
  const x=controllerFixture(),w=x.start();w.emit('error',{error:'fixture error'});assert.equal(x.get('isolated').status,'error');assert.equal(x.c.activeRequest,null);
  assert.equal(x.start(),w);w.emit();assert.equal(x.get('isolated').status,'complete');x.c.dispose();
});
test('F/G: fatal worker error is retired; replacement succeeds',()=>{
  const x=controllerFixture(),w=x.start();w.onerror({message:'fatal worker failure'});assert.equal(x.get('isolated').status,'error');assert.equal(w.terminated,true);assert.equal(x.c.worker,null);
  const b=x.start();assert.notEqual(b,w);b.emit();assert.equal(x.get('isolated').status,'complete');x.c.dispose();
});
test('postMessage failure settles error and does not retain unusable worker',()=>{
  const x=controllerFixture(),w=x.start();w.emit();w.throwPost=true;x.start();assert.equal(x.get('isolated').status,'error');assert.equal(w.terminated,true);assert.equal(x.c.worker,null);
  x.start().emit();assert.equal(x.get('isolated').status,'complete');x.c.dispose();
});
test('pending request cancellation and supersession settle without starting obsolete work',async()=>{
  const x=controllerFixture();x.c.schedule({projectId:'pending',fingerprint:'fp-A',payload:job().payload,delay:25});x.c.cancelActive();await nap(35);
  assert.equal(x.workers.length,0);assert.equal(x.get('pending').status,'cancelled');assert.equal(x.get('pending').isUpdating,false);
  x.c.schedule({projectId:'pending',fingerprint:'fp-A',payload:job().payload,delay:25});x.c.schedule({projectId:'replacement',fingerprint:'fp-B',payload:job().payload,delay:0});await nap(35);
  assert.equal(x.get('pending').status,'stale');assert.equal(x.workers.length,1);x.c.worker.emit();assert.equal(x.publications.length,1);x.c.dispose();
});
test('real worker thread and full acoustic engine complete two queued jobs on one worker', {timeout:60000}, async()=>{
  const url=new URL('../'+workerPath,import.meta.url).href;
  const w=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:m=>parentPort.postMessage(m)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'});}).catch(e=>{throw e;});`,{eval:true,execArgv:['--import',new URL('./_alias-register.mjs',import.meta.url).href]});
  try{
    const ready=await once(w,'message');assert.equal(ready[0].type,'ready');
    const received=[];w.on('message',m=>received.push(m));
    w.postMessage(job());w.postMessage(job('B','fp-B'));w.postMessage({type:'cancel',requestId:'A'});
    while(received.length<2)await once(w,'message');
    assert.deepEqual(received.map(x=>[x.requestId,x.type]),[['A','complete'],['B','complete']]);
    for(const result of received)for(const key of ['one_sub_result','two_sub_result','four_sub_result'])assert.ok(result.result.results[key].finalists.length>0,key);
  }finally{await w.terminate();}
});
