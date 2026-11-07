import test from "node:test";
import assert from "node:assert/strict";
import { computeNormalizedRoomTransfer as calculate } from "../src/components/room/bass/normalizedRoomTransferEngine.js";
import { canUseExactRoomPreviewBatch } from "../src/components/room/bass/exactRoomPreviewBatch.js";
import { buildNormalizedPhysicsOptions } from "../src/components/room/bass/normalizedPhysicsOptionsBuilder.js";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../src/components/room/bass/bassPhysicsDefaults.js";
import { applyRoomPreviewDisplaySmoothing } from "../src/components/room/bass/roomPreviewDisplaySmoothing.js";

const input = {
 roomDims:{widthM:4.5,lengthM:6,heightM:2.4},
 rspPosition:{id:"rsp",x:2.25,y:4.82,z:1.2},
 seatingPositions:[1.65,2.25,2.85].map((x,i)=>({id:"seat-"+i,x,y:5.28,z:1.2,priority:i===2?"secondary":"primary"})),
 subsForSimulation:[{id:"sub-1",x:1.125,y:.1375,z:.3,tuning:{gainDb:0,delayMs:0,polarity:0,phaseControlDeg:0}}],
 physicsOptions:buildNormalizedPhysicsOptions(BASS_NORMALIZED_PHYSICS_DEFAULTS),
 pointsPerOctave:96,listenerSelection:{mode:"all"},
};
function compare(p) {
 const before=JSON.stringify(p),reference=calculate(p),actual=calculate({...p,useExactPreviewBatch:true});
 assert.equal(actual.status,"complete");assert.equal(actual.geometryFingerprint,reference.geometryFingerprint);
 assert.deepEqual(actual.frequencies,reference.frequencies);
 assert.deepEqual(actual.sourceLayout,reference.sourceLayout);
 assert.equal(actual.seatCurves.length,reference.seatCurves.length);
 let maximum=0;
 const curves=[[actual.rspCurve,reference.rspCurve],...actual.seatCurves.map((s,i)=>{
  const r=reference.seatCurves[i];
  assert.deepEqual([s.seatKey,s.seatIndex,s.originalSeatId],[r.seatKey,r.seatIndex,r.originalSeatId]);
  return [s.responseData,r.responseData];
 })];
 for(const [a,b] of curves){
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++){assert.equal(a[i].frequency,b[i].frequency);maximum=Math.max(maximum,Math.abs(a[i].spl-b[i].spl));}
  const sa=applyRoomPreviewDisplaySmoothing(a),sb=applyRoomPreviewDisplaySmoothing(b);
  for(let i=0;i<sa.length;i++)assert.ok(Math.abs(sa[i].spl-sb[i].spl)<1e-9);
 }
 assert.ok(maximum<1e-9,"raw solver parity "+maximum);
 assert.equal(JSON.stringify(p),before);
 return actual;
}
test("All Seats full-resolution batch matches each independent raw and once-smoothed reference curve",()=>{
 assert.ok(canUseExactRoomPreviewBatch(input.physicsOptions,input.subsForSimulation));
 const r=compare(input);assert.equal(r.frequencies.length,360);assert.equal(r.rspCurve.length,0);
});
test("121-point candidate also preserves the exact engine response",()=>compare({...input,pointsPerOctave:32}));
test("gain, signed polarity, delay and all-pass phase remain exact with multiple sources",()=>{
 compare({...input,subsForSimulation:[
 {...input.subsForSimulation[0],tuning:{gainDb:-3,delayMs:2.75,polarity:-1,phaseControlDeg:35}},
 {...input.subsForSimulation[0],id:"sub-2",x:3.1,y:5.7,z:.85,tuning:{gainDb:1.5,delayMs:.3,polarity:180,phaseAdjust:95}}]});
});
test("duplicate or absent caller IDs do not merge distinct listener coordinates",()=>{
 const r=compare({...input,seatingPositions:input.seatingPositions.map((s,i)=>({...s,id:i===2?null:"same"}))});
 assert.deepEqual(r.seatCurves.map(s=>s.seatKey),["__seat_0__","__seat_1__","__seat_2__"]);
 assert.notDeepEqual(r.seatCurves[0].responseData,r.seatCurves[1].responseData);
});
test("changed source, RSP and seat geometry cannot reuse another geometry's result",()=>{
 const first=compare(input);
 for(const change of [
 {subsForSimulation:input.subsForSimulation.map(s=>({...s,x:s.x+.12}))},
 {rspPosition:{...input.rspPosition,y:4.7}},
 {seatingPositions:input.seatingPositions.map(s=>({...s,y:s.y-.2}))},
 ])assert.notEqual(compare({...input,...change}).geometryFingerprint,first.geometryFingerprint);
});
test("mixed priority and elevation in a larger multi-source room retain all listener identities",()=>{
 compare({...input,roomDims:{widthM:6,lengthM:10,heightM:3.2},
 seatingPositions:Array.from({length:9},(_,i)=>({id:"r"+i,x:2.4+(i%3)*.6,y:4.22+Math.floor(i/3)*1.8,z:1.2+Math.floor(i/3)*.4,priority:i<6?"primary":"secondary"})),
 subsForSimulation:[{x:.9,y:.145,z:.27},{x:5.1,y:.145,z:.27},{x:.9,y:9.855,z:.9},{x:5.1,y:9.855,z:.9}].map((s,i)=>({...s,id:"s"+i,tuning:{gainDb:0,delayMs:0,polarity:0}})),
 pointsPerOctave:32});
});
test("unsupported physics and tuning take the original path without approximation",()=>{
 for(const override of [{abGlobalQScale:2},{enableModes:false},{abUseLegacyAdditiveField:true},{modalCoherenceMode:"incoherent"},{unknownFutureOption:true}]){
  const p={...input,physicsOptions:{...input.physicsOptions,...override},pointsPerOctave:8};
  assert.equal(canUseExactRoomPreviewBatch(p.physicsOptions,p.subsForSimulation),false);compare(p);
 }
 const p={...input,subsForSimulation:input.subsForSimulation.map(s=>({...s,tuning:{gainDb:"-3"}})),pointsPerOctave:8};
 assert.equal(canUseExactRoomPreviewBatch(p.physicsOptions,p.subsForSimulation),false);compare(p);
});
test("unscoped full calculation preserves RSP and per-source evidence; opt-in remains optional",()=>{
 const r=compare({...input,listenerSelection:null,pointsPerOctave:32});
 assert.equal(r.rspCurve.length,121);assert.equal(r.perSourceRspComplexTransfers.length,1);
});
