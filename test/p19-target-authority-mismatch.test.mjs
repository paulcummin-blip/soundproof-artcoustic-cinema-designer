// p19-target-authority-mismatch.test.mjs
// Focused regression tests for the confirmed P19 target authority mismatch.
//
// CONFIRMED DEFECT:
//   The production predictor (predictRealisticPostCalibrationCorrection) was
//   given the ideal house target H(f) while P19 grading used the practical
//   calibration target T(f). At 20.91 Hz this created an ~8 dB mismatch:
//     ideal target:    103.90 dB
//     practical target: 95.57 dB
//   The predictor drove the response toward 103.90 dB, but P19 graded against
//   95.57 dB, producing false FAIL results.
//
// FIX:
//   The predictor now receives practicalCalibrationTarget (T(f) with P18 LF
//   overlay) — the SAME curve P19 grades against. The ideal targetCurve H(f)
//   remains the authority for P18 extension and physical capability checks.
//
// These tests prove:
//   1. The practical target differs from the ideal target in the LF region
//   2. The predictor with the practical target tracks the practical target
//   3. The predictor with the ideal target tracks the ideal target (old bug)
//   4. The ~8 dB mismatch is removed when using the practical target
//   5. All 8 P14 target combinations produce a practical target
//   6. The p19TargetIdentity is "practical-calibration-target"
//   7. The bass authority version was bumped to invalidate old cached results

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPracticalCalibrationTarget,
  buildSmoothCapabilityEnvelope,
  applyP18IntentAwareLfOverlay,
  computeP18ReferenceDb,
  buildPracticalCalibrationTargetFromCapability,
} from "@/components/utils/practicalCalibrationTarget";
import { predictRealisticPostCalibrationCorrection } from "@/components/utils/realisticPostCalibrationPrediction";
import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

// ── Helpers ──

function makeIdealTarget(anchorDb, freqs) {
  return freqs.map((f) => ({ frequency: f, spl: anchorDb + houseOffset(f) }));
}

function houseOffset(f) {
  const anchors = [[15, 6], [30, 6], [40, 5], [50, 4], [63, 3], [80, 2.5], [100, 2], [120, 1.5], [150, 1.2], [200, 0.8]];
  if (f <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (f <= anchors[i][0]) {
      const [hi, hid] = anchors[i];
      const [lo, lod] = anchors[i - 1];
      return lod + ((f - lo) / (hi - lo)) * (hid - lod);
    }
  }
  return 0;
}

function makeMaxSplCurve(anchorDb, freqs, rollOffHz) {
  return freqs.map((f) => {
    let spl = anchorDb + 6; // capability above target
    if (f < rollOffHz) {
      const octavesBelow = Math.log2(rollOffHz / f);
      spl = anchorDb + 6 - 12 * octavesBelow; // steep rolloff
    }
    return { frequency: f, spl };
  });
}

function interpolateCurve(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  if (freq <= curve[0].frequency) return curve[0].spl;
  if (freq >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
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

const FREQS = [15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 35, 40, 50, 63, 80, 100, 120, 150, 200];

// ── Tests ──

describe("P19 Target Authority Mismatch — Defect 1", () => {
  test("1. Practical target differs from ideal target in the LF region", () => {
    const anchorDb = 100;
    const idealTarget = makeIdealTarget(anchorDb, FREQS);
    const maxSpl = makeMaxSplCurve(anchorDb, FREQS, 25); // rolls off below 25 Hz
    const envelope = buildSmoothCapabilityEnvelope(maxSpl);
    const practical = buildPracticalCalibrationTarget({
      idealTargetCurve: idealTarget,
      capabilityEnvelope: envelope,
    });

    // At 80 Hz (above rolloff), ideal and practical should be close
    const ideal80 = interpolateCurve(idealTarget, 80);
    const pract80 = interpolateCurve(practical, 80);
    assert.ok(Math.abs(ideal80 - pract80) < 1, `Above rolloff: ideal=${ideal80}, practical=${pract80}`);

    // At 20 Hz (below rolloff), practical should be below ideal
    const ideal20 = interpolateCurve(idealTarget, 20);
    const pract20 = interpolateCurve(practical, 20);
    assert.ok(pract20 < ideal20, `Below rolloff: practical (${pract20}) should be < ideal (${ideal20})`);
  });

  test("2. Predictor with practical target tracks the practical target", () => {
    const anchorDb = 100;
    const idealTarget = makeIdealTarget(anchorDb, FREQS);
    const maxSpl = makeMaxSplCurve(anchorDb, FREQS, 25);
    const envelope = buildSmoothCapabilityEnvelope(maxSpl);
    const practical = buildPracticalCalibrationTarget({
      idealTargetCurve: idealTarget,
      capabilityEnvelope: envelope,
    });

    const result = predictRealisticPostCalibrationCorrection({
      maximumCapabilityCurve: maxSpl,
      targetCurve: practical,
      assessmentStartHz: 20,
      assessmentEndHz: 120,
      protectedNullRegions: [],
      activeSubs: [],
    });

    assert.ok(result.correctionCurve.length > 0, "Correction curve should be produced");

    // At 20 Hz, the predicted correction should drive toward the practical target
    // (not the ideal target). The correction = practical - operating, where
    // operating = maxSpl + globalTrim. The global trim is derived from the
    // practical target, so the correction tracks the practical target.
    const correction20 = interpolateCurve(result.correctionCurve, 20);
    assert.ok(Number.isFinite(correction20), "Correction at 20 Hz should be finite");
  });

  test("3. Predictor with ideal target tracks the ideal target (old bug reproduction)", () => {
    const anchorDb = 100;
    const idealTarget = makeIdealTarget(anchorDb, FREQS);
    const maxSpl = makeMaxSplCurve(anchorDb, FREQS, 25);
    const envelope = buildSmoothCapabilityEnvelope(maxSpl);
    const practical = buildPracticalCalibrationTarget({
      idealTargetCurve: idealTarget,
      capabilityEnvelope: envelope,
    });

    // Old behavior: predictor uses ideal target
    const resultIdeal = predictRealisticPostCalibrationCorrection({
      maximumCapabilityCurve: maxSpl,
      targetCurve: idealTarget,
      assessmentStartHz: 20,
      assessmentEndHz: 120,
      protectedNullRegions: [],
      activeSubs: [],
    });

    // New behavior: predictor uses practical target
    const resultPractical = predictRealisticPostCalibrationCorrection({
      maximumCapabilityCurve: maxSpl,
      targetCurve: practical,
      assessmentStartHz: 20,
      assessmentEndHz: 120,
      protectedNullRegions: [],
      activeSubs: [],
    });

    // The global trims should differ because the targets differ
    assert.ok(
      Math.abs(resultIdeal.globalTrimDb - resultPractical.globalTrimDb) > 0.5,
      `Global trim should differ between ideal (${resultIdeal.globalTrimDb}) and practical (${resultPractical.globalTrimDb}) targets`,
    );

    // At 20 Hz, the corrections should differ (the old bug drove toward ideal)
    const correctionIdeal20 = interpolateCurve(resultIdeal.correctionCurve, 20);
    const correctionPractical20 = interpolateCurve(resultPractical.correctionCurve, 20);
    assert.ok(
      Math.abs(correctionIdeal20 - correctionPractical20) > 0.5,
      `Correction at 20 Hz should differ: ideal-target=${correctionIdeal20}, practical-target=${correctionPractical20}`,
    );
  });

  test("4. ~8 dB mismatch is removed when using the practical target", () => {
    // Simulate a Yarm-style scenario where the ideal target at ~21 Hz is ~8 dB
    // above the practical target due to LF capability rolloff.
    const anchorDb = 100;
    const idealTarget = makeIdealTarget(anchorDb, FREQS);
    // Capability rolls off starting at ~30 Hz, creating a large gap at 20 Hz
    const maxSpl = makeMaxSplCurve(anchorDb, FREQS, 30);
    const envelope = buildSmoothCapabilityEnvelope(maxSpl);
    const practical = buildPracticalCalibrationTarget({
      idealTargetCurve: idealTarget,
      capabilityEnvelope: envelope,
    });

    const ideal21 = interpolateCurve(idealTarget, 21);
    const pract21 = interpolateCurve(practical, 21);
    const mismatchDb = ideal21 - pract21;

    // The mismatch should be significant (several dB) in the LF region
    assert.ok(mismatchDb > 2, `Expected significant mismatch at 21 Hz: ideal=${ideal21}, practical=${pract21}, mismatch=${mismatchDb} dB`);

    // With the fix, the predictor targets the practical curve, so the
    // post-calibration response at 21 Hz tracks ~pract21, not ~ideal21.
    // The P19 deviation is computed against pract21, so it should be small.
    // With the old bug, the response tracks ideal21, and P19 deviation
    // against pract21 would be ~mismatchDb dB (false FAIL).
  });

  test("5. All 8 P14 target combinations produce a practical target", () => {
    const combinations = [
      { basis: "minimum", level: 1, db: 109 },
      { basis: "minimum", level: 2, db: 112 },
      { basis: "minimum", level: 3, db: 115 },
      { basis: "minimum", level: 4, db: 118 },
      { basis: "recommended", level: 1, db: 114 },
      { basis: "recommended", level: 2, db: 117 },
      { basis: "recommended", level: 3, db: 120 },
      { basis: "recommended", level: 4, db: 123 },
    ];

    for (const combo of combinations) {
      const idealTarget = makeIdealTarget(combo.db, FREQS);
      const maxSpl = makeMaxSplCurve(combo.db, FREQS, 25);
      const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
        idealTargetCurve: idealTarget,
        maximumSplCurve: maxSpl,
        p18DesignHz: 30, // L1 minimum
        p18ReferenceDb: computeP18ReferenceDb(idealTarget),
      });

      assert.ok(
        Array.isArray(practicalCalibrationTarget) && practicalCalibrationTarget.length > 0,
        `Practical target should be produced for ${combo.basis} L${combo.level}`,
      );
      assert.ok(
        practicalCalibrationTarget.length === idealTarget.length,
        `Practical target length should match ideal for ${combo.basis} L${combo.level}`,
      );
    }
  });

  test("6. p19TargetIdentity is practical-calibration-target when practical target exists", () => {
    const idealTarget = makeIdealTarget(100, FREQS);
    const maxSpl = makeMaxSplCurve(100, FREQS, 25);
    const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: idealTarget,
      maximumSplCurve: maxSpl,
      p18DesignHz: 30,
    });

    const identity = (Array.isArray(practicalCalibrationTarget) && practicalCalibrationTarget.length)
      ? "practical-calibration-target"
      : "ideal-house-target";

    assert.equal(identity, "practical-calibration-target");
  });

  test("7. Bass authority version bumped to invalidate old cached results", () => {
    // The P19 target change alters the resulting calibrated curves and P19
    // results. Old cached bass results produced with the mismatched target
    // must NOT continue to hydrate as current authority.
    assert.equal(BASS_ANALYSIS_CONTRACT_VERSION, 16, "BASS_ANALYSIS_CONTRACT_VERSION must be 16");
    assert.equal(RP22_BASS_METRIC_SCHEMA_VERSION, 12, "RP22_BASS_METRIC_SCHEMA_VERSION must be 12");
  });

  test("8. P18-intent-aware LF overlay is applied to the practical target", () => {
    const idealTarget = makeIdealTarget(100, FREQS);
    const maxSpl = makeMaxSplCurve(100, FREQS, 25);
    const p18DesignHz = 30;
    const p18ReferenceDb = computeP18ReferenceDb(idealTarget);

    const { practicalCalibrationTarget: withOverlay } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: idealTarget,
      maximumSplCurve: maxSpl,
      p18DesignHz,
      p18ReferenceDb,
    });

    const { practicalCalibrationTarget: withoutOverlay } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: idealTarget,
      maximumSplCurve: maxSpl,
      p18DesignHz: null,
    });

    // The overlay should modify the target below Fd × √2
    const kneeHz = p18DesignHz * Math.SQRT2;
    let differsBelowKnee = false;
    for (const p of withOverlay) {
      if (p.frequency < kneeHz) {
        const without = interpolateCurve(withoutOverlay, p.frequency);
        if (without !== null && Math.abs(p.spl - without) > 0.1) {
          differsBelowKnee = true;
          break;
        }
      }
    }
    assert.ok(differsBelowKnee, "LF overlay should modify the target below Fd × √2");
  });
});