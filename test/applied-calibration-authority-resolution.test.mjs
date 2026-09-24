// applied-calibration-authority-resolution.test.mjs
// ---------------------------------------------------------------------------
// Authority Hardening Stage 1 — Prove Applied Calibration Resolution
//
// Validates that the Applied Calibration Authority correctly resolves its
// lifecycle state (Current / Stale / User Accepted / Manual / Unknown) from
// canonical engineering inputs using computeAppliedCalibrationBasisFingerprint
// as the single authority.
//
// Persistence remains dormant.  Hydration remains dormant.  No UI.  No
// workflow modification.  This test exercises ONLY the pure authority logic.
//
// Run: node --import ./test/_alias-register.mjs --test \
//         test/applied-calibration-authority-resolution.test.mjs
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  computeAppliedCalibrationBasisFingerprint,
  createAppliedCalibrationAuthority,
  resolveAppliedCalibrationStatus,
  markAsUserAccepted,
  extractAppliedCalibrationValues,
  isAppliedCalibrationConsumable,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import {
  migrateLegacyAppliedCalibration,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationPersistence.js";
import {
  markAppliedCalibrationUserModified,
  markAppliedCalibrationOptimiserGenerated,
  resetAppliedCalibrationAuthority,
  getAppliedCalibrationAuthority,
} from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";

// ── Fixture builder ──────────────────────────────────────────────────────

function buildCanonicalInputs(overrides = {}) {
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
    seatingPositions: [
      { id: "seat-1", x: 2.25, y: 3.0, z: 1.2 },
    ],
    rspPosition: { x: 2.25, y: 3.0, z: 1.2, designatedRspSeatId: null },
    selectedSubModel: "SUB2-12",
    p14TargetBasis: "minimum",
    p14TargetLevel: 2,
    p14TargetDb: 112,
    p18TargetBasis: "extension",
    ...overrides,
  };
}

function buildCalibrationValues() {
  return [
    { id: "sub-1", delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: "sub-2", delayMs: 2.3, gainDb: -1.5, polarity: 1, phaseControlDeg: 0 },
  ];
}

// Unique project/version per test to avoid store leakage
let _testCounter = 0;
function uniqueIds() {
  _testCounter += 1;
  return {
    projectId: `test-proj-${_testCounter}`,
    versionId: `test-ver-${_testCounter}`,
  };
}

// ── TEST 1: Current ──────────────────────────────────────────────────────

test("TEST 1: Current — same geometry fingerprint resolves to Current", () => {
  const inputs = buildCanonicalInputs();
  const fp = computeAppliedCalibrationBasisFingerprint(inputs);

  const authority = createAppliedCalibrationAuthority({
    basisFingerprint: fp,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.CURRENT,
    candidateId: "cand-1",
    recommendationId: "rec-1",
    values: buildCalibrationValues(),
    stageKey: "stage2",
  });

  const resolved = resolveAppliedCalibrationStatus(authority, fp);

  assert.equal(resolved.status, APPLIED_CALIBRATION_STATUS.CURRENT,
    `Expected Current, got ${resolved.status}`);
  assert.equal(resolved.isStale, false,
    "Current authority must not be stale");
  assert.equal(resolved.staleReason, null,
    "Current authority must have no stale reason");
  assert.equal(
    isAppliedCalibrationConsumable(authority, fp),
    true,
    "Current authority must be consumable by engineering",
  );
});

// ── TEST 2: Stale ─────────────────────────────────────────────────────────

test("TEST 2: Stale — geometry fingerprint change resolves to Stale", () => {
  const originalInputs = buildCanonicalInputs();
  const originalFp = computeAppliedCalibrationBasisFingerprint(originalInputs);

  const authority = createAppliedCalibrationAuthority({
    basisFingerprint: originalFp,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.CURRENT,
    candidateId: "cand-1",
    recommendationId: "rec-1",
    values: buildCalibrationValues(),
    stageKey: "stage2",
  });

  // Geometry changes — room width 4.5 → 5.2
  const changedInputs = buildCanonicalInputs({
    roomDims: { widthM: 5.2, lengthM: 6.0, heightM: 2.4 },
  });
  const newFp = computeAppliedCalibrationBasisFingerprint(changedInputs);

  assert.notEqual(originalFp, newFp,
    "Precondition: geometry change must produce a different fingerprint");

  const resolved = resolveAppliedCalibrationStatus(authority, newFp);

  assert.equal(resolved.status, APPLIED_CALIBRATION_STATUS.STALE,
    `Expected Stale, got ${resolved.status}`);
  assert.equal(resolved.isStale, true,
    "Stale authority must report isStale=true");
  assert.ok(resolved.staleReason,
    "Stale authority must have a stale reason");
  assert.equal(
    isAppliedCalibrationConsumable(authority, newFp),
    false,
    "Stale authority must NOT be consumable by engineering",
  );
});

// ── TEST 3: User Accepted ────────────────────────────────────────────────

test("TEST 3: User Accepted — Stale → designer keeps → User Accepted, engineering consumable", () => {
  const originalInputs = buildCanonicalInputs();
  const originalFp = computeAppliedCalibrationBasisFingerprint(originalInputs);

  // Step 1: authority is Current
  let authority = createAppliedCalibrationAuthority({
    basisFingerprint: originalFp,
    source: APPLIED_CALIBRATION_SOURCE.OPTIMISER,
    status: APPLIED_CALIBRATION_STATUS.CURRENT,
    candidateId: "cand-1",
    recommendationId: "rec-1",
    values: buildCalibrationValues(),
    stageKey: "stage2",
  });

  // Step 2: geometry changes → Stale
  const changedInputs = buildCanonicalInputs({
    roomDims: { widthM: 5.2, lengthM: 6.0, heightM: 2.4 },
  });
  const newFp = computeAppliedCalibrationBasisFingerprint(changedInputs);

  const staleResolved = resolveAppliedCalibrationStatus(authority, newFp);
  assert.equal(staleResolved.status, APPLIED_CALIBRATION_STATUS.STALE,
    "Precondition: must be Stale before User Accepted transition");
  assert.equal(staleResolved.isStale, true,
    "Precondition: must report isStale before User Accepted transition");

  // Step 3: designer selects "Continue With Current Design"
  authority = markAsUserAccepted(authority);

  // Step 4: resolve against the NEW fingerprint
  const acceptedResolved = resolveAppliedCalibrationStatus(authority, newFp);

  assert.equal(acceptedResolved.status, APPLIED_CALIBRATION_STATUS.USER_ACCEPTED,
    `Expected User Accepted, got ${acceptedResolved.status}`);
  assert.equal(acceptedResolved.isStale, false,
    "User Accepted must NOT be stale — designer deliberately overrode");
  assert.equal(acceptedResolved.staleReason, null,
    "User Accepted must have no stale reason");
  assert.equal(
    isAppliedCalibrationConsumable(authority, newFp),
    true,
    "User Accepted must remain consumable by engineering",
  );
});

// ── TEST 4: Manual ────────────────────────────────────────────────────────

test("TEST 4: Manual — designer edits tuning → Source = Manual, Status current", () => {
  const { projectId, versionId } = uniqueIds();
  try {
    const inputs = buildCanonicalInputs();
    const fp = computeAppliedCalibrationBasisFingerprint(inputs);

    const manualValues = [
      { id: "sub-1", delayMs: 5.1, gainDb: -2.0, polarity: -1, phaseControlDeg: 45 },
      { id: "sub-2", delayMs: 3.2, gainDb: -1.0, polarity: 1, phaseControlDeg: 0 },
    ];

    // Simulate the store action triggered by a manual edit
    markAppliedCalibrationUserModified(projectId, versionId, fp, manualValues);

    const authority = getAppliedCalibrationAuthority(projectId, versionId);
    assert.ok(authority, "Store must contain the authority after manual edit");
    assert.equal(authority.source, APPLIED_CALIBRATION_SOURCE.MANUAL,
      `Expected Source = Manual Entry, got ${authority.source}`);

    // Resolve against the SAME fingerprint (geometry unchanged)
    const resolved = resolveAppliedCalibrationStatus(authority, fp);

    // A manual edit with matching geometry is current (not stale)
    assert.equal(resolved.isStale, false,
      "Manual edit with unchanged geometry must not be stale");
    assert.equal(
      isAppliedCalibrationConsumable(authority, fp),
      true,
      "Manual edit with unchanged geometry must be consumable",
    );

    // The authority's status is USER_MODIFIED — a current, non-stale state
    // that records the designer's manual intervention.  It is functionally
    // "current" (consumable, not stale) but labelled distinctly from
    // optimiser-generated Current.
    assert.ok(
      resolved.status === APPLIED_CALIBRATION_STATUS.USER_MODIFIED
        || resolved.status === APPLIED_CALIBRATION_STATUS.CURRENT,
      `Expected User Modified or Current, got ${resolved.status}`,
    );
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});

// ── TEST 5: Unknown (Legacy Migration) ────────────────────────────────────

test("TEST 5: Unknown — legacy optimiser tuning migration → Source = Unknown", () => {
  const { projectId, versionId } = uniqueIds();
  try {
    const inputs = buildCanonicalInputs();
    const fp = computeAppliedCalibrationBasisFingerprint(inputs);

    // Legacy instances with optimiser tuning provenance but no authority
    const legacyInstances = inputs.subwooferInstances.map((s) => ({
      ...s,
      delayMs: 1.5,
      gainDb: -1.0,
      polarity: 1,
      phaseControlDeg: 0,
      tuningSource: "v2-optimised",
      appliedV2Provenance: {
        candidateId: "legacy-cand",
        recommendationId: "legacy-rec",
      },
    }));

    const migrated = migrateLegacyAppliedCalibration(
      projectId,
      versionId,
      legacyInstances,
      fp,
    );

    assert.ok(migrated, "Migration must produce an authority for legacy tuning");
    assert.equal(migrated.source, APPLIED_CALIBRATION_SOURCE.UNKNOWN,
      `Expected Source = Unknown, got ${migrated.source}`);

    // With a matching fingerprint, the migrated authority is Current
    const resolved = resolveAppliedCalibrationStatus(migrated, fp);
    assert.equal(resolved.isStale, false,
      "Legacy migration with matching fingerprint must not be stale");
    assert.equal(
      isAppliedCalibrationConsumable(migrated, fp),
      true,
      "Legacy migration with matching fingerprint must be consumable",
    );

    // No Recommendation is required — the authority exists independently
    assert.ok(!migrated.recommendationId,
      "Legacy migration must not carry a recommendation reference");
  } finally {
    resetAppliedCalibrationAuthority(projectId, versionId);
  }
});

// ── TEST 6: Fingerprint Stability ─────────────────────────────────────────

test("TEST 6: Fingerprint Stability — identical inputs always produce identical fingerprints", () => {
  const inputs = buildCanonicalInputs();

  const fingerprints = new Set();
  const ITERATIONS = 100;

  for (let i = 0; i < ITERATIONS; i++) {
    // Rebuild inputs from scratch each time to ensure no shared references
    const freshInputs = buildCanonicalInputs();
    const fp = computeAppliedCalibrationBasisFingerprint(freshInputs);
    fingerprints.add(fp);
  }

  assert.equal(fingerprints.size, 1,
    `Expected exactly 1 unique fingerprint across ${ITERATIONS} calls, got ${fingerprints.size}`);
});

// ── TEST 7: Fingerprint Sensitivity ───────────────────────────────────────

test("TEST 7: Fingerprint Sensitivity — changing any canonical input produces a different fingerprint", () => {
  const baseInputs = buildCanonicalInputs();
  const baseFp = computeAppliedCalibrationBasisFingerprint(baseInputs);

  const variants = [
    {
      label: "room width",
      inputs: buildCanonicalInputs({
        roomDims: { widthM: 5.0, lengthM: 6.0, heightM: 2.4 },
      }),
    },
    {
      label: "room length",
      inputs: buildCanonicalInputs({
        roomDims: { widthM: 4.5, lengthM: 6.5, heightM: 2.4 },
      }),
    },
    {
      label: "room height",
      inputs: buildCanonicalInputs({
        roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 3.0 },
      }),
    },
    {
      label: "seating position",
      inputs: buildCanonicalInputs({
        seatingPositions: [{ id: "seat-1", x: 2.5, y: 3.5, z: 1.2 }],
      }),
    },
    {
      label: "RSP position",
      inputs: buildCanonicalInputs({
        rspPosition: { x: 2.5, y: 3.5, z: 1.2, designatedRspSeatId: null },
      }),
    },
    {
      label: "active sub count (disable one)",
      inputs: buildCanonicalInputs({
        subwooferInstances: [
          { ...baseInputs.subwooferInstances[0], enabled: false },
          baseInputs.subwooferInstances[1],
        ],
      }),
    },
    {
      label: "sub position x",
      inputs: buildCanonicalInputs({
        subwooferInstances: [
          { ...baseInputs.subwooferInstances[0], position: { x: 2.0, y: 0.5 } },
          baseInputs.subwooferInstances[1],
        ],
      }),
    },
    {
      label: "sub position y",
      inputs: buildCanonicalInputs({
        subwooferInstances: [
          { ...baseInputs.subwooferInstances[0], position: { x: 1.5, y: 1.0 } },
          baseInputs.subwooferInstances[1],
        ],
      }),
    },
    {
      label: "sub bottom height",
      inputs: buildCanonicalInputs({
        subwooferInstances: [
          { ...baseInputs.subwooferInstances[0], bottomHeightM: 0.15 },
          baseInputs.subwooferInstances[1],
        ],
      }),
    },
    {
      label: "sub rotation",
      inputs: buildCanonicalInputs({
        subwooferInstances: [
          { ...baseInputs.subwooferInstances[0], rotationDeg: 90 },
          baseInputs.subwooferInstances[1],
        ],
      }),
    },
    {
      label: "sub model",
      inputs: buildCanonicalInputs({
        selectedSubModel: "SUB3-12",
        subwooferInstances: baseInputs.subwooferInstances.map((s) => ({
          ...s,
          model: "SUB3-12",
        })),
      }),
    },
    {
      label: "P14 target basis",
      inputs: buildCanonicalInputs({ p14TargetBasis: "fullrange" }),
    },
    {
      label: "P14 target level",
      inputs: buildCanonicalInputs({ p14TargetLevel: 3 }),
    },
    {
      label: "P14 target dB",
      inputs: buildCanonicalInputs({ p14TargetDb: 115 }),
    },
    {
      label: "P18 target basis",
      inputs: buildCanonicalInputs({ p18TargetBasis: "flat" }),
    },
  ];

  for (const { label, inputs } of variants) {
    const variantFp = computeAppliedCalibrationBasisFingerprint(inputs);
    assert.notEqual(variantFp, baseFp,
      `Fingerprint must differ when ${label} changes`);
  }
});

// ── Bonus: Calibration values do NOT change the fingerprint ────────────────

test("BONUS: Calibration value changes (delay/gain/polarity/phase) do NOT change the fingerprint", () => {
  const baseInputs = buildCanonicalInputs();
  const baseFp = computeAppliedCalibrationBasisFingerprint(baseInputs);

  // Change only calibration values — geometry unchanged
  const tunedInputs = buildCanonicalInputs({
    subwooferInstances: baseInputs.subwooferInstances.map((s) => ({
      ...s,
      delayMs: 5.0,
      gainDb: -3.0,
      polarity: -1,
      phaseControlDeg: 90,
    })),
  });

  const tunedFp = computeAppliedCalibrationBasisFingerprint(tunedInputs);
  assert.equal(tunedFp, baseFp,
    "Calibration value changes must NOT change the basis fingerprint");
});

// ── Bonus: extractAppliedCalibrationValues round-trip ─────────────────────

test("BONUS: extractAppliedCalibrationValues extracts delay/gain/polarity/phase from instances", () => {
  const instances = [
    { id: "sub-1", enabled: true, delayMs: 1.5, gainDb: -2.0, polarity: -1, phaseControlDeg: 45 },
    { id: "sub-2", enabled: false, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: "sub-3", enabled: true, delayMs: 3.0, gainDb: 0, polarity: 1, phaseAdjust: 30 },
  ];

  const values = extractAppliedCalibrationValues(instances);

  assert.equal(values.length, 2,
    "Only enabled instances must produce calibration values");
  assert.equal(values[0].id, "sub-1");
  assert.equal(values[0].delayMs, 1.5);
  assert.equal(values[0].gainDb, -2.0);
  assert.equal(values[0].polarity, -1);
  assert.equal(values[0].phaseControlDeg, 45);
  assert.equal(values[1].id, "sub-3");
  assert.equal(values[1].phaseControlDeg, 30,
    "phaseAdjust must map to phaseControlDeg");
});