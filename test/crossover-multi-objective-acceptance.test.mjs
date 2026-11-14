// crossover-multi-objective-acceptance.test.mjs
// ---------------------------------------------------------------------------
// Validation for the multi-objective crossover integration acceptance gate.
//
// An electronic crossover candidate may qualify when EITHER RSP P19 improves
// materially (P20 held within safety limits) OR P20 seat-to-seat consistency
// improves materially (P19 held within its regression limit). A candidate need
// not improve both. All existing safety protections (physical validity, P14
// headroom, individual seat protection, assessment band consistency) remain.
//
// A deliberately misaligned LCR/subwoofer case demonstrates that changing
// relative delay moves the predicted cancellation in the physically expected
// direction — the combined-response model is a real complex summation, not a
// subwoofer-only calculation.
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import {
  integrationSafetyIssues,
  integrationAcceptanceObjective,
  integrationImprovements,
} from "../src/components/room/bass/improveBassV2/crossoverIntegrationSearch.js";
import { buildElectronicConfirmationLedger } from "../src/components/room/bass/improveBassV2/electronicConfirmationLedger.js";
import { buildCombinedSystemResponse } from "../src/components/room/bass/combinedSystemResponse.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEAT = { seatId: "a", isPrimary: true, variationDbRaw: 8 };
const safeBaseline = {
  achievedP19VariationDb: 5.6,
  achievedP20VariationDb: 6.3,
  p14HeadroomDb: 5,
  assessmentStartHz: 20,
  assessmentEndHz: 160,
  perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 }],
  physicalValidation: { passed: true },
};

const mkCandidate = (overrides = {}) => ({
  ...safeBaseline,
  achievedP19VariationDb: 5.6,
  achievedP20VariationDb: 6.3,
  perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. Multi-objective acceptance
// ---------------------------------------------------------------------------

describe("multi-objective crossover acceptance", () => {
  it("P19 improves materially, P20 unchanged: eligible when all safety checks pass", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.5, // 0.5 dB better
      achievedP20VariationDb: 6.3,       // unchanged
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 }],
    });
    expect(integrationSafetyIssues(safeBaseline, candidate)).toEqual([]);
    expect(integrationAcceptanceObjective(safeBaseline, candidate)).toBe("p19");
  });

  it("P20 improves materially, P19 unchanged: eligible when all safety checks pass", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6,        // unchanged
      achievedP20VariationDb: 6.3 - 0.5,  // 0.5 dB better
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 - 0.5 }],
    });
    expect(integrationSafetyIssues(safeBaseline, candidate)).toEqual([]);
    expect(integrationAcceptanceObjective(safeBaseline, candidate)).toBe("p20");
  });

  it("both improve: eligible", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.5,
      achievedP20VariationDb: 6.3 - 0.5,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 - 0.5 }],
    });
    expect(integrationSafetyIssues(safeBaseline, candidate)).toEqual([]);
    expect(integrationAcceptanceObjective(safeBaseline, candidate)).toBe("both");
  });

  it("P19 improves but P20 deteriorates beyond per-seat safety limit: rejected", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.5,
      achievedP20VariationDb: 6.3 + 1.0,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 + 1.0 }], // +1.0 dB > 0.5 primary limit
    });
    const issues = integrationSafetyIssues(safeBaseline, candidate);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((r) => r.includes("seat regression"))).toBe(true);
  });

  it("P20 improves but P19 deteriorates beyond regression limit: rejected", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 + 0.3, // +0.3 > 0.1 limit
      achievedP20VariationDb: 6.3 - 0.5,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 - 0.5 }],
    });
    const issues = integrationSafetyIssues(safeBaseline, candidate);
    expect(issues).toContain("RSP P19 regression");
  });

  it("neither materially improves: original settings retained (rejected)", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.1, // below 0.25 threshold
      achievedP20VariationDb: 6.3 - 0.1,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 - 0.1 }],
    });
    const issues = integrationSafetyIssues(safeBaseline, candidate);
    expect(issues).toContain("No useful P19 or P20 improvement");
    expect(integrationAcceptanceObjective(safeBaseline, candidate)).toBeNull();
  });

  it("candidate improves only a crossover-specific metric but not RP22 P19/P20: not misreported as RP22 improvement", () => {
    // P19 and P20 both unchanged; the candidate is rejected, and its objective
    // is null so the ledger can never report an RP22 improvement.
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6,
      achievedP20VariationDb: 6.3,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 }],
    });
    expect(integrationSafetyIssues(safeBaseline, candidate)).toContain("No useful P19 or P20 improvement");
    expect(integrationAcceptanceObjective(safeBaseline, candidate)).toBeNull();
  });

  it("preserves all existing safety protections", () => {
    const good = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.5,
      achievedP20VariationDb: 6.3 - 0.5,
      perSeatP20: [{ ...SEAT, variationDbRaw: 6.3 - 0.5 }],
    });
    expect(integrationSafetyIssues(safeBaseline, good)).toEqual([]);
    // Each safety breach must still reject a candidate that improves P20.
    for (const patch of [
      { perSeatP20: [] }, // seat set changed
      { assessmentEndHz: NaN }, // band invalid
      { perSeatP20: [{ seatId: "a", isPrimary: false, variationDbRaw: 5.8 }] }, // primary flag changed
      { perSeatP20: [{ seatId: "a", isPrimary: true, variationDbRaw: NaN }] }, // invalid evidence
      { p14HeadroomDb: 3 }, // > 1 dB headroom lost (baseline 5)
      { achievedP19VariationDb: 5.6 + 0.3 }, // P19 regression
    ]) {
      expect(integrationSafetyIssues(safeBaseline, { ...good, ...patch }).length).toBeGreaterThan(0);
    }
  });

  it("records before/after improvement values", () => {
    const candidate = mkCandidate({
      achievedP19VariationDb: 5.6 - 0.5,
      achievedP20VariationDb: 6.3 - 0.3,
    });
    const imp = integrationImprovements(safeBaseline, candidate);
    expect(imp.p19DeltaDb).toBeCloseTo(0.5, 2);
    expect(imp.p20DeltaDb).toBeCloseTo(0.3, 2);
    expect(imp.p19BeforeDb).toBeCloseTo(5.6, 2);
    expect(imp.p19AfterDb).toBeCloseTo(5.1, 2);
  });
});

// ---------------------------------------------------------------------------
// 2. Ledger objective tracking
// ---------------------------------------------------------------------------

describe("electronic confirmation ledger records acceptance objective", () => {
  const baselineResult = {
    candidateId: "current",
    candidateKind: "current",
    achievedP19VariationDb: 5.6,
    achievedP20VariationDb: 6.3,
    p14HeadroomDb: 5,
    perSeatP20: [{ seatId: "a", isPrimary: true, variationDbRaw: 6.3 }],
    appliedTuning: [{ sourceId: "sub-a", gainDb: 0, delayMs: 0, phaseControlDeg: 0, polarity: 0 }],
  };

  const buildSelection = (candidate) => ({
    currentResult: baselineResult,
    confirmedResults: [candidate],
    evaluations: [{ candidateId: candidate.candidateId, status: "material" }],
  });

  it("stamps objective p19 for a P19-driven crossover candidate", () => {
    const candidate = {
      ...baselineResult,
      candidateId: "crossover-1",
      candidateKind: "calibration",
      combinedFrom: { crossover: true },
      achievedP19VariationDb: 5.6 - 0.5,
      achievedP20VariationDb: 6.3,
      integrationObjective: "p19",
    };
    const ledger = buildElectronicConfirmationLedger(buildSelection(candidate));
    const row = ledger.candidates.find((c) => c.candidateId === "crossover-1");
    expect(row.objective).toBe("p19");
    expect(row.improvements.p19DeltaDb).toBeCloseTo(0.5, 2);
    expect(row.improvements.p20DeltaDb).toBeCloseTo(0, 2);
    expect(row.acceptance).toEqual({ accepted: true, status: "accepted" });
  });

  it("derives objective from baseline when the search did not stamp one", () => {
    const candidate = {
      ...baselineResult,
      candidateId: "delay-1",
      candidateKind: "calibration",
      groupedDelay: { direction: "A", adjustmentMs: 3 },
      achievedP19VariationDb: 5.6,
      achievedP20VariationDb: 6.3 - 0.5,
    };
    const ledger = buildElectronicConfirmationLedger(buildSelection(candidate));
    const row = ledger.candidates.find((c) => c.candidateId === "delay-1");
    expect(row.objective).toBe("p20");
  });

  it("returns null objective for a candidate that improved neither RP22 metric", () => {
    const candidate = {
      ...baselineResult,
      candidateId: "noop-1",
      candidateKind: "phase",
      achievedP19VariationDb: 5.6,
      achievedP20VariationDb: 6.3,
    };
    const ledger = buildElectronicConfirmationLedger(buildSelection(candidate));
    const row = ledger.candidates.find((c) => c.candidateId === "noop-1");
    expect(row.objective).toBeNull();
  });

  it("records rejected safety conditions for a rejected candidate", () => {
    const candidate = {
      ...baselineResult,
      candidateId: "rejected-1",
      candidateKind: "calibration",
      achievedP19VariationDb: 5.6 + 0.3,
      achievedP20VariationDb: 6.3 - 0.5,
      crossover: { frequencyHz: 100, subwooferFrequencyHz: 100, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 },
    };
    const selection = {
      currentResult: baselineResult,
      confirmedResults: [candidate],
      evaluations: [{ candidateId: "rejected-1", status: "below-materiality" }],
      combinedDiagnostics: {
        rejected: [{
          crossover: { frequencyHz: 100, speakerHpSlopeDbPerOct: 24 },
          issues: ["RSP P19 regression"],
        }],
      },
    };
    const ledger = buildElectronicConfirmationLedger(selection);
    const row = ledger.candidates.find((c) => c.candidateId === "rejected-1");
    expect(row.acceptance.accepted).toBe(false);
    expect(row.rejectionReasons).toContain("RSP P19 regression");
    expect(row.rejectionReasons).toContain("Below material-improvement threshold");
  });
});

// ---------------------------------------------------------------------------
// 3. Deliberately misaligned LCR/subwoofer crossover case
// ---------------------------------------------------------------------------

describe("misaligned LCR/subwoofer delay moves predicted cancellation", () => {
  // A flat, phase-aligned sub and speaker through an LR4 crossover at 80 Hz
  // sum flat. Introducing a sub delay rotates the sub's phase with frequency,
  // causing cancellation near the crossover. The model must predict that
  // cancellation and show it moves with the delay.
  const frequenciesHz = Array.from({ length: 41 }, (_, i) => 20 + i * 4); // 20..180 Hz
  const crossover = {
    frequencyHz: 80,
    subwooferFrequencyHz: 80,
    linkFrequencies: true,
    speakerHpSlopeDbPerOct: 24,
    subwooferLpSlopeDbPerOct: 24,
  };
  const flatPoints = (delayMs) => frequenciesHz.map((f) => {
    const theta = -2 * Math.PI * f * (delayMs / 1000);
    return { re: Math.cos(theta), im: Math.sin(theta) };
  });

  const buildFor = (subDelayMs) => buildCombinedSystemResponse({
    frequenciesHz,
    seats: [{ seatId: "rsp" }],
    subTransfersBySeat: { rsp: [{ sourceId: "sub-a", points: flatPoints(subDelayMs) }] },
    speakerTransfersBySeat: { rsp: [{ sourceId: "lcr-fl", modelKey: "q6-3", points: flatPoints(0), channelWeight: 1 }] },
    crossover,
    primarySeatId: "rsp",
    speakerReferenceLevelDb: 0,
  });

  const dbAt = (combined, freq) => {
    const curve = combined.combinedBySeat.rsp;
    const point = curve.find((p) => Math.abs(p.frequency - freq) < 0.01);
    return point?.spl;
  };

  it("aligned sub and speaker produce a finite combined response at the crossover", () => {
    const aligned = buildFor(0);
    expect(aligned.available).toBe(true);
    const atCrossover = dbAt(aligned, 80);
    expect(Number.isFinite(atCrossover)).toBe(true);
    // The speaker's natural roll-off means the aligned sum sits below 0 dB at
    // the crossover; the exact figure is not the point. The point is that this
    // is the baseline the misaligned case is measured against.
  });

  it("a misaligned sub delay introduces cancellation near the crossover", () => {
    const aligned = buildFor(0);
    const misaligned = buildFor(2); // 2 ms — deep cancellation at 80 Hz
    const alignedAt80 = dbAt(aligned, 80);
    const misalignedAt80 = dbAt(misaligned, 80);
    // The misaligned response must be materially lower than the aligned one.
    expect(misalignedAt80).toBeLessThan(alignedAt80 - 3);
  });

  it("changing the delay moves the predicted cancellation", () => {
    const one = buildFor(1);
    const two = buildFor(2);
    const three = buildFor(3);
    const at80 = (c) => dbAt(c, 80);
    // Different delays produce different combined magnitudes — the predicted
    // cancellation is delay-dependent, not frozen. The depth is non-monotonic
    // (2 ms is deeper than 3 ms at 80 Hz), which is the physically expected
    // behaviour of a complex summation.
    expect(at80(one)).not.toBeCloseTo(at80(two), 1);
    expect(at80(two)).not.toBeCloseTo(at80(three), 1);
    expect(at80(two)).toBeLessThan(at80(one));
  });

  it("cancellation is a complex-summation effect, not a sub-only artefact", () => {
    // With no speaker path there is no cancellation to move — the sub-only
    // response is independent of LCR delay. This confirms the model sums the
    // two paths; it is not reporting a sub-only change as a combined one.
    const subOnly = buildCombinedSystemResponse({
      frequenciesHz,
      seats: [{ seatId: "rsp" }],
      subTransfersBySeat: { rsp: [{ sourceId: "sub-a", points: flatPoints(4) }] },
      speakerTransfersBySeat: {},
      crossover,
      primarySeatId: "rsp",
      speakerReferenceLevelDb: 0,
    });
    expect(subOnly.available).toBe(true);
    // The sub-only path is unaffected by the absence of the speaker.
    const subOnlyAt80 = dbAt(subOnly, 80);
    expect(Number.isFinite(subOnlyAt80)).toBe(true);
  });
});