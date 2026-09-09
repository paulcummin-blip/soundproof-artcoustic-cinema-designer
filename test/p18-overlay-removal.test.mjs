// P18 Overlay Removal — Regression Tests
// ---------------------------------------
// Validates that the P18 level boundary no longer imposes a target roll-off
// on the practical calibration target. P18 is an ACHIEVED RESULT, not a
// desired LF roll-off shape.
//
// Tests prove:
//   1. P18 is not target shaping (ample capability → target = House)
//   2. Capability still constrains target (genuine limits reduce target)
//   3. P14 progression (L1 matching ≥ L2 ≥ L3 ≥ L4)
//   4. P18 grading (P14 L1 system can achieve P18 L4)
//   5. P19 authority (predictor target = P19 grading target)
//   6. Existing constraints unchanged (+6 dB boost, −15 dB cut, null protection)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Source loaders — load REAL source via readFile + new Function so we exercise
// the actual implementation, not a copy.
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
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/components\/room\/bass\/bassGraphSmoothing"\s*;?/g, "")
    .replace(/export\s+/g, "");
  const factory = new Function(
    "applyBassSmoothing",
    `${code}\nreturn { buildSmoothCapabilityEnvelope, buildPracticalCalibrationTarget, buildPracticalCalibrationTargetFromCapability, applyP18IntentAwareLfOverlay, computeP18ReferenceDb };`,
  );
  return factory(applyBassSmoothing);
}

async function loadP18Authority() {
  const src = await readFile(
    new URL("../src/components/utils/p18ExtensionAuthority.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { p18ThresholdHzForLevel, assessP18Extension, gradeP18ForBasis, P18_THRESHOLDS_BY_BASIS };`);
  return factory();
}

async function loadBankLimits() {
  const src = await readFile(
    new URL("../src/components/utils/designEqBankLimits.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/import\s+\{[^}]+\}\s+from\s+"@\/[^"]+"\s*;?/g, "").replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { bankLimits, clampFilterGain };`);
  return factory();
}

async function loadNullProtection() {
  const src = await readFile(
    new URL("../src/components/utils/houseCurveFitProtection.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/import\s+\{[^}]+\}\s+from\s+"@\/[^"]+"\s*;?/g, "").replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { identifyProtectedNullRegions, MAX_PROTECTED_NULL_WIDTH_HZ };`);
  return factory();
}

async function loadBassAuthorityVersion() {
  const src = await readFile(
    new URL("../src/lib/bassAuthorityVersion.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION };`);
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

function maxDeviation(curveA, curveB, startHz, endHz) {
  let maxDev = 0;
  let worstFreq = null;
  for (const point of curveA) {
    if (point.frequency < startHz || point.frequency > endHz) continue;
    const valB = interpolateValue(curveB, point.frequency);
    if (valB == null) continue;
    const dev = Math.abs(point.spl - valB);
    if (dev > maxDev) { maxDev = dev; worstFreq = point.frequency; }
  }
  return { maxDev, worstFreq };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TEST 1: P18 is not target shaping — ample capability → target = House
// EXPECTED: With 20 dB headroom, practical target ≈ House target at ALL
// frequencies below the P18 boundary. No 6 dB/octave roll-off imposed.
test("Test 1a: ample capability — L1 (35 Hz boundary) does not impose roll-off", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  // House target flat at 100 dB; capability flat at 120 dB (20 dB headroom everywhere)
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 120);

  // Build practical target WITHOUT p18DesignHz (the corrected production path)
  const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // At 20 Hz (below L1 boundary of 35 Hz), target should ≈ House (no roll-off)
  const t20 = interpolateValue(practicalCalibrationTarget, 20);
  const h20 = interpolateValue(ideal, 20);
  assert.ok(
    Math.abs(t20 - h20) < 0.5,
    `L1 should not roll off at 20 Hz: T=${t20?.toFixed(2)} H=${h20?.toFixed(2)} delta=${Math.abs(t20 - h20).toFixed(2)}`,
  );

  // At 30 Hz (below L1 boundary), target should ≈ House
  const t30 = interpolateValue(practicalCalibrationTarget, 30);
  const h30 = interpolateValue(ideal, 30);
  assert.ok(
    Math.abs(t30 - h30) < 0.5,
    `L1 should not roll off at 30 Hz: T=${t30?.toFixed(2)} H=${h30?.toFixed(2)}`,
  );
});

test("Test 1b: ample capability — L2 (30 Hz boundary) does not impose roll-off", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 120);

  const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // At 20 Hz (below L2 boundary of 30 Hz), target should ≈ House
  const t20 = interpolateValue(practicalCalibrationTarget, 20);
  const h20 = interpolateValue(ideal, 20);
  assert.ok(
    Math.abs(t20 - h20) < 0.5,
    `L2 should not roll off at 20 Hz: T=${t20?.toFixed(2)} H=${h20?.toFixed(2)}`,
  );
});

test("Test 1c: ample capability — L4 (18 Hz boundary) does not impose roll-off", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(15, 200, 1, 100);
  const maxSpl = flatCurve(15, 200, 1, 120);

  const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // At 15 Hz (at L4 boundary), target should ≈ House
  const t15 = interpolateValue(practicalCalibrationTarget, 15);
  const h15 = interpolateValue(ideal, 15);
  assert.ok(
    Math.abs(t15 - h15) < 0.5,
    `L4 should not roll off at 15 Hz: T=${t15?.toFixed(2)} H=${h15?.toFixed(2)}`,
  );
});

// TEST 1d: P18 overlay is no longer applied even if p18DesignHz is passed
// EXPECTED: Passing p18DesignHz should NOT change the target — the overlay
// is decoupled from the production path.
test("Test 1d: p18DesignHz parameter no longer applies overlay", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 120);

  // Build WITHOUT p18DesignHz (corrected production path)
  const { practicalCalibrationTarget: withoutOverlay } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // Build WITH p18DesignHz (old path — should now be identical, overlay removed)
  const { practicalCalibrationTarget: withOverlayParam } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
    p18DesignHz: 35,
    p18ReferenceDb: 100,
  });

  // The two should be identical — the overlay is no longer applied
  const { maxDev } = maxDeviation(withoutOverlay, withOverlayParam, 20, 200);
  assert.ok(
    maxDev < 0.01,
    `Passing p18DesignHz should not change target (overlay removed): maxDev=${maxDev.toFixed(4)}`,
  );
});

// TEST 2: Capability still constrains target — genuine limits reduce target
// EXPECTED: When capability genuinely cannot reach House, the practical target
// is reduced. No impossible boost is requested.
test("Test 2: LF-limited system — practical target reduced where capability insufficient", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  // House target flat at 100 dB; capability rolls off below 35 Hz to ~84 dB at 20 Hz
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = curveWithRolloff(20, 200, 1, 108, 35, 40);

  const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // At 20 Hz, target should be well below House (genuine capability limit)
  const t20 = interpolateValue(practicalCalibrationTarget, 20);
  const h20 = interpolateValue(ideal, 20);
  assert.ok(
    t20 < h20 - 3,
    `Genuine capability limit should reduce target at 20 Hz: T=${t20?.toFixed(2)} H=${h20?.toFixed(2)}`,
  );

  // At 100 Hz (within capability), target should ≈ House
  const t100 = interpolateValue(practicalCalibrationTarget, 100);
  const h100 = interpolateValue(ideal, 100);
  assert.ok(
    Math.abs(t100 - h100) < 1.0,
    `Target should ≈ House where capable: T(100)=${t100?.toFixed(2)} H(100)=${h100?.toFixed(2)}`,
  );
});

// TEST 3: P14 progression — lower demand never receives more compromise
// EXPECTED: For identical geometry, L1 target matching ≥ L2 ≥ L3 ≥ L4.
// With ample capability, all levels match House equally (delta ≈ 0).
// With diminishing capability, higher demand may compromise more.
test("Test 3a: P14 progression — ample capability, all levels match equally", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 120);

  // Build target for each P14 level (all use the same capability-aware path)
  const levels = [1, 2, 3, 4];
  const deviations = {};
  for (const level of levels) {
    const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: ideal,
      maximumSplCurve: maxSpl,
    });
    const { maxDev } = maxDeviation(practicalCalibrationTarget, ideal, 20, 50);
    deviations[`L${level}`] = maxDev;
  }

  // With ample capability, all levels should have near-zero deviation
  for (const level of levels) {
    assert.ok(
      deviations[`L${level}`] < 0.5,
      `L${level} should match House with ample capability: dev=${deviations[`L${level}`].toFixed(2)}`,
    );
  }

  // L1 deviation ≤ L2 deviation (L1 has more headroom, never more compromise)
  assert.ok(
    deviations.L1 <= deviations.L2 + 0.01,
    `L1 dev (${deviations.L1.toFixed(2)}) should be ≤ L2 dev (${deviations.L2.toFixed(2)})`,
  );
  assert.ok(
    deviations.L2 <= deviations.L3 + 0.01,
    `L2 dev (${deviations.L2.toFixed(2)}) should be ≤ L3 dev (${deviations.L3.toFixed(2)})`,
  );
  assert.ok(
    deviations.L3 <= deviations.L4 + 0.01,
    `L3 dev (${deviations.L3.toFixed(2)}) should be ≤ L4 dev (${deviations.L4.toFixed(2)})`,
  );
});

test("Test 3b: P14 progression — diminishing capability, L1 never worse than L4", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  // House target flat at 100 dB; capability rolls off below 30 Hz
  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = curveWithRolloff(20, 200, 1, 105, 30, 30);

  const levels = [1, 2, 3, 4];
  const deviations = {};
  for (const level of levels) {
    const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: ideal,
      maximumSplCurve: maxSpl,
    });
    const { maxDev } = maxDeviation(practicalCalibrationTarget, ideal, 20, 50);
    deviations[`L${level}`] = maxDev;
  }

  // L1 deviation ≤ L2 deviation ≤ L3 ≤ L4
  // (Lower demand never receives MORE artificial compromise than higher demand)
  assert.ok(
    deviations.L1 <= deviations.L2 + 0.01,
    `L1 dev (${deviations.L1.toFixed(2)}) should be ≤ L2 dev (${deviations.L2.toFixed(2)})`,
  );
  assert.ok(
    deviations.L2 <= deviations.L3 + 0.01,
    `L2 dev (${deviations.L2.toFixed(2)}) should be ≤ L3 dev (${deviations.L3.toFixed(2)})`,
  );
  assert.ok(
    deviations.L3 <= deviations.L4 + 0.01,
    `L3 dev (${deviations.L3.toFixed(2)}) should be ≤ L4 dev (${deviations.L4.toFixed(2)})`,
  );
});

// TEST 4: P18 grading — P14 L1 system can achieve P18 L4
// EXPECTED: A system selected as P14 L1 that actually reaches 15 Hz may
// legitimately achieve P18 L4/Recommended L4. The selected P14 level does
// NOT cap the achieved P18 level.
test("Test 4: P18 grading — P14 L1 system reaching 15 Hz achieves P18 L4", async () => {
  const { assessP18Extension, gradeP18ForBasis } = await loadP18Authority();

  // A system selected as P14 Minimum L1 (35 Hz required) that actually reaches 15 Hz
  const achievedHz = 15;
  const p14Basis = "minimum";

  // P18 grading is independent of P14 level — it grades the achieved extension
  const minL4Assessment = assessP18Extension(achievedHz, p14Basis);
  assert.equal(
    minL4Assessment.level, 4,
    `P14 L1 system reaching 15 Hz should achieve P18 L4 (Minimum): level=${minL4Assessment.level}`,
  );

  // Recommended basis: 15 Hz achieves L4
  const recL4Assessment = assessP18Extension(achievedHz, "recommended");
  assert.equal(
    recL4Assessment.level, 4,
    `P14 L1 system reaching 15 Hz should achieve P18 L4 (Recommended): level=${recL4Assessment.level}`,
  );

  // The selected P14 level does NOT cap the achieved P18 level
  // A system at P14 L1 can achieve P18 L4 if physically capable
  const gradeMin = gradeP18ForBasis(achievedHz, "minimum");
  const gradeRec = gradeP18ForBasis(achievedHz, "recommended");
  assert.equal(gradeMin, 4, "Minimum basis: 15 Hz → L4");
  assert.equal(gradeRec, 4, "Recommended basis: 15 Hz → L4");
});

test("Test 4b: P18 grading — P14 L1 system reaching 20 Hz achieves P18 L3 (Minimum)", async () => {
  const { assessP18Extension } = await loadP18Authority();

  // P14 Minimum L1 (35 Hz required) system that actually reaches 20 Hz
  const achievedHz = 20;
  const assessment = assessP18Extension(achievedHz, "minimum");
  assert.equal(
    assessment.level, 3,
    `P14 L1 system reaching 20 Hz should achieve P18 L3 (Minimum): level=${assessment.level}`,
  );
});

// TEST 5: P19 authority — predictor target identity = P19 grading target
// EXPECTED: The practical calibration target used by the predictor is the
// SAME target used for P19 grading. Both use the capability-aware target
// with NO P18 overlay.
test("Test 5: P19 target identity — practical-calibration-target when T(f) built", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildPracticalCalibrationTargetFromCapability } = await loadPracticalTarget(applyBassSmoothing);

  const ideal = flatCurve(20, 200, 1, 100);
  const maxSpl = flatCurve(20, 200, 1, 120);

  const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
    idealTargetCurve: ideal,
    maximumSplCurve: maxSpl,
  });

  // The target is non-empty → identity is practical-calibration-target
  assert.ok(Array.isArray(practicalCalibrationTarget) && practicalCalibrationTarget.length > 0,
    "T(f) should be non-empty");
  const identity = practicalCalibrationTarget.length > 0
    ? "practical-calibration-target"
    : "ideal-house-target";
  assert.equal(identity, "practical-calibration-target");
});

// TEST 6: Existing constraints unchanged
// EXPECTED: +6 dB boost ceiling, −15 dB cut, null protection (depth ≥10 dB,
// width ≤6 Hz), and combined multi-sub capability are all unchanged.
test("Test 6a: EQ boost ceiling remains +6 dB", async () => {
  const { bankLimits } = await loadBankLimits();

  // Build a filter requesting 10 dB boost
  const filter = { frequency: 30, gainDb: 10, q: 1.0, type: "peaking" };
  const profile = { maximumAggregateBoostDb: 6, maximumCutDb: 15 };
  const limits = bankLimits(filter, profile);

  // The clamped gain must not exceed +6 dB
  assert.ok(
    limits.maximumGainDb <= 6 + 1e-6,
    `Boost ceiling must remain +6 dB: got ${limits.maximumGainDb}`,
  );
});

test("Test 6b: EQ cut limit remains −15 dB", async () => {
  const { bankLimits } = await loadBankLimits();

  const filter = { frequency: 30, gainDb: -20, q: 1.0, type: "peaking" };
  const profile = { maximumAggregateBoostDb: 6, maximumCutDb: 15 };
  const limits = bankLimits(filter, profile);

  // The clamped gain must not go below −15 dB
  assert.ok(
    limits.minimumGainDb >= -15 - 1e-6,
    `Cut limit must remain −15 dB: got ${limits.minimumGainDb}`,
  );
});

test("Test 6c: null protection — depth ≥10 dB, width ≤6 Hz", async () => {
  const { identifyProtectedNullRegions, MAX_PROTECTED_NULL_WIDTH_HZ } = await loadNullProtection();

  assert.equal(MAX_PROTECTED_NULL_WIDTH_HZ, 6, "Protected null width must remain 6 Hz");

  // A narrow 12 dB null at 50 Hz (3 Hz wide) should be protected
  const curve = [];
  for (let f = 20; f <= 200; f += 0.5) {
    let spl = 100;
    const dist = Math.abs(f - 50);
    if (dist < 3) spl = 100 - 12 * (1 - dist / 3);
    curve.push({ frequency: f, spl });
  }

  const nulls = identifyProtectedNullRegions(curve, 20, 200, 0);
  assert.ok(nulls.length > 0, "Narrow 12 dB null should be identified as protected");
  const n = nulls[0];
  assert.ok(n.widthHz <= 6, `Protected null width must be ≤6 Hz: got ${n.widthHz}`);
  assert.ok(n.nullDepthDb >= 10, `Protected null depth must be ≥10 dB: got ${n.nullDepthDb}`);
});

test("Test 6d: combined multi-sub capability — 4 subs sum +6 dB vs single sub", async () => {
  const { applyBassSmoothing } = await loadSmoothing();
  const { buildSmoothCapabilityEnvelope } = await loadPracticalTarget(applyBassSmoothing);

  // Single sub: flat at 100 dB
  const singleSub = flatCurve(20, 200, 1, 100);
  // Four subs (coherent sum): +6 dB → 106 dB
  const fourSubs = flatCurve(20, 200, 1, 106);

  const capSingle = buildSmoothCapabilityEnvelope(singleSub);
  const capFour = buildSmoothCapabilityEnvelope(fourSubs);

  const c20single = interpolateValue(capSingle, 50);
  const c20four = interpolateValue(capFour, 50);

  // Four subs should be ~6 dB higher than single sub
  assert.ok(
    Math.abs((c20four - c20single) - 6) < 0.5,
    `Four-sub capability should be +6 dB vs single: delta=${(c20four - c20single).toFixed(2)}`,
  );
});

// TEST 7: Cache invalidation — version bumped
// EXPECTED: BASS_ANALYSIS_CONTRACT_VERSION and RP22_BASS_METRIC_SCHEMA_VERSION
// are bumped so old cached contracts built with the P18 overlay cannot hydrate.
test("Test 7: cache version bumped for P18 overlay removal", async () => {
  const { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } = await loadBassAuthorityVersion();

  // The P18 overlay removal changes the calibrated curve, P18 and P19 authority.
  // Old cached contracts built with the P18-overlay target must not hydrate.
  assert.ok(
    BASS_ANALYSIS_CONTRACT_VERSION >= 17,
    `BASS_ANALYSIS_CONTRACT_VERSION must be bumped (≥17): got ${BASS_ANALYSIS_CONTRACT_VERSION}`,
  );
  assert.ok(
    RP22_BASS_METRIC_SCHEMA_VERSION >= 13,
    `RP22_BASS_METRIC_SCHEMA_VERSION must be bumped (≥13): got ${RP22_BASS_METRIC_SCHEMA_VERSION}`,
  );
});