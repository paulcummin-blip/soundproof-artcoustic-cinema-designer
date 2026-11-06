import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyRoomPreviewDisplaySmoothing as smooth } from "../src/components/room/bass/roomPreviewDisplaySmoothing.js";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
const raw = JSON.parse(fs.readFileSync("test/fixtures/room-preview-boundary-raw.json", "utf8"));
const turns = a => a.slice(1,-1).filter((p,i)=>(p.spl-a[i].spl)*(a[i+2].spl-p.spl)<0).length;
test("closed 1/3-octave bands include exactly the mathematical 33 samples at 96 points/octave",()=>{
  const result=smooth(raw);
  for(let i=20;i<raw.length-20;i++){
    const expected=10*Math.log10(raw.slice(i-16,i+17).reduce((sum,p)=>sum+Math.pow(10,p.spl/10),0)/33);
    assert.equal(result[i].spl,expected, "window centre "+i);
  }
});
test("captured refinement loses boundary jitter, not acoustic resolution",()=>{
  const result=smooth(raw);
  assert.equal(raw.length,360);
  assert.equal(turns(raw),19);
  assert.equal(turns(applyBassSmoothing(raw,"third")),74);
  assert.equal(turns(result),14);
  assert.deepEqual(result.map(p=>p.frequency),raw.map(p=>p.frequency));
  assert.ok(Math.min(...result.map(p=>p.spl))<82, "main destructive trough remains visible");
});
test("31-point live preview is bit-for-bit unchanged",()=>{
  const coarse=raw.filter((_,i)=>i%12===0);
  if(coarse.at(-1).frequency!==raw.at(-1).frequency)coarse.push(raw.at(-1));
  assert.equal(coarse.length,31);
  assert.deepEqual(smooth(coarse),applyBassSmoothing(coarse,"third"));
});
test("one power-average pass is independent per listener and does not mutate raw evidence",()=>{
  const original=JSON.stringify(raw), base=smooth(raw);
  const shifted=smooth(raw.map(p=>({...p,spl:p.spl-5})));
  assert.equal(JSON.stringify(raw),original);
  shifted.forEach((p,i)=>assert.ok(Math.abs(p.spl-base[i].spl+5)<1e-10));
  const twice=smooth(base);
  assert.ok(Math.max(...twice.map((p,i)=>Math.abs(p.spl-base[i].spl)))>1, "test distinguishes one from two passes");
});
test("roundoff tolerance does not admit a genuinely out-of-band frequency",()=>{
  const hi=60*Math.pow(2,1/6);
  const response=smooth([{frequency:60,spl:80},{frequency:hi,spl:80},{frequency:hi*(1+1e-10),spl:180}]);
  assert.equal(response[0].spl,80);
});
