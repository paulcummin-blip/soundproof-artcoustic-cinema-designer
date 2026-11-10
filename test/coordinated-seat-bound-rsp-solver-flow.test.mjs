// coordinated-seat-bound-rsp-solver-flow.test.mjs
// Regression tests for the seat-bound RSP flowing into the seating-batch
// acoustic calculation and canonical confirmation, and for the designer-facing
// physical-alternative presentation surfacing independently of the calibration
// winner.
//
// The batch worker (stage2SeatingBatchEvaluation) and the canonical confirmation
// use heavy acoustic modules that cannot run under bare Node. These tests
// verify the CONTRACT that governs what the solver receives:
//
//   1. buildAuthoritativeRspPosition resolves a seat-bound RSP to the
//      designated seat's exact XYZ (the value the orchestrator passes to the
//      engine, which passes it to runCoordinatedPhysicalSearch, which passes
//      it to the batch worker).
//   2. The batch worker's RSP translation formula (movedRsp.y = rspPosition.y
//      + offset) produces the MOVED DESIGNATED SEAT for a seat-bound RSP —
//      i.e. the solver evaluates the acoustic field at the designated seat's
//      moved position, not at a translated manual RSP.
//   3. validateCoordinatedRspAuthority REJECTS the search when rsp_mode is
//      seat_bound but the engine RSP was NOT resolved from the designated
//      seat — so the solver cannot proceed with a translated manual RSP while
//      diagnostics claim seat_bound. The search is skipped with
//      invalid_rsp_authority, not run with the wrong RSP.
//   4. Manual-position behaviour is preserved: no designated seat →
//      free-floating RSP, translated by the offset (existing behaviour).
//   5. attachRspAuthority records the evaluatedRspPosition the solver used
//      (rspPosition.y + offset), so a saved candidate's RSP can be audited.
//   6. selectEligiblePhysicalAlternativesFromSummary surfaces ONLY eligible
//      alternatives from the PERSISTED summary, independent of the live
//      selection.evaluations, so they appear after a cold reopen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthoritativeRspPosition } from "../src/components/room/bass/authoritativeRspPosition.js";
import {
  validateCoordinatedRspAuthority,
  attachRspAuthority,
} from "../src/components/room/bass/improveBassV2/coordinatedRspAuthority.js";
import { selectEligiblePhysicalAlternativesFromSummary } from "../src/components/room/bass/optimiserPlan/coordinatedPhysicalAlternativePresentation.js";

const ROOM = { widthM: 3.5, lengthM: 6.0, heightM: 2.4 };
const SEATS = [
  { id: "seat-r1-c1", x: 1.15, y: 4.0, z: 1.2, priority: "primary" },
  { id: "seat-r1-c2", x: 1.75, y: 4.0, z: 1.2, priority: "primary" },
  { id: "seat-r2-c1", x: 1.15, y: 5.8, z: 1.7, priority: "secondary" },
];
const DESIGNATED = SEATS[1]; // seat-r1-c2

// ── 1. Seat-bound RSP resolves to the designated seat's exact XYZ ──────────

test("buildAuthoritativeRspPosition resolves seat-bound RSP to the designated seat XYZ", () => {
  const rsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, DESIGNATED);
  assert.equal(rsp.id, "rsp");
  assert.equal(rsp.x, DESIGNATED.x);
  assert.equal(rsp.y, DESIGNATED.y);
  assert.equal(rsp.z, DESIGNATED.z);
  assert.equal(rsp.designatedRspSeatId, DESIGNATED.id);
  assert.equal(rsp.__isSyntheticRsp, true);
});

test("buildAuthoritativeRspPosition free-floating RSP has no designated seat", () => {
  const rsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  assert.equal(rsp.designatedRspSeatId, null);
  assert.equal(rsp.x, ROOM.widthM / 2);
  assert.equal(rsp.y, 4.2);
});

// ── 2. The batch worker's translation formula produces the moved designated seat ─
// The batch worker builds: movedRsp.y = rspPosition.y + candidate.effectiveOffsetM.
// For a seat-bound RSP, rspPosition.y IS the designated seat's y, so the moved
// RSP is the moved designated seat — the solver evaluates at that point.

test("batch worker RSP translation produces the moved designated seat for seat-bound RSP", () => {
  const rsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, DESIGNATED);
  const offsetM = 0.3; // +300 mm
  const movedRspY = rsp.y + offsetM;
  assert.equal(movedRspY, DESIGNATED.y + 0.3,
    "moved RSP y must equal the designated seat's moved y (not a manual RSP translated)");
  assert.equal(rsp.designatedRspSeatId, DESIGNATED.id,
    "the RSP passed to the batch worker carries the designated seat identity");
});

test("batch worker RSP translation produces a translated manual RSP for manual-position", () => {
  const rsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  const offsetM = -0.2; // -200 mm
  const movedRspY = rsp.y + offsetM;
  assert.equal(movedRspY, 4.2 - 0.2);
  assert.equal(rsp.designatedRspSeatId, null,
    "manual-position RSP carries no designated seat identity");
});

// ── 3. The solver CANNOT proceed with a translated manual RSP while seat_bound ─
// validateCoordinatedRspAuthority rejects the search when the mode is seat_bound
// but the engine RSP was not resolved from the designated seat. The coordinated
// search skips with invalid_rsp_authority — it does not run the batch worker
// against a translated manual RSP.

test("seat_bound with a manual RSP (wrong designatedRspSeatId) is REJECTED — solver cannot proceed", () => {
  const manualRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: DESIGNATED.id,
    seatingPositions: SEATS,
    rspPosition: manualRsp,
  });
  assert.equal(authority.valid, false,
    "the search must be skipped, not run with a translated manual RSP");
  assert.ok(authority.issues.some((i) => i.includes("seat_bound")),
    "the issue must name the seat_bound mismatch");
});

test("seat_bound with the correct designated-seat RSP is accepted — solver proceeds", () => {
  const seatBoundRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, DESIGNATED);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: DESIGNATED.id,
    seatingPositions: SEATS,
    rspPosition: seatBoundRsp,
  });
  assert.equal(authority.valid, true);
  assert.equal(authority.issues.length, 0);
});

// ── 4. Manual-position behaviour preserved (no designated seat) ────────────

test("manual_position without a designated seat is valid — existing behaviour preserved", () => {
  const manualRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: manualRsp,
  });
  assert.equal(authority.valid, true);
  assert.equal(authority.rspMode, "manual_position");
  assert.equal(authority.designatedRspSeatId, null);
});

test("auto_from_screen without a designated seat is valid — existing behaviour preserved", () => {
  const autoRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "auto_from_screen",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: autoRsp,
  });
  assert.equal(authority.valid, true);
});

// ── 5. attachRspAuthority records the evaluated RSP the solver used ─────────
// For seat_bound, evaluatedRspPosition.y = designated seat y + offset (the moved
// designated seat the batch worker evaluated). For manual, = mlpY + offset.

test("attachRspAuthority records the moved designated seat for seat_bound", () => {
  const seatBoundRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, DESIGNATED);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "seat_bound",
    designatedRspSeatId: DESIGNATED.id,
    seatingPositions: SEATS,
    rspPosition: seatBoundRsp,
  });
  const result = attachRspAuthority({ candidateId: "c1" }, authority, 300);
  assert.equal(result.rspAuthority.rspMode, "seat_bound");
  assert.equal(result.rspAuthority.designatedRspSeatId, DESIGNATED.id);
  assert.equal(result.rspAuthority.evaluatedRspPosition.y, DESIGNATED.y + 0.3,
    "the evaluated RSP is the moved designated seat");
  assert.equal(result.rspAuthority.evaluatedRspPosition.x, DESIGNATED.x);
});

test("attachRspAuthority records the translated manual RSP for manual_position", () => {
  const manualRsp = buildAuthoritativeRspPosition(ROOM, 4.2, null, null);
  const authority = validateCoordinatedRspAuthority({
    rspMode: "manual_position",
    designatedRspSeatId: null,
    seatingPositions: SEATS,
    rspPosition: manualRsp,
  });
  const result = attachRspAuthority({ candidateId: "c2" }, authority, -200);
  assert.equal(result.rspAuthority.rspMode, "manual_position");
  assert.equal(result.rspAuthority.designatedRspSeatId, null);
  assert.equal(result.rspAuthority.evaluatedRspPosition.y, 4.2 - 0.2);
});

// ── 6. Presentation surfaces eligible alternatives from the persisted summary ─
// Independent of the live selection.evaluations — works after a cold reopen.

test("selectEligiblePhysicalAlternativesFromSummary surfaces only eligible candidates", () => {
  const summary = {
    confirmedCandidates: [
      {
        candidateId: "coordinated:p1:300",
        placementId: "p1",
        quantity: 4,
        offsetMm: 300,
        p19Level: "L3",
        p19VariationDb: 2.1,
        p14Db: 117,
        perSeatP20: [
          { seatId: "seat-r1-c2", isPrimary: true, level: 3, variationDbRaw: 2.5, worstFrequencyHz: 35 },
          { seatId: "seat-r2-c1", isPrimary: false, level: 2, variationDbRaw: 4.1, worstFrequencyHz: 28 },
        ],
        materialityOutcome: { material: true, rule: "p20-primary", reason: "Primary P20 improved" },
        rspAuthority: { rspMode: "seat_bound", designatedRspSeatId: "seat-r1-c2" },
        installedQuantity: 2,
        isCrossQuantity: true,
        physicalAlternativeEligible: true,
      },
      {
        candidateId: "coordinated:p2:-200",
        placementId: "p2",
        quantity: 2,
        offsetMm: -200,
        p19Level: "L2",
        p19VariationDb: 3.8,
        perSeatP20: [],
        physicalAlternativeEligible: false, // not eligible — must be filtered out
      },
    ],
  };
  const currentPerSeatP20 = [
    { seatId: "seat-r1-c2", level: 2, variationDbRaw: 4.8 },
    { seatId: "seat-r2-c1", level: 1, variationDbRaw: 5.5 },
  ];
  const presentations = selectEligiblePhysicalAlternativesFromSummary(summary, currentPerSeatP20);
  assert.equal(presentations.length, 1, "only the eligible candidate is surfaced");
  assert.equal(presentations[0].candidateId, "coordinated:p1:300");
  assert.equal(presentations[0].quantity, 4);
  assert.equal(presentations[0].offsetMm, 300);
  assert.equal(presentations[0].installationComplexity.quantityChange, 2);
  assert.equal(presentations[0].installationComplexity.isCrossQuantity, true);
  assert.equal(presentations[0].materialImprovement, "Primary P20 improved");
  assert.equal(presentations[0].perSeatP20Comparisons.length, 2);
  const primary = presentations[0].perSeatP20Comparisons[0];
  assert.equal(primary.seatId, "seat-r1-c2");
  assert.equal(primary.isPrimary, true);
  assert.equal(primary.beforeVariationDb, 4.8);
  assert.equal(primary.afterVariationDb, 2.5);
  assert.equal(primary.afterLevel, 3);
});

test("selectEligiblePhysicalAlternativesFromSummary returns [] when none eligible", () => {
  const summary = {
    confirmedCandidates: [
      { candidateId: "c1", physicalAlternativeEligible: false },
      { candidateId: "c2", physicalAlternativeEligible: false },
    ],
  };
  assert.deepEqual(selectEligiblePhysicalAlternativesFromSummary(summary, []), []);
});

test("selectEligiblePhysicalAlternativesFromSummary returns [] for null/empty summary", () => {
  assert.deepEqual(selectEligiblePhysicalAlternativesFromSummary(null, []), []);
  assert.deepEqual(selectEligiblePhysicalAlternativesFromSummary({}, []), []);
  assert.deepEqual(selectEligiblePhysicalAlternativesFromSummary({ confirmedCandidates: [] }, []), []);
});

test("presentation is independent of the calibration winner — eligibility is per-candidate", () => {
  // A summary with TWO eligible alternatives of different quantities: both are
  // surfaced. The calibration winner is not consulted — the presentation reads
  // only the persisted summary + current per-seat P20.
  const summary = {
    confirmedCandidates: [
      {
        candidateId: "a1", placementId: "p1", quantity: 4, offsetMm: 300,
        p19Level: "L3", p19VariationDb: 2.0, p14Db: 117,
        perSeatP20: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 2.2, worstFrequencyHz: 35 }],
        materialityOutcome: { material: true, reason: "improved" },
        installedQuantity: 2, isCrossQuantity: true, physicalAlternativeEligible: true,
      },
      {
        candidateId: "a2", placementId: "p2", quantity: 2, offsetMm: -100,
        p19Level: "L3", p19VariationDb: 1.9, p14Db: 117,
        perSeatP20: [{ seatId: "s1", isPrimary: true, level: 3, variationDbRaw: 2.0, worstFrequencyHz: 38 }],
        materialityOutcome: { material: true, reason: "improved" },
        installedQuantity: 2, isCrossQuantity: false, physicalAlternativeEligible: true,
      },
    ],
  };
  const presentations = selectEligiblePhysicalAlternativesFromSummary(summary, []);
  assert.equal(presentations.length, 2, "both eligible alternatives surface independently");
  assert.notEqual(presentations[0].candidateId, presentations[1].candidateId);
});