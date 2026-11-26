import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Exercise the actual readiness gate; the canonical evaluator is a spy here.
// Numerical equivalence is checked separately by the real Preview ADI transaction.
const source=readFileSync(new URL('../src/components/room/bass/optimiseWorkflow/evaluateCurrentIntegration.js',import.meta.url),'utf8')
 .replace(/^import.*\n/,'').replace('export function','function');
function fixture() {
 let calls=0;
 const marker={canonical:true};
 const evaluate=new Function('evaluateStage2Confirmation','buildSeatPriorityMap',source+'\nreturn evaluateCurrentIntegration;')
 ((transfer,params)=>{calls++;assert.equal(transfer.rspRawCurve.length,1);assert.equal(params.p14TargetDb,112);return marker;},()=>new Map());
 const a={status:'idle',simulationReady:true,combinedSystem:{available:true,combinedBySeat:{rsp:[1]}},
 requested:{selectedP14TargetDb:112},seatingPositions:[],designEqSystemLimits:{}};
 return {evaluate,a,marker,calls:()=>calls};
}
for(const status of ['idle','ready'])test('completed identity-checked response is evaluated while '+status,()=>{
 const f=fixture();assert.equal(f.evaluate({...f.a,status}),f.marker);assert.equal(f.calls(),1);
});
for(const [label,change] of [
 ['incomplete simulation',{simulationReady:false}],['missing completion evidence',{simulationReady:undefined}],
 ['calculating',{status:'calculating'}],['error',{status:'error'}],['missing combined response',{combinedSystem:{available:false}}]
])test(label+' cannot reach comparison',()=>{const f=fixture();assert.equal(f.evaluate({...f.a,...change}),null);assert.equal(f.calls(),0);});
