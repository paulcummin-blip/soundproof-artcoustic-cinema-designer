import test from "node:test";
import assert from "node:assert/strict";
import {resolveCrossoverReceiptState as resolve} from "../components/room/bass/optimiseWorkflow/crossoverReceiptState.js";
const base={
 projectId:"test-project",versionId:"test-version",fingerprint:"before",
 record:{versionId:"test-version",runId:"run-1",candidateId:"joint-1",baselineCacheKey:"before",status:"recommended",candidate:{
 integrationVerified:true,crossover:{frequencyHz:90},appliedTuning:[{sourceId:"sub-1"}],
 achievedP19VariationDb:0.9385,achievedP20VariationDb:4.4745,p14AchievedDb:122.77,achievedP18Hz:24.3959,
 perSeatP20:[{seatId:"seat-1",variationDbRaw:4.4745}]}},
 plan:{projectId:"test-project",versionId:"test-version",designFingerprint:"before",candidateId:"joint-1",
 baselineParity:{status:"MATCH"},baseline:{seats:[{seatId:"seat-1"}]},run:{runId:"run-1",terminal:true,outcome:"actionable_plan_produced",winnerCandidateId:"joint-1"}},
 latestRun:{runId:"run-1"}
};
const withRecord=changes=>({...base,record:{...base.record,...changes}});
test("completed current recommendation is actionable",()=>assert.equal(resolve(base).canApply,true));
test("intentional fingerprint transition belongs to the live Apply",()=>{
 const result=resolve({...withRecord({status:"applying"}),fingerprint:"after",operation:{projectId:base.projectId,versionId:base.versionId,candidateId:"joint-1",baselineCacheKey:"before",kind:"apply"}});
 assert.equal(result.state,"applying");assert.equal(result.ownsPanel,true);assert.equal(result.canApply,false);
});
test("saved applying without a live transaction requires verification",()=>{
 const result=resolve({...withRecord({status:"applying"}),fingerprint:"after"});
 assert.equal(result.state,"verification-required");assert.equal(result.operationActive,false);assert.equal(result.canApply,false);
});
test("verified receipt owns the post-Apply fingerprint after cold reopen",()=>{
 assert.equal(resolve({...withRecord({status:"applied",appliedCacheKey:"after"}),fingerprint:"after",latestRun:null}).state,"applied");
});
test("a newer running or failed run suppresses historical receipt",()=>{
 for(const runStatus of ["running","failed","idle"])assert.equal(resolve({...base,runStatus,latestRun:{runId:"run-2"}}).ownsPanel,false);
});
test("failed and incomplete saved outcomes suppress the lower card",()=>{
 for(const outcome of ["failed","evaluation_incomplete"])assert.equal(resolve({...base,plan:{...base.plan,terminalOutcome:outcome,run:{...base.plan.run,outcome}}}).ownsPanel,false);
});
test("missing seat evidence cannot remain actionable",()=>assert.equal(resolve(withRecord({candidate:{...base.record.candidate,perSeatP20:[]}})).ownsPanel,false));
test("parity mismatch cannot remain actionable",()=>assert.equal(resolve({...base,plan:{...base.plan,baselineParity:{status:"MISMATCH"}}}).ownsPanel,false));
test("wrong version or producing run is rejected",()=>{
 assert.equal(resolve(withRecord({versionId:"other"})).ownsPanel,false);
 assert.equal(resolve(withRecord({runId:"older"})).ownsPanel,false);
});
test("legacy receipt requires exact baseline and candidate match",()=>{
 assert.equal(resolve(withRecord({runId:undefined})).canApply,true);
 assert.equal(resolve(withRecord({runId:undefined,baselineCacheKey:"old"})).ownsPanel,false);
});
test("unrelated design edits never inherit the applied result",()=>assert.equal(resolve({...withRecord({status:"applied",appliedCacheKey:"after"}),fingerprint:"other"}).ownsPanel,false));
test("restore owns its transition but is never described as Apply",()=>{
 assert.equal(resolve({...withRecord({status:"restoring"}),operation:{projectId:base.projectId,versionId:base.versionId,candidateId:"joint-1",baselineCacheKey:"before",kind:"restore"}}).state,"restoring");
});
