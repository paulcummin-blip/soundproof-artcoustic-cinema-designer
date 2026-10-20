
import assert from "node:assert/strict";
import test from "node:test";
import {applyBassSmoothing} from "../src/components/room/bass/bassGraphSmoothing.jsx";
import {buildLcrIntegrationSources} from "../src/components/room/bass/lcrIntegrationSources.js";
import {buildCombinedSystemResponse} from "../src/components/room/bass/combinedSystemResponse.js";
import {combinedResponseCurves} from "../src/components/room/bass/combinedTuningResponse.js";
import {crossoverFrequencyOptions} from "../src/components/room/CrossoverControls.jsx";

test("power smoothing preserves the original arithmetic on irregular grids and gaps",()=>{
 const data=Array.from({length:360},(_,i)=>({frequency:15*Math.pow(200/15,i/359),spl:i%17===0?null:100+15*Math.sin(i/8)}));
 for(const [mode,width] of [["third",3],["sixth",6],["octave",1]]){
  const expected=data.map(p=>{
   const lo=p.frequency*Math.pow(2,-0.5/width),hi=p.frequency*Math.pow(2,0.5/width);
   let sum=0,n=0;
   for(const q of data)if(q.frequency>=lo&&q.frequency<=hi&&Number.isFinite(q.spl)){sum+=Math.pow(10,q.spl/10);n++;}
   return{frequency:p.frequency,spl:n?10*Math.log10(sum/n):null};
  });
  assert.deepEqual(applyBassSmoothing(data,mode),expected);
 }
});
test("split centres are both included and share one centre channel",()=>{
 const speakers=["FL","FCL","FCR","FR","SL"].map(role=>({role,model:"q6-3",position:{x:1,y:.1,z:1.2}}));
 const sources=buildLcrIntegrationSources(speakers);
 assert.deepEqual(sources.map(s=>s.role),["FL","FCL","FCR","FR"]);
 assert.equal(sources.reduce((sum,s)=>sum+s.channelWeight,0),3);
});
const freqs=[20,35,50,80,100,120,160,200];
const source=scale=>freqs.map(f=>({frequency:f,re:scale,im:0}));
const request={
 frequenciesHz:freqs,seats:[{seatId:"rsp"},{seatId:"seat"}],speakerReferenceLevelDb:0,
 subTransfersBySeat:{rsp:[{sourceId:"s",points:source(1)}],seat:[{sourceId:"s",points:source(.7)}]},
 speakerTransfersBySeat:{rsp:[{sourceId:"l",modelKey:"q6-3",points:source(1)}],seat:[{sourceId:"l",modelKey:"q6-3",points:source(1.1)}]},
 crossover:{frequencyHz:100,speakerHpSlopeDbPerOct:24,subwooferLpSlopeDbPerOct:24,linkFrequencies:true},
};
test("a sub gain adjustment changes integration without silently moving speaker level",()=>{
 const a=buildCombinedSystemResponse(request);
 const b=buildCombinedSystemResponse({...request,subTransfersBySeat:{rsp:[{sourceId:"s",points:source(2)}],seat:[{sourceId:"s",points:source(1.4)}]}});
 assert.equal(a.levelMatchDb,b.levelMatchDb);
 const deltas=a.combinedBySeat.rsp.map((p,i)=>b.combinedBySeat.rsp[i].spl-p.spl);
 assert.ok(Math.max(...deltas)-Math.min(...deltas)>2);
});
test("combined canonical inputs preserve every assessed seat and primary priority",()=>{
 const c=buildCombinedSystemResponse(request);
 const curves=combinedResponseCurves(c,[["seat","secondary"]]);
 assert.deepEqual(curves.rspRawCurve,c.combinedBySeat.rsp);
 assert.equal(curves.perSeatRawCurves.length,1);
 assert.equal(curves.perSeatRawCurves[0].isPrimary,false);
 assert.equal(curves.cancellationComplexTransfers.length,2);
});
test("a missing fixed reference cannot silently become an authoritative result",()=>{
 assert.equal(buildCombinedSystemResponse({...request,speakerReferenceLevelDb:undefined}).available,false);
});
test("independent frequencies outside the usual ladder remain editable",()=>{
 assert.ok(crossoverFrequencyOptions({minHz:80,maxHz:200},170).includes(170));
 assert.ok(!crossoverFrequencyOptions({minHz:150,maxHz:200},100).includes(100));
});

