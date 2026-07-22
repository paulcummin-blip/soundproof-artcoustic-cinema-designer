import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { assessShadowPairedP14P18 } from "@/components/utils/shadowPairedP14P18Authority";
import { smoothThirdOctavePowerMean } from "@/components/utils/thirdOctavePowerMean";

export const SHADOW_FIXTURE_ROOM = Object.freeze({ widthM: 6, lengthM: 8, heightM: 2.8 });
export const SHADOW_FIXTURE_RSP = Object.freeze({ x: 3, y: 5.5, z: 1.2 });
const REF_AMPLITUDE = Math.pow(10, 94 / 20);
const physicsOptions = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "ab_corrected", enableRewCoreReflections: true, roomDamping: 20, axialQ: 4 });
const sub = (id, modelKey, x, y, z = 0.3) => ({ id, modelKey, x, y, z, placement: y < 4 ? "front" : "rear", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } });
const logGrid = (ppo) => {
  const values = [];
  for (let index = 0; index <= Math.ceil(Math.log2(120 / 15) * ppo); index += 1) values.push(15 * Math.pow(2, index / ppo));
  return [...new Set([...values.filter((frequency) => frequency <= 120), 18, 25, 30, 80, 100, 120])].sort((a, b) => a - b);
};
const unityTransfer = (sourceId, frequencies = logGrid(48)) => ({ sourceId, points: frequencies.map((frequency) => ({ frequency, re: REF_AMPLITUDE, im: 0 })) });
const flatCapability = (id, db = 120) => ({ id, modelKey: "synthetic", shadowCapabilityCurve: [{ frequency: 15, spl: db }, { frequency: 120, spl: db }] });
const valueAt = (curve, frequency) => curve.find((point) => Math.abs(point.frequency - frequency) < 1e-9)?.spl ?? null;
const check = (name, expected, actual, tolerance = 0.01) => ({ name, expected, actual, delta: Number.isFinite(actual) ? actual - expected : null, passed: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance });

export const SHADOW_FIXTURE_LAYOUTS = Object.freeze([
  { id: "one-sub2-front", label: "One front SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-colocated", label: "Two co-located SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-front", label: "Two separated front SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 4.5, 1)] },
  { id: "sub2-front-rear", label: "One front and one rear SUB2-12", subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 1.5, 7)] },
  { id: "two-sub4-colocated", label: "Two co-located SUB4-12", subs: [sub("s1", "sub4-12", 1.5, 1), sub("s2", "sub4-12", 1.5, 1)] },
  { id: "four-sub4-distributed", label: "Four distributed SUB4-12", subs: [sub("s1", "sub4-12", 1, 1), sub("s2", "sub4-12", 5, 1), sub("s3", "sub4-12", 1, 7), sub("s4", "sub4-12", 5, 7)] },
]);

function runSyntheticAuthorityFixtures() {
  const frequencies = logGrid(48);
  const single = assessShadowPairedP14P18({ activeSubs: [flatCapability("s1")], perSourceComplexTransfers: [unityTransfer("s1", frequencies)] });
  const two = assessShadowPairedP14P18({ activeSubs: [flatCapability("s1"), flatCapability("s2")], perSourceComplexTransfers: [unityTransfer("s1", frequencies), unityTransfer("s2", frequencies)] });
  const fourSubs = ["s1", "s2", "s3", "s4"].map((id) => flatCapability(id));
  const four = assessShadowPairedP14P18({ activeSubs: fourSubs, perSourceComplexTransfers: fourSubs.map((item) => unityTransfer(item.id, frequencies)) });
  const shapedSub = { id: "s1", modelKey: "synthetic-shaped", shadowCapabilityCurve: [{ frequency: 15, spl: 114 }, { frequency: 30, spl: 114 }, { frequency: 80, spl: 120 }, { frequency: 120, spl: 120 }] };
  const shaped = assessShadowPairedP14P18({ activeSubs: [shapedSub], perSourceComplexTransfers: [unityTransfer("s1", frequencies)] });
  const narrowSevereTransfer = unityTransfer("s1", frequencies);
  narrowSevereTransfer.points = narrowSevereTransfer.points.map((point) => Math.abs(point.frequency - 60) < 1e-9 ? { ...point, re: point.re * Math.pow(10, -15 / 20) } : point);
  const narrowSevere = assessShadowPairedP14P18({ activeSubs: [flatCapability("s1")], perSourceComplexTransfers: [narrowSevereTransfer] });
  const l4SevereRegion = narrowSevere.levelResults.find((level) => level.level === "L4")?.unsmoothedUnderTargetRegions?.find((region) => region.severe);
  const productDelta30 = valueAt(shaped.rawDeliveredCurve, 30) - valueAt(single.rawDeliveredCurve, 30);
  return {
    single, two, four, shaped,
    checks: [
      check("Unity transfer delivers flat product capability", 120, valueAt(single.rawDeliveredCurve, 80)),
      check("Two co-located unity transfers", 126.0206, valueAt(two.rawDeliveredCurve, 80)),
      check("Four co-located unity transfers", 132.0412, valueAt(four.rawDeliveredCurve, 80)),
      check("Product response applied once at 30 Hz", -6, productDelta30),
      { name: "Product response is not applied twice", expected: "not -12 dB", actual: productDelta30, delta: Math.abs(productDelta30 + 12), passed: Math.abs(productDelta30 + 12) > 0.01 },
      { name: "Narrow severe null is not ignored", expected: "L4 FAIL with severe region", actual: l4SevereRegion ? `${l4SevereRegion.classification} ${l4SevereRegion.depthDb.toFixed(2)} dB` : "not detected", passed: narrowSevere.levelResults.find((level) => level.level === "L4")?.status === "FAIL" && !!l4SevereRegion },
    ],
  };
}

function runMappingFixtures() {
  const validSub = flatCapability("s1");
  const cases = [
    ["Missing active source ID", [{ ...validSub, id: "" }], [unityTransfer("s1")]],
    ["Duplicate active source IDs", [validSub, { ...validSub }], [unityTransfer("s1")]],
    ["Duplicate transfer source IDs", [validSub], [unityTransfer("s1"), unityTransfer("s1")]],
    ["Missing matching transfer", [validSub], [unityTransfer("other")]],
    ["Orphan transfer", [validSub], [unityTransfer("s1"), unityTransfer("orphan")]],
  ];
  return cases.map(([name, activeSubs, transfers]) => {
    const result = assessShadowPairedP14P18({ activeSubs, perSourceComplexTransfers: transfers });
    return { name, expected: "INCOMPLETE DATA", actual: result.status, reason: result.reason, passed: result.status === "INCOMPLETE DATA" };
  });
}

function runSmoothingFixture() {
  const curveAt = (frequency) => 112 + 2.5 * Math.sin(Math.log2(frequency / 15) * 1.3);
  const sparse = logGrid(24).map((frequency) => ({ frequency, spl: curveAt(frequency) }));
  const dense = logGrid(96).map((frequency) => ({ frequency, spl: curveAt(frequency) }));
  const sparseSmoothed = smoothThirdOctavePowerMean(sparse);
  const denseSmoothed = smoothThirdOctavePowerMean(dense);
  const centres = [18, 25, 30, 40, 60, 80, 100];
  const nearest = (curve, frequency) => curve.reduce((best, point) => Math.abs(point.frequency - frequency) < Math.abs(best.frequency - frequency) ? point : best, curve[0]).spl;
  const maximumDeltaDb = Math.max(...centres.map((frequency) => Math.abs(nearest(sparseSmoothed, frequency) - nearest(denseSmoothed, frequency))));
  return { name: "One-third-octave power-mean grid-density stability", expected: "≤ 0.10 dB", actual: maximumDeltaDb, passed: maximumDeltaDb <= 0.1 };
}

function runLowFrequencyCompletenessFixtures() {
  return ["sub2-12", "sub4-12"].map((modelKey) => {
    const activeSub = sub("s1", modelKey, 1.5, 1);
    const result = assessShadowPairedP14P18({ activeSubs: [activeSub], perSourceComplexTransfers: [unityTransfer("s1")] });
    return { modelKey, levels: Object.fromEntries(result.levelResults.map((level) => [level.level, level.status === "INCOMPLETE DATA" ? "INCOMPLETE DATA" : "COMPLETE"])) };
  });
}

function runLiveLayoutFixtures() {
  return SHADOW_FIXTURE_LAYOUTS.map((layout) => {
    const transfer = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: layout.subs, physicsOptions });
    const scalar = assessP14Capability({ activeSubs: layout.subs, targetBasis: "minimum" });
    const shadow = assessShadowPairedP14P18({ activeSubs: layout.subs, perSourceComplexTransfers: transfer.perSourceRspComplexTransfers, targetBasis: "minimum" });
    return { id: layout.id, label: layout.label, scalarGrade: scalar ? `L${scalar.level}` : "FAIL", scalarDb: scalar?.value ?? null, shadowGrade: shadow.pairedP14Grade, shadowP18Grade: shadow.pairedP18Grade, status: shadow.status };
  });
}

export function runShadowPairedP14P18Fixtures() {
  const synthetic = runSyntheticAuthorityFixtures();
  const mapping = runMappingFixtures();
  const smoothing = runSmoothingFixture();
  const lowFrequencyCompleteness = runLowFrequencyCompletenessFixtures();
  const layouts = runLiveLayoutFixtures();
  const checks = [...synthetic.checks, ...mapping, smoothing];
  return { normalization: { engineAmplitudeDomain: "pressure amplitude relative to 20 µPa", referenceSourceDb: 94, referenceSourceAmplitude: REF_AMPLITUDE, normalizedTransferUnit: "dimensionless" }, syntheticResults: { unityDb: valueAt(synthetic.single.rawDeliveredCurve, 80), twoColocatedDb: valueAt(synthetic.two.rawDeliveredCurve, 80), fourColocatedDb: valueAt(synthetic.four.rawDeliveredCurve, 80), productDelta30Db: valueAt(synthetic.shaped.rawDeliveredCurve, 30) - valueAt(synthetic.single.rawDeliveredCurve, 30) }, mappingFailures: mapping, smoothingStability: smoothing, lowFrequencyCompleteness, layouts, checks, passed: checks.filter((item) => item.passed).length, total: checks.length, allPassed: checks.every((item) => item.passed) };
}