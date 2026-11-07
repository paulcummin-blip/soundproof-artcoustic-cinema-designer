import { register } from "node:module";
register("../../test/_alias-loader.mjs", import.meta.url);
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { deriveRspPosition } = await import("../components/room/bass/bda/recommendationInputs.js");
assert.deepEqual(deriveRspPosition({mlp:{x:2.5,y:3.243642811,z:1.2},mlpX_m:2.5,mlpY_m:4.39,rspMode:"manual_position"},{widthM:5}),{x:2.5,y:4.39,z:1.2});
assert.deepEqual(deriveRspPosition({mlpX_m:0,mlpY_m:2,rspMode:"seat_bound",designatedRspSeatId:"rear",seatingPositions:[{id:"rear",z:1.7}]},{widthM:5}),{x:0,y:2,z:1.7});
// Exercise the actual disabled-consumer branch from each hook against a
// shared controller. Do not execute worker calculations or backend writes.
for (const n of [1,2]) {
  const source = readFileSync(new URL(`../components/room/bass/stage${n}/useStage${n}PlacementOptimiser.js`,import.meta.url),"utf8");
  const start = source.indexOf("    if (!enabled || !requestId) {");
  const end = source.indexOf("\n    const requestToken",start);
  assert.ok(start >= 0 && end > start);
  const execute = new Function("enabled","requestId","explicitRequestRef","projectId","versionId",
    `getStage${n}State`,`stage${n}PlacementController`,`markStage${n}Idle`, source.slice(start,end));
  for (const [previous,owner,expected] of [[null,"background",0],["old","background",0],["own","own",1]]) {
    let cancelled=0,idled=0;
    const ref={current:{requestId:previous,fingerprint:"fp"}};
    execute(false,null,ref,"p","v",()=>({ownerRequestId:owner}),
      {cancelActive(){cancelled++},cancelAll(){cancelled++}},()=>{idled++});
    assert.equal(cancelled,expected);
    assert.equal(idled,expected);
    assert.equal(ref.current.requestId,null);
  }
}
console.log("PASS inactive-consumer isolation, own cancellation, manual RSP and seat-bound height");
