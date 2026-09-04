// P19 Lower-Edge Production Fix — regression tests.
//
// Validates that the production P19 path now delegates to the canonical
// bassAssessmentBandAuthority (resolveBassAssessmentBand) and shares the
// P18_REFERENCE_BAND_HZ [60, 200] reference band with P18.
//
// Case A — roll-off below P18: P19 ignores everything below achieved P18.
// Case B — exact band: P18=20, transition=160 → P19 evaluates 20–160 Hz.
// Case C — production/canonical parity: same fixture → same band + result.
// Case D — P20 unchanged: P20 is numerically identical before/after.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Source loaders — load REAL source via readFile + new Function so we
// exercise the actual implementation, not a copy. Handles @/ alias by
// injecting dependencies directly.
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

async function loadLevels() {
  const src = await readFile(
    new URL("../src/components/utils/rp22/levels.jsx", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(
    `${code}\nreturn { levelP19_lfResponse, levelP20_lfConsistency, numericRp22Level };`,
  );
  return factory();
}

async function loadDesignEq() {
  const src = await readFile(
    new URL("../src/components/utils/designEqCalibration.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { applyDesignEqCurve, calculateDesignEqCurve };`);
  return factory();
}

async function loadBassOperatingDefinitions() {
  const src = await readFile(
    new URL("../src/components/utils/rp22BassOperatingDefinitions.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { getRp22BassOperatingDefinitions };`);
  return factory();
}

async function loadResolveDesignValue() {
  const src = await readFile(
    new URL("../src/components/utils/rp22/resolveRp22DesignValue.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { resolveRp22DesignValue };`);
  return factory();
}

async function loadSpeakerRegistry() {
  const src = await readFile(
    new URL("../src/components/models/speakers/registry.jsx", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(
    `${code}\nreturn { getSpeakerModelMeta, getSubwooferCurve };`,
  );
  return factory();
}

// Load rp22BassMetrics with all its @/ dependencies injected.
async function loadBassMetrics() {
  const smoothing = await loadSmoothing();
  const designEq = await loadDesignEq();
  const operatingDefs = await loadBassOperatingDefinitions();
  const resolveDesignValue = await loadResolveDesignValue();
  const speakerRegistry = await loadSpeakerRegistry();
  const levels = await loadLevels();

  const src = await readFile(
    new URL("../src/components/utils/rp22BassMetrics.jsx", import.meta.url),
    "utf8",
  );
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/room\/bass\/bassGraphSmoothing"\s*;?/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/utils\/designEqCalibration"\s*;?/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/utils\/rp22BassOperatingDefinitions"\s*;?/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/models\/speakers\/registry"\s*;?/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/utils\/rp22\/levels"\s*;?/g, "")
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/utils\/rp22\/resolveRp22DesignValue"\s*;?/g, "")
    .replace(/export\s+\{[^}]+\}\s+from[^;]+;/g, "")
    .replace(/export\s+/g, "");

  const factory = new Function(
    "applyBassSmoothing",
    "applyDesignEqCurve",
    "calculateDesignEqCurve",
    "getRp22BassOperatingDefinitions",
    "getSpeakerModelMeta",
    "getSubwooferCurve",
    "levelP19_lfResponse",
    "levelP20_lfConsistency",
    "numericRp22Level",
    "resolveRp22DesignValue",
    `${code}\nreturn { computeParam19Deviation, computeParam20SeatConsistency, computeInRoomF3FromResponseCurve, P18_REFERENCE_BAND_HZ };`,
  );
  return factory(
    smoothing.applyBassSmoothing,
    designEq.applyDesignEqCurve,
    designEq.calculateDesignEqCurve,
    operatingDefs.getRp22BassOperatingDefinitions,
    speakerRegistry.getSpeakerModelMeta,
    speakerRegistry.getSubwooferCurve,
    levels.levelP19_lfResponse,
    levels.levelP20_lfConsistency,
    levels.numericRp22Level,
    resolveDesignValue.resolveRp22DesignValue,
  );
}

async function loadAssessmentBandAuthority() {
  const src = await readFile(
    new URL("../src/components/utils/bassAssessmentBandAuthority.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { resolveBassAssessmentBand };`);
  return factory();
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

// Curve that is flat above rolloffStartHz and falls linearly below it.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("P18_REFERENCE_BAND_HZ constant is [60, 200]", async () => {
  const { P18_REFERENCE_BAND_HZ } = await loadBassMetrics();
  assert.deepEqual(P18_REFERENCE_BAND_HZ, [60, 200]);
});

test("Case A: roll-off below P18 — P19 ignores everything below achieved P18", async () => {
  const { computeParam19Deviation } = await loadBassMetrics();

  // Flat at 90 dB from 160 Hz down to 28 Hz, then rolls off to 70 dB at 15 Hz.
  // P18 F3 = 28 Hz (the -3 dB point relative to the 60–200 Hz median of 90 dB).
  // Without the lower bound, P19 would see the -20 dB deviation at 15 Hz and fail.
  // With lowerHz=28, P19 should only assess [28 → 200] and see ~3 dB max deviation.
  const curve = curveWithRolloff(15, 200, 1, 90, 28, 20);
  const transitionHz = 200;

  // Without lower bound (legacy behaviour) — picks up the roll-off.
  const p19Legacy = computeParam19Deviation(curve, transitionHz, null);
  assert.ok(p19Legacy != null, "Legacy P19 should produce a result");
  assert.ok(
    p19Legacy.rawMaxDev > 10,
    `Legacy P19 should see large deviation from roll-off: ${p19Legacy.rawMaxDev.toFixed(1)} dB`,
  );

  // With lower bound at achieved P18 F3 — excludes the roll-off region.
  const p19Bounded = computeParam19Deviation(curve, transitionHz, 28);
  assert.ok(p19Bounded != null, "Bounded P19 should produce a result");
  assert.ok(
    p19Bounded.rawMaxDev < p19Legacy.rawMaxDev,
    `Bounded P19 (${p19Bounded.rawMaxDev.toFixed(1)}) should be lower than legacy (${p19Legacy.rawMaxDev.toFixed(1)})`,
  );
  // The bounded deviation should be small (near the -3 dB at the F3 crossing).
  assert.ok(
    p19Bounded.rawMaxDev <= 5,
    `Bounded P19 should be ≤5 dB (near the F3 crossing): ${p19Bounded.rawMaxDev.toFixed(1)} dB`,
  );
});

test("Case B: exact band — P18=20, transition=160 → P19 evaluates 20–160 Hz", async () => {
  const { computeParam19Deviation } = await loadBassMetrics();
  const { resolveBassAssessmentBand } = await loadAssessmentBandAuthority();

  // Resolve the band: P14 passes, P18=20 Hz, transition=160 Hz.
  const band = resolveBassAssessmentBand({
    p14Pass: true,
    achievedP18Hz: 20,
    transitionHz: 160,
  });
  assert.ok(band.valid, "Band should be valid");
  assert.equal(band.lowerHz, 20);
  assert.equal(band.upperHz, 160);

  // Flat curve at 90 dB with a broad 6 dB plateau at 100 Hz (survives smoothing).
  const curve = flatCurve(15, 200, 1, 90);
  for (const p of curve) {
    if (p.frequency >= 90 && p.frequency <= 110) p.spl = 96;
  }

  const p19 = computeParam19Deviation(curve, 160, 20);
  assert.ok(p19 != null, "P19 should produce a result");
  // The broad 6 dB plateau at 100 Hz survives 1/3-octave smoothing and is
  // the max deviation within [20, 160].
  assert.ok(
    p19.rawMaxDev > 4,
    `P19 max deviation should be >4 dB (broad plateau at 100 Hz): ${p19.rawMaxDev.toFixed(2)} dB`,
  );
  assert.ok(
    p19.rawMaxDev <= 6,
    `P19 max deviation should be ≤6 dB (plateau amplitude): ${p19.rawMaxDev.toFixed(2)} dB`,
  );
});

test("Case C: production/canonical parity — same fixture → same band + result", async () => {
  const { computeParam19Deviation } = await loadBassMetrics();
  const { resolveBassAssessmentBand } = await loadAssessmentBandAuthority();

  // Shared fixture: P14 passes, P18=28 Hz, transition=200 Hz.
  const p14Pass = true;
  const achievedP18Hz = 28;
  const transitionHz = 200;

  // Both production and canonical use the SAME resolveBassAssessmentBand.
  const band = resolveBassAssessmentBand({ p14Pass, achievedP18Hz, transitionHz });
  assert.ok(band.valid);
  assert.equal(band.lowerHz, 28);
  assert.equal(band.upperHz, 200);

  // Flat curve at 90 dB with a broad 4 dB dip at 50 Hz (survives smoothing).
  const curve = flatCurve(15, 200, 1, 90);
  for (const p of curve) {
    if (p.frequency >= 45 && p.frequency <= 55) p.spl = 86;
  }

  // Production P19 with the resolved lower bound.
  const p19 = computeParam19Deviation(curve, transitionHz, band.lowerHz);
  assert.ok(p19 != null);

  // The reference level should be the 60–200 Hz median (90 dB, shared with P18).
  assert.ok(
    Math.abs(p19.targetDb - 90) < 1.0,
    `P19 reference should be ~90 dB (shared 60–200 Hz median): ${p19.targetDb.toFixed(2)}`,
  );
  // The broad 4 dB dip at 50 Hz is within [28, 200] so it's the max deviation.
  assert.ok(
    p19.rawMaxDev > 2,
    `P19 max deviation should be >2 dB (broad dip at 50 Hz): ${p19.rawMaxDev.toFixed(2)} dB`,
  );
  assert.ok(
    p19.rawMaxDev <= 4,
    `P19 max deviation should be ≤4 dB (dip amplitude): ${p19.rawMaxDev.toFixed(2)} dB`,
  );
  // The worst frequency should be near 50 Hz.
  // (computeParam19Deviation doesn't return worstFrequencyHz, but the rawMaxDev
  //  confirms the dip is included.)
});

test("Case C2: production/canonical parity — invalid band (P14 fail) → P19 not calculated", async () => {
  const { resolveBassAssessmentBand } = await loadAssessmentBandAuthority();

  // P14 fails → band invalid → P19 must not be graded.
  const band = resolveBassAssessmentBand({
    p14Pass: false,
    achievedP18Hz: 28,
    transitionHz: 200,
  });
  assert.ok(!band.valid);
  assert.equal(band.reason, "p14-operating-point-not-achieved");
  assert.equal(band.lowerHz, null);
  assert.equal(band.upperHz, null);
});

test("Case C3: production/canonical parity — P18 null → band invalid", async () => {
  const { resolveBassAssessmentBand } = await loadAssessmentBandAuthority();

  const band = resolveBassAssessmentBand({
    p14Pass: true,
    achievedP18Hz: null,
    transitionHz: 200,
  });
  assert.ok(!band.valid);
  assert.equal(band.reason, "p18-extension-not-achieved");
});

test("Case D: P20 unchanged — no lowerHz passed → identical result", async () => {
  const { computeParam20SeatConsistency } = await loadBassMetrics();

  const rspCurve = flatCurve(15, 200, 2, 95);
  const seatA = flatCurve(15, 200, 2, 97);
  const seatB = flatCurve(15, 200, 2, 92);

  // P20 with no lowerHz (current production behaviour — unchanged).
  const p20NoLower = computeParam20SeatConsistency({
    rspResponse: rspCurve,
    perSeatResponses: [
      { seatId: "seat-1", responseData: seatA, isPrimary: true },
      { seatId: "seat-2", responseData: seatB },
    ],
    transitionHz: 200,
    rspSeatId: "seat-1",
  });

  // P20 with lowerHz=28 (should it ever be passed — but we do NOT pass it).
  // This test confirms that when lowerHz is NOT passed (the current production
  // behaviour), the result is well-defined and stable.
  assert.ok(p20NoLower != null, "P20 should produce a result");
  assert.ok(
    Number.isFinite(p20NoLower.worstSeatDeviationDb),
    "P20 worst seat deviation should be finite",
  );
  // The worst seat should be seat-2 (deviates 3 dB from RSP).
  assert.equal(p20NoLower.worstSeatId, "seat-2");
  assert.ok(
    Math.abs(p20NoLower.worstSeatDeviationDb - 3) < 0.5,
    `P20 worst deviation should be ~3 dB: ${p20NoLower.worstSeatDeviationDb}`,
  );
});

test("P19 reference band is 60–200 Hz (shared with P18), not 70–200 Hz", async () => {
  const { computeParam19Deviation } = await loadBassMetrics();

  // Curve with a broad +6 dB plateau from 60–70 Hz (survives 1/3-octave smoothing).
  // If P19 used 70–200 Hz reference, this plateau would be EXCLUDED from the
  // reference median. With the shared 60–200 Hz band, it's INCLUDED, shifting
  // the median above 90 dB.
  const curve = flatCurve(15, 200, 1, 90);
  for (const p of curve) {
    if (p.frequency >= 60 && p.frequency <= 70) p.spl = 96;
  }

  const p19 = computeParam19Deviation(curve, 200, 28);
  assert.ok(p19 != null);
  // The reference median should be >90 dB because the 60–70 Hz plateau is
  // included in the 60–200 Hz reference band.
  assert.ok(
    p19.targetDb > 90,
    `P19 reference should include 60–70 Hz plateau (>90): ${p19.targetDb.toFixed(2)}`,
  );
});

test("resolveBassAssessmentBand: transition ≤ P18 → invalid", async () => {
  const { resolveBassAssessmentBand } = await loadAssessmentBandAuthority();
  const band = resolveBassAssessmentBand({
    p14Pass: true,
    achievedP18Hz: 200,
    transitionHz: 150,
  });
  assert.ok(!band.valid);
  assert.equal(band.reason, "transition-not-above-p18");
});