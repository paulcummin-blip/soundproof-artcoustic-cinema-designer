// test/stage11b-result-render-regression.test.mjs
// Regression test for the Stage 11B final-result render crash.
//
// ROOT CAUSE: ImproveBassV2Results passed flat canonical per-seat arrays
// (winner.perSeatP19 / winner.perSeatP20) directly to SharedP19P20SeatResults,
// which expects row-grouped [{ row, seats: [...] }]. The SeatGrid called
// row.seats.map(...) on a flat seat object → TypeError: Cannot read
// properties of undefined (reading 'map').
//
// FIX: Adapt flat arrays via buildP19SeatRows / buildP20SeatRows before
// passing to the shared component. Priority comes from the canonical
// seatingPositions via seatPriorityAuthority, not the result's isPrimary.
//
// This test validates the adapter boundary (the presentation adapter). If
// the row builders produce correct { row, seats } structure from flat V2
// arrays, the SharedP19P20SeatResults SeatGrid cannot crash.
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-result-render-regression.test.mjs

import { buildP19SeatRows } from "@/components/room/bass/p19SeatPresentation";
import { buildP20SeatRows } from "@/components/room/bass/p20SeatPresentation";
import { PRIMARY, SECONDARY } from "@/components/utils/seatPriorityAuthority";

// ── Fixture: 5 seating positions, 2 primary seats (row 1), 3 secondary (row 2) ──
const seatingPositions = [
  { id: "seat-r1-c1", row: 1, column: 1, priority: PRIMARY },
  { id: "seat-r1-c2", row: 1, column: 2, priority: PRIMARY },
  { id: "seat-r2-c1", row: 2, column: 1, priority: SECONDARY },
  { id: "seat-r2-c2", row: 2, column: 2, priority: SECONDARY },
  { id: "seat-r2-c3", row: 2, column: 3, priority: SECONDARY },
];

const perSeatP19 = [
  { seatId: "seat-r1-c1", level: 0, variationDbRaw: 6.9 },
  { seatId: "seat-r1-c2", level: 0, variationDbRaw: 6.9 },
  { seatId: "seat-r2-c1", level: 0, variationDbRaw: 10.48 },
  { seatId: "seat-r2-c2", level: 0, variationDbRaw: 10.47 },
  { seatId: "seat-r2-c3", level: 0, variationDbRaw: 10.48 },
];

const perSeatP20 = [
  { seatId: "seat-r1-c1", level: 0, variationDbRaw: 6.9 },
  { seatId: "seat-r1-c2", level: 0, variationDbRaw: 6.9 },
  { seatId: "seat-r2-c1", level: 0, variationDbRaw: 10.48 },
  { seatId: "seat-r2-c2", level: 0, variationDbRaw: 10.47 },
  { seatId: "seat-r2-c3", level: 0, variationDbRaw: 10.48 },
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    console.error(`  \u2717 ${message}`);
  }
}

// ── Section 6: Exact crash shape — flat V2 arrays ──
console.log("Section 6: Flat V2 arrays → row-grouped presentation");
const p19Rows = buildP19SeatRows(seatingPositions, perSeatP19);
const p20Rows = buildP20SeatRows(seatingPositions, perSeatP20);

assert(Array.isArray(p19Rows), "P19 rows is an array");
assert(Array.isArray(p20Rows), "P20 rows is an array");
assert(p19Rows.length === 2, `Two P19 rows produced (got ${p19Rows.length})`);
assert(p20Rows.length === 2, `Two P20 rows produced (got ${p20Rows.length})`);
assert(p19Rows[0].row === 1, "First P19 row is row 1");
assert(p19Rows[0].seats.length === 2, `Row 1 has 2 P19 seats (got ${p19Rows[0].seats.length})`);
assert(p19Rows[1].seats.length === 3, `Row 2 has 3 P19 seats (got ${p19Rows[1].seats.length})`);
assert(p20Rows[0].seats.length === 2, `Row 1 has 2 P20 seats (got ${p20Rows[0].seats.length})`);
assert(p20Rows[1].seats.length === 3, `Row 2 has 3 P20 seats (got ${p20Rows[1].seats.length})`);

// Primary seats preserve primary priority from seatingPositions
const p19Row1Seats = p19Rows[0].seats;
assert(p19Row1Seats.every((s) => s.priority === PRIMARY), "Row 1 P19 seats are all Primary");
const p19Row2Seats = p19Rows[1].seats;
assert(p19Row2Seats.every((s) => s.priority === SECONDARY), "Row 2 P19 seats are all Secondary");

// All five P19 results render (have a level)
const allP19Seats = p19Rows.flatMap((r) => r.seats);
assert(allP19Seats.length === 5, `All 5 P19 seats present (got ${allP19Seats.length})`);
assert(allP19Seats.every((s) => s.level !== "\u2014"), "All P19 seats have a level");

// All five P20 results render
const allP20Seats = p20Rows.flatMap((r) => r.seats);
assert(allP20Seats.length === 5, `All 5 P20 seats present (got ${allP20Seats.length})`);
assert(allP20Seats.every((s) => s.level !== "\u2014"), "All P20 seats have a level");

// No crash: every row has a seats array (the exact crash was row.seats.map)
assert(p19Rows.every((r) => Array.isArray(r.seats)), "Every P19 row has seats array");
assert(p20Rows.every((r) => Array.isArray(r.seats)), "Every P20 row has seats array");

// ── Section 7: Malformed / absent data ──
console.log("\nSection 7: Absent per-seat arrays");
const emptyP19 = buildP19SeatRows(seatingPositions, []);
const emptyP20 = buildP20SeatRows(seatingPositions, []);
assert(Array.isArray(emptyP19), "Empty P19 rows is array");
assert(Array.isArray(emptyP20), "Empty P20 rows is array");
assert(emptyP19.length === 2, `Empty P19 still has 2 rows (seating structure) (got ${emptyP19.length})`);
assert(emptyP20.length === 2, `Empty P20 still has 2 rows (seating structure) (got ${emptyP20.length})`);
// Seats exist but with "\u2014" level (no fabricated grades)
const emptyP19Seats = emptyP19.flatMap((r) => r.seats);
assert(emptyP19Seats.every((s) => s.level === "\u2014"), "No fabricated P19 grades");
const emptyP20Seats = emptyP20.flatMap((r) => r.seats);
assert(emptyP20Seats.every((s) => s.level === "\u2014"), "No fabricated P20 grades");

// Null/undefined arrays
const nullP19 = buildP19SeatRows(seatingPositions, null);
const nullP20 = buildP20SeatRows(seatingPositions, undefined);
assert(Array.isArray(nullP19), "Null P19 input \u2192 array output");
assert(Array.isArray(nullP20), "Undefined P20 input \u2192 array output");

// Null seatingPositions
const noSeatsP19 = buildP19SeatRows(null, perSeatP19);
assert(Array.isArray(noSeatsP19) && noSeatsP19.length === 0, "Null seatingPositions \u2192 empty rows");

// ── Section 8: Simulate SharedP19P20SeatResults SeatGrid consumption ──
console.log("\nSection 8: SeatGrid consumption (row.seats.map simulation)");
// The crash was: rows.map(row => row.seats.map(...)) where row.seats was undefined.
// Verify the row-grouped structure is consumable without exception.
let p19RenderCount = 0;
let p20RenderCount = 0;
let p19PrimaryCount = 0;
let p20PrimaryCount = 0;
try {
  p19Rows.forEach((row) => {
    row.seats.forEach((seat) => {
      p19RenderCount++;
      if (seat.priority === PRIMARY) p19PrimaryCount++;
    });
  });
  p20Rows.forEach((row) => {
    row.seats.forEach((seat) => {
      p20RenderCount++;
      if (seat.priority === PRIMARY) p20PrimaryCount++;
    });
  });
  assert(true, "No exception consuming row-grouped structure");
} catch (err) {
  assert(false, `Exception: ${err.message}`);
}

assert(p19RenderCount === 5, `All 5 P19 seats rendered (got ${p19RenderCount})`);
assert(p20RenderCount === 5, `All 5 P20 seats rendered (got ${p20RenderCount})`);
assert(p19PrimaryCount === 2, `2 primary P19 seats (got ${p19PrimaryCount})`);
assert(p20PrimaryCount === 2, `2 primary P20 seats (got ${p20PrimaryCount})`);

// ── Section 8b: Realistic Stage 11B selection object shape ──
console.log("\nSection 8b: Realistic Stage 11B winner object fields");
// Verify the V2 winner's flat field names are accepted by the row builders.
const realisticWinnerP19 = [
  { seatId: "seat-r1-c1", level: 2, variationDbRaw: 3.2, worstFrequencyHz: 52.5, isPrimary: true },
  { seatId: "seat-r1-c2", level: 2, variationDbRaw: 3.1, worstFrequencyHz: 54.0, isPrimary: true },
  { seatId: "seat-r2-c1", level: 1, variationDbRaw: 5.8, worstFrequencyHz: 48.0, isPrimary: false },
  { seatId: "seat-r2-c2", level: 1, variationDbRaw: 5.9, worstFrequencyHz: 49.5, isPrimary: false },
  { seatId: "seat-r2-c3", level: 1, variationDbRaw: 6.0, worstFrequencyHz: 50.0, isPrimary: false },
];
const realisticRows = buildP19SeatRows(seatingPositions, realisticWinnerP19);
assert(realisticRows.length === 2, "Realistic winner \u2192 2 rows");
const realisticSeats = realisticRows.flatMap((r) => r.seats);
assert(realisticSeats.length === 5, "All 5 seats present from realistic winner");
// Priority from seatingPositions, NOT from isPrimary boolean
assert(realisticSeats[0].priority === PRIMARY, "Priority from seatingPositions (seat 1)");
assert(realisticSeats[2].priority === SECONDARY, "Priority from seatingPositions (seat 3, not isPrimary)");
// worstFrequencyHz preserved
assert(realisticSeats[0].worstFrequencyHz === 52.5, "worstFrequencyHz preserved");

// ── Summary ──
console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error("STAGE 11B RESULT RENDER REGRESSION FAILED");
  process.exit(1);
} else {
  console.log("STAGE 11B RESULT RENDER REGRESSION PASSED");
}