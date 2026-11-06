import { register } from 'node:module';
register('./test/_alias-loader.mjs', import.meta.url);

const { buildAllSeatsPreviewSeries } = await import('@/components/room/bass/previewSeatCurveAuthority');
const { resolvePreviewSeatId, resolvePreviewCurve, resolvePreviewSeatCurve, seatIdentity } = await import('@/components/room/bass/previewSeatCurveAuthority');

import assert from 'node:assert/strict';

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.error('FAIL', name, e.message); } };

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
const getSeatColor = (sid) => { const idx = orderedSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid); return palette[Math.max(0, idx) % palette.length]; };
const formatLabel = (sid) => sid.toUpperCase();

// All-seats overlay tests
ok('one series per ordered seat', () => {
  const s = buildAllSeatsPreviewSeries({ previewResult, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel });
  assert.equal(s.length, 3);
  assert.deepEqual(s.map(x=>x.id), ["r1s1","r1s2","r1s3"]);
  assert.deepEqual(s.map(x=>x.label), ["R1S1","R1S2","R1S3"]);
  assert.equal(s[0].color, palette[0]);
  assert.equal(s[1].color, palette[1]);
  assert.equal(s[2].color, palette[2]);
  assert.equal(s.every(x=>x.kind==="room-response-preview"), true);
});
ok('each series carries its own curve verbatim (no averaging)', () => {
  const s = buildAllSeatsPreviewSeries({ previewResult, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel });
  assert.equal(s[0].data, previewResult.seatCurves[0].responseData);
  assert.equal(s[1].data, previewResult.seatCurves[1].responseData);
  assert.equal(s[2].data, previewResult.seatCurves[2].responseData);
});
ok('distinct colours across seats', () => {
  const s = buildAllSeatsPreviewSeries({ previewResult, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel });
  assert.equal(new Set(s.map(x=>x.color)).size, s.length);
});
ok('RSP curve never substituted for a seat curve', () => {
  const s = buildAllSeatsPreviewSeries({ previewResult, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel });
  assert.equal(s.some(x=>x.data===previewResult.rspCurve), false);
  assert.equal(s.some(x=>x.id==="rsp"), false);
});
ok('seats without a preview curve omitted', () => {
  const partial = { rspCurve: previewResult.rspCurve, seatCurves: [previewResult.seatCurves[0], previewResult.seatCurves[2]] };
  const s = buildAllSeatsPreviewSeries({ previewResult: partial, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel });
  assert.deepEqual(s.map(x=>x.id), ["r1s1","r1s3"]);
});
ok('empty preview result → empty list', () => {
  assert.deepEqual(buildAllSeatsPreviewSeries({ previewResult: null, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel }), []);
  assert.deepEqual(buildAllSeatsPreviewSeries({ previewResult: { seatCurves: [] }, orderedSeats, seatingPositions: orderedSeats, getSeatColor, formatLabel }), []);
});
ok('index-fallback for idless seats', () => {
  const idless = { rspCurve: [], seatCurves: [{ seatKey:"__seat_0__", originalSeatId:null, seatIndex:0, responseData:curve(40) },{ seatKey:"__seat_1__", originalSeatId:null, seatIndex:1, responseData:curve(45) }] };
  const seats = [{id:null,x:1,y:2,row:1},{id:null,x:2,y:2,row:1}];
  const s = buildAllSeatsPreviewSeries({ previewResult:idless, orderedSeats:seats, seatingPositions:seats, getSeatColor:()=>"#000", formatLabel:(id)=>id });
  assert.equal(s.length, 2);
  assert.equal(s[0].data, idless.seatCurves[0].responseData);
  assert.equal(s[1].data, idless.seatCurves[1].responseData);
});

// Preview seat curve authority tests
ok('RSP scope when nothing focused', () => {
  assert.equal(resolvePreviewSeatId({ interactionSeatId: null, selectedSeatIds: ["rsp"] }), null);
  assert.equal(resolvePreviewSeatId({ interactionSeatId: "rsp", selectedSeatIds: [] }), null);
});
ok('interaction seat takes precedence', () => {
  assert.equal(resolvePreviewSeatId({ interactionSeatId: "seat-r1-c2", selectedSeatIds: ["rsp"] }), "seat-r1-c2");
});
ok('single selected seat is preview scope', () => {
  assert.equal(resolvePreviewSeatId({ interactionSeatId: null, selectedSeatIds: ["seat-r1-c1"] }), "seat-r1-c1");
});
ok('focused seat without curve keeps RSP + flags', () => {
  const r = resolvePreviewCurve({ previewResult, previewSeatId: "seat-r1-c9", seatingPositions: [] });
  assert.equal(r.seatCurveUsed, false);
  assert.equal(r.seatUnavailable, true);
  assert.equal(r.data, previewResult.rspCurve);
});
ok('RSP scope draws RSP preview, no notice', () => {
  const r = resolvePreviewCurve({ previewResult, previewSeatId: null, seatingPositions: [] });
  assert.equal(r.data, previewResult.rspCurve);
  assert.equal(r.seatCurveUsed, false);
  assert.equal(r.seatUnavailable, false);
});
ok('focused seat with curve draws that curve', () => {
  const r = resolvePreviewCurve({ previewResult, previewSeatId: "r1s1", seatingPositions: [] });
  assert.equal(r.seatCurveUsed, true);
  assert.equal(r.seatUnavailable, false);
  assert.equal(r.data, previewResult.seatCurves[0].responseData);
  assert.notEqual(r.data, previewResult.rspCurve);
});
ok('missing preview result degrades safely', () => {
  assert.deepEqual(resolvePreviewCurve({ previewResult: null, previewSeatId: "r1s1" }), { data: null, seatCurveUsed: false, seatUnavailable: true });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
