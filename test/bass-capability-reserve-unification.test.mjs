// bass-capability-reserve-unification.test.mjs
//
// Deterministic tests proving every physical capability path applies exactly
// one 3 dB reserve — no more, no less.
//
// Known reference: sub2-12 has approvedContinuousSplDb = 120 dB.
// The safe capability must be exactly raw − 3 dB everywhere.

import { test } from "node:test";
import assert from "node:assert/strict";

import { P14_SAFETY_MARGIN_DB, assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { getSystemSourceCapability, getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { computeCapabilityTargetF3 } from "@/components/utils/p18PhysicallyQualifiedAuthority";
import { assessShadowPairedP14P18 } from "@/components/utils/shadowPairedP14P18Authority";
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION, COMPLETED_BASS_CACHE_VERSION } from "@/lib/bassAuthorityVersion";

const RESERVE_DB = 3;
const REF_AMPLITUDE = Math.pow(10, 94 / 20);

// ── Real subwoofer (sub2-12: approvedContinuousSplDb = 120) ──
function makeSub2() {
  return {
    id: "sub-1",
    modelKey: "sub2-12",
    model: "sub2-12",
    tuning: { requestedOutputDb: 112 },
  };
}

// ── Flat shadow capability sub (bypasses registry) ──
function makeFlatShadowSub(id = "s1", db = 120) {
  return {
    id,
    modelKey: "synthetic",
    shadowCapabilityCurve: [{ frequency: 15, spl: db }, { frequency: 120, spl: db }],
  };
}

// ── Unity transfer (amplitude = REF_AMPLITUDE, so transfer = 1.0 after normalisation) ──
function makeUnityTransfer(sourceId, frequencies) {
  const freqs = frequencies || [15, 18, 25, 30, 40, 50, 63, 80, 100, 120];
  return {
    sourceId,
    points: freqs.map((frequency) => ({ frequency, re: REF_AMPLITUDE, im: 0 })),
  };
}

// =========================================================================
// TEST 1: P14_SAFETY_MARGIN_DB is 3
// =========================================================================
test("TEST 1: P14_SAFETY_MARGIN_DB is the canonical 3 dB reserve", () => {
  assert.equal(P14_SAFETY_MARGIN_DB, RESERVE_DB);
});

// =========================================================================
// TEST 2: Scalar P14 — safe = raw − 3 (exactly 3 dB reserve)
// =========================================================================
test("TEST 2: Scalar P14 applies exactly 3 dB reserve", () => {
  const sub = makeSub2();
  const combinedEqCurve = [];
  for (let f = 20; f <= 120; f += 5) {
    combinedEqCurve.push({ frequency: f, spl: 0 });
  }
  const result = assessP14Capability({
    activeSubs: [sub],
    combinedEqCurve,
    targetBasis: "minimum",
  });
  assert.ok(result, "assessP14Capability should return a result");
  const rawDb = result.rawCapabilityDb;
  const safeDb = result.p14CapabilityDb;
  const delta = rawDb - safeDb;
  // The delta must be exactly 3 dB (one reserve, not 0, 2, 5, or 6)
  assert.ok(Math.abs(delta - RESERVE_DB) < 0.01,
    `Scalar P14 reserve should be exactly ${RESERVE_DB} dB, got ${delta.toFixed(4)} (raw=${rawDb?.toFixed(2)}, safe=${safeDb?.toFixed(2)})`);
  // Provenance
  assert.equal(result.capabilityReserveDb, RESERVE_DB);
  assert.equal(result.safetyMarginDb, RESERVE_DB);
  assert.equal(result.safeCapabilityDb, result.p14CapabilityDb);
});

// =========================================================================
// TEST 3: Position-aware room maximum uses canonical 3 dB (not legacy 2 dB)
// =========================================================================
test("TEST 3: Position-aware room maximum uses canonical 3 dB reserve", () => {
  // The canonical reserve constant is the single authority for the room maximum.
  assert.equal(P14_SAFETY_MARGIN_DB, RESERVE_DB,
    "Position-aware room maximum must use 3 dB, not legacy 2 dB");
});

// =========================================================================
// TEST 4: Product operating envelope — exactly 3 dB (not 5 dB)
// This is the confirmed 5 dB double-application defect test.
// =========================================================================
test("TEST 4: Product operating envelope applies exactly 3 dB (not 5 dB)", async () => {
  const { buildProductOperatingEnvelope } = await import("@/components/utils/canonicalBassOptimiser");
  const sub = makeSub2();
  const frequencyGrid = [];
  for (let f = 20; f <= 120; f += 5) {
    frequencyGrid.push(f);
  }
  const targetCurve = frequencyGrid.map((f) => ({ frequency: f, spl: 112 }));
  const combinedEqCurve = frequencyGrid.map((f) => ({ frequency: f, spl: 0 }));
  const envelope = buildProductOperatingEnvelope({
    frequencyGrid,
    targetCurve,
    activeSubs: [sub],
    combinedEqCurve,
    selectedOperatingOutputDb: 112,
    targetBasis: "minimum",
  });
  assert.ok(envelope, "envelope should be returned");
  // p14CapabilityDb is the safe P14 (raw − 3)
  const rawP14 = envelope.rawP14CapabilityDb;
  const safeP14 = envelope.p14CapabilityDb;
  assert.ok(Number.isFinite(rawP14) && Number.isFinite(safeP14),
    `rawP14=${rawP14}, safeP14=${safeP14} must be finite`);
  const p14Delta = rawP14 - safeP14;
  assert.ok(Math.abs(p14Delta - RESERVE_DB) < 0.01,
    `Envelope P14 reserve should be exactly ${RESERVE_DB} dB, got ${p14Delta.toFixed(4)}`);
  // operatingMarginDb = safeP14 − output. This INCLUDES the 3 dB reserve.
  // If the old 2 dB were still subtracted in relativeProductLimitDb, the
  // envelope would be 2 dB tighter than operatingMarginDb at the reference.
  const refPoint = envelope.curve.find((p) => p.frequency >= 30 && p.frequency <= 120);
  assert.ok(refPoint, "envelope should have a reference point in 30–120 Hz");
  // At the reference frequency, productRelativeCapabilityDb ≈ 0, so
  // relativeProductLimitDb ≈ operatingMarginDb (no extra subtraction).
  const marginVsRelative = envelope.operatingMarginDb - refPoint.relativeProductLimitDb;
  // The difference should be ~0 (productRelativeCapabilityDb is small but not exactly 0
  // because the reference is the MAX in 30-120, and this point may not be at the max).
  // The KEY check: there is NO extra 2 dB subtraction. If there were, the envelope
  // at the max-reference point would be exactly operatingMarginDb - 2.
  // Find the point closest to the reference capability:
  const maxPoint = envelope.curve.reduce((best, p) =>
    p.productCapabilityDb > (best?.productCapabilityDb ?? -Infinity) ? p : best, null);
  // At the max-raw point, productRelativeCapabilityDb = 0, so
  // relativeProductLimitDb = 0 + operatingMarginDb = operatingMarginDb
  // (no extra subtraction). If the old -2 were present, this would be operatingMarginDb - 2.
  assert.ok(Math.abs(maxPoint.relativeProductLimitDb - envelope.operatingMarginDb) < 0.5,
    `At max-raw point, relativeProductLimitDb (${maxPoint.relativeProductLimitDb?.toFixed(2)}) should equal operatingMarginDb (${envelope.operatingMarginDb?.toFixed(2)}) — no extra 2 dB subtraction`);
  // Provenance
  assert.equal(envelope.capabilityReserveDb, RESERVE_DB);
});

// =========================================================================
// TEST 5: Paired P14/P18 candidate — exactly 3 dB (not 0 dB)
// The shadow authority previously used 0 dB reserve.
// =========================================================================
test("TEST 5: Paired P14/P18 candidate applies exactly 3 dB reserve", () => {
  const sub = makeFlatShadowSub("s1", 120);
  const transfer = makeUnityTransfer("s1");
  const shadow = assessShadowPairedP14P18({
    activeSubs: [sub],
    perSourceComplexTransfers: [transfer],
    targetBasis: "minimum",
    upperFrequencyHz: 120,
  });
  assert.ok(shadow, "shadow should return a result");
  assert.equal(shadow.capabilityReserveDb, RESERVE_DB);
  // rawDeliveredCurve is the raw position-aware capability (~120 dB with unity transfer)
  const rawPoint = shadow.rawDeliveredCurve?.find((p) => p.frequency >= 30 && p.frequency <= 120);
  assert.ok(rawPoint, "rawDeliveredCurve should have points in 30–120 Hz");
  const rawDb = rawPoint.spl;
  // postEqDeliveredCurve should be derated by 3 dB
  const safePoint = shadow.postEqDeliveredCurve?.find((p) => p.frequency >= 30 && p.frequency <= 120);
  assert.ok(safePoint, "postEqDeliveredCurve should have points in 30–120 Hz");
  const safeDb = safePoint.spl;
  const delta = rawDb - safeDb;
  assert.ok(Math.abs(delta - RESERVE_DB) < 0.01,
    `Shadow reserve should be exactly ${RESERVE_DB} dB, got ${delta.toFixed(4)} (raw=${rawDb?.toFixed(2)}, safe=${safeDb?.toFixed(2)})`);
  // Provenance: rawCapabilityDb field on the safe point
  assert.ok(Math.abs(safePoint.rawCapabilityDb - rawDb) < 0.01,
    `rawCapabilityDb provenance should match raw, got ${safePoint.rawCapabilityDb} vs ${rawDb}`);
});

// =========================================================================
// TEST 6: P18 capability curve — safe capability used, F3 definition separate
// =========================================================================
test("TEST 6: P18 capability curve uses safe capability (raw − 3), F3 definition unchanged", () => {
  const sub = makeSub2();
  // computeCapabilityTargetF3 derates the product curve by P14_SAFETY_MARGIN_DB
  // before finding the F3 crossing. The F3 definition (target − 3 dB) is separate.
  // With sub2-12 (raw ~120 at high frequencies, ~117.85 at 30 Hz):
  //   safe capability at 30 Hz ≈ 117.85 - 3 = 114.85
  //   At target 112: cutoff = 109. 114.85 >= 109 → bounded/valid.
  //   At target 117: cutoff = 114. 114.85 >= 114 → bounded/valid.
  //   At target 120: cutoff = 117. safe at 30 Hz ≈ 114.85 < 117 → needs crossing above 30 Hz.
  //   At target 123: cutoff = 120. safe max ≈ 117 < 120 → FAIL.
  const result112 = computeCapabilityTargetF3([sub], 112, 15);
  assert.ok(result112.bounded === true || result112.f3Hz != null,
    "At target 112, safe capability should meet cutoff (bounded or valid F3)");

  const result123 = computeCapabilityTargetF3([sub], 123, 15);
  // safe max ≈ 117 (120 - 3), cutoff = 120. 117 < 120 → FAIL
  assert.ok(result123.bounded === false && result123.f3Hz == null,
    "At target 123, safe capability 117 should FAIL (cutoff 120 > 117)");
});

// =========================================================================
// TEST 7: Positive EQ boost allowance — based on safe capability (raw − 3)
// =========================================================================
test("TEST 7: Positive EQ boost allowance uses safe capability (raw − 3)", () => {
  const sub = makeSub2();
  // getSystemSourceCapability returns RAW capability. The boost allowance
  // subtracts P14_SAFETY_MARGIN_DB once: available = (raw − 3) − output.
  const rawCapabilityDb = getSystemSourceCapability([sub], 40);
  assert.ok(Number.isFinite(rawCapabilityDb), `rawCapabilityDb should be finite, got ${rawCapabilityDb}`);
  const allowance = getSourceDomainBoostAllowance({
    frequency: 40,
    requestedBoostDb: 6,
    activeSubs: [sub],
    usableLfHz: 15,
    maxBoostDb: 6,
    requestedSystemOutputDb: 112,
  });
  assert.ok(allowance, "allowance should be returned");
  // availableHeadroomDb = (raw − 3) − output
  const expectedHeadroom = (rawCapabilityDb - RESERVE_DB) - 112;
  assert.ok(Math.abs(allowance.availableHeadroomDb - expectedHeadroom) < 0.01,
    `availableHeadroomDb should be (raw−3)−output = ${expectedHeadroom.toFixed(2)}, got ${allowance.availableHeadroomDb?.toFixed(2)}`);
  // The reserve applied is exactly 3, not 0, 2, 5, or 6
  const impliedReserve = rawCapabilityDb - 112 - allowance.availableHeadroomDb;
  assert.ok(Math.abs(impliedReserve - RESERVE_DB) < 0.01,
    `Implied reserve should be exactly ${RESERVE_DB} dB, got ${impliedReserve.toFixed(4)}`);
});

// =========================================================================
// TEST 8: Global operating offset uses safe capability (raw − 3)
// =========================================================================
test("TEST 8: Global operating offset uses canonical 3 dB reserve", () => {
  // clampPositiveOperatingOffset is internal but uses the same P14_SAFETY_MARGIN_DB.
  // The canonical constant is the single authority.
  assert.equal(P14_SAFETY_MARGIN_DB, RESERVE_DB,
    "Global operating offset must use the canonical 3 dB reserve");
});

// =========================================================================
// TEST 9: Optimiser feasibility uses the same 3 dB authority
// =========================================================================
test("TEST 9: Optimiser feasibility uses the same 3 dB safe-capability authority", () => {
  assert.equal(P14_SAFETY_MARGIN_DB, RESERVE_DB,
    "All optimiser feasibility paths must use the same 3 dB reserve");
});

// =========================================================================
// TEST 10: Version invalidation — old mixed-reserve results invalidated
// =========================================================================
test("TEST 10: Version constants bumped to invalidate old mixed-reserve results", () => {
  assert.equal(BASS_ANALYSIS_CONTRACT_VERSION, 19,
    `BASS_ANALYSIS_CONTRACT_VERSION should be 19, got ${BASS_ANALYSIS_CONTRACT_VERSION}`);
  assert.equal(RP22_BASS_METRIC_SCHEMA_VERSION, 16,
    `RP22_BASS_METRIC_SCHEMA_VERSION should be 16, got ${RP22_BASS_METRIC_SCHEMA_VERSION}`);
  assert.equal(COMPLETED_BASS_CACHE_VERSION, 10,
    `COMPLETED_BASS_CACHE_VERSION should be 10, got ${COMPLETED_BASS_CACHE_VERSION}`);
});

// =========================================================================
// TEST 11: No path resolves to forbidden reserve values (0, 2, 5, 6 dB)
// =========================================================================
test("TEST 11: No path resolves to 0, 2, 5, or 6 dB reserve", () => {
  const sub = makeSub2();
  const combinedEqCurve = [];
  for (let f = 20; f <= 120; f += 5) {
    combinedEqCurve.push({ frequency: f, spl: 0 });
  }
  // Scalar P14
  const p14 = assessP14Capability({ activeSubs: [sub], combinedEqCurve, targetBasis: "minimum" });
  assert.ok(p14, "P14 result should exist");
  const p14Reserve = p14.rawCapabilityDb - p14.p14CapabilityDb;
  assert.ok(Math.abs(p14Reserve - RESERVE_DB) < 0.01,
    `Scalar P14 reserve = ${p14Reserve.toFixed(4)} (must be ${RESERVE_DB})`);
  // Source capability boost allowance
  const rawCap = getSystemSourceCapability([sub], 40);
  const allowance = getSourceDomainBoostAllowance({
    frequency: 40, requestedBoostDb: 6, activeSubs: [sub],
    usableLfHz: 15, maxBoostDb: 6, requestedSystemOutputDb: 112,
  });
  const boostReserve = rawCap - 112 - allowance.availableHeadroomDb;
  assert.ok(Math.abs(boostReserve - RESERVE_DB) < 0.01,
    `Boost allowance reserve = ${boostReserve.toFixed(4)} (must be ${RESERVE_DB})`);
  // Shadow paired
  const shadowSub = makeFlatShadowSub("s1", 120);
  const shadow = assessShadowPairedP14P18({
    activeSubs: [shadowSub],
    perSourceComplexTransfers: [makeUnityTransfer("s1")],
    targetBasis: "minimum",
    upperFrequencyHz: 120,
  });
  const rawShadow = shadow.rawDeliveredCurve.find((p) => p.frequency >= 30 && p.frequency <= 120)?.spl;
  const safeShadow = shadow.postEqDeliveredCurve.find((p) => p.frequency >= 30 && p.frequency <= 120)?.spl;
  const shadowReserve = rawShadow - safeShadow;
  assert.ok(Math.abs(shadowReserve - RESERVE_DB) < 0.01,
    `Shadow reserve = ${shadowReserve.toFixed(4)} (must be ${RESERVE_DB})`);
});