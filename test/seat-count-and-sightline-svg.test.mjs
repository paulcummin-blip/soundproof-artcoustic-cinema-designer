import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normaliseSeatCount,
  stepSeatCount,
} from "../src/components/room/seatCount.js";

const seatingLayout = await readFile(
  new URL("../src/components/room/SeatingLayout.jsx", import.meta.url),
  "utf8",
);
const sightlineGraphic = await readFile(
  new URL("../src/components/report/SightlineGraphic.jsx", import.meta.url),
  "utf8",
);

test("seat count changes by exactly one and accepts two seats", () => {
  assert.equal(stepSeatCount(3, -1), 2);
  assert.equal(stepSeatCount(2, -1), 1);
  assert.equal(stepSeatCount(1, -1), 1);
  assert.equal(stepSeatCount(1, 1), 2);
  assert.equal(stepSeatCount(2, 1), 3);
  assert.equal(normaliseSeatCount("2"), 2);
});

test("seat count UI uses deterministic buttons instead of a native number spinner", () => {
  assert.match(seatingLayout, /Remove one seat from row/);
  assert.match(seatingLayout, /Add one seat to row/);
  assert.match(seatingLayout, /type="text"[\s\S]*?inputMode="numeric"/);
  assert.doesNotMatch(
    seatingLayout,
    /\{\/\* Seats in this row[^]*?<Input\s+type="number"/,
  );
});

test("resized-room sightline outline always uses a positive SVG width", () => {
  assert.match(sightlineGraphic, /x=\{rx0\}\s+y=\{ry1\}/);
  assert.match(sightlineGraphic, /width=\{rx1 - rx0\}/);
  assert.doesNotMatch(sightlineGraphic, /width=\{rx0 - rx1\}/);
});
