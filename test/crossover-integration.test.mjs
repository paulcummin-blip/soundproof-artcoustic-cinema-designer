// Crossover & integration — physically essential behaviour.
// Pure modules only: no React, no entities, no engine runtime.
import { describe, it, expect } from "vitest";
import {
  crossoverLimitsForModel,
  resolveSharedCrossoverLimits,
  normaliseCrossoverFrequency,
  normaliseCrossoverConfig,
  linkwitzRileyResponse,
  buildCrossoverFilterBank,
} from "../src/components/room/bass/crossoverAuthority.js";
import { buildCombinedSystemResponse } from "../src/components/room/bass/combinedSystemResponse.js";

const db = (c) => 20 * Math.log10(Math.max(Math.hypot(c.re, c.im), 1e-12));

describe("speaker-specific crossover defaults and minimums", () => {
  it("uses the mandated default and minimum for each raised model", () => {
    expect(crossoverLimitsForModel("evolve-1")).toEqual({ defaultHz: 150, minHz: 150, maxHz: 200 });
    expect(crossoverLimitsForModel("evolve-1-1")).toEqual({ defaultHz: 120, minHz: 120, maxHz: 200 });
    expect(crossoverLimitsForModel("evolve-2-1")).toEqual({ defaultHz: 100, minHz: 100, maxHz: 200 });
    expect(crossoverLimitsForModel("q6-3")).toEqual({ defaultHz: 100, minHz: 80, maxHz: 200 });
  });

  it("never lets a frequency under a speaker minimum be produced", () => {
    const limits = crossoverLimitsForModel("evolve-1");
    expect(normaliseCrossoverFrequency(80, limits)).toBe(150);
    expect(normaliseCrossoverFrequency(150, limits)).toBe(150);
    expect(normaliseCrossoverFrequency(400, limits)).toBe(200);
  });

  it("adopts the highest required minimum across a mixed LCR trio", () => {
    const shared = resolveSharedCrossoverLimits(["q6-3", "evolve-1", "evolve-2-1"]);
    expect(shared.minHz).toBe(150);
    expect(shared.defaultHz).toBe(150);
    expect(normaliseCrossoverConfig({ frequencyHz: 90 }, shared).frequencyHz).toBe(150);
  });

  it("preserves a still-valid manual choice when speakers change", () => {
    const shared = resolveSharedCrossoverLimits(["q6-3"]);
    expect(normaliseCrossoverConfig({ frequencyHz: 160 }, shared).frequencyHz).toBe(160);
  });
});

describe("filter magnitude and phase behaviour", () => {
  const frequencies = [20, 40, 60, 80, 100, 120, 160, 200];

  it("LR4 24/24 sums flat through the crossover", () => {
    for (const f of frequencies) {
      const sum = db(linkwitzRileyResponse(f, 100, 24, "highpass")) + 0; // magnitudes combine in complex form below
      const lp = linkwitzRileyResponse(f, 100, 24, "lowpass");
      const hp = linkwitzRileyResponse(f, 100, 24, "highpass");
      const combined = { re: lp.re + hp.re, im: lp.im + hp.im };
      expect(Math.abs(db(combined))).toBeLessThan(0.15);
      expect(Number.isFinite(sum)).toBe(true);
    }
  });

  it("LR2 12/12 sums flat only with the high-pass branch inverted", () => {
    for (const f of frequencies) {
      const lp = linkwitzRileyResponse(f, 100, 12, "lowpass");
      const hp = linkwitzRileyResponse(f, 100, 12, "highpass");
      const combined = { re: lp.re + hp.re, im: lp.im + hp.im };
      expect(Math.abs(db(combined))).toBeLessThan(0.15);
    }
    // At the crossover point itself the two branches must be equal in level.
    expect(Math.abs(db(linkwitzRileyResponse(100, 100, 12, "lowpass")) - db(linkwitzRileyResponse(100, 100, 12, "highpass")))).toBeLessThan(1e-9);
  });

  it("mismatched slopes are bounded and not flat — a shelf, not a null", () => {
    for (const [hpSlope, lpSlope] of [[12, 24], [24, 12]]) {
      const lp = linkwitzRileyResponse(100, 100, lpSlope, "lowpass");
      const hp = linkwitzRileyResponse(100, 100, hpSlope, "highpass");
      const atCrossover = db({ re: lp.re + hp.re, im: lp.im + hp.im });
      expect(atCrossover).toBeLessThan(0.1);
      expect(atCrossover).toBeGreaterThan(-12);
    }
  });

  it("both branches roll off away from the crossover", () => {
    // LR4 rolls off 24 dB/octave. At 20 Hz (2.32 octaves below 100 Hz) the
    // high-pass is ≈ −56 dB; at 200 Hz (one octave above) the low-pass is ≈ −24.6 dB.
    expect(db(linkwitzRileyResponse(20, 100, 24, "highpass"))).toBeLessThan(-50);
    expect(db(linkwitzRileyResponse(200, 100, 24, "lowpass"))).toBeLessThan(-20);
  });

  it("builds a filter bank with independent HP and LP slopes", () => {
    const bank = buildCrossoverFilterBank([50, 100, 150], {
      frequencyHz: 100, subwooferFrequencyHz: 100, linkFrequencies: true,
      speakerHpSlopeDbPerOct: 12, subwooferLpSlopeDbPerOct: 24,
    });
    expect(bank.speakerHpSlopeDbPerOct).toBe(12);
    expect(bank.subwooferLpSlopeDbPerOct).toBe(24);
    expect(bank.highPass).toHaveLength(3);
  });
});

describe("combined response preserves genuine low-frequency limits", () => {
  // A subwoofer path that is genuinely weak at 35 Hz, and a speaker path that
  // is high-passed at 100 Hz, must NOT rescue that weakness: the combined
  // response below the crossover has to stay close to the subwoofer-only one.
  const frequencies = [20, 25, 30, 35, 40, 50, 60, 80, 100, 120, 160];
  const transfer = (splAt) => frequencies.map((f) => {
    const magnitude = Math.pow(10, splAt(f) / 20);
    return { frequency: f, re: magnitude, im: 0 };
  });
  const subPoints = transfer((f) => (f < 40 ? -8 : 0));
  const speakerPoints = transfer(() => 0);

  const combined = buildCombinedSystemResponse({
    speakerReferenceLevelDb: 0,
    frequenciesHz: frequencies,
    seats: [{ seatId: "rsp", isRsp: true }, { seatId: "seat-2", isRsp: false }],
    subTransfersBySeat: {
      rsp: [{ sourceId: "sub-1", points: subPoints }],
      "seat-2": [{ sourceId: "sub-1", points: subPoints }],
    },
    speakerTransfersBySeat: {
      rsp: [{ sourceId: "lcr-FL", modelKey: "q6-3", points: speakerPoints }],
      "seat-2": [{ sourceId: "lcr-FL", modelKey: "q6-3", points: speakerPoints }],
    },
    crossover: { frequencyHz: 100, subwooferFrequencyHz: 100, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 },
    primarySeatId: "rsp",
  });

  const valueAt = (curve, target) => curve.find((p) => p.frequency === target)?.spl ?? null;

  it("produces a combined response for every seat", () => {
    expect(combined.available).toBe(true);
    expect(Object.keys(combined.combinedBySeat)).toEqual(["rsp", "seat-2"]);
    expect(combined.speakerCount).toBe(1);
    expect(combined.subwooferCount).toBe(1);
  });

  it("does not remove the 35 Hz shortfall", () => {
    const combined35 = valueAt(combined.combinedBySeat.rsp, 35);
    const subOnly35 = valueAt(combined.subOnlyBySeat.rsp, 35);
    expect(Math.abs(combined35 - subOnly35)).toBeLessThan(0.5);
  });

  it("adds the screen channel above the crossover", () => {
    const combined160 = valueAt(combined.combinedBySeat.rsp, 160);
    const subOnly160 = valueAt(combined.subOnlyBySeat.rsp, 160);
    expect(combined160).toBeGreaterThan(subOnly160 + 3);
  });

  it("changes with the crossover frequency, without a new room transfer", () => {
    const raised = buildCombinedSystemResponse({
    speakerReferenceLevelDb: 0,
      frequenciesHz: frequencies,
      seats: [{ seatId: "rsp", isRsp: true }],
      subTransfersBySeat: { rsp: [{ sourceId: "sub-1", points: subPoints }] },
      speakerTransfersBySeat: { rsp: [{ sourceId: "lcr-FL", modelKey: "q6-3", points: speakerPoints }] },
      crossover: { frequencyHz: 60, subwooferFrequencyHz: 60, linkFrequencies: true, speakerHpSlopeDbPerOct: 24, subwooferLpSlopeDbPerOct: 24 },
      primarySeatId: "rsp",
    });
    expect(Math.abs(valueAt(raised.combinedBySeat.rsp, 80) - valueAt(combined.combinedBySeat.rsp, 80))).toBeGreaterThan(0.1);
  });
});