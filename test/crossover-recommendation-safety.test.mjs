import test from "node:test";
import assert from "node:assert/strict";
import { integrationSafetyIssues } from "../src/components/room/bass/improveBassV2/crossoverIntegrationSearch.js";
import { confirmedCalibrationCandidates } from "../src/components/room/bass/optimiseWorkflow/adiCalibrationCandidateSelection.js";
import { recommendationResultMatches, recommendationSettingsMatch } from "../src/components/room/bass/optimiseWorkflow/crossoverApplicationVerification.js";
const baseline={achievedP19VariationDb:1,achievedP20VariationDb:8,p14HeadroomDb:5,assessmentStartHz:20,assessmentEndHz:160,perSeatP20:[{seatId:"a",isPrimary:true,variationDbRaw:8}],physicalValidation:{passed:true}};
const candidate={...baseline,achievedP20VariationDb:6,perSeatP20:[{seatId:"a",isPrimary:true,variationDbRaw:6}]};
test("joint recommendation protects complete seat evidence and fixed band",()=>{
 assert.deepEqual(integrationSafetyIssues(baseline,candidate),[]);
 for(const patch of [{perSeatP20:[]},{assessmentEndHz:NaN},{perSeatP20:[{seatId:"a",isPrimary:false,variationDbRaw:6}]},{perSeatP20:[{seatId:"a",isPrimary:true,variationDbRaw:NaN}]},{p14HeadroomDb:3},{achievedP19VariationDb:2}]) assert.ok(integrationSafetyIssues(baseline,{...candidate,...patch}).length);
});
test("joint Apply owns the whole recommendation, preventing partial auto-apply",()=>{
 assert.deepEqual(confirmedCalibrationCandidates({selection:{integrationRecommendation:{integrationVerified:true},calibrationResult:{candidateId:"delay",appliedTuning:[{delayMs:2}]}}}),[]);
});
const expected={...candidate,p14AchievedDb:120,achievedP18Hz:25};
const authority={contract:{selectedCandidate:{perSeatP20Results:candidate.perSeatP20,achievedP14Db:120,achievedP18FrequencyHz:25},productAnalysis:{parameters:{p19:{variationDbRaw:1,level:4},p20:{variationDbRaw:6,level:2},p18:{value:25}}}}};
test("applied verification compares canonical headline and every seat",()=>{
 assert.equal(recommendationResultMatches(authority,expected),true);
 assert.equal(recommendationResultMatches(authority,{...expected,achievedP20VariationDb:7}),false);
 assert.equal(recommendationResultMatches(authority,{...expected,perSeatP20:[{...candidate.perSeatP20[0],variationDbRaw:NaN}]}),false);
 assert.equal(recommendationResultMatches(authority,{...expected,p14AchievedDb:NaN}),false);
});
test("applied verification checks crossover and absolute subwoofer tuning",()=>{
 const crossover={frequencyHz:160,subwooferFrequencyHz:150,speakerHpSlopeDbPerOct:24,subwooferLpSlopeDbPerOct:12};
 const tuning={sourceId:"sub-a",gainDb:-1,delayMs:7,phaseControlDeg:60,polarity:180};
 const actual={crossover,sources:[{id:"sub-a",tuning}]};
 assert.equal(recommendationSettingsMatch(actual,{crossover,tuning:[tuning]}),true);
 assert.equal(recommendationSettingsMatch(actual,{crossover:{...crossover,subwooferFrequencyHz:160},tuning:[tuning]}),false);
 assert.equal(recommendationSettingsMatch(actual,{crossover,tuning:[{...tuning,delayMs:8}]}),false);
});
import { buildPersistedBassAuthority } from '../src/components/room/bass/completedBassResultPersistence.js';
import { COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from '../src/lib/bassAuthorityVersion.js';
test('large completed cache preserves current and previous contracts without rewriting eight full histories',()=>{
 const snapshots=Object.fromEntries(Array.from({length:8},(_,i)=>['fp'+i,{job:{completedAtMs:i},graphPayload:{data:'x'.repeat(520000)}}]));
 const existing={version:COMPLETED_BASS_CACHE_VERSION,instanceAuthorityVersion:INSTANCE_AUTHORITY_VERSION,metricSchemaVersion:RP22_BASS_METRIC_SCHEMA_VERSION,completedByFingerprint:snapshots};
 const saved=buildPersistedBassAuthority(existing,'fp0');
 assert.equal(saved.status,'complete');
 assert.equal(saved.completedByFingerprint.fp0,snapshots.fp0);
 assert.equal(saved.completedByFingerprint.fp7,snapshots.fp7);
 assert.ok(JSON.stringify(saved).length<1250000);
});

test("saved primary scope survives compacted candidate rows and remains enforced",()=>{
 const compact=structuredClone(authority);
 compact.contract.selectedCandidate.perSeatP20Results[0].isPrimary=false;
 compact.contract.provenance={primarySeatIds:["a"]};
 assert.equal(recommendationResultMatches(compact,expected),true);
 compact.contract.provenance.primarySeatIds=[];
 assert.equal(recommendationResultMatches(compact,expected),false);
});

import { computeEngineeringFingerprint } from '../src/components/proposal/engineeringAuthority/engineeringFingerprint.js';
import { buildFrozenReportProject } from '../shared/engineeringPublicationContract.js';
test('recommendation receipts cannot republish unchanged engineering while real crossover changes do',()=>{
 const design={splConfig:{crossover:{frequencyHz:100,speakerHpSlopeDbPerOct:24,subwooferLpSlopeDbPerOct:24},crossoverRecommendation:{status:'applying'}}};
 const versions={publicationContractVersion:2,bassFingerprint:'bass-a'};
 const before=computeEngineeringFingerprint(design,versions);
 const receipt=structuredClone(design);receipt.splConfig.crossoverRecommendation={status:'applied',verifiedAt:'later'};
 assert.equal(computeEngineeringFingerprint(receipt,versions),before);
 assert.deepEqual(buildFrozenReportProject(receipt).reportProject.spl_config,buildFrozenReportProject(design).reportProject.spl_config);
 assert.equal('crossoverRecommendation' in buildFrozenReportProject(receipt).reportProject.spl_config,false);
 receipt.splConfig.crossover.frequencyHz=150;
 assert.notEqual(computeEngineeringFingerprint(receipt,versions),before);
});
