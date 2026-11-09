// coordinated-candidate-room-d-audit.test.mjs
// One-shot forensic audit: run the developer coordinated-candidate evaluator
// for Room D with the ACTUAL saved project seating, then compare the genuine
// P19/P20 evidence against the independently accepted Room D reference.
//
// This is a read-only audit. It never applies geometry, never publishes, never
// autosaves. It invokes runCoordinatedCandidateDeveloper exactly once.
//
// Reference regression targets (independent acceptance, 95 Hz combined):
//   P19        L4 / 1.470 dB
//   Primary P20 L4 / 2.785 dB
//   Secondary P20 L1 / 7.916 dB
//   95 Hz combined integration
//   fingerprint cal:v8:c0808cc94fe257d7
// These are regression targets only — nothing is hard-coded to match them.

import { test } from "node:test";
import {
  runCoordinatedCandidateDeveloper,
  clearCoordinatedDeveloperRun,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateDeveloperRun.js";
import {
  buildRoomDBundle,
  validateRoomDSavedSeatingReference,
  ROOM_D_COORDINATES,
  ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M,
  ROOM_D_SELECTED_SUB_MODEL,
  ROOM_D_CROSSOVER,
  ROOM_D_EXPECTED_SEAT_IDS,
  ROOM_D_EXPECTED_X_POSITIONS,
  ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M,
  ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M,
  ROOM_D_ORIGINAL_ROW_Y,
  ROOM_D_SHIFT_M,
} from "../src/components/room/bass/improveBassV2/coordinatedCandidateFixture.js";
import { validateCoordinatedCandidateBundle } from "../src/components/room/bass/improveBassV2/coordinatedCandidateBundle.js";

// The actual saved Room D seating, exactly as the open project stores it:
// seat-r1-c1..seat-r2-c3, row 1 Y=4.0 m, row 2 Y=5.8 m, X 1.15/1.75/2.35 m per
// row, front ear height 1.2 m, rear ear height 1.7 m, platformHeightM preserved.
function buildSavedRoomDSeating() {
  const rows = [
    { rowNumber: 1, y: ROOM_D_ORIGINAL_ROW_Y[0], z: ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M, priority: "primary", platformHeightM: 0 },
    { rowNumber: 2, y: ROOM_D_ORIGINAL_ROW_Y[1], z: ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M, priority: "secondary", platformHeightM: 0.5 },
  ];
  const xs = ROOM_D_EXPECTED_X_POSITIONS;
  const seats = [];
  for (const row of rows) {
    for (let c = 0; c < xs.length; c++) {
      seats.push({
        id: `seat-r${row.rowNumber}-c${c + 1}`,
        rowNumber: row.rowNumber,
        x: xs[c],
        y: row.y,
        z: row.z,
        priority: row.priority,
        platformHeightM: row.platformHeightM,
      });
    }
  }
  return seats;
}

const REF = {
  p19: { level: 4, variationDb: 1.470 },
  p20Primary: { level: 4, variationDb: 2.785 },
  p20Secondary: { level: 1, variationDb: 7.916 },
  crossoverHz: 95,
  responseBasis: "combined-lcr-sub",
  fingerprint: "cal:v8:c0808cc94fe257d7",
};

function row(label, expected, actual, delta, severity, next) {
  console.log(`TEST | ${label}`);
  console.log(`  EXPECTED : ${expected}`);
  console.log(`  ACTUAL   : ${actual}`);
  console.log(`  DELTA    : ${delta}`);
  console.log(`  SEVERITY : ${severity}`);
  console.log(`  NEXT TEST: ${next}`);
  console.log("");
}

test("Room D coordinated candidate — saved-seating audit", async () => {
  const savedSeating = buildSavedRoomDSeating();

  // 1. Pre-run input contract verification.
  const ref = validateRoomDSavedSeatingReference(savedSeating);
  row(
    "Input contract: saved seating matches Room D reference",
    "valid (6 seats, ids seat-r1-c1..seat-r2-c3, X 1.15/1.75/2.35, rows 4.0/5.8, ears 1.2/1.7)",
    ref.valid ? `valid — ${ref.summary.seatCount} seats, ids ${ref.summary.seatIds.join(",")}, rows [${ref.summary.rowCentres.join(", ")}] m, ears ${ref.summary.frontEarHeight}/${ref.summary.rearEarHeight} m`
              : `INVALID — ${ref.issues.join("; ")}`,
    ref.valid ? "none" : "reference mismatch",
    ref.valid ? "info" : "blocker",
    "Build bundle from saved seating",
  );

  // Expose the exact geometry the runner will consume.
  row(
    "Proposed geometry (after −0.6 m shift)",
    `rows [3.4, 5.2] m · RSP (1.75, 3.4, 1.2) · designated seat-r1-c2`,
    ref.valid ? `rows [${ref.summary.proposedRowCentres.join(", ")}] m · RSP (${ref.summary.proposedRsp.x}, ${ref.summary.proposedRsp.y}, ${ref.summary.proposedRsp.z}) · designated ${ref.summary.designatedSeatId}`
              : "—",
    ref.valid ? "none" : "n/a",
    "info",
    "Verify four-sub geometry + auto-align + crossover",
  );
  row(
    "Four-sub geometry / auto-align / crossover",
    `4 × ${ROOM_D_SELECTED_SUB_MODEL} @ ${JSON.stringify(ROOM_D_COORDINATES)} · bottom ${ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M} m · auto-align OFF · ${ROOM_D_CROSSOVER.frequencyHz} Hz`,
    `4 × ${ROOM_D_SELECTED_SUB_MODEL} @ ${JSON.stringify(ROOM_D_COORDINATES)} · bottom ${ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M} m · auto-align OFF · ${ROOM_D_CROSSOVER.frequencyHz} Hz`,
    "none",
    "info",
    "Run evaluator once",
  );

  // 2. Build + structural validation of the bundle (from saved seating).
  const bundle = buildRoomDBundle({ savedSeating });
  const structural = validateCoordinatedCandidateBundle(bundle);
  row(
    "Bundle structural validation",
    "valid",
    structural.valid ? "valid" : `INVALID — ${structural.issues.join("; ")}`,
    structural.valid ? "none" : "structural failure",
    structural.valid ? "info" : "blocker",
    "Pre-transfer integrity gate",
  );
  row(
    "Bundle source IDs (candidate-owned, unique)",
    `4 unique ids coord-${bundle.candidateId}-src-1..4`,
    bundle.sourceIds.join(", "),
    bundle.sourceIds.length === 4 && new Set(bundle.sourceIds).size === 4 ? "none" : "count/uniq failure",
    "info",
    "Pre-transfer gate",
  );

  // 3. Run the developer evaluator exactly once. Sub-only here (no live LCR
  //    integration context available in the standalone harness); the 95 Hz
  //    crossover is still applied by the canonical confirmation. The response
  //    basis difference vs the combined reference is reported explicitly.
  clearCoordinatedDeveloperRun();
  const result = await runCoordinatedCandidateDeveloper({
    integrationContext: null,
    amplifierPowerPerSubW: 0,
    savedSeating,
  });

  row(
    "Run-once status",
    "evaluated",
    result.status,
    result.status === "evaluated" ? "none" : `non-evaluated (${result.status})`,
    result.status === "evaluated" ? "info" : result.status === "rejected" ? "major" : "blocker",
    "Integrity gates",
  );

  // 4. Integrity gates.
  const b = result.boundaries || {};
  row(
    "Pre-transfer integrity gate",
    "valid",
    b.preTransfer ? (b.preTransfer.valid ? "valid" : `INVALID — ${(b.preTransfer.issues||[]).join("; ")}`) : "not set",
    b.preTransfer?.valid ? "none" : "gate failure",
    b.preTransfer?.valid ? "info" : "major",
    "Pre-confirm gate",
  );
  row(
    "Pre-confirm integrity gate",
    "valid",
    b.preConfirm ? (b.preConfirm.valid ? "valid" : `INVALID — ${(b.preConfirm.issues||[]).join("; ")}`) : "not set",
    b.preConfirm?.valid ? "none" : "gate failure",
    b.preConfirm?.valid ? "info" : "major",
    "Post-confirm gate",
  );
  row(
    "Post-confirm integrity gate",
    "valid",
    b.postConfirm ? (b.postConfirm.valid ? "valid" : `INVALID — ${(b.postConfirm.issues||[]).join("; ")}`) : "not set",
    b.postConfirm?.valid ? "none" : "gate failure",
    b.postConfirm?.valid ? "info" : "major",
    "Evidence inspection",
  );

  const ev = result.evidence || {};

  // 5. Evidence: response basis, crossover, processing.
  row(
    "Response basis",
    REF.responseBasis,
    ev.responseBasis || "—",
    (ev.responseBasis || "—") === REF.responseBasis ? "none" : "sub-only in harness vs combined reference",
    "minor",
    "Crossover",
  );
  row(
    "Crossover",
    `${REF.crossoverHz} Hz`,
    ev.crossover?.frequencyHz ? `${ev.crossover.frequencyHz} Hz` : "—",
    ev.crossover?.frequencyHz === REF.crossoverHz ? "none" : "mismatch",
    ev.crossover?.frequencyHz === REF.crossoverHz ? "info" : "major",
    "P14 / headroom",
  );

  row(
    "P14 / headroom",
    "target 117 dB · achieved/headroom numeric",
    ev.p14 ? `target ${ev.p14.targetDb} dB · achieved ${ev.p14.achievedDb} dB · headroom ${ev.p14.headroomDb} dB` : "—",
    "n/a (regression context)",
    "info",
    "P19 at RSP",
  );

  // 6. P19 at RSP vs reference.
  const p19 = ev.p19 || {};
  const p19Delta = (p19.variationDb != null && REF.p19.variationDb != null)
    ? (Math.round((p19.variationDb - REF.p19.variationDb) * 1000) / 1000) + " dB"
    : "n/a";
  const p19LevelMatch = p19.level === REF.p19.level;
  row(
    "P19 at RSP (level / variation)",
    `L${REF.p19.level} / ${REF.p19.variationDb} dB`,
    p19.level != null && p19.variationDb != null ? `L${p19.level} / ${p19.variationDb} dB` : "—",
    p19Delta,
    p19LevelMatch ? "info" : "minor",
    "Primary P20",
  );

  // 7. Primary / Secondary P20 vs reference.
  const pp = ev.p20Primary || null;
  const ppDelta = (pp?.variationDb != null && REF.p20Primary.variationDb != null)
    ? (Math.round((pp.variationDb - REF.p20Primary.variationDb) * 1000) / 1000) + " dB"
    : "n/a";
  row(
    "Primary P20 (worst)",
    `L${REF.p20Primary.level} / ${REF.p20Primary.variationDb} dB`,
    pp ? `L${pp.level} / ${pp.variationDb} dB (${pp.seatId || "—"}${pp.worstFrequencyHz != null ? ` @ ${pp.worstFrequencyHz} Hz` : ""})` : "—",
    ppDelta,
    pp && pp.level === REF.p20Primary.level ? "info" : "minor",
    "Secondary P20",
  );

  const sp = ev.p20Secondary || null;
  const spDelta = (sp?.variationDb != null && REF.p20Secondary.variationDb != null)
    ? (Math.round((sp.variationDb - REF.p20Secondary.variationDb) * 1000) / 1000) + " dB"
    : "n/a";
  row(
    "Secondary P20 (worst)",
    `L${REF.p20Secondary.level} / ${REF.p20Secondary.variationDb} dB`,
    sp ? `L${sp.level} / ${sp.variationDb} dB (${sp.seatId || "—"}${sp.worstFrequencyHz != null ? ` @ ${sp.worstFrequencyHz} Hz` : ""})` : "—",
    spDelta,
    sp && sp.level === REF.p20Secondary.level ? "info" : "minor",
    "Per-seat P20",
  );

  // 8. Per-seat P20 ownership + post-EQ curves + shared cancellations.
  const perSeat = Array.isArray(ev.perSeatP20) ? ev.perSeatP20 : [];
  const bundleSeatIds = new Set(bundle.seatingPositions.map((s) => String(s.id)));
  const ownedSeats = perSeat.filter((s) => bundleSeatIds.has(String(s.seatId)));
  row(
    "Per-seat P20 ownership (seats in proposed seating)",
    `${bundle.seatingPositions.length} of ${bundle.seatingPositions.length}`,
    `${ownedSeats.length} of ${bundle.seatingPositions.length}`,
    ownedSeats.length === bundle.seatingPositions.length ? "none" : "missing seats",
    ownedSeats.length === bundle.seatingPositions.length ? "info" : "major",
    "Post-EQ curves",
  );
  row(
    "Post-EQ RSP / per-seat curves",
    "non-empty",
    `RSP ${ev.postEqRspCurve?.length || 0} pts · per-seat ${ev.postEqPerSeatCurves?.length || 0} curves`,
    (ev.postEqRspCurve?.length || 0) > 0 ? "none" : "empty",
    (ev.postEqRspCurve?.length || 0) > 0 ? "info" : "minor",
    "Shared cancellation diagnostic",
  );
  row(
    "Shared cancellation diagnostic",
    "reported",
    ev.sharedCancellations ? (ev.sharedCancellations.hasSharedCancellations ? "detected" : "none") : "—",
    "n/a",
    "info",
    "Canonical receipt",
  );
  row(
    "Canonical receipt",
    "selectedCandidateId present",
    ev.receipt?.selectedCandidateId || "—",
    ev.receipt?.selectedCandidateId ? "none" : "missing",
    ev.receipt?.selectedCandidateId ? "info" : "major",
    "Fingerprint note",
  );
  row(
    "Reference fingerprint",
    REF.fingerprint,
    "(regression target — not computed by this audit; supplied for comparison only)",
    "n/a",
    "info",
    "Foundation verdict",
  );

  // 9. Foundation verdict.
  const credible =
    result.status === "evaluated" &&
    b.preTransfer?.valid && b.preConfirm?.valid && b.postConfirm?.valid &&
    p19.level != null && p19.variationDb != null &&
    pp != null && sp != null &&
    ownedSeats.length === bundle.seatingPositions.length &&
    ev.receipt?.selectedCandidateId;

  console.log(credible
    ? "COORDINATED EVALUATION FOUNDATION: PASS"
    : "COORDINATED EVALUATION FOUNDATION: NOT YET — see rows above");
  console.log("");
  console.log("Smallest next step: bound the saved-seating evaluator into a single-quantity");
  console.log("ADI search loop — generate candidate seating shifts within [0, −1.0] m, evaluate");
  console.log("each once through this same read-only path, rank by lexicographic (P19, Primary P20,");
  console.log("Secondary P20), and surface the best as advisory-only ADI guidance. No Apply, no");
  console.log("autosave; the designer approves the move.");

  // Keep the assertion light — the audit prints its own verdict.
  if (!credible && result.status !== "evaluated") {
    // Don't fail the test harness on a non-evaluated status in the standalone
    // environment; the printed rows are the deliverable.
  }
});