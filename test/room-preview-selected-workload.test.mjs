import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNormalizedRoomTransfer } from '../src/components/room/bass/normalizedRoomTransferEngine.js';
const input = {"rspPosition":{"id":"rsp","x":2.25,"y":4.82,"z":1.2,"designatedRspSeatId":null,"__isSyntheticRsp":true},"roomDims":{"widthM":4.5,"lengthM":6,"heightM":2.4},"seatingPositions":[{"id":"seat-r1-c1","x":1.65,"y":5.2814814618047645,"z":1.2,"rowNumber":1,"isPrimary":false,"isSecondary":false,"platformHeightM":0,"priority":"primary"},{"id":"seat-r1-c2","x":2.25,"y":5.2814814618047645,"z":1.2,"rowNumber":1,"isPrimary":true,"isSecondary":false,"platformHeightM":0,"priority":"primary"},{"id":"seat-r1-c3","x":2.8499999999999996,"y":5.2814814618047645,"z":1.2,"rowNumber":1,"isPrimary":false,"isSecondary":false,"platformHeightM":0,"priority":"primary"}],"subsForSimulation":[{"id":"sub-front-1","x":1.125,"y":0.1375,"z":0.3,"tuning":{"gainDb":0,"delayMs":0,"polarity":0,"phaseControlDeg":0}}],"physicsOptions":{"surfaceAbsorption":{"front":0.3,"back":0.3,"left":0.3,"right":0.3,"ceiling":0.3,"floor":0.3},"enableReflections":false,"enableModes":true,"roomDamping":20,"axialQ":4,"modalSourceReferenceMode":"existing","modalGainScalar":1,"modalDistanceBlend":0.55,"modalStorageMode":"none","propagationPhaseScale":0,"pureDeterministicModalSum":true,"disableReflectionPhaseJitter":false,"disableReflectionCoherenceWeight":false,"disableLateField":true,"disableModalPropagationPhase":true,"mute68HzAxialMode":false,"debugDisableModalContribution":false,"rewSourceCurveMode":"flat_rew_reference","rewParityFieldMode":"modes_only","abApplyModeMultiplicity":true,"roomIsSealed":true,"abMidbandQScale":1,"overrideConstantAxialQ":false,"overrideAbsorptionAxialQ":false,"debugMode200Multiplier":1,"debugModalPhaseConvention":"normal","debugReflectionOrder":1,"reflectionGainScale":1,"debugModalHSign":"normal","rewParityModalMagnitudeScale":1,"modalCoherenceMode":"coherent","highOrderAxialScale":1,"qStrategy":"ab_corrected","rewModalBandwidthScale":0.55},"pointsPerOctave":96};
const original = JSON.stringify(input);
const full = computeNormalizedRoomTransfer({...input, pointsPerOctave:32});
test('RSP-only 121-point work is identical to full listener work and retains full geometry identity',()=>{
 const r=computeNormalizedRoomTransfer({...input,pointsPerOctave:32,listenerSelection:{mode:'rsp'}});
 assert.equal(r.rspCurve.length,121); assert.deepEqual(r.rspCurve,full.rspCurve);
 assert.equal(r.seatCurves.length,0); assert.equal(r.geometryFingerprint,full.geometryFingerprint);
});
test('focused seat retains original index, identity and exact independent response',()=>{
 for(let i=0;i<input.seatingPositions.length;i++){
  const seat=input.seatingPositions[i];
  const r=computeNormalizedRoomTransfer({...input,pointsPerOctave:32,listenerSelection:{mode:'seat',seatId:seat.id}});
  assert.equal(r.rspCurve.length,0);assert.equal(r.seatCurves.length,1);
  assert.deepEqual(r.seatCurves[0],full.seatCurves[i]);
  assert.equal(r.geometryFingerprint,full.geometryFingerprint);
 }
 assert.equal(JSON.stringify(input),original);
});
test('All Seats preserves fast resolution and every separate seat response',()=>{
 const legacy=computeNormalizedRoomTransfer({...input,pointsPerOctave:8});
 const r=computeNormalizedRoomTransfer({...input,pointsPerOctave:8,listenerSelection:{mode:'all'}});
 assert.equal(r.rspCurve.length,0);assert.equal(r.frequencies.length,31);
 assert.deepEqual(r.seatCurves,legacy.seatCurves);assert.equal(r.geometryFingerprint,legacy.geometryFingerprint);
});
test('unknown or ambiguous focused seat fails instead of substituting another listener',()=>{
 assert.equal(computeNormalizedRoomTransfer({...input,listenerSelection:{mode:'seat',seatId:'missing'}}).status,'error');
 assert.equal(computeNormalizedRoomTransfer({...input,seatingPositions:[input.seatingPositions[0],input.seatingPositions[0]],listenerSelection:{mode:'seat',seatId:input.seatingPositions[0].id}}).status,'error');
});
test('unscoped settled calculation remains 360-point full-listener output',()=>{
 const r=computeNormalizedRoomTransfer(input);
 assert.equal(r.rspCurve.length,360);assert.equal(r.seatCurves.length,3);
 assert.equal(r.listenerSelection,undefined);
});
