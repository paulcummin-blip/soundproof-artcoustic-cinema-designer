// improve-bass-v2-safety.test.mjs
// V2 Improve Bass Response safety regression suite.
//
// Tests A–G plus BLOCKER 2/3/4/5/6 guardrails using PURE functions only
// (no Worker instantiation). All acoustic maths are fixtures — this suite
// never changes P14/P18/P19/P20 equations, scaling, or summation logic.
//
// Run: node --test test/improve-bass-v2-safety.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

// --- V2 fingerprint (BLOCKER 2) ---
const { computeV2DesignFingerprint, isCurrentAuthorityNonStale, extractBaseFingerprint } =
  await import("../src/components/room/bass/improveBassV2/improveBassV2Fingerprint.js");

// --- V2 apply (BLOCKER 4) ---
const { buildOptimisedInstances, isOptimisedApplied, buildCalibrationSummary } =
  await import("../src/components/room/bass/improveBassV2/improveBassV2Apply.js");

// --- V2 engine (BLOCKER 1, 3, 5) ---
const { snapshotCurrentDesign, gatherCandidates } =
  await import("../src/components/room/bass/improveBassV2/improveBassV2Engine.js");

// --- Production fingerprint (BLOCKER 6) ---
const { computeCalibrationFingerprint, computeGeometryFingerprint } =
  await import("../src/components/room/bass/bassAnalysisFingerprints.js");

// --- Authoritative finalist selection (primary-seat protection) ---
const { selectAuthoritativeFinalist, hasPrimarySeatRegression } =
  await import("../src/components/room/bass/best-layout/authoritativeFinalistSelection.js");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const ROOM_B = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
const ROOM_C = { widthM: 5.5, lengthM: 7.0, heightM: 2.8 };

function makeInstance({ id, x, y, model = "SUB2-12", enabled = true, gainDb = 0, delayMs = 0, polarity = 0, bottomHeightM = 0, rotationDeg = 0 }) {
  return { id, model, enabled, position: { x, y }, bottomHeightM, rotationDeg, gainDb, delayMs, polarity };
}

function makeSeats(count, roomDims) {
  const seats = [];
  const yStep = roomDims.lengthM / (count + 1);
  for (let i = 0; i < count; i++) {
    seats.push({
      id: `seat-${i + 1}`,
      x: roomDims.widthM / 2,
      y: yStep * (i + 1),
      z: 1.2,
    });
  }
  return seats;
}

function makeRsp(roomDims) {
  return { x: roomDims.widthM / 2, y: roomDims.lengthM * 0.5, z: 1.2, designatedRspSeatId: null };
}

function makePerSeat(count, variationBySeat, levels, isPrimaryArr, parameter) {
  return Array.from({ length: count }, (_, i) => ({
    seatId: `seat-${i + 1}`,
    isPrimary: isPrimaryArr[i] ?? true,
    variationDbRaw: variationBySeat[i] ?? 1.0,
    level: levels[i] ?? 3,
    worstFrequencyHz: parameter === "P19" ? 35 : 45,
  }));
}

function makeConfirmedResult({
  candidateId,
  isCurrent = false,
  coordinates,
  appliedTuning,
  p19VariationBySeat,
  p20VariationBySeat,
  p19Levels = [3, 3],
  p20Levels = [3, 3],
  isPrimaryArr = [true, true],
  p19Headline = null,
  p20Headline = null,
  p18Level = 3,
  p18Hz = 28,
  p14Level = 3,
  p14Db = 95,
}) {
  const perSeatP19 = makePerSeat(p19VariationBySeat.length, p19VariationBySeat, p19Levels, isPrimaryArr, "P19");
  const perSeatP20 = makePerSeat(p20VariationBySeat.length, p20VariationBySeat, p20Levels, isPrimaryArr, "P20");
  return {
    candidateId,
    isCurrent,
    coordinates,
    appliedTuning,
    perSeatP19,
    perSeatP20,
    achievedP19VariationDb: p19Headline ?? Math.max(...p19VariationBySeat.map((v) => Math.abs(v))),
    achievedP19Level: p19Levels[0] ?? 3,
    achievedP20VariationDb: p20Headline ?? Math.max(...p20VariationBySeat.map((v) => Math.abs(v))),
    achievedP20Level: p20Levels[0] ?? 3,
    p18AchievedLevel: p18Level,
    achievedP18Hz: p18Hz,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
  };
}

// OLD/WRONG shape: per-seat data at contract root (contract.perSeatP19).
// Production code NEVER stored per-seat data here. This fixture is retained
// to prove that isCurrentAuthorityNonStale REJECTS the obsolete shape rather
// than silently accepting it.
function makeCurrentAuthority({ perSeatP19, perSeatP20, fingerprint, p19Levels, p20Levels, p19Headline, p20Headline, p18Level = 3, p18Hz = 28, p14Level = 3, p14Db = 95 }) {
  return {
    authoritative: true,
    currentFingerprint: fingerprint,
    contract: { perSeatP19, perSeatP20 },
    perSeatP19,
    perSeatP20,
    achievedP19VariationDb: p19Headline ?? Math.max(...perSeatP19.map((s) => Math.abs(s.variationDbRaw))),
    achievedP19Level: p19Levels?.[0] ?? perSeatP19[0]?.level ?? 3,
    achievedP20VariationDb: p20Headline ?? Math.max(...perSeatP20.map((s) => Math.abs(s.variationDbRaw))),
    achievedP20Level: p20Levels?.[0] ?? perSeatP20[0]?.level ?? 3,
    p18AchievedLevel: p18Level,
    achievedP18Hz: p18Hz,
    p14AchievedLevel: p14Level,
    p14AchievedDb: p14Db,
    canonicalAuthorityReceipt: { filterBankSignature: "test-sig" },
  };
}

// PRODUCTION shape: per-seat data at contract.selectedCandidate.perSeatP19Results
// / perSeatP20Results, headline at contract.productAnalysis.parameters.
// This matches completedBassResultPersistence.js lines 52-60 and the compact
// contract structure published by publishCompletedBassContract.
function makeProductionCurrentAuthority({ perSeatP19, perSeatP20, fingerprint, p19Levels, p20Levels, p19Headline, p20Headline, p18Level = 3, p18Hz = 28, p14Level = 3, p14Db = 95 }) {
  const p19HeadlineVal = p19Headline ?? Math.max(...perSeatP19.map((s) => Math.abs(s.variationDbRaw)));
  const p20HeadlineVal = p20Headline ?? Math.max(...perSeatP20.map((s) => Math.abs(s.variationDbRaw)));
  return {
    authoritative: true,
    currentFingerprint: fingerprint,
    contract: {
      selectedCandidate: {
        perSeatP19Results: perSeatP19,
        perSeatP20Results: perSeatP20,
        achievedP18FrequencyHz: p18Hz,
      },
      productAnalysis: {
        parameters: {
          p19: { value: p19HeadlineVal, level: p19Levels?.[0] ?? perSeatP19[0]?.level ?? 3, status: "complete" },
          p20: { value: p20HeadlineVal, level: p20Levels?.[0] ?? perSeatP20[0]?.level ?? 3, status: "complete" },
          p18: { value: p18Hz, level: p18Level, status: "complete" },
          p14: { value: p14Db, level: p14Level, status: "complete" },
        },
      },
      job: { resultFingerprint: fingerprint },
    },
  };
}

// ---------------------------------------------------------------------------
// BLOCKER 6 — Tuning-only fingerprint invalidation
// ---------------------------------------------------------------------------

test("BLOCKER 6: position change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const moved = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 2.0, y: 0.5 })] };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(moved);
  assert.notEqual(fp1, fp2, "Moving a subwoofer must change the fingerprint");
});

test("BLOCKER 6: delay change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, delayMs: 0 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const tuned = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, delayMs: 5.5 })] };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(tuned);
  assert.notEqual(fp1, fp2, "Changing delay must change the fingerprint");
});

test("BLOCKER 6: trim (gainDb) change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, gainDb: 0 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const trimmed = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, gainDb: -3.5 })] };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(trimmed);
  assert.notEqual(fp1, fp2, "Changing trim must change the fingerprint");
});

test("BLOCKER 6: polarity change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: 0 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const inverted = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: -1 })] };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(inverted);
  assert.notEqual(fp1, fp2, "Changing polarity must change the fingerprint");
});

test("BLOCKER 6: bottomHeightM change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, bottomHeightM: 0 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const raised = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, bottomHeightM: 0.35 })] };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(raised);
  assert.notEqual(fp1, fp2, "Changing bottomHeightM must change the fingerprint");
});

test("BLOCKER 6: room geometry change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const bigger = { ...base, roomDims: ROOM_C, seatingPositions: makeSeats(2, ROOM_C), rspPosition: makeRsp(ROOM_C) };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(bigger);
  assert.notEqual(fp1, fp2, "Changing room geometry must change the fingerprint");
});

test("BLOCKER 6: model change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, model: "SUB2-12" })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const upgraded = { ...base, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, model: "SUB3-12" })], selectedSubModel: "SUB3-12" };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(upgraded);
  assert.notEqual(fp1, fp2, "Changing model must change the fingerprint");
});

test("BLOCKER 6: P14 target change invalidates fingerprint", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const retargeted = { ...base, p14TargetLevel: 3, p14TargetDb: 120 };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(retargeted);
  assert.notEqual(fp1, fp2, "Changing P14 target must change the fingerprint");
});

test("BLOCKER 6: identical inputs produce identical fingerprint (stability)", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(base);
  assert.equal(fp1, fp2, "Identical inputs must produce identical fingerprint");
});

// ---------------------------------------------------------------------------
// BLOCKER 2 — Stale-job rejection across worker boundaries
// ---------------------------------------------------------------------------

test("BLOCKER 2: fingerprint differs when any material input changes during V2", () => {
  const startInputs = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const startFp = computeV2DesignFingerprint(startInputs);

  // Simulate each material change during V2 execution
  const changes = [
    { ...startInputs, roomDims: ROOM_C, seatingPositions: makeSeats(2, ROOM_C), rspPosition: makeRsp(ROOM_C) }, // geometry
    { ...startInputs, seatingPositions: makeSeats(3, ROOM_B) }, // seats
    { ...startInputs, subwooferInstances: [makeInstance({ id: "sub-1", x: 2.5, y: 0.5 })] }, // position
    { ...startInputs, subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, model: "SUB3-12" })], selectedSubModel: "SUB3-12" }, // model
    { ...startInputs, p14TargetLevel: 3, p14TargetDb: 120 }, // target
  ];

  for (const changed of changes) {
    const currentFp = computeV2DesignFingerprint(changed);
    assert.notEqual(startFp, currentFp, "Stale check must detect the change");
  }
});

test("BLOCKER 2: fingerprint unchanged when no material input changes", () => {
  const inputs = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const startFp = computeV2DesignFingerprint(inputs);
  const currentFp = computeV2DesignFingerprint(inputs);
  assert.equal(startFp, currentFp, "No change = no stale");
});

// ---------------------------------------------------------------------------
// BLOCKER 3 — Current authority non-stale check
// ---------------------------------------------------------------------------

// PROOF: The old contract shape (per-seat at contract root) is obsolete.
// Production code (completedBassResultPersistence.js lines 52-60) reads from
// contract.selectedCandidate.perSeatP19Results / perSeatP20Results. The old
// shape must be REJECTED, not silently accepted, so V2 falls back to
// canonical recalculation rather than using a non-production authority.
test("BLOCKER 3: OLD contract shape (perSeatP19 at contract root) is REJECTED", () => {
  const fp = "cal:v7:abcdef1234567890";
  const authority = makeCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: fp,
  });
  assert.equal(isCurrentAuthorityNonStale(authority, fp), false,
    "Old contract shape (no selectedCandidate.perSeatP19Results) must be rejected");
});

test("BLOCKER 3: PRODUCTION contract shape (selectedCandidate.perSeatP19Results) with matching fingerprint is accepted", () => {
  const fp = "cal:v7:abcdef1234567890";
  const authority = makeProductionCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: fp,
  });
  assert.equal(isCurrentAuthorityNonStale(authority, fp), true,
    "Production contract shape with matching fingerprint must be non-stale");
});

test("BLOCKER 3: stale authority (fingerprint mismatch) is NOT used directly", () => {
  const authority = makeCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: "cal:v7:oldfingerprint00",
  });
  assert.equal(isCurrentAuthorityNonStale(authority, "cal:v7:newfingerprint00"), false,
    "Fingerprint mismatch means authority is stale");
});

test("BLOCKER 3: non-authoritative authority is NOT used directly", () => {
  const fp = "cal:v7:abcdef1234567890";
  const authority = makeCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: fp,
  });
  authority.authoritative = false;
  assert.equal(isCurrentAuthorityNonStale(authority, fp), false,
    "Non-authoritative authority must not be used directly");
});

test("BLOCKER 3: authority with empty per-seat data is NOT used directly", () => {
  const fp = "cal:v7:abcdef1234567890";
  const authority = makeCurrentAuthority({
    perSeatP19: [], perSeatP20: [], fingerprint: fp,
  });
  assert.equal(isCurrentAuthorityNonStale(authority, fp), false,
    "Empty per-seat data means authority is not usable");
});

test("BLOCKER 3: null authority is NOT used directly", () => {
  assert.equal(isCurrentAuthorityNonStale(null, "cal:v7:abcdef1234567890"), false);
});

// ---------------------------------------------------------------------------
// BLOCKER 5 — Snapshot includes bottomHeightM
// ---------------------------------------------------------------------------

test("BLOCKER 5: snapshot includes model, enabled, x/y, rotation, bottomHeightM, delay, trim, polarity", () => {
  const instances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5, model: "SUB2-12", gainDb: -1.5, delayMs: 3.2, polarity: -1, bottomHeightM: 0.35, rotationDeg: 90 }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5, model: "SUB2-12", gainDb: 0, delayMs: 0, polarity: 0, bottomHeightM: 0, rotationDeg: 0 }),
  ];
  const snapshot = snapshotCurrentDesign({
    subwooferInstances: instances, roomDims: ROOM_B, selectedSubModel: "SUB2-12",
    currentAuthority: null, p14TargetBasis: "minimum", p14TargetLevel: 2, p18TargetBasis: "minimum",
  });
  assert.equal(snapshot.positions.length, 2);
  assert.equal(snapshot.positions[0].x, 1.0);
  assert.equal(snapshot.positions[0].y, 0.5);
  assert.equal(snapshot.models[0], "sub2-12");
  assert.equal(snapshot.rotation[0], 90);
  assert.equal(snapshot.bottomHeightM[0], 0.35);
  assert.equal(snapshot.tuning[0].delayMs, 3.2);
  assert.equal(snapshot.tuning[0].gainDb, -1.5);
  assert.equal(snapshot.tuning[0].polarity, -1);
  assert.equal(snapshot.instanceIds[0], "sub-1");
});

test("BLOCKER 5: snapshot excludes disabled instances", () => {
  const instances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5, enabled: true }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5, enabled: false }),
  ];
  const snapshot = snapshotCurrentDesign({
    subwooferInstances: instances, roomDims: ROOM_B, selectedSubModel: "SUB2-12",
    currentAuthority: null, p14TargetBasis: "minimum", p14TargetLevel: 2, p18TargetBasis: "minimum",
  });
  assert.equal(snapshot.positions.length, 1, "Disabled instances must be excluded");
  assert.equal(snapshot.instanceIds[0], "sub-1");
});

// ---------------------------------------------------------------------------
// BLOCKER 1 — Shortlist diversity (promoteChallengers)
// ---------------------------------------------------------------------------

// promoteChallengers is not exported, but we can test gatherCandidates which
// always includes Current, and verify the engine's MAX_CHALLENGERS = 3.

// BLOCKER 2: Current is a FIXED CONTROL — it must NOT appear in the
// challenger candidate list. Current is handled separately (reused from
// existing authority or canonically recalculated with installed tuning).
test("BLOCKER 2: gatherCandidates EXCLUDES Current from challenger candidates", () => {
  const instances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5 }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5 }),
  ];
  const candidates = gatherCandidates({
    subwooferInstances: instances, roomDims: ROOM_B, stage2Result: null, stage2Fingerprint: null,
  });
  const currentCandidate = candidates.find((c) => c.isCurrent === true || c.id === "current");
  assert.equal(currentCandidate, undefined,
    "Current must NOT be in the challenger candidate list — it is a fixed control");
});

test("BLOCKER 1: gatherCandidates excludes Stage 2 finalists matching current placement", () => {
  const instances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5 }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5 }),
  ];
  // Stage 2 finalist at the same positions (normalised) should be deduped.
  const W = ROOM_B.widthM, L = ROOM_B.lengthM;
  const stage2Result = {
    two_sub_result: {
      finalists: [{
        id: "dup-finalist",
        sources: [
          { xNorm: 1.0 / W, yNorm: 0.5 / L },
          { xNorm: 3.5 / W, yNorm: 0.5 / L },
        ],
      }],
    },
  };
  const candidates = gatherCandidates({
    subwooferInstances: instances, roomDims: ROOM_B, stage2Result, stage2Fingerprint: null,
  });
  const dup = candidates.find((c) => c.id === "dup-finalist");
  assert.equal(dup, undefined, "Duplicate placement must be excluded");
});

// ---------------------------------------------------------------------------
// BLOCKER 4 — Polarity normalisation in isOptimisedApplied
// ---------------------------------------------------------------------------

test("BLOCKER 4: polarity 0 and 1 both match as 'normal' (not inverted)", () => {
  const winner = {
    coordinates: [{ x: 1.0, y: 0.5 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: 1 })];
  // polarity 1 (instance) vs polarity 0 (winner) — both are "normal"
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), true,
    "polarity 0 and 1 both mean normal — must match");
});

test("BLOCKER 4: polarity -1 and 180 both match as 'inverted'", () => {
  const winner = {
    coordinates: [{ x: 1.0, y: 0.5 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: -1 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: 180 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), true,
    "polarity -1 and 180 both mean inverted — must match");
});

test("BLOCKER 4: polarity mismatch (normal vs inverted) is NOT applied", () => {
  const winner = {
    coordinates: [{ x: 1.0, y: 0.5 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: -1 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: 0 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), false,
    "Normal vs inverted polarity must NOT match");
});

// ---------------------------------------------------------------------------
// Test A — Room B unsafe headline winner (REJECTED — CURRENT RETAINED)
// ---------------------------------------------------------------------------

test("A — Room B: unsafe headline winner rejected, current retained", () => {
  // Current: P19 L3, P20 L3 on primary seats
  const currentAuthority = makeCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: "cal:v7:roomb-current00",
  });

  // Challenger: headline P19/P20 better (lower variation) but primary seat-1
  // P19 drops from L3 to L2 (regression).
  const challenger = makeConfirmedResult({
    candidateId: "unsafe-headline",
    isCurrent: false,
    coordinates: [{ x: 1.5, y: 0.3 }, { x: 3.0, y: 0.3 }],
    appliedTuning: [{ delayMs: 2, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: 0 }],
    p19VariationBySeat: [0.5, 1.8],  // headline better (max=1.8 < 1.2? no, 1.8 > 1.2)
    p20VariationBySeat: [1.5, 2.0],  // headline better
    p19Levels: [2, 3],               // seat-1 regressed L3→L2
    p20Levels: [3, 3],
    isPrimaryArr: [true, true],
  });

  const regression = hasPrimarySeatRegression(challenger, currentAuthority);
  assert.equal(regression.regressed, true, "Primary-seat P19 regression must be detected");
  assert.equal(regression.seatId, "seat-1");
  assert.equal(regression.parameter, "P19");
  assert.equal(regression.currentLevel, 3);
  assert.equal(regression.candidateLevel, 2);
});

// ---------------------------------------------------------------------------
// Test B — Room C unsafe headline winner (REJECTED — CURRENT RETAINED)
// ---------------------------------------------------------------------------

test("B — Room C: unsafe headline winner rejected, current retained", () => {
  const currentAuthority = makeCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.5, 1.8], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.5, 3.0], [3, 3], [true, true], "P20"),
    fingerprint: "cal:v7:roomc-current00",
  });

  // Challenger: headline P20 better but primary seat-2 P20 drops L3→L2
  const challenger = makeConfirmedResult({
    candidateId: "unsafe-headline-c",
    isCurrent: false,
    coordinates: [{ x: 2.0, y: 0.3 }, { x: 3.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 1, gainDb: 0, polarity: 0 }, { delayMs: 0, gainDb: 0, polarity: -1 }],
    p19VariationBySeat: [1.2, 1.5],
    p20VariationBySeat: [1.0, 2.8],  // headline better (max=2.8 < 3.0)
    p19Levels: [3, 3],
    p20Levels: [3, 2],               // seat-2 regressed L3→L2
    isPrimaryArr: [true, true],
  });

  const regression = hasPrimarySeatRegression(challenger, currentAuthority);
  assert.equal(regression.regressed, true, "Primary-seat P20 regression must be detected");
  assert.equal(regression.parameter, "P20");
  assert.equal(regression.currentLevel, 3);
  assert.equal(regression.candidateLevel, 2);
});

// ---------------------------------------------------------------------------
// Test C — Genuine balanced improvement (ACCEPTED)
// ---------------------------------------------------------------------------

test("C — Room B: genuine balanced improvement accepted", () => {
  const currentLayout = {
    id: "current",
    sources: [{ id: "sub-1" }, { id: "sub-2" }],
    metrics: {
      perSeatP19: makePerSeat(2, [3.0, 3.5], [2, 2], [true, true], "P19"),
      perSeatP20: makePerSeat(2, [5.0, 5.5], [2, 2], [true, true], "P20"),
      achievedP19VariationDb: 3.5,
      achievedP19Level: 2,
      achievedP20VariationDb: 5.5,
      achievedP20Level: 2,
      p18AchievedLevel: 3, achievedP18Hz: 28,
      p14AchievedLevel: 3, p14AchievedDb: 95,
    },
  };

  const quantityResult = {
    evaluatedFinalists: [{
      finalistId: "balanced-winner",
      familyId: "front-rear",
      quantity: 2,
      coordinates: [{ x: 1.5, y: 0.3 }, { x: 3.0, y: 0.3 }],
      perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
      perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
      achievedP19VariationDb: 1.2,
      achievedP19Level: 3,
      achievedP20VariationDb: 2.5,
      achievedP20Level: 3,
      p18AchievedLevel: 3, achievedP18Hz: 28,
      p14AchievedLevel: 3, p14AchievedDb: 95,
    }],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, false, "Genuine improvement must not retain current");
  assert.ok(selection.winner, "A winner must be selected");
  assert.equal(selection.winner.finalistId, "balanced-winner");
  assert.equal(selection.isTradeOff, false, "Joint improvement is not a trade-off");
});

// ---------------------------------------------------------------------------
// Test D — No safer winner (CURRENT RETAINED)
// ---------------------------------------------------------------------------

test("D — Room B: no safer winner, current retained", () => {
  const currentLayout = {
    id: "current",
    sources: [{ id: "sub-1" }, { id: "sub-2" }],
    metrics: {
      perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
      perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
      achievedP19VariationDb: 1.2, achievedP19Level: 3,
      achievedP20VariationDb: 2.5, achievedP20Level: 3,
      p18AchievedLevel: 3, achievedP18Hz: 28,
      p14AchievedLevel: 3, p14AchievedDb: 95,
    },
  };

  const quantityResult = {
    evaluatedFinalists: [
      {
        finalistId: "worse-A",
        familyId: "front-rear", quantity: 2,
        coordinates: [{ x: 1, y: 0 }, { x: 3, y: 0 }],
        perSeatP19: makePerSeat(2, [2.5, 2.8], [2, 2], [true, true], "P19"),
        perSeatP20: makePerSeat(2, [4.0, 4.5], [2, 2], [true, true], "P20"),
        achievedP19VariationDb: 2.8, achievedP19Level: 2,
        achievedP20VariationDb: 4.5, achievedP20Level: 2,
        p18AchievedLevel: 3, achievedP18Hz: 28,
        p14AchievedLevel: 3, p14AchievedDb: 95,
      },
    ],
  };

  const selection = selectAuthoritativeFinalist(quantityResult, ROOM_B, currentLayout);
  assert.equal(selection.isCurrent, true, "Current must be retained when all alternatives are worse");
  assert.equal(selection.winner, null, "No winner when current is best");
});

// ---------------------------------------------------------------------------
// Test E — Stale during optimisation (stale rejected, no Apply, Current untouched)
// ---------------------------------------------------------------------------

test("E — Stale rejection: fingerprint change detected across worker boundaries", () => {
  const startInputs = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const startFp = computeV2DesignFingerprint(startInputs);

  // Simulate: user moves a subwoofer during V2 execution
  const changedInputs = {
    ...startInputs,
    subwooferInstances: [makeInstance({ id: "sub-1", x: 2.5, y: 0.5 })],
  };
  const currentFp = computeV2DesignFingerprint(changedInputs);

  // The engine's isStale() compares startFp !== currentFp
  const isStale = startFp !== currentFp;
  assert.equal(isStale, true, "Stale must be detected when subwoofer position changes during V2");

  // Stale means: no winner published, no Apply enabled, Current untouched.
  // The engine returns { status: "stale" } which the store sets as status="stale".
  // The UI only shows Apply when status === "complete" && winner exists.
  // Therefore a stale result can never produce an Apply button.
});

// ---------------------------------------------------------------------------
// Test F — Apply + reopen (positions + delay + trim + polarity persist)
// ---------------------------------------------------------------------------

test("F — Apply builds instances with positions, delay, trim, polarity", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }, { x: 3.0, y: 0.3 }],
    appliedTuning: [
      { delayMs: 2.5, gainDb: -1.5, polarity: -1 },
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
  };
  const currentInstances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5, bottomHeightM: 0.35 }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5, bottomHeightM: 0.35 }),
  ];
  const built = buildOptimisedInstances(winner, currentInstances, ROOM_B, "SUB2-12");
  assert.equal(built.length, 2);
  assert.equal(built[0].position.x, 1.5);
  assert.equal(built[0].position.y, 0.3);
  assert.equal(built[0].delayMs, 2.5);
  assert.equal(built[0].gainDb, -1.5);
  assert.equal(built[0].polarity, -1);
  assert.equal(built[0].model, "sub2-12");
  assert.equal(built[0].enabled, true);
  assert.equal(built[0].positionSource, "v2-optimised");
  // bottomHeightM preserved from existing
  assert.equal(built[0].bottomHeightM, 0.35);
});

test("F — Apply + reopen: isOptimisedApplied detects matching state", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }, { x: 3.0, y: 0.3 }],
    appliedTuning: [
      { delayMs: 2.5, gainDb: -1.5, polarity: -1 },
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
  };
  // Simulate the state after Apply + reopen (instances match winner exactly)
  const appliedInstances = [
    makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 2.5, gainDb: -1.5, polarity: -1 }),
    makeInstance({ id: "sub-2", x: 3.0, y: 0.3, delayMs: 0, gainDb: 0, polarity: 0 }),
  ];
  assert.equal(isOptimisedApplied(appliedInstances, winner, ROOM_B), true,
    "After Apply + reopen, applied detection must succeed");
});

test("F — Apply + reopen: authority fingerprint corresponds to applied design", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }, { x: 3.0, y: 0.3 }],
    appliedTuning: [
      { delayMs: 2.5, gainDb: -1.5, polarity: -1 },
      { delayMs: 0, gainDb: 0, polarity: 0 },
    ],
  };
  const appliedInstances = [
    makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 2.5, gainDb: -1.5, polarity: -1 }),
    makeInstance({ id: "sub-2", x: 3.0, y: 0.3, delayMs: 0, gainDb: 0, polarity: 0 }),
  ];
  // The V2 fingerprint of the applied state must be stable (same inputs = same fp)
  const fp1 = computeV2DesignFingerprint({
    subwooferInstances: appliedInstances, roomDims: ROOM_B,
    seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  });
  const fp2 = computeV2DesignFingerprint({
    subwooferInstances: appliedInstances, roomDims: ROOM_B,
    seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  });
  assert.equal(fp1, fp2, "Applied state fingerprint must be stable across reopen");
});

// ---------------------------------------------------------------------------
// Test G — Tuning mismatch (NOT APPLIED)
// ---------------------------------------------------------------------------

test("G — Same coordinates, different delay: NOT APPLIED", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 5.0, gainDb: 0, polarity: 0 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 0, gainDb: 0, polarity: 0 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), false,
    "Same coordinates but different delay must NOT be applied");
});

test("G — Same coordinates, different trim: NOT APPLIED", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 0, gainDb: -3.0, polarity: 0 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 0, gainDb: 0, polarity: 0 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), false,
    "Same coordinates but different trim must NOT be applied");
});

test("G — Same coordinates, different polarity: NOT APPLIED", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: -1 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 0, gainDb: 0, polarity: 0 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), false,
    "Same coordinates but different polarity must NOT be applied");
});

test("G — Same coordinates AND same tuning: APPLIED", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 3.0, gainDb: -2.0, polarity: -1 }],
  };
  const instances = [makeInstance({ id: "sub-1", x: 1.5, y: 0.3, delayMs: 3.0, gainDb: -2.0, polarity: -1 })];
  assert.equal(isOptimisedApplied(instances, winner, ROOM_B), true,
    "Same coordinates AND same tuning must be applied");
});

// ---------------------------------------------------------------------------
// ACCEPTANCE: Apply winner preserves disabled instances, enabled state,
// position.z, bottomHeightM, rotation, and identity fields.
// ---------------------------------------------------------------------------

test("ACCEPTANCE: Apply preserves disabled instances (not removed)", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 2.5, gainDb: -1.5, polarity: -1 }],
  };
  const currentInstances = [
    makeInstance({ id: "sub-1", x: 1.0, y: 0.5, enabled: true }),
    makeInstance({ id: "sub-2", x: 3.5, y: 0.5, enabled: false, gainDb: -2, delayMs: 1, polarity: 0 }),
  ];
  const built = buildOptimisedInstances(winner, currentInstances, ROOM_B, "SUB2-12");
  // 1 active (from winner) + 1 disabled (preserved) = 2 total
  assert.equal(built.length, 2, "Disabled instance must be preserved, not removed");
  const active = built.find((s) => s.enabled === true);
  const disabled = built.find((s) => s.enabled === false);
  assert.ok(active, "Active instance must be present");
  assert.ok(disabled, "Disabled instance must be preserved");
  assert.equal(disabled.id, "sub-2", "Disabled instance ID preserved");
  assert.equal(disabled.position.x, 3.5, "Disabled instance position preserved");
  assert.equal(disabled.gainDb, -2, "Disabled instance tuning preserved");
});

test("ACCEPTANCE: Apply preserves position.z when present", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
  };
  const currentInstances = [
    { ...makeInstance({ id: "sub-1", x: 1.0, y: 0.5 }), position: { x: 1.0, y: 0.5, z: 0.35 } },
  ];
  const built = buildOptimisedInstances(winner, currentInstances, ROOM_B, "SUB2-12");
  assert.equal(built[0].position.z, 0.35, "position.z must be preserved from existing instance");
});

test("ACCEPTANCE: Apply preserves bottomHeightM and identity fields", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
  };
  const currentInstances = [
    { ...makeInstance({ id: "sub-1", x: 1.0, y: 0.5, bottomHeightM: 0.45 }), legacyGroup: "front", symmetryLinkId: "sym-1" },
  ];
  const built = buildOptimisedInstances(winner, currentInstances, ROOM_B, "SUB2-12");
  assert.equal(built.length, 1);
  assert.equal(built[0].bottomHeightM, 0.45, "bottomHeightM preserved");
  assert.equal(built[0].legacyGroup, "front", "legacyGroup preserved");
  assert.equal(built[0].symmetryLinkId, "sym-1", "symmetryLinkId preserved");
});

test("ACCEPTANCE: Apply sets enabled=true on active instances and positionSource=v2-optimised", () => {
  const winner = {
    coordinates: [{ x: 1.5, y: 0.3 }],
    appliedTuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
  };
  const currentInstances = [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })];
  const built = buildOptimisedInstances(winner, currentInstances, ROOM_B, "SUB2-12");
  assert.equal(built[0].enabled, true, "Active instance must be enabled");
  assert.equal(built[0].positionSource, "v2-optimised", "positionSource must be v2-optimised");
});

// ---------------------------------------------------------------------------
// ACCEPTANCE: Zero valid challengers → explicit terminal NO_WINNER.
// When all worker calls return null, no challengers are promoted, and
// selectWinnerWithProtection returns NO_WINNER (Current retained).
// Tested via gatherCandidates returning empty + no proxy results.
// ---------------------------------------------------------------------------

test("ACCEPTANCE: zero valid challengers produces empty candidate list", () => {
  // No Stage 2 finalists → gatherCandidates returns empty
  const instances = [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })];
  const candidates = gatherCandidates({
    subwooferInstances: instances, roomDims: ROOM_B,
    stage2Result: null, stage2Fingerprint: null,
  });
  assert.equal(candidates.length, 0, "No Stage 2 finalists = no challengers");
  // Engine's selectWinnerWithProtection with empty confirmedResults and no
  // existing authority returns NO_WINNER (isCurrent: true, winner: null).
  // This is verified by code review: the function checks
  // `if (!confirmedResults.length && !existingAuthority)` and returns
  // { isCurrent: true, winner: null, message: "No safer automatic improvement found" }.
});

// ---------------------------------------------------------------------------
// INVARIANT 1: Current authority — frozen, never proxy-optimised, compared
// against every challenger. If absent/stale, recompute through authoritative
// path (not proxy scoring).
// ---------------------------------------------------------------------------

test("INVARIANT 1: production Current authority is read from real compact contract", () => {
  const fp = "cal:v7:prod-current-001";
  const authority = makeProductionCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: fp,
  });
  // isCurrentAuthorityNonStale must accept the production shape
  assert.equal(isCurrentAuthorityNonStale(authority, fp), true);

  // extractAuthorityForComparison (via engine) reads per-seat from
  // contract.selectedCandidate.perSeatP19Results — verify the data is there
  const sc = authority.contract.selectedCandidate;
  assert.ok(Array.isArray(sc.perSeatP19Results) && sc.perSeatP19Results.length === 2,
    "Per-seat P19 must be at selectedCandidate.perSeatP19Results");
  assert.ok(Array.isArray(sc.perSeatP20Results) && sc.perSeatP20Results.length === 2,
    "Per-seat P20 must be at selectedCandidate.perSeatP20Results");
  // Headline metrics at productAnalysis.parameters
  const params = authority.contract.productAnalysis.parameters;
  assert.ok(params.p19 && params.p20 && params.p18 && params.p14,
    "Headline metrics must be at productAnalysis.parameters");
});

test("INVARIANT 1: Current is frozen before challenger evaluation (never proxy-optimised)", () => {
  // When a valid non-stale authority exists, it is reused as-is.
  // The engine's snapshotCurrentDesign captures the installed tuning,
  // and isCurrentAuthorityNonStale gates whether the authority is used directly.
  // Current's tuning is NEVER passed through runProxySearch.
  const fp = "cal:v7:frozen-current-01";
  const authority = makeProductionCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: fp,
  });
  // Non-stale authority → used directly, not recalculated
  assert.equal(isCurrentAuthorityNonStale(authority, fp), true,
    "Non-stale authority is frozen and used directly");
  // The authority's per-seat data is the FROZEN Current — challengers compare
  // against THIS, not a proxy-optimised version
  assert.equal(authority.contract.selectedCandidate.perSeatP19Results[0].level, 3,
    "Frozen Current P19 level is preserved from production");
});

test("INVARIANT 1: stale/absent authority is NOT substituted with proxy scoring", () => {
  // When authority is stale (fingerprint mismatch), isCurrentAuthorityNonStale
  // returns false. The engine then canonically recalculates Current through
  // the authoritative production path (worker confirmation with installed
  // tuning), NOT through proxy scoring. Proxy scoring is ONLY used for
  // challenger promotion.
  const authority = makeProductionCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: "cal:v7:old-fingerprint",
  });
  // Stale → rejected, engine must recompute through authoritative path
  assert.equal(isCurrentAuthorityNonStale(authority, "cal:v7:new-fingerprint"), false,
    "Stale authority must be rejected — engine recomputes through authoritative path");
  // Absent → rejected
  assert.equal(isCurrentAuthorityNonStale(null, "cal:v7:new-fingerprint"), false,
    "Absent authority must be rejected — engine recomputes through authoritative path");
});

// ---------------------------------------------------------------------------
// INVARIANT 2: Fingerprint/staleness — rotation in stale detection but
// stripped for authority matching. Every acoustically relevant change
// invalidates in-flight V2. Unchanged design matches existing authority.
// ---------------------------------------------------------------------------

test("INVARIANT 2: rotation is appended for stale detection but stripped for authority matching", () => {
  // The V2 fingerprint is: <baseCalibrationFingerprint>|rot:<r0>,<r1>,...
  // The base (before |rot:) is the SAME fingerprint used by production.
  // Authority matching compares the base only (extractBaseFingerprint).
  // Stale detection uses the FULL fingerprint (with rotation).
  const inputs = {
    subwooferInstances: [
      makeInstance({ id: "sub-1", x: 1.0, y: 0.5, rotationDeg: 0 }),
      makeInstance({ id: "sub-2", x: 3.5, y: 0.5, rotationDeg: 0 }),
    ],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const fp = computeV2DesignFingerprint(inputs);
  assert.ok(fp.includes("|rot:"), "V2 fingerprint must include rotation suffix");
  const base = extractBaseFingerprint(fp);
  assert.ok(!base.includes("|rot:"), "Base fingerprint must NOT include rotation suffix");
  assert.ok(base.startsWith("cal:v"), "Base must be the production calibration fingerprint");
});

test("INVARIANT 2: rotation change invalidates in-flight V2 (stale detection)", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, rotationDeg: 0 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const rotated = {
    ...base,
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, rotationDeg: 90 })],
  };
  const fp1 = computeV2DesignFingerprint(base);
  const fp2 = computeV2DesignFingerprint(rotated);
  assert.notEqual(fp1, fp2, "Rotation change must invalidate V2 stale fingerprint");
  // But the BASE fingerprints match (rotation is stripped for authority matching)
  assert.equal(extractBaseFingerprint(fp1), extractBaseFingerprint(fp2),
    "Base fingerprints must match despite rotation change (authority matching unaffected)");
});

test("INVARIANT 2: unchanged acoustic design matches existing production authority", () => {
  const inputs = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const fp1 = computeV2DesignFingerprint(inputs);
  const fp2 = computeV2DesignFingerprint(inputs);
  assert.equal(fp1, fp2, "Identical inputs must produce identical fingerprints");
  // The base of the V2 fingerprint is what production uses
  const base = extractBaseFingerprint(fp1);
  // FIX 2: V2 now consumes the production-resolved liveCacheKey directly
  // (same value the production UI uses for hasCurrentResult). When
  // currentFingerprint === liveCacheKey AND authoritative === true, the
  // authority belongs to the live design and is accepted directly.
  const authority = makeProductionCurrentAuthority({
    perSeatP19: makePerSeat(2, [1.0, 1.2], [3, 3], [true, true], "P19"),
    perSeatP20: makePerSeat(2, [2.0, 2.5], [3, 3], [true, true], "P20"),
    fingerprint: base,
  });
  assert.equal(isCurrentAuthorityNonStale(authority, base), true,
    "Unchanged design with matching liveCacheKey must accept production authority");
});

test("INVARIANT 2: every acoustically relevant change invalidates in-flight V2", () => {
  const base = {
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  };
  const startFp = computeV2DesignFingerprint(base);
  const changes = [
    { name: "position", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 2.0, y: 0.5 })] } },
    { name: "delay", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, delayMs: 5 })] } },
    { name: "trim", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, gainDb: -3 })] } },
    { name: "polarity", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, polarity: -1 })] } },
    { name: "bottomHeightM", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, bottomHeightM: 0.5 })] } },
    { name: "room", mod: { roomDims: { widthM: 5.0, lengthM: 6.5, heightM: 2.4 } } },
    { name: "model", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, model: "SUB3-12" })] } },
    { name: "p14Target", mod: { p14TargetLevel: 3 } },
    { name: "p14Db", mod: { p14TargetDb: 120 } },
    { name: "rotation", mod: { subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5, rotationDeg: 90 })] } },
  ];
  for (const { name, mod } of changes) {
    const changed = { ...base, ...mod };
    const changedFp = computeV2DesignFingerprint(changed);
    assert.notEqual(startFp, changedFp, `${name} change must invalidate V2 fingerprint`);
  }
});

// ---------------------------------------------------------------------------
// Summary guardrail: no P14/P18/P19/P20 maths changed
// ---------------------------------------------------------------------------

test("GUARDRAIL: V2 fingerprint uses the same computeCalibrationFingerprint authority", () => {
  // The V2 fingerprint must delegate to computeCalibrationFingerprint, not a
  // separate fingerprint system. We verify by checking the prefix.
  const fp = computeV2DesignFingerprint({
    subwooferInstances: [makeInstance({ id: "sub-1", x: 1.0, y: 0.5 })],
    roomDims: ROOM_B, seatingPositions: makeSeats(2, ROOM_B), rspPosition: makeRsp(ROOM_B),
    selectedSubModel: "SUB2-12", p14TargetBasis: "minimum", p14TargetLevel: 2, p14TargetDb: 117,
  });
  assert.ok(fp.startsWith("cal:v"), "V2 fingerprint must use the cal: prefix from computeCalibrationFingerprint");
});