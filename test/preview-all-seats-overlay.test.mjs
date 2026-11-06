// All-seats preview overlay — presentation-only builder (no acoustic change)
// ---------------------------------------------------------------------------
// Verifies that buildAllSeatsPreviewSeries produces one graph series per real
// listening position, each carrying that seat's OWN preview curve verbatim with
// a distinct colour and label, and that no averaging, summing, normalising or
// RSP substitution is performed. Seats without a preview curve are omitted.
//
// No calculations, bass maths, optimiser, RP22 grading or publication authority
// is exercised or changed.
import test from "node:test";
import assert from "node:assert/strict";

import { buildAllSeatsPreviewSeries } from "@/components/room/bass/previewSeatCurveAuthority";

const curve = (startHz) => [
  { frequency: startHz, spl: startHz },
  { frequency: startHz + 10, spl: startHz + 1 },
];

const previewResult = {
  rspCurve: [{ frequency: 30, spl: 0 }],
  seatCurves: [
    { seatKey: "__seat_0__", originalSeatId: "r1s1", seatIndex: 0, responseData: curve(20) },
    { seatKey: "__seat_1__", originalSeatId: "r1s2", seatIndex: 1, responseData: curve(25) },
    { seatKey: "__seat_2__", originalSeatId: "r1s3", seatIndex: 2, responseData: curve(30) },
  ],
};

const orderedSeats = [
  { id: "r1s1", row: 1, indexInRow: 1, x: 1, y: 2 },
  { id: "r1s2", row: 1, indexInRow: 2, x: 2, y: 2 },
  { id: "r1s3", row: 1, indexInRow: 3, x: 3, y: 2 },
];

const palette = ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"];
const getSeatColor = (sid) => {
  const idx = orderedSeats.findIndex((s) => (s.id || `${s.x}-${s.y}`) === sid);
  return palette[Math.max(0, idx) % palette.length];
};
const formatLabel = (sid) => sid.toUpperCase();

test("one series per ordered seat, each with its own curve, colour and label", () => {
  const series = buildAllSeatsPreviewSeries({
    previewResult,
    orderedSeats,
    seatingPositions: orderedSeats,
    getSeatColor,
    formatLabel,
  });
  assert.equal(series.length, 3);
  assert.deepEqual(series.map((s) => s.id), ["r1s1", "r1s2", "r1s3"]);
  assert.deepEqual(series.map((s) => s.label), ["R1S1", "R1S2", "R1S3"]);
  assert.equal(series[0].color, palette[0]);
  assert.equal(series[1].color, palette[1]);
  assert.equal(series[2].color, palette[2]);
  assert.equal(series.every((s) => s.kind === "room-response-preview"), true);
});

test("each series carries that seat's own preview curve verbatim — no averaging or summing", () => {
  const series = buildAllSeatsPreviewSeries({
    previewResult,
    orderedSeats,
    seatingPositions: orderedSeats,
    getSeatColor,
    formatLabel,
  });
  // Series data is the exact responseData object from the preview result, not a
  // combined/averaged derivative. Compare by reference to prove no copy/merge.
  assert.equal(series[0].data, previewResult.seatCurves[0].responseData);
  assert.equal(series[1].data, previewResult.seatCurves[1].responseData);
  assert.equal(series[2].data, previewResult.seatCurves[2].responseData);
});

test("distinct colours across seats", () => {
  const series = buildAllSeatsPreviewSeries({
    previewResult,
    orderedSeats,
    seatingPositions: orderedSeats,
    getSeatColor,
    formatLabel,
  });
  const colors = new Set(series.map((s) => s.color));
  assert.equal(colors.size, series.length, "every seat must have a distinct colour");
});

test("RSP curve is never substituted for a seat curve in the all-seats overlay", () => {
  const series = buildAllSeatsPreviewSeries({
    previewResult,
    orderedSeats,
    seatingPositions: orderedSeats,
    getSeatColor,
    formatLabel,
  });
  assert.equal(series.some((s) => s.data === previewResult.rspCurve), false);
  assert.equal(series.some((s) => s.id === "rsp"), false);
});

test("seats without a preview curve are omitted; others are kept", () => {
  const partial = {
    rspCurve: previewResult.rspCurve,
    seatCurves: [previewResult.seatCurves[0], previewResult.seatCurves[2]],
  };
  const series = buildAllSeatsPreviewSeries({
    previewResult: partial,
    orderedSeats,
    seatingPositions: orderedSeats,
    getSeatColor,
    formatLabel,
  });
  assert.deepEqual(series.map((s) => s.id), ["r1s1", "r1s3"]);
});

test("empty preview result degrades to an empty series list", () => {
  assert.deepEqual(
    buildAllSeatsPreviewSeries({ previewResult: null, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel }),
    [],
  );
  assert.deepEqual(
    buildAllSeatsPreviewSeries({ previewResult: { seatCurves: [] }, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel }),
    [],
  );
});

test("index-fallback matching resolves idless seats to their curve", () => {
  const idlessPreview = {
    rspCurve: [],
    seatCurves: [
      { seatKey: "__seat_0__", originalSeatId: null, seatIndex: 0, responseData: curve(40) },
      { seatKey: "__seat_1__", originalSeatId: null, seatIndex: 1, responseData: curve(45) },
    ],
  };
  const idlessSeats = [
    { id: null, x: 1, y: 2, row: 1 },
    { id: null, x: 2, y: 2, row: 1 },
  ];
  const series = buildAllSeatsPreviewSeries({
    previewResult: idlessPreview,
    orderedSeats: idlessSeats,
    seatingPositions: idlessSeats,
    getSeatColor: () => "#000000",
    formatLabel: (id) => id,
  });
  assert.equal(series.length, 2);
  assert.equal(series[0].data, idlessPreview.seatCurves[0].responseData);
  assert.equal(series[1].data, idlessPreview.seatCurves[1].responseData);
});