/**
 * visual-report-neutral-language.test.mjs
 * ----------------------------------------
 * Proves the Visual Report RP22 result callouts report achieved levels
 * factually without opinion / recommendation language.
 *
 * Part A — functional: the two self-contained SPL-capability selectors
 * (P12 / P13) return neutral "Level N" / "Does not achieve Level 1"
 * result headings and a factual measured-value line.
 *
 * Part B — source scan: no forbidden subjective / recommendation phrases
 * remain in any Visual Report parameter result-card source.
 *
 * Run: node --test test/visual-report-neutral-language.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectClientFrontSoundstageDynamicRange } from "../src/components/report/client/selectClientFrontSoundstageDynamicRange.js";
import { selectClientNonScreenDynamicRange } from "../src/components/report/client/selectClientNonScreenDynamicRange.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "../src/components/report/client");

// ── Part A: functional level → heading mapping ────────────────────────────

function makeAnalysisResult(p12Value, p13Value) {
  return {
    gradedParameters: {
      primary: {
        12: p12Value != null ? { value: p12Value, formatted: `${p12Value} dB`, status: "ok", level: null } : null,
        13: p13Value != null ? { value: p13Value, formatted: `${p13Value} dB`, status: "ok", level: null } : null,
      },
    },
  };
}

const SEATS = [{ id: "s1", x: 2, y: 4 }];
const RSP = { x: 2, y: 4 };
const SPL_METRICS = new Map();

test("P12 resultHeading is neutral for every achieved level", () => {
  const cases = [
    { value: 111, mode: "recommended", want: "Level 4" },
    { value: 108, mode: "recommended", want: "Level 3" },
    { value: 105, mode: "recommended", want: "Level 2" },
    { value: 102, mode: "recommended", want: "Level 1" },
    { value: 99, mode: "recommended", want: "Does not achieve Level 1" },
  ];
  for (const c of cases) {
    const r = selectClientFrontSoundstageDynamicRange({
      analysisResult: makeAnalysisResult(c.value, null),
      allSeatSplMetrics: SPL_METRICS,
      seatingPositions: SEATS,
      rsp: RSP,
      p12Mode: c.mode,
    });
    assert.equal(r.resultHeading, c.want, `P12 value=${c.value} mode=${c.mode}`);
    assert.equal(r.resultExplanation, "Minimum SPL capability of the left, centre and right screen speakers at the reference seating position.");
    assert.ok(r.minimum && r.minimum.formatted, "P12 measured value remains visible");
  }
});

test("P13 resultHeading is neutral for every achieved level", () => {
  const cases = [
    { value: 108, mode: "recommended", want: "Level 4" },
    { value: 105, mode: "recommended", want: "Level 3" },
    { value: 102, mode: "recommended", want: "Level 2" },
    { value: 99, mode: "recommended", want: "Level 1" },
    { value: 96, mode: "recommended", want: "Does not achieve Level 1" },
  ];
  for (const c of cases) {
    const r = selectClientNonScreenDynamicRange({
      analysisResult: makeAnalysisResult(null, c.value),
      allSeatSplMetrics: SPL_METRICS,
      seatingPositions: SEATS,
      rsp: RSP,
      p13Mode: c.mode,
    });
    assert.equal(r.resultHeading, c.want, `P13 value=${c.value} mode=${c.mode}`);
    assert.equal(r.resultExplanation, "Minimum SPL capability of the surround and overhead speakers at the reference seating position.");
    assert.ok(r.minimum && r.minimum.formatted, "P13 measured value remains visible");
  }
});

// ── Part B: source scan for forbidden subjective phrases ───────────────────

const FORBIDDEN_PHRASES = [
  "Further refinement recommended",
  "Improvement recommended",
  "Additional dynamic capability recommended",
  "Additional surround capability recommended",
  "Excellent spatial continuity",
  "Very good spatial continuity",
  "Good spatial continuity",
  "Exceptional dynamic capability",
  "Strong cinema-level dynamic capability",
  "Good dynamic capability",
  "Basic dynamic capability",
  "Exceptional surround capability",
  "Strong surround capability",
  "Good surround capability",
  "Basic surround capability",
  "Good seating",
  "Very consistent",
  "Highly consistent",
  "Reducing the widest gap",
  "would create smoother movement",
  "could be adjusted to bring",
  "would improve the viewing experience",
  "Speaker level balance needs improving",
  "strongest balance",
  "enjoyable listening positions",
];

const SCAN_FILES = [
  "ClientSoundAroundListener.jsx",
  "print/PrintP5Content.jsx",
  "selectClientFrontSoundstageDynamicRange.js",
  "selectClientNonScreenDynamicRange.js",
  "selectClientBestListeningArea.js",
  "selectClientTimbreConsistency.js",
  "selectClientScreenSeating.js",
  "selectClientP9Overhead.js",
  "ClientReportPage.jsx",
  "ClientTimbreConsistency.jsx",
];

test("no forbidden subjective phrases remain in Visual Report result-card sources", () => {
  const offenders = [];
  for (const rel of SCAN_FILES) {
    const full = path.join(CLIENT_DIR, rel);
    const src = fs.readFileSync(full, "utf8");
    for (const phrase of FORBIDDEN_PHRASES) {
      if (src.includes(phrase)) {
        offenders.push(`${rel}: "${phrase}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Forbidden subjective phrases found:\n${offenders.join("\n")}`);
});

test("P5 status copy uses neutral Level headings", () => {
  const src = fs.readFileSync(path.join(CLIENT_DIR, "ClientSoundAroundListener.jsx"), "utf8");
  for (const lvl of ["L4", "L3", "L2", "L1"]) {
    assert.ok(src.includes(`label: "Level ${lvl.slice(1)}"`), `P5 ${lvl} heading should be "Level ${lvl.slice(1)}"`);
  }
  assert.ok(src.includes('label: "Does not achieve Level 1"'), "P5 FAIL heading should be factual");
  assert.ok(src.includes("Maximum horizontal angle between adjacent surround speakers"), "P5 body should describe what was measured");
});

test("PrintP5 status copy uses neutral Level headings", () => {
  const src = fs.readFileSync(path.join(CLIENT_DIR, "print/PrintP5Content.jsx"), "utf8");
  for (const lvl of ["L4", "L3", "L2", "L1"]) {
    assert.ok(src.includes(`label: "Level ${lvl.slice(1)}"`), `Print P5 ${lvl} heading should be "Level ${lvl.slice(1)}"`);
  }
  assert.ok(src.includes("Maximum horizontal angle between adjacent surround speakers"), "Print P5 body should describe what was measured");
});

test("Best Listening Area category labels are neutral level references", () => {
  const src = fs.readFileSync(path.join(CLIENT_DIR, "selectClientBestListeningArea.js"), "utf8");
  assert.ok(src.includes('category: "Level 1"'), "L1 category should be Level 1");
  assert.ok(src.includes('category: "Level 2"'), "L2 category should be Level 2");
  assert.ok(src.includes('category: "Level 3 or 4"'), "L3/L4 category should be Level 3 or 4");
  assert.ok(src.includes('category: "Does not achieve Level 1"'), "FAIL category should be factual");
});

test("Timbre Consistency category labels are neutral level references", () => {
  const src = fs.readFileSync(path.join(CLIENT_DIR, "selectClientTimbreConsistency.js"), "utf8");
  for (const n of [1, 2, 3, 4]) {
    assert.ok(src.includes(`label: "Level ${n}"`), `Timbre L${n} label should be "Level ${n}"`);
  }
  assert.ok(src.includes('label: "Does not achieve Level 1"'), "Timbre FAIL label should be factual");
});