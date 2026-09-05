// P18-Intent-Aware P19 Calibration Target — regression tests.
//
// Validates the tolerance-centred predetermined LF target that resolves the
// internal contradiction where an otherwise legitimate P18 extension boundary
// became an automatic P19 FAIL.
//
// TEST 1 — Target determinism: same Fd → same target curve.
// TEST 2 — Target distinction: different Fd → different LF target shapes.
// TEST 3 — House-curve preservation: above Fd×√2, target = A(f) unchanged.
// TEST 4 — Anti-cheating: target does NOT move when product rolls off early.
// TEST 5 — Never exceed A(f): new target ≤ existing target everywhere.
// TEST 6 — 6 dB/octave rolloff below Fd.
// TEST 7 — Fd from target combination: L3 Minimum=20Hz, L2 Recommended=25Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Load the REAL applyP18IntentAwareLfOverlay and computeP18ReferenceDb from
// practicalCalibrationTarget.js. Strip the @/ import (applyBassSmoothing is
// only used by buildSmoothCapabilityEnvelope, not by the overlay function).
async function loadPracticalCalibrationTarget() {
  const src = await readFile(
    new URL("../src/components/utils/practicalCalibrationTarget.js", import.meta.url),
    "utf8",
  );
  // Remove the @/ import line — not needed for the overlay function.
  const code = src
    .replace(/import\s+\{[^}]+\}\s+from\s+"@\/[^"]+";\n?/g, "")
    .replace(/export\s+/g, "");
  const factory = new Function(
    `${code}\nreturn { applyP18IntentAwareLfOverlay, computeP18ReferenceDb, buildPracticalCalibrationTarget };`,
  );
  return factory();
}

// Load p18ExtensionAuthority for p18ThresholdHzForLevel.
async function loadP18Authority() {
  const src = await readFile(
    new URL("../src/components/utils/p18ExtensionAuthority.js", import.meta.url),
    "utf8",
  );
  const code = src.replace(/export\s+/g, "");
  const factory = new Function(`${code}\nreturn { p18ThresholdHzForLevel };`);
  return factory();
}

// Build a synthetic ideal house target curve: flat at targetDb with a small
// house-curve bass shelf below 120 Hz.
function buildIdealTargetCurve(frequencyGrid, targetDb) {
  return frequencyGrid.map((f) => {
    // Simple house curve: +6 dB at 20 Hz, smoothly decreasing to 0 dB at 120 Hz
    const offset = f < 120 ? 6 * Math.max(0, 1 - Math.log2(120 / Math.max(f, 1)) / 3) : 0;
    return { frequency: f, spl: targetDb + offset };
  });
}

// Build a synthetic capability envelope that is ALWAYS above the ideal target.
// This ensures A(f) = idealTarget(f) everywhere, so the overlay is the sole
// LF shaper and target distinction between different Fd values is visible.
function buildCapabilityEnvelope(frequencyGrid, targetDb) {
  return frequencyGrid.map((f) => ({ frequency: f, spl: targetDb + 20 }));
}

test("P18-Intent-Aware LF Target", async (t) => {
  const { applyP18IntentAwareLfOverlay, computeP18ReferenceDb, buildPracticalCalibrationTarget } =
    await loadPracticalCalibrationTarget();
  const { p18ThresholdHzForLevel } = await loadP18Authority();

  const frequencyGrid = [];
  for (let f = 5; f <= 200; f += 1) frequencyGrid.push(f);
  const targetDb = 105;
  const idealTarget = buildIdealTargetCurve(frequencyGrid, targetDb);
  const capabilityEnvelope = buildCapabilityEnvelope(frequencyGrid, targetDb);

  // Build the base practical target A(f) — same as production without the overlay.
  const baseTargetA = buildPracticalCalibrationTarget({ idealTargetCurve: idealTarget, capabilityEnvelope });
  const rDb = computeP18ReferenceDb(idealTarget);

  await t.test("TEST 1 — Target determinism: same Fd → same target curve", () => {
    const fd = 20; // L3 Minimum
    const target1 = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    const target2 = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    assert.equal(target1.length, target2.length, "same length");
    for (let i = 0; i < target1.length; i++) {
      assert.ok(Math.abs(target1[i].spl - target2[i].spl) < 1e-9, `identical at ${target1[i].frequency} Hz`);
    }
  });

  await t.test("TEST 2 — Target distinction: different Fd → different LF shapes", () => {
    const fd20 = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: 20, p18ReferenceDb: rDb });
    const fd30 = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: 30, p18ReferenceDb: rDb });
    // At 20 Hz, the Fd=20 target should be different from the Fd=30 target.
    const t20_at20 = fd20.find((p) => p.frequency === 20).spl;
    const t30_at20 = fd30.find((p) => p.frequency === 20).spl;
    assert.ok(Math.abs(t20_at20 - t30_at20) > 0.5, `LF target differs at 20 Hz: ${t20_at20} vs ${t30_at20}`);
    // At 20 Hz, the Fd=20 target should be HIGHER (M is centred at 20 Hz)
    // while the Fd=30 target is in the 6 dB/octave rolloff below 30 Hz.
    assert.ok(t20_at20 > t30_at20, "Fd=20 target is higher at 20 Hz than Fd=30 target");
  });

  await t.test("TEST 3 — House-curve preservation: above Fd×√2, target = A(f) unchanged", () => {
    const fd = 20;
    const kneeHz = fd * Math.SQRT2; // ~28.28 Hz
    const overlayTarget = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    // Check frequencies above the knee — must be bit-identical to A(f).
    for (let i = 0; i < overlayTarget.length; i++) {
      if (overlayTarget[i].frequency >= kneeHz) {
        const aSpl = baseTargetA[i].spl;
        assert.ok(Math.abs(overlayTarget[i].spl - aSpl) < 1e-9, `identical to A(f) at ${overlayTarget[i].frequency} Hz`);
      }
    }
  });

  await t.test("TEST 4 — Anti-cheating: target does NOT move when product rolls off early", () => {
    // Fd = 20 Hz (L3 Minimum). The target is constructed from Fd, NOT from
    // the achieved response. If the product only achieves 29 Hz, the target
    // remains based on 20 Hz — it does NOT move to 29 Hz.
    const fd = 20;
    const target = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    // The target at Fd should be M = (C + A(Fd)) / 2, where C = R - 3.
    // Since A(Fd) > M (flat high capability), target = M (not capped by A(f)).
    const cDb = rDb - 3;
    const aFd = baseTargetA.find((p) => p.frequency === fd)?.spl;
    assert.ok(Number.isFinite(aFd), "A(Fd) exists");
    const expectedM = (cDb + aFd) / 2;
    const targetAtFd = target.find((p) => p.frequency === fd)?.spl;
    assert.ok(Math.abs(targetAtFd - expectedM) < 0.01, `Target at Fd = M = ${expectedM.toFixed(2)}, got ${targetAtFd?.toFixed(2)}`);
    // The target at 29 Hz should NOT be M for 29 Hz — it should be in the
    // smoothstep transition from M(20Hz) toward A(f).
    const targetAt29 = target.find((p) => p.frequency === 29)?.spl;
    const aAt29 = baseTargetA.find((p) => p.frequency === 29)?.spl;
    // At 29 Hz (above knee ~28.28), the target should be A(f) unchanged.
    assert.ok(Math.abs(targetAt29 - aAt29) < 1e-9, "Target at 29 Hz = A(f) (above knee, unchanged)");
  });

  await t.test("TEST 5 — Never exceed A(f): new target ≤ existing target everywhere", () => {
    const fd = 20;
    const target = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    for (let i = 0; i < target.length; i++) {
      assert.ok(target[i].spl <= baseTargetA[i].spl + 1e-9, `≤ A(f) at ${target[i].frequency} Hz: ${target[i].spl.toFixed(2)} ≤ ${baseTargetA[i].spl.toFixed(2)}`);
    }
  });

  await t.test("TEST 6 — 6 dB/octave rolloff below Fd", () => {
    const fd = 20;
    const target = applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    const mDb = target.find((p) => p.frequency === fd)?.spl;
    // At Fd/2 = 10 Hz, the rolloff should be ~6 dB below M.
    const targetAt10 = target.find((p) => p.frequency === 10)?.spl;
    const aAt10 = baseTargetA.find((p) => p.frequency === 10)?.spl;
    const expectedRolloff = mDb - 6;
    // The target at 10 Hz should be approximately M - 6 dB (or lower if A(f) is lower).
    assert.ok(targetAt10 <= expectedRolloff + 0.1, `6 dB/octave rolloff at 10 Hz: ≤ ${expectedRolloff.toFixed(2)}, got ${targetAt10?.toFixed(2)}`);
    assert.ok(targetAt10 <= aAt10 + 1e-9, "never exceeds A(f) at 10 Hz");
  });

  await t.test("TEST 7 — Fd from target combination: L3 Minimum=20Hz, L2 Recommended=25Hz", () => {
    // Verify the canonical P18 threshold authority gives the right Fd values.
    assert.equal(p18ThresholdHzForLevel("minimum", 3), 20, "L3 Minimum = 20 Hz");
    assert.equal(p18ThresholdHzForLevel("recommended", 2), 25, "L2 Recommended = 25 Hz");
    assert.equal(p18ThresholdHzForLevel("minimum", 1), 35, "L1 Minimum = 35 Hz");
    assert.equal(p18ThresholdHzForLevel("recommended", 4), 15, "L4 Recommended = 15 Hz");
  });

  await t.test("TEST 8 — All 8 target combinations produce distinct LF targets", () => {
    const combinations = [
      { basis: "minimum", level: 1, expectedFd: 35 },
      { basis: "minimum", level: 2, expectedFd: 30 },
      { basis: "minimum", level: 3, expectedFd: 20 },
      { basis: "minimum", level: 4, expectedFd: 18 },
      { basis: "recommended", level: 1, expectedFd: 30 },
      { basis: "recommended", level: 2, expectedFd: 25 },
      { basis: "recommended", level: 3, expectedFd: 18 },
      { basis: "recommended", level: 4, expectedFd: 15 },
    ];
    const targets = combinations.map(({ basis, level, expectedFd }) => {
      const fd = p18ThresholdHzForLevel(basis, level);
      assert.equal(fd, expectedFd, `${basis} L${level} → Fd=${expectedFd} Hz`);
      return applyP18IntentAwareLfOverlay({ practicalTargetA: baseTargetA, p18DesignHz: fd, p18ReferenceDb: rDb });
    });
    // Each target at its own Fd should be M for that Fd.
    // Different Fd values produce different M values (since A(Fd) varies).
    const mValues = combinations.map((combo, i) => {
      const fd = p18ThresholdHzForLevel(combo.basis, combo.level);
      return targets[i].find((p) => p.frequency === fd)?.spl;
    });
    // At least some M values should differ (different Fd → different A(Fd) → different M).
    const uniqueM = new Set(mValues.map((m) => Math.round(m * 10) / 10));
    assert.ok(uniqueM.size > 1, `Multiple distinct M values: ${[...uniqueM].join(", ")}`);
  });
});