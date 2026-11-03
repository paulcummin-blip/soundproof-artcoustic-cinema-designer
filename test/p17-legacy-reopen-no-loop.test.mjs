// p17-legacy-reopen-no-loop.test.mjs
// ---------------------------------------------------------------------------
// Legacy P17 auto-refresh — detection + no-loop contract.
//
// A saved engineering publication from before the coverage-window P17 method
// stores a scored P17 seat level (L1..L4) but NO `windowLevel` basis marker.
// Its design fingerprint can still match the current design, so the durable
// read returns it as Current indefinitely and the user is shown stale
// "earlier variance basis" P17 evidence.
//
// CONTRACT:
//   isLegacyP17Publication detects the legacy basis from the basis marker alone
//   (never from rawVarianceDb):
//     - scored P17 with windowLevel present  → NOT legacy (current basis)
//     - scored P17 with windowLevel absent   → legacy
//     - no scored P17 at all                 → NOT legacy (missing-evidence path)
//
// NO-LOOP: after a fresh publication carrying windowLevel is written, the same
// function returns false, so a second reopen does not trigger another refresh.
//
// This test covers the PURE detection used at the Room Designer open boundary
// (the actual republish goes through the existing canonical engine → publish
// path, which is integration-tested elsewhere). P17 maths and thresholds are
// not exercised here and are unchanged.
//
// Run: node --import ./test/_alias-register.mjs test/p17-legacy-reopen-no-loop.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { isLegacyP17Publication } from "@/components/utils/rp22/p17BasisStaleness";

// ── Fixtures ─────────────────────────────────────────────────────────────

function publicationWithSeatP17(seatP17BySeatId) {
  const seatHudById = {};
  for (const [seatId, p17] of Object.entries(seatP17BySeatId)) {
    seatHudById[seatId] = { rp22: { p17 } };
  }
  return { engineering_summary: { seatHudById } };
}

/** A fresh coverage-window P17 seat metric: scored level + windowLevel marker. */
function freshScoredP17({ level = "L3" } = {}) {
  return {
    value: 2.4,
    formatted: "L3",
    level,
    windowLevel: level,
    windowLevelNumber: Number(level.replace(/^L/, "")),
    windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41 },
    evidenceType: "estimated",
    cause: "within_l3_window",
    rawVarianceDb: 2.4, // legacy read-only diagnostic, intentionally present
    perSpeaker: [],
    p17HasNaAngles: false,
  };
}

/** A legacy saved P17 seat metric: scored level, NO windowLevel marker. */
function legacyScoredP17({ level = "L3" } = {}) {
  return {
    value: 2.4,
    formatted: "L3",
    level,
    windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41 },
    evidenceType: "estimated",
    cause: "within_l3_window",
    rawVarianceDb: 2.4,
    perSpeaker: [],
    p17HasNaAngles: false,
  };
}

/** A seat the engine could not grade: no scored level. */
function ungradedP17() {
  return {
    value: null,
    formatted: "—",
    level: "—",
    windows: null,
    evidenceType: "missing",
    cause: "missing_evidence",
    perSpeaker: [],
    p17HasNaAngles: false,
  };
}

// ── Detection ────────────────────────────────────────────────────────────

test("LEGACY P17 DETECTED: scored P17 with no windowLevel is legacy", () => {
  const pub = publicationWithSeatP17({
    "seat-r1-c1": legacyScoredP17({ level: "L3" }),
    "seat-r1-c2": legacyScoredP17({ level: "L2" }),
  });
  assert.equal(isLegacyP17Publication(pub), true);
});

test("LEGACY P17 DETECTED: a single legacy seat among fresh seats is still legacy", () => {
  const pub = publicationWithSeatP17({
    "seat-r1-c1": freshScoredP17({ level: "L4" }),
    "seat-r1-c2": legacyScoredP17({ level: "L3" }),
  });
  assert.equal(isLegacyP17Publication(pub), true);
});

test("CURRENT P17 NOT FALSELY FLAGGED: scored P17 with windowLevel is not legacy", () => {
  const pub = publicationWithSeatP17({
    "seat-r1-c1": freshScoredP17({ level: "L4" }),
    "seat-r1-c2": freshScoredP17({ level: "L3" }),
  });
  assert.equal(isLegacyP17Publication(pub), false);
});

test("CURRENT P17 NOT FALSELY FLAGGED: rawVarianceDb present does not make a fresh metric legacy", () => {
  // A fresh metric carries rawVarianceDb as a read-only diagnostic; the basis
  // marker (windowLevel) decides, not the diagnostic.
  const pub = publicationWithSeatP17({
    "seat-r1-c1": freshScoredP17({ level: "L4" }),
  });
  assert.equal(isLegacyP17Publication(pub), false);
});

test("MISSING INPUTS DO NOT FORCE: no scored P17 is not legacy", () => {
  const pub = publicationWithSeatP17({
    "seat-r1-c1": ungradedP17(),
    "seat-r1-c2": ungradedP17(),
  });
  assert.equal(isLegacyP17Publication(pub), false);
});

test("MISSING INPUTS DO NOT FORCE: empty seatHudById is not legacy", () => {
  assert.equal(isLegacyP17Publication({ engineering_summary: { seatHudById: {} } }), false);
});

test("detection accepts a bare engineering_summary (no publication wrapper)", () => {
  const summary = publicationWithSeatP17({
    "seat-r1-c1": legacyScoredP17({ level: "L2" }),
  }).engineering_summary;
  assert.equal(isLegacyP17Publication(summary), true);
});

test("detection returns false for null / malformed input", () => {
  assert.equal(isLegacyP17Publication(null), false);
  assert.equal(isLegacyP17Publication(undefined), false);
  assert.equal(isLegacyP17Publication({}), false);
  assert.equal(isLegacyP17Publication({ engineering_summary: null }), false);
  assert.equal(isLegacyP17Publication({ engineering_summary: { seatHudById: null } }), false);
});

// ── No-loop: fresh publication after refresh is not legacy ───────────────

test("SECOND REOPEN DOES NOT REPUBLISH: a refreshed publication with windowLevel is not legacy", () => {
  // State before refresh: legacy publication.
  const legacy = publicationWithSeatP17({
    "seat-r1-c1": legacyScoredP17({ level: "L3" }),
    "seat-r1-c2": legacyScoredP17({ level: "L2" }),
  });
  assert.equal(isLegacyP17Publication(legacy), true);

  // State after refresh: same seats, fresh coverage-window basis carries
  // windowLevel on every scored metric.
  const refreshed = publicationWithSeatP17({
    "seat-r1-c1": freshScoredP17({ level: "L3" }),
    "seat-r1-c2": freshScoredP17({ level: "L2" }),
  });
  assert.equal(isLegacyP17Publication(refreshed), false);
});

test("NO-LOOP: a legacy seat that recalculates to L1 (terminal) is no longer legacy once windowLevel is written", () => {
  // Legacy L1 (terminal) result — scored, no basis marker.
  const legacy = publicationWithSeatP17({
    "seat-r1-c1": legacyScoredP17({ level: "L1" }),
  });
  assert.equal(isLegacyP17Publication(legacy), true);

  // After the canonical engine republishes, the same L1 grade carries the
  // windowLevel marker — L1 is terminal AND current basis, so no further
  // refresh fires.
  const refreshed = publicationWithSeatP17({
    "seat-r1-c1": freshScoredP17({ level: "L1" }),
  });
  assert.equal(isLegacyP17Publication(refreshed), false);
});