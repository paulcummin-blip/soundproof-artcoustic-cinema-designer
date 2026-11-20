import test from "node:test";
import assert from "node:assert/strict";
import { buildArtcousticDesignRatingAuthority as build, calculateScopedRoomDesignRating as scoped, calculateRoomDesignRating, calculateSeatDesignRating, PARAM_WEIGHTS } from "../src/components/report/technical/artcousticSystemDesignRating.js";
import { buildDesignRatingInput } from "../src/components/report/technical/buildDesignRatingInput.js";
import { summariseEngineeringResults } from "../src/components/engineering/engineeringSummaryAuthority.js";
const seats = [{id:"p1",priority:"primary"},{id:"p2",priority:"primary"},{id:"p3",priority:"primary"},{id:"s1",priority:"secondary"},{id:"s2",priority:"secondary"}];
const ids = {primary:["p1","p2","p3"],secondary:["s1","s2"]};
const points = r => r.actualPoints;
const contrib = (r,k) => r.contributions.find(c=>c.key===k);
const grade = level => ({verified:true,authoritativeLevel:level});
function score(input,group="primary") { return scoped(build({seats,...input}),ids[group]); }
test("highest valid seat level is selected independently, never averaged or blended",()=>{
  const input={p20:{p1:grade("L2"),p2:grade("L3"),p3:grade("L2"),s1:grade("L1"),s2:grade("L2")}};
  assert.equal(contrib(score(input),"p20").resultLevel,"L3");
  assert.equal(points(score(input)),8*PARAM_WEIGHTS.p20);
  assert.equal(points(score(input,"secondary")),4*PARAM_WEIGHTS.p20);
  assert.equal(calculateSeatDesignRating(build({seats,...input}),"p1").actualPoints,4*PARAM_WEIGHTS.p20);
});
test("unavailable, provisional, invalid and N/A seat evidence cannot raise or lower a selection",()=>{
  const a=score({p20:{p1:grade("L2"),p2:{...grade("L4"),provisional:true},p3:{...grade("L4"),verified:false},s1:grade("L4")}});
  assert.equal(points(a),4*PARAM_WEIGHTS.p20);
  assert.equal(points(score({p20:{p1:grade("BOGUS")}})),0);
});
test("a non-highest seat change cannot alter its group's selected level",()=>{
  const input={p20:{p1:grade("L4"),p2:grade("L1"),s1:grade("L2")}};
  const before=score(input);
  input.p20.p2=grade("L3");
  assert.equal(points(score(input)),points(before));
  assert.equal(points(score(input,"secondary")),4*PARAM_WEIGHTS.p20);
});
test("P19 is the single verified RSP grade in both groups; legacy seat grades never substitute",()=>{
  const input={p19:grade("L3")};
  const a=build({seats,...input});
  assert.equal(a.parameters.p19.scope,"room");
  assert.equal(points(scoped(a,ids.primary)),72);
  assert.equal(points(scoped(a,ids.secondary)),72);
  assert.equal(points(score({p19:{p1:grade("L4"),s1:grade("FAIL")}})),0);
  assert.equal(points(score({p19:{...grade("L4"),provisional:true}})),0);
});
test("retained P19 uses RSP only, and adding bass leaves non-bass contributions intact",()=>{
  const bridge=buildDesignRatingInput({seats,analysisResult:{gradedParameters:{primary:{2:{value:3}}}},retainedBass:{fingerprint:"matching",p19Rsp:grade("L3"),p19BySeat:{p1:1},p19LevelBySeat:{p1:"L4"}}});
  const result=scoped(build(bridge),ids.primary);
  assert.equal(contrib(result,"p19")?.earnedPoints,72);
  const noBass=scoped(build(buildDesignRatingInput({seats,analysisResult:{gradedParameters:{primary:{2:{value:3}}}}})),ids.primary);
  assert.deepEqual(result.contributions.filter(c=>c.key!=="p19"),noBass.contributions);
});
test("additive scoring: new positive evidence never decreases; missing/provisional has no effect",()=>{
  const base={p2:{rawValue:3},p15:"L2",p21:"L2"};
  const r=score(base);
  const positive=score({...base,p19:grade("L3")});
  assert.equal(points(positive)-points(r),72);
  assert.ok(positive.designPerformanceIndex>=r.designPerformanceIndex);
  for(const p19 of [null,{...grade("L4"),verified:false},{provisional:true}]) assert.equal(points(score({...base,p19})),points(r));
});
test("FAIL contributes exactly minus five times weight; rounding occurs only after summation",()=>{
  const r=score({p2:{rawValue:3},p19:grade("FAIL"),p15:"L1"});
  assert.equal(contrib(r,"p19").earnedPoints,-45);
  assert.equal(r.designPerformanceIndex,Math.max(0,Math.round(points(r)/10)));
});
test("P18 ASDR uses the approved level multiplier without changing physical thresholds",()=>{
  for(const [rawValue,mode,expectedLevel,multiplier] of [[18,"minimum","L4",12],[18,"recommended","L3",8],[25,"recommended","L2",4],[30,"recommended","L1",2],[36,"minimum","FAIL",-5]]){
    const r=score({p18:{rawValue,mode,verified:true}});
    assert.equal(contrib(r,"p18").resultLevel,expectedLevel);
    assert.equal(contrib(r,"p18").earnedPoints,multiplier*PARAM_WEIGHTS.p18);
  }
});
test("P15 and P21 assumption changes affect only their own contribution and total",()=>{
  for(const key of ["p15","p21"]){
    const before=score({p2:{rawValue:3},p15:"L2",p21:"L2"});
    const after=score({p2:{rawValue:3},p15:"L2",p21:"L2",[key]:"L4"});
    assert.equal(points(after)-points(before),8*PARAM_WEIGHTS[key]);
    assert.deepEqual(after.contributions.filter(c=>c.key!==key),before.contributions.filter(c=>c.key!==key));
  }
});
test("room-wide results are identical across groups and priorities only move seat evidence",()=>{
  const input={seats,p2:{rawValue:3},p20:{p1:grade("L4"),p2:grade("L2"),s1:grade("L1")}};
  const a=build(input);
  assert.equal(contrib(scoped(a,ids.primary),"p2").earnedPoints,contrib(scoped(a,ids.secondary),"p2").earnedPoints);
  const moved=build({...input,seats:seats.map(s=>s.id==="p1"?{...s,priority:"secondary"}:s)});
  assert.equal(contrib(scoped(moved,["p2","p3"]),"p20").resultLevel,"L2");
  assert.equal(contrib(scoped(moved,["p1","s1","s2"]),"p20").resultLevel,"L4");
});
test("no Secondary seats produces no numeric Secondary index; legacy room entry is Primary only",()=>{
  const a=build({seats,p20:{p1:grade("L2"),s1:grade("L4")}});
  assert.equal(scoped(a,[]).designPerformanceIndex,null);
  assert.equal(calculateRoomDesignRating(a).actualPoints,scoped(a,ids.primary).actualPoints);
  const summary=summariseEngineeringResults({designRatingAuthority:a,seats,seatHudById:{}});
  assert.equal(summary.designRating.rating.actualPoints,summary.primary.rating.actualPoints);
});
test("published contribution detail reconciles exactly and P8 remains excluded",()=>{
  const a=build({seats,p2:{rawValue:3},p19:grade("L3"),p20:{p1:grade("L2"),p2:grade("L4")}});
  for(const group of Object.keys(ids)){
    const r=scoped(a,ids[group]);
    assert.equal(r.actualPoints,r.contributions.reduce((n,c)=>n+c.earnedPoints,0));
    assert.equal(r.designPerformanceIndex,Math.max(0,Math.round(r.actualPoints/10)));
    assert.equal(contrib(r,"p8"),undefined);
  }
});
test("bridge excludes explicitly provisional or stale numeric room and seat evidence",()=>{
  for(const flag of [{provisional:true},{status:"provisional"},{status:"stale"},{verified:false}]){
    const input=buildDesignRatingInput({seats,analysisResult:{gradedParameters:{primary:{2:{value:3,...flag}}}},reportSeatHudById:{p1:{rp22:{p1:{value:3,level:"L4",...flag}}}}});
    const r=score(input);
    assert.equal(contrib(r,"p2"),undefined);
    assert.equal(contrib(r,"p1"),undefined);
  }
});
