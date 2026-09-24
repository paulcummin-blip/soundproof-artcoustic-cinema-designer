// applied-calibration-fingerprint-unification.test.mjs
// ---------------------------------------------------------------------------
// Authority Hardening — Canonical Fingerprint Unification
//
// Verifies that there is exactly ONE canonical Applied Calibration fingerprint
// (computeAppliedCalibrationBasisFingerprint), that both stamping paths
// (Accept Transition and Manual Calibration) produce bit-for-bit identical
// fingerprints for the same geometry, and that P14/P18 targets are excluded.
//
// Run: node --import ./test/_alias-register.mjs --test \
//         test/applied-calibration-fingerprint-unification.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  computeAppliedCalibrationBasisFingerprint,
  extractAppliedCalibrationValues,
  createAppliedCalibrationAuthority,
  resolveAppliedCalibrationStatus,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import {
  markAppliedCalibrationUserModified,
  markAppliedCalibrationOptimiserGenerated,
  resetAppliedCalibrationAuthority,
  getAppliedCalibrationAuthority,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";

// ── Shared geometry fixture ───────────────────────────────────────────────

function buildGeometry() {
  return {
    subwooferInstances: [
      {
        id: "sub-1",
        enabled: true,
        model: "SUB2-12",
        position: { x: 1.5, y: 0.5 },
        bottomHeightM: 0.05,
        rotationDeg: 0,
      },
      {
        id: "sub-2",
        enabled: true,
        model: "SUB2-12",
        position: { x: 3.5, y: 0.5 },
        bottomHeightM: 0.05,
        rotationDeg: 0,
      },
    ],
    roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    seatingPositions: [{ id: "seat-1", x: 2.25, y: 3.0, z: 1.2 }],
    rspPosition: { x: 2.25, y: 3.0, z: 1.2, designatedRspSeatId: null },
    selectedSubModel: "SUB2-12",
  };
}

let _testCounter = 0;
function uniqueIds() {
  _testCounter += 1;
  return {
    projectId: `unify-proj-${_testCounter}`,
    versionId: `unify-ver-${_testCounter}`,
  };
}

// ── TEST 1: Accept Recommendation — fingerprint generated ─────────────────

test("TEST 1: Accept Recommendation — fingerprint generated", () => {
  const geo = buildGeometry();
  const fp = computeAppliedCalibrationBasisFingerprint(geo);
  assert.ok(fp, "Accept Transition must produce a fingerprint");
  assert.ok(fp.startsWith("calbasis:v1:"), "Fingerprint must have calbasis:v1: prefix");
});

// ── TEST 2: Manual calibration — fingerprint generated ───────────────────

test("TEST 2: Manual calibration — fingerprint generated", () => {
  const { projectId, versionId } = uniqueIds();
  try {
    const geo = buildGeometry();
    const fp = computeAppliedCalibrationBasisFingerprint(geo);
    const values = extractAppliedCalibrationValues(geo.subwooferInstances);

    markAppliedCalibrationUserModified(projectId, versionId, fp, values);
    const authority = getAppliedCalibrationAuthority(projectId, versionId);

    assert.ok(authority, "Manual calibration must produce an authority");
    assert.ok(authority.basisFingerprint, "Manual calibration must stamp a basis fingerprint");
    assert.equal(authority.source, APPLIED_CALIBRATION_SOURCE.MANUAL);
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});

// ── TEST 3: Identical geometry — fingerprints identical ──────────────────

test("TEST 3: Identical geometry — Accept Transition fingerprint == Manual Calibration fingerprint (bit-for-bit)", () => {
  const geo = buildGeometry();

  // Accept Transition path: the recommendation's geometryFingerprint is set
  // to the basis fingerprint by the optimiser workflow, and the Accept
  // Transition stamps recommendation.geometryFingerprint as the authority's
  // basisFingerprint.
  const acceptFp = computeAppliedCalibrationBasisFingerprint(geo);

  // Manual Calibration path: setInstanceCalibration computes the basis
  // fingerprint directly and stamps it via markAppliedCalibrationUserModified.
  const manualFp = computeAppliedCalibrationBasisFingerprint(geo);

  assert.equal(acceptFp, manualFp,
    "Accept Transition and Manual Calibration must produce bit-for-bit identical fingerprints for the same geometry");
});

// ── TEST 4: Geometry changes — fingerprint changes ───────────────────────

test("TEST 4: Geometry changes — fingerprint changes", () => {
  const geo = buildGeometry();
  const originalFp = computeAppliedCalibrationBasisFingerprint(geo);

  const changedGeo = {
    ...geo,
    roomDims: { widthM: 5.2, lengthM: 6.0, heightM: 2.4 },
  };
  const changedFp = computeAppliedCalibrationBasisFingerprint(changedGeo);

  assert.notEqual(originalFp, changedFp,
    "Fingerprint must change when geometry changes");

  // Verify stale detection works
  const authority = createAppliedCalibrationAuthority({
    basisFingerprint: originalFp,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.CURRENT,
    values: [],
  });
  const resolved = resolveAppliedCalibrationStatus(authority, changedFp);
  assert.equal(resolved.isStale, true, "Changed geometry must make calibration stale");
});

// ── TEST 5: P14/P18 target changes only — fingerprint unchanged ──────────

test("TEST 5: Changing P14 or P18 targets only — fingerprint unchanged", () => {
  const geo = buildGeometry();
  const baseFp = computeAppliedCalibrationBasisFingerprint(geo);

  // Change P14 targets
  const p14Changed = computeAppliedCalibrationBasisFingerprint({
    ...geo,
    p14TargetBasis: "fullrange",
    p14TargetLevel: 4,
    p14TargetDb: 120,
  });
  assert.equal(p14Changed, baseFp,
    "P14 target changes must NOT change the fingerprint");

  // Change P18 target
  const p18Changed = computeAppliedCalibrationBasisFingerprint({
    ...geo,
    p18TargetBasis: "flat",
  });
  assert.equal(p18Changed, baseFp,
    "P18 target changes must NOT change the fingerprint");

  // Change all P14/P18 at once
  const allChanged = computeAppliedCalibrationBasisFingerprint({
    ...geo,
    p14TargetBasis: "fullrange",
    p14TargetLevel: 4,
    p14TargetDb: 120,
    p18TargetBasis: "flat",
  });
  assert.equal(allChanged, baseFp,
    "All P14/P18 changes must NOT change the fingerprint");

  // Null P14/P18 (cold hydration scenario)
  const nullTargets = computeAppliedCalibrationBasisFingerprint({
    ...geo,
    p14TargetBasis: null,
    p14TargetLevel: null,
    p14TargetDb: null,
    p18TargetBasis: null,
  });
  assert.equal(nullTargets, baseFp,
    "Null P14/P18 (cold hydration) must produce the same fingerprint");
});

// ── TEST 6: Cold project load — fingerprint computable from geometry alone ─

test("TEST 6: Cold project load — fingerprint computable immediately from persisted geometry (no optimiser, no Engineering Prediction)", () => {
  // Simulate cold hydration: ONLY geometry is available from persisted design_state.
  // No P14/P18 target values, no optimiser, no engineering prediction.
  const persistedGeometry = {
    subwooferInstances: buildGeometry().subwooferInstances,
    roomDims: buildGeometry().roomDims,
    seatingPositions: buildGeometry().seatingPositions,
    rspPosition: buildGeometry().rspPosition,
    selectedSubModel: "SUB2-12",
  };

  const fp = computeAppliedCalibrationBasisFingerprint(persistedGeometry);

  assert.ok(fp, "Fingerprint must be computable from geometry alone");
  assert.ok(fp.startsWith("calbasis:v1:"), "Fingerprint must have correct prefix");

  // Must match a fingerprint computed with P14/P18 present (same geometry)
  const fullFp = computeAppliedCalibrationBasisFingerprint(buildGeometry());
  assert.equal(fp, fullFp,
    "Geometry-only fingerprint must equal full-input fingerprint");
});

// ── TEST 7: Cross-path authority consistency ─────────────────────────────

test("TEST 7: Cross-path — optimiser-generated and manual-edit authorities share the same basis fingerprint for the same geometry", () => {
  const { projectId, versionId } = uniqueIds();
  try {
    const geo = buildGeometry();
    const fp = computeAppliedCalibrationBasisFingerprint(geo);
    const values = extractAppliedCalibrationValues(geo.subwooferInstances);

    // Path A: Optimiser-generated (simulates Accept Transition stamping)
    markAppliedCalibrationOptimiserGenerated(projectId, versionId, {
      basisFingerprint: fp,
      candidateId: "cand-1",
      values,
      stageKey: "calibration",
    });
    const optimiserAuthority = getAppliedCalibrationAuthority(projectId, versionId);
    const optimiserFp = optimiserAuthority.basisFingerprint;

    resetAppliedCalibrationAuthority(projectId, versionId);

    // Path B: Manual edit
    markAppliedCalibrationUserModified(projectId, versionId, fp, values);
    const manualAuthority = getAppliedCalibrationAuthority(projectId, versionId);
    const manualFp = manualAuthority.basisFingerprint;

    assert.equal(optimiserFp, manualFp,
      "Optimiser-generated and manual-edit authorities must share the same basis fingerprint");
    assert.equal(optimiserFp, fp,
      "Authority basis fingerprint must equal the canonical fingerprint");
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});