// Unit tests for the coordinated physical search's pure selection helper.
// Proves the "diverse, not-pruned-by-installed-sub-performance" property that
// the spec requires: retained seating states are a spread across the legal
// range, independent of how each offset performs with the installed subs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDiverseSeatingStates } from "../src/components/room/bass/improveBassV2/coordinatedDiversityPolicy.js";

const mk = (offsetMm) => ({ offsetMm, valid: true, seatingPositions: [{ y: 2 + offsetMm / 1000 }] });

test("retains a bounded diverse spread across the full legal range", () => {
  // 12 legal non-zero offsets (-600..-100, +100..+600), no proxy ranking applied
  const valid = [-600, -500, -400, -300, -200, -100, 100, 200, 300, 400, 500, 600].map(mk);
  const sel = selectDiverseSeatingStates(valid, 5);
  assert.equal(sel.length, 5);
  // The spread must cover both extremes of the legal range (diversity, not a cluster)
  const offsets = sel.map((s) => s.offsetMm).sort((a, b) => a - b);
  assert.equal(offsets[0], -600, "leftmost extreme retained");
  assert.equal(offsets[offsets.length - 1], 600, "rightmost extreme retained");
});

test("does not prune by installed-sub performance — selection is geometry-only", () => {
  // Give every offset an identical (unranked) shape; selection must still spread.
  const valid = [-400, -300, -200, 200, 300, 400].map(mk);
  const sel = selectDiverseSeatingStates(valid, 4);
  assert.equal(sel.length, 4);
  const span = Math.max(...sel.map((s) => s.offsetMm)) - Math.min(...sel.map((s) => s.offsetMm));
  assert.ok(span >= 600, `span ${span}mm should cover most of the range`);
});

test("returns all when fewer legal offsets than the cap", () => {
  const valid = [-200, 200].map(mk);
  assert.equal(selectDiverseSeatingStates(valid, 5).length, 2);
});

test("returns empty when no legal offsets", () => {
  assert.deepEqual(selectDiverseSeatingStates([], 5), []);
});