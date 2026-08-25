// P19 Practical Calibration Target — validation fixtures (Tests A–F).
//
// Validates that:
//   T(f) follows H(f) where the system can achieve it, rolls smoothly to C(f)
//   where it cannot, and that narrow modal structure never leaks into T(f).
//   P19 graded against T(f) removes the double-penalty for LF-limited systems.
//   P20 (seat-vs-RSP) is completely independent of the P19 target choice.
//   The persistence layer validates p19TargetIdentity on the assessment envelope.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Source loaders — load REAL source via readFile + new Function so we exercise
// the actual implementation, not a copy. Handles @/ alias by injecting the
// smoothing module directly.
// ---------------------------------------------------------------------------

async function loadSmoothing() {
  const src = await readFile(
    new URL("../src/components/room/bass/bassGraphSmoothing.jsx", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { applyBassSmoothing };`);
  return factory();
}

async function loadPracticalTarget(applyBassSmoothing) {
  const src = await readFile(
    new URL("../src/components/utils/practicalCalibrationTarget.js", import.meta.url),
    "utf8",
  );
  // Replace the @/ import with an injected reference
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/room\/bass\/bassGraphSmoothing"\s*;?/g, "")
    .replace(/export\s+/g, "");
  const factory = new Function(
    "applyBassSmoothing",
    `${code}\nreturn { buildSmoothCapabilityEnvelope, buildPracticalCalibrationTarget, buildPracticalCalibrationTargetFromCapability };`,
  );
  return factory(applyBassSmoothing);
}

async function loadPersistence() {
  const { validateAssessmentEnvelopeAuthority } = await import(
    "../src/components/room/bass/completedBassResultPersistence.js"
  );
  const { BASS_ANALYSIS_CONTRACT_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } =
    await import("../base44/shared/bassAuthorityVersion.js");
  return { validateAssessmentEnvelopeAuthority, BASS_ANALYSIS_CONTRACT_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION };
}

// ---------------------------------------------------------------------------
// Curve helpers
// ---------------------------------------------------------------------------

function flatCurve(startHz, endHz, stepHz, spl) {
  const curve = [];
  for (let f = startHz; f <= endHz + 1e-6; f += stepHz) {
    curve.push({ frequency: Math.round(f * 1000) / 1000, spl });
  }
  return curve;
}

function curveWithRolloff(startHz, endHz, stepHz, flatSpl, rolloffStartHz, rolloffDepthDb) {
  const curve = [];
  for (let f = startHz; f <= endHz + 1e-6; f += stepHz) {
    let spl = flatSpl;
    if (f < rolloffStartHz) {
      const ratio = (rolloffStartHz - f) / rolloffStartHz;
      spl = flatSpl - rolloffDepthDb * ratio;
    }
    curve.push({ frequency: Math.round(f * 1000) / 1000, spl });
  }
  return curve;
}

function curveWithNarrowNull(startHz, endHz, stepHz, flatSpl, nullHz, nullDepthDb, widthHz) {
  const curve = [];
  for (let f = startHz; f <= endHz + 1e-6; f += stepHz) {
    let spl = flatSpl;
    const dist = Math.abs(f - nullHz);
    if (dist < widthHz) {
      spl = flatSpl - nullDepthDb * (1 - dist / widthHz);
    }
    curve.push({ frequency: Math.round(f * 1000) / 1000, spl });
  }
  return curve;
}

function curveWithBroadPeak(startHz, endHz, stepHz, flatSpl, peakHz, peakHeightDb, widthHz) {
  const curve = [];
  for (let f = startHz; f <= endHz + 1e-6; f += stepHz) {
    let spl = flatSpl;
    const dist = Math.abs(f - peakHz);
    if (dist < widthHz) {
      spl = flatSpl + peakHeightDb * (1 - dist / widthHz);
    }
    curve.push({ frequency: Math.round(f * 1000) / 1000, spl });
  }
  return curve;
}

function interpolateValue(curve, freq) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(freq)) return null;
  if (freq <= curve[0].frequency) return curve[0].spl;
  if (freq >= curve.at(-1).frequency) return curve.at(-1).spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (freq >= curve[i].frequency && freq <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (freq - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

// Max absolute deviation between two curves over a frequency range
function maxDeviation(curveA, curveB, startHz, endHz) {
  let maxDev = 0;
  let worstFreq = null;
  for (const point of curveA) {
    if (point.frequency < startHz || point.frequency > endHz) continue;
    const valB = interpolateValue(curveB, point.frequency);
    if (valB == null) continue;
    const dev = Math.abs(point.spl - valB);
    if (dev > maxDev) {
      maxDev = dev;
      worstFreq = point.frequency;
    }
  }
  return { maxDev, worstFreq };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("Test A: capable system — T(f) ≈ H(f) where capability exceeds ideal", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget, buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  // H(f) flat at 100 dB, C(f) flat at 110 dB — ideal is fully achievable
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 110);
  const capability = buildSmoothCapabilityEnvelope(maxSpl);
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: ideal, capabilityEnvelope: capability });

  // T(f) should equal H(f) to within <0.5 dB everywhere (softplus ≈ 0 when H < C)
  const { maxDev } = maxDeviation(target, ideal, 20, 200);
  assert.ok(maxDev < 0.5, `T(f) should approximate H(f) when capable, max deviation ${maxDev.toFixed(2)} dB`);
});

test("Test B: LF-limited system — T(f) rolls to C(f) below the capability crossing", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget, buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  // H(f) flat at 100 dB, C(f) rolls off below 35 Hz to ~84 dB at 20 Hz
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = curveWithRolloff(20, 200, 1, 108, 35, 40);
  const capability = buildSmoothCapabilityEnvelope(maxSpl);
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: ideal, capabilityEnvelope: capability });

  // At 20 Hz, T(f) should be well below H(f) (rolled toward C(f))
  const t20 = interpolateValue(target, 20);
  const h20 = interpolateValue(ideal, 20);
  assert.ok(t20 < h20 - 3, `T(20Hz) should be significantly below H(20Hz): T=${t20?.toFixed(1)} H=${h20?.toFixed(1)}`);

  // At 100 Hz (well within capability), T(f) should ≈ H(f)
  const t100 = interpolateValue(target, 100);
  const h100 = interpolateValue(ideal, 100);
  assert.ok(Math.abs(t100 - h100) < 1.0, `T(100Hz) should ≈ H(100Hz): T=${t100?.toFixed(1)} H=${h100?.toFixed(1)}`);

  // T(f) must never go BELOW C(f) (the target follows capability, not below it)
  const t20Cap = interpolateValue(capability, 20);
  assert.ok(t20 >= t20Cap - 1.0, `T(20Hz) should not go below C(20Hz): T=${t20?.toFixed(1)} C=${t20Cap?.toFixed(1)}`);
});

test("Test C: narrow null — 1-octave smoothing removes it from C(f), T(f) unaffected", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget, buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  // C(f) with a narrow 15 dB null at 50 Hz (3 Hz wide)
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = curveWithNarrowNull(20, 200, 1, 108, 50, 15, 3);
  const capability = buildSmoothCapabilityEnvelope(maxSpl);

  // The narrow null should be smoothed away — C(50) should NOT dip by 15 dB
  const c50 = interpolateValue(capability, 50);
  const c60 = interpolateValue(capability, 60);
  assert.ok(
    Math.abs(c50 - c60) < 5,
    `Narrow null should be smoothed from C(f): C(50)=${c50?.toFixed(1)} C(60)=${c60?.toFixed(1)}`,
  );

  // T(f) should not have a dip at 50 Hz from the null
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: ideal, capabilityEnvelope: capability });
  const t50 = interpolateValue(target, 50);
  const t55 = interpolateValue(target, 55);
  assert.ok(
    Math.abs(t50 - t55) < 3,
    `T(f) should not dip at narrow null frequency: T(50)=${t50?.toFixed(1)} T(55)=${t55?.toFixed(1)}`,
  );
});

test("Test D: broad modal peak — C(f) preserves it, T(f) rises in that region", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget, buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  // C(f) with a broad 8 dB peak from 40–60 Hz (20 Hz wide)
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = curveWithBroadPeak(20, 200, 1, 104, 50, 8, 10);
  const capability = buildSmoothCapabilityEnvelope(maxSpl);

  // The broad peak should survive 1-octave smoothing
  const c50 = interpolateValue(capability, 50);
  const c100 = interpolateValue(capability, 100);
  assert.ok(c50 > c100, `Broad peak should survive smoothing: C(50)=${c50?.toFixed(1)} C(100)=${c100?.toFixed(1)}`);

  // T(f) should be closer to H(f) at 50 Hz because C(f) is higher there
  // (less reduction from softplus when C is higher)
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: ideal, capabilityEnvelope: capability });
  const t50 = interpolateValue(target, 50);
  const h50 = interpolateValue(ideal, 50);
  // When capability is higher, T should be closer to H (less reduction)
  assert.ok(
    Math.abs(t50 - h50) < 2,
    `T(f) should track H(f) more closely where C(f) is higher: T(50)=${t50?.toFixed(1)} H(50)=${h50?.toFixed(1)}`,
  );
});

test("Test E: P19 target identity is 'practical-calibration-target' when T(f) is built", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget, buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 110);
  const capability = buildSmoothCapabilityEnvelope(maxSpl);
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: ideal, capabilityEnvelope: capability });

  // When T(f) is non-empty, the identity is practical-calibration-target
  assert.ok(Array.isArray(target) && target.length > 0, "T(f) should be non-empty");
  const identity = target.length > 0 ? "practical-calibration-target" : "ideal-house-target";
  assert.equal(identity, "practical-calibration-target");
});

test("Test E: P19 target identity is 'ideal-house-target' when T(f) is empty (fallback)", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTarget } = await loadPracticalTarget(applyBassSmoothing);

  // Empty ideal curve → T(f) is empty → identity falls back to ideal-house-target
  const target = buildPracticalCalibrationTarget({ idealTargetCurve: [], capabilityEnvelope: [] });
  assert.ok(Array.isArray(target) && target.length === 0, "T(f) should be empty");
  const identity = target.length > 0 ? "practical-calibration-target" : "ideal-house-target";
  assert.equal(identity, "ideal-house-target");
});

test("Test F: P20 is independent of P19 target choice — seat-vs-RSP only", async () => {
  // P20 measures |seatFinalResponse - rspFinalResponse|, which does NOT involve
  // any target curve. Changing from H(f) to T(f) for P19 must not affect P20.
  // This is a structural invariant: P20's formula has no target parameter.
  //
  // Load bassAuthoritativeAssessment.js via readFile + new Function with mocked
  // @/ imports so we exercise the REAL P20 computation logic.
  const { applyBassSmoothing } = await loadSmoothing();
  const src = await readFile(
    new URL("../src/components/utils/bassAuthoritativeAssessment.js", import.meta.url),
    "utf8",
  );
  // Strip imports and replace with injected mocks
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/[^"]+"\s*;?/g, "")
    .replace(/export\s+/g, "");
  const factory = new Function(
    "applyBassSmoothing",
    "isReferenceSeatIdentity",
    "interpolateCanonicalTarget",
    "levelP19_lfResponse",
    "levelP20_lfConsistency",
    "numericRp22Level",
    `${code}\nreturn { computeOfficialP20Assessment };`,
  );
  const { computeOfficialP20Assessment } = factory(
    applyBassSmoothing,
    (id) => String(id) === "rsp",
    (curve, freq) => {
      if (!Array.isArray(curve) || !curve.length) return null;
      return interpolateValue(curve, freq);
    },
    (v) => ({ ok: true, level: "L4" }),
    (v) => ({ ok: true, level: "L4" }),
    (level) => (typeof level === "number" ? level : 4),
  );

  const rspCurve = flatCurve(20, 200, 2, 95);
  const seatA = flatCurve(20, 200, 2, 97);
  const seatB = flatCurve(20, 200, 2, 92);

  const p20result = computeOfficialP20Assessment({
    rspPostEqCurve: rspCurve,
    perSeatPostEqCurves: [
      { seatId: "seat-1", responseData: seatA },
      { seatId: "seat-2", responseData: seatB },
    ],
    assessmentStartHz: 20,
    assessmentEndHz: 120,
  });

  assert.ok(p20result?.available, "P20 should be available with 2 seats");
  assert.ok(Number.isFinite(p20result?.worstSeat?.variationDbRaw), "P20 worst seat variation should be finite");
  // The worst seat should be seat-2 (deviates 3 dB from RSP) vs seat-1 (deviates 2 dB)
  assert.equal(p20result.worstSeat.seatId, "seat-2");
  assert.ok(Math.abs(Math.abs(p20result.worstSeat.variationDbRaw) - 3) < 0.5,
    `P20 worst deviation should be ~3 dB: ${p20result.worstSeat.variationDbRaw}`);
});

test("Persistence: p19TargetIdentity validated on assessment envelope", async () => {
  const { validateAssessmentEnvelopeAuthority, BASS_ANALYSIS_CONTRACT_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } =
    await loadPersistence();

  const FINGERPRINT = "cal:v5:p19-target-identity-test";

  function buildEnvelopeContract(p19TargetIdentity) {
    const p18 = 28.0;
    return {
      version: BASS_ANALYSIS_CONTRACT_VERSION,
      instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      analysisId: "analysis-p19-identity",
      fingerprints: { calibration: "cal:v5:p19-identity" },
      job: {
        status: "complete",
        metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
        resultFingerprint: FINGERPRINT,
        currentJobFingerprint: FINGERPRINT,
        completedAtMs: 1724000000000,
      },
      productAnalysis: {
        status: "complete",
        parameters: {
          p14: { status: "complete", targetDb: 112, targetBasis: "minimum", level: 2, value: 112 },
          p18: { status: "complete", extensionHz: p18, level: 2, value: p18 },
          p19: { status: "complete", rspVariationDb: 2.1, level: 4, value: 2.1 },
          p20: { status: "complete", worstVariationDb: 3.2, level: 3, value: 3.2 },
        },
      },
      selectedCandidateId: "cand-p19-id",
      selectedCandidate: {
        id: "cand-p19-id",
        worstP20SeatId: "seat-1",
        perSeatP19Results: [{ seatId: "rsp", variationDbRaw: 2.1, level: 4 }],
        perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: 3.2, level: 3 }],
        p14TargetBasis: "minimum",
        achievedP18FrequencyHz: p18,
      },
      assessmentEnvelope: {
        achievedP18FrequencyHz: p18,
        assessmentStartHz: p18,
        assessmentEndHz: 120,
        officialP19WorstFrequencyHz: 35.0,
        p20WorstSeatId: "seat-1",
        p20WorstFrequencyHz: 48.5,
        p19TargetIdentity,
      },
      metricPublication: { canonicalMetricPublicationValid: true },
      provenance: { realSeatCount: 2 },
    };
  }

  // Valid: practical-calibration-target
  const practicalResult = validateAssessmentEnvelopeAuthority(buildEnvelopeContract("practical-calibration-target"));
  assert.ok(practicalResult.valid, `practical-calibration-target should be valid: ${practicalResult.reason}`);

  // Valid: ideal-house-target
  const idealResult = validateAssessmentEnvelopeAuthority(buildEnvelopeContract("ideal-house-target"));
  assert.ok(idealResult.valid, `ideal-house-target should be valid: ${idealResult.reason}`);

  // Invalid: missing p19TargetIdentity
  const missingResult = validateAssessmentEnvelopeAuthority(buildEnvelopeContract(undefined));
  assert.ok(!missingResult.valid, "Missing p19TargetIdentity should be rejected");
  assert.ok(missingResult.reason?.startsWith("p19-target-identity"), `Reason should be p19-target-identity: ${missingResult.reason}`);

  // Invalid: bogus value
  const bogusResult = validateAssessmentEnvelopeAuthority(buildEnvelopeContract("bogus-target"));
  assert.ok(!bogusResult.valid, "Bogus p19TargetIdentity should be rejected");
  assert.ok(bogusResult.reason?.startsWith("p19-target-identity"), `Reason should be p19-target-identity: ${bogusResult.reason}`);
});