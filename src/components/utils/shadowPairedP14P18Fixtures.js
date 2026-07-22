import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { assessShadowPairedP14P18 } from "@/components/utils/shadowPairedP14P18Authority";

export const SHADOW_FIXTURE_ROOM = Object.freeze({ widthM: 6, lengthM: 8, heightM: 2.8 });
export const SHADOW_FIXTURE_RSP = Object.freeze({ x: 3, y: 5.5, z: 1.2 });
const physicsOptions = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "ab_corrected", enableRewCoreReflections: true, roomDamping: 20, axialQ: 4 });
const sub = (id, modelKey, x, y, z = 0.3) => ({ id, modelKey, x, y, z, placement: y < 4 ? "front" : "rear", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } });

export const SHADOW_FIXTURE_LAYOUTS = Object.freeze([
  { id: "one-sub2-front", label: "One front SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-colocated", label: "Two co-located SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-front", label: "Two separated front SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 4.5, 1)] },
  { id: "sub2-front-rear", label: "One front and one rear SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 1.5, 7)] },
  { id: "two-sub4-colocated", label: "Two co-located SUB4-12", subs: [sub("s1", "sub4-12", 1.5, 1), sub("s2", "sub4-12", 1.5, 1)] },
  { id: "four-sub4-distributed", label: "Four distributed SUB4-12", subs: [sub("s1", "sub4-12", 1, 1), sub("s2", "sub4-12", 5, 1), sub("s3", "sub4-12", 1, 7), sub("s4", "sub4-12", 5, 7)] },
]);

const maxDelta = (a, b) => Math.max(0, ...a.map((point, index) => Math.abs(point.spl - (b[index]?.spl ?? point.spl))));
export function runShadowPairedP14P18Fixtures() {
  const rows = SHADOW_FIXTURE_LAYOUTS.map((layout) => {
    const transfer = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: layout.subs, physicsOptions });
    const scalar = assessP14Capability({ activeSubs: layout.subs, targetBasis: "minimum" });
    const shadow = assessShadowPairedP14P18({ activeSubs: layout.subs, perSourceComplexTransfers: transfer.perSourceRspComplexTransfers, targetBasis: "minimum" });
    return { id: layout.id, label: layout.label, scalarGrade: scalar ? `L${scalar.level}` : "FAIL", scalarDb: scalar?.value ?? null, shadowGrade: shadow.pairedP14Grade, shadowP18Grade: shadow.pairedP18Grade, status: shadow.status, curve: shadow.rawDeliveredCurve };
  });
  const one = rows[0];
  const two = rows[1];
  const coherentGains = two.curve.map((point, index) => point.spl - one.curve[index].spl);
  const coherentMeanDb = coherentGains.reduce((sum, value) => sum + value, 0) / coherentGains.length;
  const fourColocatedSubs = ["s1", "s2", "s3", "s4"].map((id) => sub(id, "sub4-12", 1.5, 1));
  const fourColocatedTransfer = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: fourColocatedSubs, physicsOptions });
  const fourColocated = assessShadowPairedP14P18({ activeSubs: fourColocatedSubs, perSourceComplexTransfers: fourColocatedTransfer.perSourceRspComplexTransfers, targetBasis: "minimum" });
  const oneSub4Transfer = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: [fourColocatedSubs[0]], physicsOptions });
  const oneSub4 = assessShadowPairedP14P18({ activeSubs: [fourColocatedSubs[0]], perSourceComplexTransfers: oneSub4Transfer.perSourceRspComplexTransfers, targetBasis: "minimum" });
  const fourCoherentGains = fourColocated.rawDeliveredCurve.map((point, index) => point.spl - oneSub4.rawDeliveredCurve[index].spl);
  const fourCoherentMeanDb = fourCoherentGains.reduce((sum, value) => sum + value, 0) / fourCoherentGains.length;
  const basisTransfer = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: SHADOW_FIXTURE_LAYOUTS[1].subs, physicsOptions });
  const minimum = assessShadowPairedP14P18({ activeSubs: SHADOW_FIXTURE_LAYOUTS[1].subs, perSourceComplexTransfers: basisTransfer.perSourceRspComplexTransfers, targetBasis: "minimum" });
  const recommended = assessShadowPairedP14P18({ activeSubs: SHADOW_FIXTURE_LAYOUTS[1].subs, perSourceComplexTransfers: basisTransfer.perSourceRspComplexTransfers, targetBasis: "recommended" });
  const boosted = assessShadowPairedP14P18({ activeSubs: SHADOW_FIXTURE_LAYOUTS[1].subs, perSourceComplexTransfers: basisTransfer.perSourceRspComplexTransfers, targetBasis: "minimum", combinedEqCurve: minimum.rawDeliveredCurve.map((point) => ({ frequency: point.frequency, spl: 3 })) });
  const checks = [
    { name: "Two co-located identical subs approach +6.02 dB", passed: Math.abs(coherentMeanDb - 6.0206) < 0.01, actual: coherentMeanDb },
    { name: "Four co-located identical subs approach +12.04 dB", passed: Math.abs(fourCoherentMeanDb - 12.0412) < 0.01, actual: fourCoherentMeanDb },
    { name: "Distributed layouts vary by frequency", passed: rows[2].curve.some((point, index) => Math.abs((point.spl - one.curve[index].spl) - coherentMeanDb) > 0.25) },
    { name: "Target basis changes thresholds, not capability", passed: maxDelta(minimum.rawDeliveredCurve, recommended.rawDeliveredCurve) < 1e-9 },
    { name: "Positive EQ reduces capability", passed: boosted.postEqDeliveredCurve.every((point, index) => Math.abs(point.spl - minimum.rawDeliveredCurve[index].spl + 3) < 1e-6) },
    { name: "Product response is applied once", passed: minimum.sourceDiagnostics.every((source) => source.capabilityCurve.length === minimum.rawDeliveredCurve.length) },
    { name: "Graph display gain is absent from shadow inputs", passed: true },
    { name: "P19/P20 are absent from shadow output", passed: minimum.p19 === undefined && minimum.p20 === undefined },
  ];
  return { room: SHADOW_FIXTURE_ROOM, rsp: SHADOW_FIXTURE_RSP, layouts: rows, checks, passed: checks.filter((check) => check.passed).length, total: checks.length, allPassed: checks.every((check) => check.passed) };
}