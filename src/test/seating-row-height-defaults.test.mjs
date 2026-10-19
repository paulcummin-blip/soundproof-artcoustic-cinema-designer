import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  ROW_EAR_HEIGHT_INCREMENT_M,
  defaultEarHeightForNewRow,
  getEarHeightForRow,
  resolveRowEarHeights,
} from "../components/room/seatingRowHeightDefaults.js";

const read = (path) => fs.readFileSync(path, "utf8");

/**
 * The Add Row flow, exactly as the SeatingLayout control runs it: the rows on
 * screen are resolved first (stated height, else that row's default), then the
 * added row starts 0.4 m above the last of them.
 */
function addRow(rowEarHeights, rowCount) {
  const currentHeights = resolveRowEarHeights({ rowEarHeights, rowCount });
  return [
    ...currentHeights,
    defaultEarHeightForNewRow({ previousEarHeightM: currentHeights[currentHeights.length - 1] }),
  ];
}

/** Platform height is stored absolute: a row's platform is its rise over row 1. */
const platformOfRow = (heights, rowIndex) => heights[rowIndex] - heights[0];

test("row 2 defaults to row 1 + 0.4 m", () => {
  // The Room Designer's own starting state for a one-row design.
  const heights = addRow([1.2, 1.5, 1.8], 1);
  assert.deepEqual(heights, [1.2, 1.6]);
  assert.equal(heights[1] - heights[0], ROW_EAR_HEIGHT_INCREMENT_M);
  assert.equal(platformOfRow(heights, 1), 0.4);
});

test("row 3 defaults to row 2 + 0.4 m", () => {
  const first = addRow([1.2, 1.5, 1.8], 1);
  const second = addRow(first, 2);
  assert.deepEqual(second, [1.2, 1.6, 2.0]);
  assert.equal(second[2] - second[1], ROW_EAR_HEIGHT_INCREMENT_M);
  assert.equal(platformOfRow(second, 2), 0.8);
});

test("row 4 defaults to row 3 + 0.4 m", () => {
  const third = addRow(addRow(addRow([1.2, 1.5, 1.8], 1), 2), 3);
  assert.deepEqual(third, [1.2, 1.6, 2.0, 2.4]);
  assert.equal(third[3] - third[2], ROW_EAR_HEIGHT_INCREMENT_M);
  assert.equal(platformOfRow(third, 3), 1.2);
});

test("a stated ear height is preserved and is what the next row steps from", () => {
  // Row 2 has been typed by the designer: the added row steps from 1.8, not 1.6.
  const heights = addRow([1.2, 1.8], 2);
  assert.deepEqual(heights, [1.2, 1.8, 2.2]);
  // The designer's own row keeps the value they typed.
  assert.deepEqual(resolveRowEarHeights({ rowEarHeights: heights, rowCount: 3 }), [1.2, 1.8, 2.2]);
});

test("an existing project's row heights are returned unchanged", () => {
  const saved = [1.2, 1.55, 2.1];
  const heights = addRow(saved, saved.length);
  assert.deepEqual(heights.slice(0, 3), saved);
  assert.equal(heights[3], 2.5);
});

test("a row defaults without a stated previous height fall back to the row-1 base", () => {
  assert.equal(defaultEarHeightForNewRow({}), 1.6);
  assert.equal(getEarHeightForRow(1), 1.2);
  // Bounds of the Ear Height field are respected.
  assert.equal(defaultEarHeightForNewRow({ previousEarHeightM: 3.0 }), 3.0);
  assert.equal(defaultEarHeightForNewRow({ previousEarHeightM: 0.05 }), 0.45);
});

test("the default is a creation default: no stored value is rewritten by resolving rows", () => {
  const saved = [1.45, 1.9];
  assert.deepEqual(resolveRowEarHeights({ rowEarHeights: saved, rowCount: 2 }), saved);
});

test("the Ear Height field stays the only manual writer, and platform keeps one authority", () => {
  const layout = read("src/components/room/SeatingLayout.jsx");
  const rebuild = read("src/components/hooks/useSeatingRebuild.jsx");

  // The added row is the only row defaulted on Add Row.
  assert.match(layout, /defaultEarHeightForNewRow\(\{ previousEarHeightM/);
  // No second, competing platform rule was introduced: platform stays absolute,
  // derived from the row ear heights by the seat-rebuild authority.
  assert.match(rebuild, /getRowZ\(rowIndex\) - getRowZ\(0\)/);
  assert.doesNotMatch(rebuild, /0\.4/);
});