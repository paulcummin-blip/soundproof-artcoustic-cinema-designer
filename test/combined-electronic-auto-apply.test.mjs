import test from "node:test";
import assert from "node:assert/strict";
import {clone,stable,electronicContext,prepareElectronicCandidate,completeTuning,completeCrossover,changedSettings,
executeElectronicTransaction,resultLevels} from "../src/components/room/bass/optimiseWorkflow/electronicApplication.js";
import {buildCombinedElectronicLever} from "../src/components/room/bass/optimiserPlan/combinedElectronicLever.js";

const crossover={frequencyHz:80,subwooferFrequencyHz:80,linkFrequencies:true,speakerHpSlopeDbPerOct:24,subwooferLpSlopeDbPerOct:24};
const instances=[{id:"s1",model:"SUB2-12",position:{x:1.23456789,y:0.22222222,z:0.05},bottomHeightM:0.05,rotationDeg:0,
delayMs:0,gainDb:0,phaseControlDeg:0,polarity:1},
{id:"s2",model:"SUB2-12",position:{x:3,y:5,z:0.05},bottomHeightM:0.05,rotationDeg:180,
delayMs:0,gainDb:0,phaseControlDeg:0,polarity:1}];
const context=electronicContext({subwooferInstances:instances,roomDims:{widthM:4,lengthM:5.5,heightM:2.5},
seatingPositions:[{id:"seat1",x:2,y:3,earHeightM:1.2,priority:"primary"}],rspPosition:{x:2,y:3,z:1.2},
selectedSubModel:"SUB2-12",amplifierPowerPerSubW:1000,integrationContext:{crossover,identity:"integration1",speakerSources:[{id:"L",model:"EVOLVE",x:0.5,y:0,z:1.2}]}});
const tuning=[{sourceId:"s1",delayMs:0,gainDb:0,phaseControlDeg:0,polarity:1},
{sourceId:"s2",delayMs:1.23456789,gainDb:-0.456789,phaseControlDeg:37.123456,polarity:-1}];
const candidate={candidateId:"combined1",candidateKind:"calibration",candidateOrigin:"combined-integration",
combinedFrom:{crossover:true},electronicContext:context,inputIdentity:"v2-full",baselineCacheKey:"bass-cache",
appliedTuning:tuning,crossover:{...crossover,frequencyHz:90,subwooferFrequencyHz:95,linkFrequencies:false,speakerHpSlopeDbPerOct:12}};
const args=()=>({candidate:clone(candidate),context:clone(context),inputIdentity:"v2-full",cacheKey:"bass-cache",currentCrossover:clone(crossover)});
test("complete joint payload retains raw precision and exact geometry",()=>{
 const p=prepareElectronicCandidate(args());assert.equal(p.ok,true);
 assert.equal(p.instances[1].delayMs,tuning[1].delayMs);assert.equal(p.instances[1].phaseControlDeg,tuning[1].phaseControlDeg);
 assert.deepEqual(p.instances.map(s=>s.position),instances.map(s=>s.position));
 assert.deepEqual(p.crossover,candidate.crossover);
});
for(const [label,mutate] of [
 ["submillimetre geometry",a=>a.context.instances[0].position.x+=0.000001],
 ["orientation",a=>a.context.instances[0].rotationDeg=0.0001],
 ["height",a=>a.context.instances[0].bottomHeightM+=0.0001],
 ["model",a=>a.context.instances[0].model="SUB4-12"],
 ["seat position",a=>a.context.seatingPositions[0].y+=0.001],
 ["seat priority",a=>a.context.seatingPositions[0].priority="secondary"],
 ["RSP",a=>a.context.rspPosition.x+=0.001],
 ["amplifier",a=>a.context.amplifierPowerPerSubW=500],
 ["room",a=>a.context.roomDims.widthM+=0.001],
 ["main speaker",a=>a.context.integrationContext.speakerSources[0].model="OTHER"],
 ["V2 fingerprint",a=>a.inputIdentity="different"],
 ["cache fingerprint",a=>a.cacheKey="different"],
 ["missing fingerprint",a=>a.inputIdentity=""],
 ["missing receipt",a=>delete a.candidate.electronicContext],
 ["physical marker",a=>a.candidate.isPositionCandidate=true],
 ["seating marker",a=>a.candidate.seatingOffsetMm=1],
 ["duplicate IDs",a=>a.candidate.appliedTuning[1].sourceId="s1"],
 ["null gain",a=>a.candidate.appliedTuning[1].gainDb=null],
 ["missing phase",a=>delete a.candidate.appliedTuning[1].phaseControlDeg],
 ["nonfinite delay",a=>a.candidate.appliedTuning[1].delayMs=NaN],
 ["missing slope",a=>delete a.candidate.crossover.subwooferLpSlopeDbPerOct],
 ["null slope",a=>a.candidate.crossover.speakerHpSlopeDbPerOct=null],
 ["missing linking",a=>delete a.candidate.crossover.linkFrequencies],
 ["missing independent frequency",a=>delete a.candidate.crossover.subwooferFrequencyHz],
])test(label+" rejects the complete application",()=>{const a=args();mutate(a);assert.equal(prepareElectronicCandidate(a).ok,false);});
test("tuning-only preserves complete crossover",()=>{const a=args();delete a.candidate.crossover;delete a.candidate.combinedFrom;const p=prepareElectronicCandidate(a);assert.equal(p.ok,true);assert.deepEqual(p.crossover,crossover);});
test("combined winner retained even when incomplete, never actionable",()=>{
 const winner=clone(candidate);delete winner.crossover.speakerHpSlopeDbPerOct;
 const lever=buildCombinedElectronicLever({winner,instances,identity:{inputIdentity:"v2-full",cacheKey:"bass-cache",electronicContext:context},currentCrossover:crossover});
 assert.ok(lever);assert.equal(lever.actionable,false);assert.deepEqual(lever.confirmedCandidate,winner);
});
test("combined winner retains candidate-owned context, not current instances",()=>{
 const changed=clone(instances);changed[0].position.x=9;
 const lever=buildCombinedElectronicLever({winner:candidate,instances:changed,identity:{inputIdentity:"v2-full",cacheKey:"bass-cache",electronicContext:{...context,instances:changed}},currentCrossover:crossover});
 assert.equal(lever.actionable,false);assert.deepEqual(lever.sourceIdentity,instances);
});
test("report excludes unchanged settings and includes slopes and linking",()=>{
 const p=prepareElectronicCandidate(args()),rows=changedSettings(p.before,p);
 assert.ok(rows.some(r=>r.label==="Speaker high-pass slope"));
 assert.ok(rows.some(r=>r.label==="Crossover frequencies"));
 assert.ok(!rows.some(r=>r.label==="Sub 1 · Gain"));
});
test("Level comparison reads canonical levels including missing secondary",()=>{
 assert.deepEqual(resultLevels({achievedP19Level:"L4",perSeatP20:[{isPrimary:true,level:"L2"}]}),{p19:4,primary:2,secondary:null});
});
function harness(failAt){
 const p=prepareElectronicCandidate(args()),before=p.before,after={instances:p.instances,crossover:p.crossover};
 let saved=clone(before),live=clone(before),verified=false;
 const events=[];
 const receipt={runId:"run1",before,after};
 const io={
 before,after,receipt,guard:()=>failAt!=="stale",
 persist:async(settings,r)=>{events.push("save:"+r.status);saved={...clone(settings),receipt:clone(r)};if(failAt==="save"&&r.status==="verifying")throw Error("ambiguous save");},
 readback:async()=>{events.push("read");if(failAt==="receipt"&&saved.receipt?.status==="verified")return {...saved,receipt:null};return clone(saved);},
 commit:(settings,r)=>{events.push("commit:"+r.status);live=clone(settings);if(r.status==="verified")assert.equal(verified,true);},
 verify:async(settings,restoring)=>{events.push(restoring?"verify:rollback":"verify");if(restoring)return true;if(failAt==="verify")return false;verified=true;return {fingerprint:"new-cache",levels:{p19:4,primary:3,secondary:2}};}
 };
 return {io,events,state:()=>({saved,live,verified})};
}
test("applied receipt follows atomic save, readback and canonical verification",async()=>{
 const h=harness();const r=await executeElectronicTransaction(h.io);
 assert.equal(r.status,"verified");
 assert.deepEqual(h.events,["save:verifying","read","commit:verifying","verify","save:verified","read","commit:verified"]);
 assert.deepEqual(h.state().saved.instances,h.io.after.instances);
});
for(const failure of ["save","verify","receipt"])test(failure+" failure restores the complete prior pair",async()=>{
 const h=harness(failure);await assert.rejects(()=>executeElectronicTransaction(h.io));
 assert.deepEqual(h.state().saved.instances,h.io.before.instances);
 assert.deepEqual(h.state().saved.crossover,h.io.before.crossover);
 assert.deepEqual(h.state().live,h.io.before);
 assert.ok(!h.events.includes("commit:verified"));
});
test("stale identity writes nothing",async()=>{const h=harness("stale");await assert.rejects(()=>executeElectronicTransaction(h.io));assert.equal(h.events.length,0);});
