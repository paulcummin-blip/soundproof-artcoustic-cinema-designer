import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { SHADOW_FIXTURE_ROOM, SHADOW_FIXTURE_RSP, SHADOW_FIXTURE_LAYOUTS } from "@/components/utils/shadowPairedP14P18Fixtures";
import { assessShadowPairedP14P18 } from "@/components/utils/shadowPairedP14P18Authority";
import {
  PAIRED_P14_P18_AUTHORITY_METHOD,
  PAIRED_P14_P18_AUTHORITY_VERSION,
  PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION,
  calculatePairedP14P18ProductionAuthority,
  validatePairedP14P18ProductionAuthorityResult,
} from "@/components/utils/pairedP14P18ProductionAuthority";

const REF_AMPLITUDE = Math.pow(10, 94 / 20);
const PHYSICS = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "ab_corrected", enableRewCoreReflections: true, roomDamping: 20, axialQ: 4 });
const frequencies = () => {
  const values = [];
  for (let index = 0; index <= 144; index += 1) values.push(15 * Math.pow(2, index / 48));
  return [...new Set([...values.filter((frequency) => frequency <= 120), 18, 20, 25, 30, 80, 120])].sort((a, b) => a - b);
};
const transfer = (sourceId, phase = 0, grid = frequencies()) => ({ sourceId, points: grid.map((frequency) => ({ frequency, re: REF_AMPLITUDE * Math.cos(phase), im: REF_AMPLITUDE * Math.sin(phase) })) });
const syntheticSub = (id, db = 124, lowHz = 15) => ({ id, modelKey: "synthetic", shadowCapabilityCurve: [{ frequency: lowHz, spl: db }, { frequency: 120, spl: db }] });
const production = (overrides = {}) => calculatePairedP14P18ProductionAuthority({
  activeSubs: [syntheticSub("s1")],
  perSourceComplexTransfers: [transfer("s1")],
  selectedEqBankIdentity: "fixture-bank",
  normalizedTransferFingerprint: "fixture-transfer",
  calibrationFingerprint: "fixture-calibration",
  ...overrides,
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const withoutLegacyValue = (value) => {
  const copy = clone(value);
  copy.legacyScalarDiagnostic.value = null;
  return copy;
};
const check = (name, passed, expected, actual) => ({ name, expected, actual, passed: Boolean(passed) });
const curveEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function runLiveLayoutFixtures() {
  const baseLayouts = SHADOW_FIXTURE_LAYOUTS.filter((layout) => ["one-sub2-front", "two-sub2-colocated", "two-sub2-front", "sub2-front-rear", "four-sub4-distributed"].includes(layout.id));
  const two = SHADOW_FIXTURE_LAYOUTS.find((layout) => layout.id === "two-sub2-colocated");
  const fourColocated = {
    id: "four-sub2-colocated",
    subs: [...two.subs, { ...two.subs[0], id: "s3" }, { ...two.subs[0], id: "s4" }],
  };
  return [...baseLayouts, fourColocated].map((layout) => {
    const normalized = computeNormalizedRoomTransfer({ roomDims: SHADOW_FIXTURE_ROOM, rspPosition: SHADOW_FIXTURE_RSP, seatingPositions: [], subsForSimulation: layout.subs, physicsOptions: PHYSICS });
    const result = calculatePairedP14P18ProductionAuthority({ activeSubs: layout.subs, perSourceComplexTransfers: normalized.perSourceRspComplexTransfers, normalizedTransferFingerprint: normalized.geometryFingerprint });
    const validation = validatePairedP14P18ProductionAuthorityResult(result);
    return check(`Live layout ${layout.id}`, validation.valid, "valid canonical contract", validation.reason || result.status);
  });
}

function runProductAndBasisFixtures() {
  const sub2 = { id: "s1", modelKey: "sub2-12" };
  const sub4 = { id: "s1", modelKey: "sub4-12" };
  const sub2Result = production({ activeSubs: [sub2] });
  const sub4Result = production({ activeSubs: [sub4] });
  const sameInputs = production({ targetBasis: "minimum" });
  return [
    check("SUB2 and SUB4 retain product differentiation", JSON.stringify(sub2Result.sources.sourceDiagnostics) !== JSON.stringify(sub4Result.sources.sourceDiagnostics), "different approved product capability", "different"),
    check("Minimum and Recommended calculated independently", sameInputs.assessments.minimum.levels.L1.targetDb !== sameInputs.assessments.recommended.levels.L1.targetDb, "different target envelopes", `${sameInputs.assessments.minimum.levels.L1.targetDb}/${sameInputs.assessments.recommended.levels.L1.targetDb}`),
    check("Selected basis controls selected envelope", curveEqual(sameInputs.curves.selectedTargetEnvelope, sameInputs.assessments.minimum.levels[sameInputs.limitingResult.level].targetEnvelope), "minimum envelope selected", sameInputs.selectedTargetBasis),
  ];
}

function runCoverageFixtures() {
  const startsAt20 = production({ activeSubs: [syntheticSub("s1", 124, 20)] });
  const missingTransfer = production({ perSourceComplexTransfers: [] });
  const missingProduct = production({ activeSubs: [{ id: "s1", modelKey: "not-approved" }] });
  return [
    check("20 Hz data assesses L1 and L2", ["PASS", "FAIL"].includes(startsAt20.assessments.minimum.levels.L1.status) && ["PASS", "FAIL"].includes(startsAt20.assessments.minimum.levels.L2.status), "L1/L2 assessed", `${startsAt20.assessments.minimum.levels.L1.status}/${startsAt20.assessments.minimum.levels.L2.status}`),
    check("20 Hz data leaves L3 and L4 incomplete", startsAt20.assessments.minimum.levels.L3.status === "INCOMPLETE DATA" && startsAt20.assessments.minimum.levels.L4.status === "INCOMPLETE DATA", "INCOMPLETE DATA/INCOMPLETE DATA", `${startsAt20.assessments.minimum.levels.L3.status}/${startsAt20.assessments.minimum.levels.L4.status}`),
    check("Missing complex transfer awards no grade", missingTransfer.status === "INCOMPLETE DATA" && missingTransfer.assessments.minimum.winningLevel == null, "INCOMPLETE DATA, no grade", `${missingTransfer.status}/${missingTransfer.assessments.minimum.winningLevel}`),
    check("Missing product capability awards no grade", missingProduct.status === "INCOMPLETE DATA" && missingProduct.assessments.minimum.winningLevel == null, "INCOMPLETE DATA, no grade", `${missingProduct.status}/${missingProduct.assessments.minimum.winningLevel}`),
  ];
}

function runSourceIntegrityFixtures() {
  const validSub = syntheticSub("s1");
  const cases = [
    ["Missing active source ID", [{ ...validSub, id: "" }], [transfer("s1")]],
    ["Duplicate active source IDs", [validSub, { ...validSub }], [transfer("s1")]],
    ["Missing transfer source ID", [validSub], [{ ...transfer("s1"), sourceId: "" }]],
    ["Duplicate transfer source IDs", [validSub], [transfer("s1"), transfer("s1")]],
    ["Missing matching transfer", [validSub], [transfer("other")]],
    ["Orphan transfer", [validSub], [transfer("s1"), transfer("orphan")]],
    ["Insufficient transfer points", [validSub], [{ sourceId: "s1", points: [{ frequency: 80, re: REF_AMPLITUDE, im: 0 }] }]],
  ];
  return cases.map(([name, activeSubs, perSourceComplexTransfers]) => {
    const result = production({ activeSubs, perSourceComplexTransfers });
    return check(name, result.status === "INCOMPLETE DATA" && result.assessments.minimum.winningLevel == null, "INCOMPLETE DATA, no grade", `${result.status}/${result.assessments.minimum.winningLevel}`);
  });
}

function runEqFixtures() {
  const noEq = production();
  const boost80 = production({ combinedEqCurve: [{ frequency: 15, spl: 0 }, { frequency: 79, spl: 0 }, { frequency: 80, spl: 3 }, { frequency: 81, spl: 0 }, { frequency: 120, spl: 0 }] });
  const boost150 = production({ combinedEqCurve: [{ frequency: 15, spl: 0 }, { frequency: 120, spl: 0 }, { frequency: 150, spl: 6 }] });
  const cuts = production({ combinedEqCurve: [{ frequency: 15, spl: -4 }, { frequency: 120, spl: -4 }] });
  const raw80 = boost80.curves.rawDeliveredCurve.find((point) => Math.abs(point.frequency - 80) < 1e-9);
  const post80 = boost80.curves.postEqDeliveredCurve.find((point) => Math.abs(point.frequency - 80) < 1e-9);
  return [
    check("Positive EQ at 80 Hz consumes capability", Math.abs((raw80.spl - post80.spl) - 3) < 1e-9 && boost80.eqHeadroom.maximumPositiveEqCostDb === 3, "3 dB", boost80.eqHeadroom.maximumPositiveEqCostDb),
    check("Positive EQ above 120 Hz consumes no capability", boost150.eqHeadroom.maximumPositiveEqCostDb === 0 && curveEqual(noEq.curves.postEqDeliveredCurve, boost150.curves.postEqDeliveredCurve), "0 dB", boost150.eqHeadroom.maximumPositiveEqCostDb),
    check("Cut-only EQ consumes no headroom", cuts.eqHeadroom.maximumPositiveEqCostDb === 0, "0 dB", cuts.eqHeadroom.maximumPositiveEqCostDb),
  ];
}

function runIsolationAndDeterminismFixtures() {
  const scalarA = production({ legacyScalarDiagnostic: 100 });
  const scalarB = production({ legacyScalarDiagnostic: 130 });
  const first = production();
  const second = production();
  const serialized = JSON.stringify(first);
  return [
    check("Legacy scalar is explicitly non-authoritative", scalarA.legacyScalarDiagnostic.authoritative === false, "false", scalarA.legacyScalarDiagnostic.authoritative),
    check("Legacy scalar cannot change paired output", JSON.stringify(withoutLegacyValue(scalarA)) === JSON.stringify(withoutLegacyValue(scalarB)), "deep equality excluding diagnostic value", "equal"),
    check("Deterministic deep equality", JSON.stringify(first) === JSON.stringify(second), "equal", "equal"),
    check("JSON serialization round trip", JSON.stringify(JSON.parse(serialized)) === serialized, "stable JSON", `${serialized.length} characters`),
    check("Canonical result validates", validatePairedP14P18ProductionAuthorityResult(first).valid, "valid", validatePairedP14P18ProductionAuthorityResult(first).reason),
  ];
}

function runValidationRejectionFixtures() {
  const valid = production();
  const cases = [
    ["Validation rejects unknown schema", (item) => { item.schemaVersion = "unknown"; }],
    ["Validation rejects unknown method", (item) => { item.authority.method = "unknown"; }],
    ["Validation rejects unknown version", (item) => { item.authority.version = "unknown"; }],
    ["Validation rejects unknown status", (item) => { item.status = "INCOMPLETE"; }],
    ["Validation rejects missing authority metadata", (item) => { delete item.authority; }],
    ["Validation rejects incomplete assessment with grade", (item) => { item.assessments.minimum.status = "INCOMPLETE DATA"; item.assessments.minimum.winningLevel = "L1"; item.assessments.minimum.winningLevelNumber = 1; }],
    ["Validation rejects PASS without grade", (item) => { item.assessments.minimum.status = "PASS"; item.assessments.minimum.winningLevel = null; item.assessments.minimum.winningLevelNumber = null; }],
    ["Validation rejects inconsistent shortfall", (item) => { item.limitingResult.marginDb = -2; item.limitingResult.shortfallDb = 1; }],
    ["Validation rejects duplicate source IDs", (item) => { item.sources.activeSourceIds.push(item.sources.activeSourceIds[0]); }],
    ["Validation rejects unsupported PASS level", (item) => { item.coverage.sharedFrequencyRangeHz[0] = 20; item.assessments.minimum.levels.L4.status = "PASS"; item.assessments.minimum.levels.L4.passes = true; }],
  ];
  const checks = cases.map(([name, mutate]) => {
    const invalid = clone(valid);
    mutate(invalid);
    const validation = validatePairedP14P18ProductionAuthorityResult(invalid);
    return check(name, !validation.valid, "invalid", validation.valid ? "valid" : validation.reason);
  });
  const nonFinite = clone(valid);
  nonFinite.curves.rawDeliveredCurve[0].spl = Infinity;
  const nonFiniteValidation = validatePairedP14P18ProductionAuthorityResult(nonFinite);
  checks.push(check("Validation rejects non-finite curve points", !nonFiniteValidation.valid, "invalid", nonFiniteValidation.valid ? "valid" : nonFiniteValidation.reason));
  return checks;
}

function runShadowParityFixtures() {
  return ["minimum", "recommended"].map((targetBasis) => {
    const activeSubs = [syntheticSub("s1"), syntheticSub("s2")];
    const perSourceComplexTransfers = [transfer("s1"), transfer("s2", 0.15)];
    const combinedEqCurve = [{ frequency: 15, spl: 0 }, { frequency: 80, spl: 2 }, { frequency: 120, spl: 0 }];
    const shadow = assessShadowPairedP14P18({ activeSubs, perSourceComplexTransfers, combinedEqCurve, targetBasis });
    const result = production({ activeSubs, perSourceComplexTransfers, combinedEqCurve, targetBasis });
    const assessment = result.assessments[targetBasis];
    const statusesMatch = shadow.levelResults.every((level) => assessment.levels[level.level].status === level.status);
    const curvesMatch = curveEqual(result.curves.rawDeliveredCurve, shadow.rawDeliveredCurve.map(({ frequency, spl, re, im, energeticSpl }) => ({ frequency, spl, re, im, energeticSpl })))
      && curveEqual(result.curves.postEqDeliveredCurve, shadow.postEqDeliveredCurve.map(({ frequency, spl, positiveEqCostDb }) => ({ frequency, spl, positiveEqCostDb })))
      && curveEqual(result.curves.smoothedDeliveredCurve, shadow.smoothedDeliveredCurve);
    return check(`Shadow parity ${targetBasis}`, statusesMatch && curvesMatch, "identical supported statuses and curves", `${statusesMatch}/${curvesMatch}`);
  });
}

export function runPairedP14P18ProductionAuthorityFixtures() {
  const checks = [
    ...runLiveLayoutFixtures(),
    ...runProductAndBasisFixtures(),
    ...runCoverageFixtures(),
    ...runSourceIntegrityFixtures(),
    ...runEqFixtures(),
    ...runIsolationAndDeterminismFixtures(),
    ...runValidationRejectionFixtures(),
    ...runShadowParityFixtures(),
  ];
  return {
    authority: { method: PAIRED_P14_P18_AUTHORITY_METHOD, version: PAIRED_P14_P18_AUTHORITY_VERSION, schemaVersion: PAIRED_P14_P18_CONTRACT_SCHEMA_VERSION },
    checks,
    passed: checks.filter((item) => item.passed).length,
    total: checks.length,
    allPassed: checks.every((item) => item.passed),
  };
}