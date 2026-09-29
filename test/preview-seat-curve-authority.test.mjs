// Placement Preview — seat-scoped preview curve selection (presentation only)
// ---------------------------------------------------------------------------
// Verifies that, during placement preview, the graph can draw the focused
// seat's own preview curve from the preview result's seatCurves, falls back to
// the RSP preview when no seat curve exists, and never re-points the faded
// published curve.
//
// No calculations, bass maths, optimiser, RP22 grading, publication authority,
// target bank or restore behaviour is exercised or changed.
import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePreviewSeatId,
  resolvePreviewSeatCurve,
  resolvePreviewCurve,
  seatIdentity,
} from "@/components/room/bass/previewSeatCurveAuthority";

const curve = (id) => [{ frequency: id, spl: -id }];

const previewResult = {
  rspCurve: [{ frequency: 30, spl: 0 }],
  seatCurves: [
    { seatKey: "__seat_0__", originalSeatId: "seat-r1-c1", seatIndex: 0, responseData: curve(11) },
    { seatKey: "__seat_1__", originalSeatId: "seat-r1-c2", seatIndex: 1, responseData: curve(12) },
  ],
};

test("RSP scope when nothing is focused", () => {
  assert.equal(resolvePreviewSeatId({ interactionSeatId: null, selectedSeatIds: ["rsp"] }), null);
  assert.equal(resolvePreviewSeatId({ interactionSeatId: "rsp", selectedSeatIds: [] }), null);
  assert.equal(resolvePreviewSeatId({ interactionSeatId: null, selectedSeatIds: ["rsp", "seat-r1-c1"] }), null);
});

test("interaction seat (P20 pill) takes precedence over the pill selection", () => {
  assert.equal(
    resolvePreviewSeatId({ interactionSeatId: "seat-r1-c2", selectedSeatIds: ["rsp"] }),
    "seat-r1-c2",
  );
});

test("single selected seat pill is the preview scope", () => {
  assert.equal(
    resolvePreviewSeatId({ interactionSeatId: null, selectedSeatIds: ["seat-r1-c1"] }),
    "seat-r1-c1",
  );
});

test("seat curve matched by originalSeatId", () => {
  const match = resolvePreviewSeatCurve({
    seatCurves: previewResult.seatCurves,
    previewSeatId: "seat-r1-c2",
    seatingPositions: [],
  });
  assert.equal(match.originalSeatId, "seat-r1-c2");
});

test("seat curve matched by seatKey", () => {
  const match = resolvePreviewSeatCurve({
    seatCurves: previewResult.seatCurves,
    previewSeatId: "__seat_1__",
    seatingPositions: [],
  });
  assert.equal(match.seatIndex, 1);
});

test("index fallback used only when ids are missing", () => {
  const idlessCurves = [{ seatKey: "__seat_0__", originalSeatId: null, seatIndex: 0, responseData: curve(21) }];
  const seating = [{ id: null, x: 1, y: 2 }];
  assert.equal(seatIdentity(seating[0]), "1-2");
  const match = resolvePreviewSeatCurve({
    seatCurves: idlessCurves,
    previewSeatId: "1-2",
    seatingPositions: seating,
  });
  assert.equal(match.responseData[0].frequency, 21);
});

test("focused seat without a preview curve keeps the RSP preview and flags it", () => {
  const resolved = resolvePreviewCurve({
    previewResult,
    previewSeatId: "seat-r1-c9",
    seatingPositions: [],
  });
  assert.equal(resolved.seatCurveUsed, false);
  assert.equal(resolved.seatUnavailable, true);
  assert.equal(resolved.data, previewResult.rspCurve);
});

test("RSP scope draws the RSP preview curve and raises no notice", () => {
  const resolved = resolvePreviewCurve({ previewResult, previewSeatId: null, seatingPositions: [] });
  assert.equal(resolved.data, previewResult.rspCurve);
  assert.equal(resolved.seatCurveUsed, false);
  assert.equal(resolved.seatUnavailable, false);
});

test("focused seat with a preview curve draws that seat's curve", () => {
  const resolved = resolvePreviewCurve({
    previewResult,
    previewSeatId: "seat-r1-c1",
    seatingPositions: [],
  });
  assert.equal(resolved.seatCurveUsed, true);
  assert.equal(resolved.seatUnavailable, false);
  assert.equal(resolved.data, previewResult.seatCurves[0].responseData);
  assert.notEqual(resolved.data, previewResult.rspCurve);
});

test("missing preview result degrades safely", () => {
  assert.deepEqual(
    resolvePreviewCurve({ previewResult: null, previewSeatId: "seat-r1-c1" }),
    { data: null, seatCurveUsed: false, seatUnavailable: true },
  );
});