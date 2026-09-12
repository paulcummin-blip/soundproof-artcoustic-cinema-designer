import test from "node:test";
import assert from "node:assert/strict";
import { resumWithTuning } from "../src/components/room/bass/stage2/stage2TuningSearch.js";
import { applyCalibrationTuning, bindTuningToSourceIds, isCalibrationApplied } from "../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js";
import { buildOptimisedInstances, isOptimisedApplied } from "../src/components/room/bass/improveBassV2/improveBassV2Apply.js";
import { computeV2DesignFingerprint } from "../src/components/room/bass/improveBassV2/improveBassV2Fingerprint.js";
const near=(a,b,e=1e-12)=>assert.ok(Math.abs(a-b)<=e, String(a)+" != "+String(b));
const freqs=[25,50,100], base=(id,phase=0)=>({seatId:"rsp",sourceId:id,points:freqs.map(f=>({frequency:f,re:Math.cos(phase),im:Math.sin(phase)}))});
const t=(delayMs=0,gainDb=0,polarity=0)=>({delayMs,gainDb,polarity});
const sum=(sources,tuning)=>resumWithTuning(sources,tuning,["rsp"]).rsp;
test("positive delay is analytic phase lag, with invariant single-source magnitude",()=>{
 const r=sum([base("a")],[t(5)]);
 freqs.forEach((f,i)=>{near(r._sumRe[i],Math.cos(-2*Math.PI*f*.005));near(r._sumIm[i],Math.sin(-2*Math.PI*f*.005));near(r.splDb[i],0);});
});
test("two identical sources: known delay gives quadrature, cancellation and addition",()=>{
 const r=sum([base("a"),base("b")],[t(),t(10)]);
 near(r._sumRe[0],1);near(r._sumIm[0],-1);near(r.splDb[0],10*Math.log10(2));
 near(Math.hypot(r._sumRe[1],r._sumIm[1]),0);assert.equal(r.splDb[1],-200);
 near(r._sumRe[2],2);near(r.splDb[2],20*Math.log10(2));
});
test("common added delay rotates the sum without changing magnitude, including a null",()=>{
 const a=sum([base("a"),base("b")],[t(),t(10)]),b=sum([base("a"),base("b")],[t(3),t(13)]);
 freqs.forEach((f,i)=>{const c=Math.cos(-2*Math.PI*f*.003),s=Math.sin(-2*Math.PI*f*.003);near(b._sumRe[i],a._sumRe[i]*c-a._sumIm[i]*s);near(b._sumIm[i],a._sumRe[i]*s+a._sumIm[i]*c);near(b.splDb[i],a.splDb[i]);});
});
test("normal and both supported inverted polarity encodings agree",()=>{
 for(const pol of [-1,180]){const r=sum([base("a"),base("b")],[t(),t(0,0,pol)]);r.splDb.forEach(v=>assert.equal(v,-200));}
 assert.deepEqual(sum([base("a")],[t(0,0,1)]),sum([base("a")],[t()]));
});
test("gain applies once with simultaneous delay and polarity",()=>{
 const r=sum([base("a",.3)],[t(7,-6,-1)]),g=-(10**(-6/20));
 freqs.forEach((f,i)=>{const a=.3-2*Math.PI*f*.007;near(r._sumRe[i],g*Math.cos(a));near(r._sumIm[i],g*Math.sin(a));near(r.splDb[i],-6);});
});
const instances=[
 {id:"rear",model:"SUB3-12",position:{x:2,y:5,z:.4},bottomHeightM:.15,rotationDeg:180,enabled:true,delayMs:1,gainDb:0,polarity:1,legacyGroup:"rear"},
 {id:"off",model:"SUB4-12",position:{x:3,y:4},bottomHeightM:.6,rotationDeg:90,enabled:false,delayMs:8,gainDb:-2,polarity:-1,tuningSource:"manual",custom:"keep"},
 {id:"front",model:"SUB2-12",position:{x:1,y:.2,z:.3},bottomHeightM:.05,rotationDeg:0,enabled:true,delayMs:0,gainDb:0,polarity:1,legacyGroup:"front"}
];
const tuning=bindTuningToSourceIds([t(9,-2,-1),t(3,-1,0)],["front","rear"]);
test("calibration-only Apply maps by ID and preserves every non-tuning field and disabled instance",()=>{
 const before=JSON.stringify(instances),out=applyCalibrationTuning(instances,tuning);
 assert.equal(JSON.stringify(instances),before);assert.deepEqual(out.map(x=>x.id),instances.map(x=>x.id));assert.equal(out[1],instances[1]);
 for(const original of instances.filter(i=>i.enabled)){const updated=out.find(i=>i.id===original.id);for(const k of Object.keys(original).filter(k=>!["delayMs","gainDb","polarity"].includes(k)))assert.deepEqual(updated[k],original[k]);}
 assert.equal(out.find(i=>i.id==="front").delayMs,9);assert.equal(out.find(i=>i.id==="rear").delayMs,3);assert.ok(isCalibrationApplied(out,tuning));
});
test("repeated calibration Apply is idempotent",()=>{const once=applyCalibrationTuning(instances,tuning);assert.deepEqual(applyCalibrationTuning(once,tuning),once);});
const winner={candidateId:"confirmed",coordinates:[{x:1.2,y:.2},{x:2.2,y:5}],appliedTuning:tuning};
test("position Apply preserves products, rotations, height, seats-independent metadata and disabled state",()=>{
 const before=JSON.stringify(instances),out=buildOptimisedInstances(winner,instances,{widthM:6,lengthM:6},"SUB4-12");
 assert.equal(JSON.stringify(instances),before);assert.deepEqual(out.map(s=>s.id),instances.map(s=>s.id));assert.equal(out[1],instances[1]);
 for(const original of instances.filter(i=>i.enabled)){const updated=out.find(i=>i.id===original.id);for(const k of ["model","rotationDeg","bottomHeightM","enabled","legacyGroup"])assert.deepEqual(updated[k],original[k]);assert.equal(updated.position.z,original.position.z);}
 assert.equal(out.find(i=>i.id==="front").position.x,1.2);assert.equal(out.find(i=>i.id==="rear").position.x,2.2);assert.ok(isOptimisedApplied(out,winner));
 assert.deepEqual(buildOptimisedInstances(winner,out,{widthM:6,lengthM:6},"SUB4-12"),out);
});
test("reordered arrays retain ID-to-position and ID-to-tuning mapping",()=>{
 const a=buildOptimisedInstances(winner,instances),b=buildOptimisedInstances(winner,[...instances].reverse());
 assert.deepEqual([...a].sort((a,b)=>a.id.localeCompare(b.id)),[...b].sort((a,b)=>a.id.localeCompare(b.id)));
});
test("missing, duplicate or incompatible source IDs fail closed",()=>{
 assert.throws(()=>bindTuningToSourceIds([t(),t()],["a","a"]));
 assert.throws(()=>applyCalibrationTuning(instances,[{...t(),sourceId:"missing"},{...t(),sourceId:"front"}]));
 assert.throws(()=>buildOptimisedInstances({...winner,coordinates:[{x:0,y:0}]},instances));
});
test("same stored numbers with changed provenance cannot reuse a V2 result",()=>{
 const p={subwooferInstances:instances,roomDims:{widthM:6,lengthM:6,heightM:2.4},seatingPositions:[],rspPosition:{x:3,y:4,z:1.2}};
 assert.notEqual(computeV2DesignFingerprint(p),computeV2DesignFingerprint({...p,subwooferInstances:instances.map(i=>({...i,tuningSource:"v2-optimised"}))}));
});
test("incompatible design, priority, P18 and amplifier changes invalidate a completed proposal",()=>{
 const p={subwooferInstances:instances,roomDims:{widthM:6,lengthM:6,heightM:2.4},seatingPositions:[{id:"seat",x:3,y:4,z:1.2,isPrimary:true}],rspPosition:{x:3,y:4,z:1.2},p18TargetBasis:"minimum",amplifierPowerPerSubW:1000};
 for(const mod of [{roomDims:{...p.roomDims,lengthM:7}},{p18TargetBasis:"recommended"},{amplifierPowerPerSubW:500},{seatingPositions:[{...p.seatingPositions[0],isPrimary:false}]}])assert.notEqual(computeV2DesignFingerprint(p),computeV2DesignFingerprint({...p,...mod}));
});

test("Apply emits valid canonical stored polarity (+1/-1) for actual hydration",()=>{
 const out=applyCalibrationTuning(instances,tuning);
 for(const inst of out)assert.ok(inst.polarity===1||inst.polarity===-1);
 assert.equal(out.find(s=>s.id==="front").polarity,-1);
 assert.equal(out.find(s=>s.id==="rear").polarity,1);
});

test("Current fallback resolves manual plus auto against the captured geometry", async()=>{
 const { resolveInstalledEffectiveTuning } = await import("../src/components/room/bass/improveBassV2/improveBassV2Engine.js");
 const raw={sources:[{x:0,y:0,z:0},{x:0,y:1,z:0}]},rsp={x:0,y:2,z:0};
 const manual=[{id:"far",delayMs:2,gainDb:-1,polarity:1},{id:"near",delayMs:1,gainDb:0,polarity:-1}];
 const resolved=resolveInstalledEffectiveTuning(raw,manual,rsp);
 near(resolved[0].delayMs,2);near(resolved[1].delayMs,2+1000/343);assert.equal(resolved[1].polarity,-1);
 const mixed=resolveInstalledEffectiveTuning(raw,[{...manual[0],tuningSource:"v2-optimised"},manual[1]],rsp);
 near(mixed[0].delayMs,2);near(mixed[1].delayMs,2+1000/343);
 const effective=resolveInstalledEffectiveTuning(raw,manual.map(s=>({...s,tuningSource:"v2-optimised"})),rsp);
 assert.deepEqual(effective.map(s=>s.delayMs),[2,1]);
});
test("matching manual numbers are not already-applied effective tuning",()=>{
 const one=[{...instances[2],delayMs:0,gainDb:0,polarity:1}];
 const bound=bindTuningToSourceIds([t()],["front"]);
 assert.equal(isCalibrationApplied(one,bound),false);
 assert.equal(isOptimisedApplied(one,{coordinates:[one[0].position],appliedTuning:bound}),false);
 assert.equal(isCalibrationApplied(applyCalibrationTuning(one,bound),bound),true);
});
