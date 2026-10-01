// marquee-correction-trace.test.mjs
//
// Marquee Home correction-trace examination.
//
// REAL DATA: src/test/fixtures/marquee-completed-snapshot.json holds the real
// 360-point curves persisted by the last completed Marquee Home calculation
// (project 6abbca668e0245f45b27f164). Nothing in this suite fabricates a curve
// except where a case is explicitly labelled as injected.
//
// What this suite proves:
//   1. The P19 authority used by the counterfactual reproduces the PERSISTED
//      official P19 of that completed run — parity, not a parallel metric.
//   2. Required low-frequency retention (16/20/23.8/30/40 Hz, P19 worst, P20
//      worst, transition edge) survives stride downsampling.
//   3. Remaining headroom, boost-limit, capability and protected-null status are
//      stated per frequency from curves, and are null (not false) when the curve
//      evidence is absent.
//   4. A counterfactual that closes a real deficit is scored by the same P19
//      authority, and the outcome follows the published decision rule.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateP19AbsoluteTargetDeviation } from "../components/utils/p19AbsoluteTargetDeviation.js";
import {
  buildCorrectionTrace,
  readRetainedTraceRecord,
  REQUIRED_INSPECTION_FREQUENCIES_HZ,
  RETENTION_REASONS,
} from "../components/room/bass/correctionTraceAuthority.js";
import {
  buildCorrectionCounterfactual,
  selectInspectionFrequencyForCounterfactual,
  formatResidualMechanismSentence,
  COUNTERFACTUAL_OUTCOMES,
  P19_MATERIALITY_DB,
} from "../components/room/bass/correctionCounterfactualAuthority.js";

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "marquee-completed-snapshot.json"), "utf8"),
);
const curves = fixture.curves;
const band = {
  assessmentStartHz: fixture.persisted.assessmentStartHz,
  assessmentEndHz: fixture.persisted.assessmentEndHz,
};

// ── The reported current state: a 0.8 dB deficit at 23.8 Hz, applied over a
// realistic 1/3-octave neighbourhood (never a single-bin spike). Labelled
// INJECTED because the current calculation has no completed snapshot to read.
const injectDeficit = (curve, centreHz, deficitDb, octaveHalfWidth = 1 / 3) => curve.map((point) => {
  const frequency = Number(point.frequency);
  const offset = Math.abs(Math.log2(frequency / centreHz));
  const weight = offset <= octaveHalfWidth
    ? 0.5 * (1 + Math.cos((Math.PI * offset) / octaveHalfWidth))
    : 0;
  return { ...point, spl: Number(point.spl) - deficitDb * weight };
});

describe("Marquee Home — P19 authority parity", () => {
  it("reproduces the persisted official P19 from the persisted curves", () => {
    const scored = evaluateP19AbsoluteTargetDeviation({
      rspPostEqCurve: curves.postEqRspCurve,
      canonicalTargetCurve: curves.productionHouseCurveTarget,
      ...band,
    });
    expect(scored).not.toBeNull();
    console.log("[marquee] recomputed P19:", scored.maxAbsDeviationDb,
      "worst", scored.worstFrequencyHz,
      "| persisted", fixture.persisted.p19Value,
      "worst", fixture.persisted.officialP19WorstFrequencyHz);
    expect(scored.maxAbsDeviationDb).toBeCloseTo(fixture.persisted.p19Value, 1);
    expect(Math.abs(scored.maxAbsDeviationDb - fixture.persisted.p19Value)).toBeLessThan(0.05);
    expect(Math.abs(scored.worstFrequencyHz - fixture.persisted.officialP19WorstFrequencyHz)).toBeLessThan(1);
  });
});

describe("Marquee Home — required retention and honest evidence", () => {
  const trace = buildCorrectionTrace({
    postEqRspCurve: curves.postEqRspCurve,
    rawRspCurve: curves.referenceEq,
    targetCurve: curves.productionHouseCurveTarget,
    correctionCurve: curves.correctionCurve,
    maximumOutputCurve: curves.maximumSplCurveAfterEq,
    globalTrimDb: fixture.persisted.operatingLevelOffsetDb,
    assessmentStartHz: band.assessmentStartHz,
    assessmentEndHz: band.assessmentEndHz,
    officialP19WorstFrequencyHz: fixture.persisted.officialP19WorstFrequencyHz,
    p20WorstFrequencyHz: fixture.persisted.p20WorstFrequencyHz,
  });

  it("retains every required inspection frequency with its requested value", () => {
    expect(trace).not.toBeNull();
    for (const frequency of REQUIRED_INSPECTION_FREQUENCIES_HZ) {
      const record = readRetainedTraceRecord(trace, frequency);
      expect(record, `retained row for ${frequency} Hz`).not.toBeNull();
      expect(record.requestedFrequencyHz).toBe(frequency);
    }
  });

  it("retains the P19 worst, P20 worst and transition edge rows", () => {
    const reasons = trace.records.map((record) => record.retention);
    expect(reasons).toContain(RETENTION_REASONS.P19_WORST);
    expect(reasons).toContain(RETENTION_REASONS.P20_WORST);
    expect(reasons).toContain(RETENTION_REASONS.TRANSITION_EDGE);
  });

  it("states remaining headroom at 23.8 Hz from the output ceiling", () => {
    const record = readRetainedTraceRecord(trace, 23.8);
    expect(record.maxOutputDb).not.toBeNull();
    expect(record.remainingHeadroomDb).not.toBeNull();
    expect(record.remainingHeadroomDb).toBeCloseTo(record.maxOutputDb - record.finalPostEqDb, 1);
    console.log("[marquee] 23.8 Hz row:", JSON.stringify(record));
  });

  it("never claims a smoothing limitation without the pre-smoothing envelope", () => {
    expect(trace.hasPreSmoothingEnvelope).toBe(false);
    for (const record of trace.records) {
      expect(record.smoothingLimited).toBeNull();
      expect(record.correctionBeforeSmoothingDb).toBeNull();
    }
  });

  it("leaves unavailable values null rather than publishing zero", () => {
    const bare = buildCorrectionTrace({
      postEqRspCurve: curves.postEqRspCurve,
      targetCurve: curves.productionHouseCurveTarget,
      ...band,
    });
    const record = bare.records[0];
    expect(record.maxOutputDb).toBeNull();
    expect(record.remainingHeadroomDb).toBeNull();
    expect(record.requestedCorrectionDb).toBeNull();
  });
});

describe("Marquee Home — counterfactual examination (injected 0.8 dB deficit)", () => {
  const deficitCurve = injectDeficit(curves.postEqRspCurve, 23.8, 0.8);
  const inspectionFrequencyHz = selectInspectionFrequencyForCounterfactual({
    postEqRspCurve: deficitCurve,
    canonicalTargetCurve: curves.productionHouseCurveTarget,
    frequencies: REQUIRED_INSPECTION_FREQUENCIES_HZ,
  });
  const counterfactual = buildCorrectionCounterfactual({
    inspectionFrequencyHz,
    postEqRspCurve: deficitCurve,
    canonicalTargetCurve: curves.productionHouseCurveTarget,
    correctionCurve: curves.correctionCurve,
    rawCorrectionCurve: curves.correctionCurve,
    maximumOutputCurve: curves.maximumSplCurveAfterEq,
    globalTrimDb: fixture.persisted.operatingLevelOffsetDb,
    ...band,
    officialP19WorstFrequencyHz: fixture.persisted.officialP19WorstFrequencyHz,
  });

  it("selects the injected deficit frequency as the inspection frequency", () => {
    expect(inspectionFrequencyHz).not.toBeNull();
    expect(Math.abs(inspectionFrequencyHz - 23.8)).toBeLessThan(0.5);
  });

  it("scores the counterfactual with the official P19 authority", () => {
    expect(counterfactual).not.toBeNull();
    expect(counterfactual.counterfactualAllowed).toBe(true);
    expect(Number.isFinite(counterfactual.counterfactualP19Db)).toBe(true);
    expect(Number.isFinite(counterfactual.p19DeltaDb)).toBe(true);
    console.log("[marquee] counterfactual:", JSON.stringify({
      original: counterfactual.originalP19Db,
      originalWorst: counterfactual.originalP19WorstFrequencyHz,
      counterfactual: counterfactual.counterfactualP19Db,
      counterfactualWorst: counterfactual.counterfactualP19WorstFrequencyHz,
      delta: counterfactual.p19DeltaDb,
      outcome: counterfactual.outcome,
      smoothing: counterfactual.smoothing?.p19DeltaDb,
      bestTrim: counterfactual.globalTrim?.bestTrimDb,
      currentOptimal: counterfactual.globalTrim?.currentIsOptimal,
    }));
  });

  it("follows the published decision rule and never invents an explanation", () => {
    if (counterfactual.worsensP19 === true) {
      expect(counterfactual.outcome).toBe(COUNTERFACTUAL_OUTCOMES.JUSTIFIED);
      const sentence = formatResidualMechanismSentence({
        counterfactual,
        residualDb: counterfactual.counterfactualCorrectionDb,
      });
      expect(sentence).toMatch(/Hz remains [\d.]+ dB below target because additional correction would increase the official P19 maximum error from [\d.]+ dB to [\d.]+ dB at \d+ Hz\./);
    } else {
      expect(counterfactual.outcome).toBe(COUNTERFACTUAL_OUTCOMES.UNDER_CORRECTING);
      expect(formatResidualMechanismSentence({
        counterfactual,
        residualDb: counterfactual.counterfactualCorrectionDb,
      })).toBeNull();
    }
  });

  it("keeps smoothing and global-alignment comparisons independent", () => {
    expect(counterfactual.smoothing.available).toBe(true);
    // Identical pre- and post-smoothing envelopes: the swap is a no-op.
    expect(Math.abs(counterfactual.smoothing.p19DeltaDb)).toBeLessThan(P19_MATERIALITY_DB);
    expect(counterfactual.globalTrim.steps).toHaveLength(5);
    expect(counterfactual.globalTrim.rejectedSteps).toEqual([]);
    expect(typeof counterfactual.globalTrim.currentIsOptimal).toBe("boolean");
  });

  it("refuses to boost a protected null", () => {
    const blocked = buildCorrectionCounterfactual({
      inspectionFrequencyHz,
      postEqRspCurve: deficitCurve,
      canonicalTargetCurve: curves.productionHouseCurveTarget,
      correctionCurve: curves.correctionCurve,
      rawCorrectionCurve: curves.correctionCurve,
      maximumOutputCurve: curves.maximumSplCurveAfterEq,
      globalTrimDb: fixture.persisted.operatingLevelOffsetDb,
      ...band,
      protectedNullRegions: [{ startHz: 22, endHz: 26 }],
    });
    expect(blocked.counterfactualAllowed).toBe(false);
    expect(blocked.counterfactualRejectionReason).toBe("protected_null_active");
  });
});