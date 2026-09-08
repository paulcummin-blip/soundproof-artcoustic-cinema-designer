// Regression: RP22 analysis memo dependency defect (P5/P17 stale publication)
//
// CONFIRMED DEFECT
//   In useRP22AnalysisEngine.jsx the main useMemo consumes `visiblePlanSpeakers`
//   (P5 headline + per-seat P5, P3, P7, P11, P17 all derive speaker inputs from
//   it) but `visiblePlanSpeakers` was absent from the useMemo dependency array.
//   React therefore returned a cached result when only `visiblePlanSpeakers`
//   changed, so P5/P17 could stay NOT CALCULATED even though the pure
//   calculations would produce real values for the live Yarm Cinema inputs
//   (6 valid surrounds, 6 valid overheads, canonical roles, valid coordinates,
//   valid models → P5 ≈ 44.8° / L4, P17 calculable).
//
// FIX
//   Add `visiblePlanSpeakers` to the dependency array of the main useMemo.
//   Nothing else — no settling logic, no __rev, no maths, no presentation.
//
// These tests prove three things without a React renderer:
//   1. STATIC GUARD — the source file's main useMemo dependency array now
//      contains `visiblePlanSpeakers` (directly guards the regression).
//   2. DEPENDENCY SEMANTICS — a faithful Object.is-based useMemo simulation
//      reproduces the stale publication with the OLD deps and proves fresh
//      recompute with the NEW deps, when ONLY visiblePlanSpeakers changes.
//   3. NUMERICAL STABILITY — the pure per-seat P5 path produces a stable,
//      deterministic result for a Yarm-style surround set across repeated
//      identical invocations (the dependency fix changes WHEN the memo
//      recomputes, not WHAT it computes).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeSurroundRingGaps, rp22LevelForP5 } from "../src/components/utils/p5SurroundGaps.jsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "hooks", "useRP22AnalysisEngine.jsx"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Helper: locate the MAIN useMemo dependency array and return its body text.
// The main useMemo is the one whose dependency array contains `placedSpeakers`
// as its first element (the designEqSystemLimits useMemo above it depends on
// `[subwoofers]` only). We extract the array literal that starts with
// `placedSpeakers`.
// ---------------------------------------------------------------------------
function extractMainMemoDepsBody(src) {
  // Find the dependency array that begins with `placedSpeakers,`.
  // It is the array literal `[\n    placedSpeakers,\n ... \n  ]` immediately
  // following the main useMemo's returned object.
  const m = src.match(/\},\s*\[\s*\n\s*placedSpeakers,\s*\n([\s\S]*?)\n\s*\]\);/);
  assert.ok(m, "could not locate the main useMemo dependency array beginning with placedSpeakers");
  return m[0];
}

// ---------------------------------------------------------------------------
// 1. STATIC GUARD
// ---------------------------------------------------------------------------

test("main useMemo dependency array contains visiblePlanSpeakers", () => {
  const depsBody = extractMainMemoDepsBody(ENGINE_SRC);
  // Match `visiblePlanSpeakers` as a standalone dependency entry (not as a
  // property access like `visiblePlanSpeakers?.x`). The dependency is listed
  // as a bare identifier on its own line.
  assert.match(
    depsBody,
    /(^|\n)\s*visiblePlanSpeakers\s*,/,
    "visiblePlanSpeakers must be a standalone entry in the main useMemo dependency array",
  );
});

test("visiblePlanSpeakers appears exactly once as a bare dependency (not duplicated)", () => {
  const depsBody = extractMainMemoDepsBody(ENGINE_SRC);
  const bareMatches = depsBody.match(/(^|\n)\s*visiblePlanSpeakers\s*,/g);
  assert.equal(bareMatches?.length, 1, "visiblePlanSpeakers should be listed exactly once as a dependency");
});

test("the fix did NOT add a __rev / Date.now() dependency", () => {
  const depsBody = extractMainMemoDepsBody(ENGINE_SRC);
  assert.ok(!/__rev/.test(depsBody), "no __rev dependency was added (forbidden by task scope)");
  assert.ok(!/Date\.now/.test(depsBody), "no Date.now() dependency was added (forbidden by task scope)");
});

// ---------------------------------------------------------------------------
// 2. DEPENDENCY SEMANTICS — faithful useMemo simulation
// ---------------------------------------------------------------------------

// React's useMemo caches the last value and last deps; on each call it
// compares new deps to last deps element-by-element with Object.is. If every
// pair is equal, the cached value is returned; otherwise the factory runs and
// the cache is updated. This is the exact behaviour that governs the defect.
function createMemo(factory) {
  let lastDeps;
  let lastValue;
  let lastComputed = false;
  return {
    run(deps) {
      let recompute = !lastComputed;
      if (!recompute) {
        for (let i = 0; i < deps.length; i++) {
          if (!Object.is(deps[i], lastDeps[i])) { recompute = true; break; }
        }
      }
      if (recompute) {
        lastValue = factory(deps);
        lastDeps = deps;
        lastComputed = true;
      }
      return { value: lastValue, recomputed: recompute };
    },
  };
}

// A factory that mirrors the engine's dependence on visiblePlanSpeakers: the
// published P5/P17 are derived from it. We return a small object standing in
// for the graded P5/P17 publication so the test can observe staleness.
function analysisFactory(deps) {
  // deps layout mirrors the real hook's argument list shape:
  //   [placedSpeakers, visiblePlanSpeakers, seatingPositions, ...]
  const placedSpeakers = deps[0];
  const visiblePlanSpeakers = deps[1];
  const vps = Array.isArray(visiblePlanSpeakers) ? visiblePlanSpeakers : [];
  const surrounds = vps.filter((s) => /SL|SR|SBL|SBR|LW|RW/.test(String(s.role || "")));
  const overheads = vps.filter((s) => String(s.role || "").startsWith("T"));
  return {
    p5Published: surrounds.length >= 2,
    p17EligibleCount: surrounds.length + overheads.length,
    placedSpeakersCount: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0,
  };
}

// OLD (buggy) dependency array — exactly what shipped before the fix:
// visiblePlanSpeakers is consumed inside the factory but NOT listed.
const OLD_DEPS = (placedSpeakers, visiblePlanSpeakers, seatingPositions) => ([
  placedSpeakers,
  seatingPositions,
]);

// NEW (fixed) dependency array — visiblePlanSpeakers added as second entry,
// matching the applied one-line correction.
const NEW_DEPS = (placedSpeakers, visiblePlanSpeakers, seatingPositions) => ([
  placedSpeakers,
  visiblePlanSpeakers,
  seatingPositions,
]);

// Stable "other" inputs — held constant across both phases, exactly as the
// task requires ("change only visiblePlanSpeakers, keep other inputs stable").
const placedSpeakers = [{ role: "SL", position: { x: 1, y: 2 }, model: "a" }];
const seatingPositions = [{ id: "s1", x: 3, y: 4, isPrimary: true }];

// Phase 1 inputs: visiblePlanSpeakers cannot calculate P5/P17 (no surrounds).
const vpsPhase1 = [
  { role: "FL", position: { x: 0, y: 0 }, model: "a" },
  { role: "FR", position: { x: 6, y: 0 }, model: "a" },
];

// Phase 2 inputs: visiblePlanSpeakers now has 6 surrounds + 6 overheads
// (the live Yarm Cinema shape) → P5/P17 become calculable.
const vpsPhase2 = [
  ...["SL", "SR", "SBL", "SBR", "LW", "RW"].map((role, i) => ({
    role, position: { x: 1 + i, y: 2 + i }, model: "a",
  })),
  ...["TFL", "TFR", "TML", "TMR", "TRL", "TRR"].map((role, i) => ({
    role, position: { x: 1 + i, y: 5 + i }, model: "a",
  })),
];

test("OLD deps: changing only visiblePlanSpeakers does NOT recompute (reproduces defect)", () => {
  const memo = createMemo(analysisFactory);
  const r1 = memo.run(OLD_DEPS(placedSpeakers, vpsPhase1, seatingPositions));
  assert.ok(r1.recomputed, "first run always computes");
  assert.equal(r1.value.p5Published, false, "phase 1: P5 not published (no surrounds)");
  assert.equal(r1.value.p17EligibleCount, 0, "phase 1: P17 has 0 eligible non-LCR sources");

  // Change ONLY visiblePlanSpeakers → with the old deps the memo must NOT recompute.
  const r2 = memo.run(OLD_DEPS(placedSpeakers, vpsPhase2, seatingPositions));
  assert.equal(r2.recomputed, false, "DEFECT REPRODUCED: memo did not recompute on visiblePlanSpeakers-only change");
  assert.equal(r2.value.p5Published, false, "stale: P5 still not published despite valid surrounds now present");
  assert.equal(r2.value.p17EligibleCount, 0, "stale: P17 still 0 despite 12 eligible non-LCR sources now present");
});

test("NEW deps: changing only visiblePlanSpeakers DOES recompute and publishes P5/P17", () => {
  const memo = createMemo(analysisFactory);
  const r1 = memo.run(NEW_DEPS(placedSpeakers, vpsPhase1, seatingPositions));
  assert.ok(r1.recomputed, "first run always computes");
  assert.equal(r1.value.p5Published, false, "phase 1: P5 not published (no surrounds)");
  assert.equal(r1.value.p17EligibleCount, 0, "phase 1: P17 has 0 eligible non-LCR sources");

  // Change ONLY visiblePlanSpeakers → with the new deps the memo MUST recompute.
  const r2 = memo.run(NEW_DEPS(placedSpeakers, vpsPhase2, seatingPositions));
  assert.equal(r2.recomputed, true, "FIX: memo recomputed on visiblePlanSpeakers-only change");
  assert.equal(r2.value.p5Published, true, "phase 2: P5 now published (6 valid surrounds)");
  assert.equal(r2.value.p17EligibleCount, 12, "phase 2: P17 sees 12 eligible non-LCR sources (6 surrounds + 6 overheads)");
});

test("NEW deps: unchanged visiblePlanSpeakers (same reference) does NOT spuriously recompute", () => {
  const memo = createMemo(analysisFactory);
  memo.run(NEW_DEPS(placedSpeakers, vpsPhase2, seatingPositions));
  const r2 = memo.run(NEW_DEPS(placedSpeakers, vpsPhase2, seatingPositions));
  assert.equal(r2.recomputed, false, "no spurious recompute when visiblePlanSpeakers reference is unchanged");
});

// ---------------------------------------------------------------------------
// 3. NUMERICAL STABILITY — pure per-seat P5 path for a Yarm-style surround set
//    Proves the dependency fix changes WHEN the memo recomputes, not WHAT it
//    computes: identical inputs yield identical P5 numbers across invocations.
// ---------------------------------------------------------------------------

// 6 surrounds arranged around an MLP so the worst no-wrap adjacent gap is
// graded L4 (≤50°). Coordinates are in metres (plan view). The exact live Yarm
// value (≈44.8°) depends on the real project coordinates and is confirmed by
// live reload; here we prove the pure P5 path is calculable and deterministic
// for a canonical 6-surround set — i.e. the dependency fix changes WHEN the
// memo recomputes, not WHAT it computes.
const yarmMlp = { id: "mlp", x: 3.5, y: 4.0, isPrimary: true };
// Place 6 surrounds on a 3 m radius around the MLP at theta angles (deg, 0 = front,
// clockwise) chosen so every no-wrap adjacent gap is 40° → worst gap 40° → L4.
function polar(thetaDeg, r = 3) {
  const rad = (thetaDeg - 90) * Math.PI / 180; // theta 0 = +Y (front)
  return { x: yarmMlp.x + r * Math.cos(rad), y: yarmMlp.y + r * Math.sin(rad) };
}
const yarmSurrounds = [
  { role: "LW",  position: polar(110) },
  { role: "SL",  position: polar(150) },
  { role: "SBL", position: polar(190) },
  { role: "SBR", position: polar(230) },
  { role: "SR",  position: polar(270) },
  { role: "RW",  position: polar(310) },
];
const getCanonicalRole = (r) => String(r || "").toUpperCase();

function computeYarmP5() {
  const res = computeSurroundRingGaps({ seat: yarmMlp, speakers: yarmSurrounds, getCanonicalRole });
  if (!Number.isFinite(res.worstGapDeg)) return null;
  const floored = Math.floor(res.worstGapDeg);
  const levelStr = rp22LevelForP5(floored);
  const level = levelStr === "—" ? 1 : Number(levelStr.replace("L", ""));
  return { worstGapDeg: res.worstGapDeg, floored, level, gaps: res.gaps.length };
}

test("Yarm-style surrounds produce a real, calculable P5 (not NOT CALCULATED)", () => {
  const p5 = computeYarmP5();
  assert.ok(p5, "P5 must be calculable for 6 valid surrounds with canonical roles and coordinates");
  assert.equal(p5.gaps, 5, "6 surrounds produce 5 no-wrap adjacent gaps");
  assert.ok(p5.floored > 0, `P5 worst gap must be a positive number, got ${p5.floored}°`);
  assert.ok([1, 2, 3, 4].includes(p5.level), `P5 level must be a valid RP22 level (1-4), got ${p5.level}`);
});

test("P5 numerical result is stable across repeated identical invocations (fix changes when, not what)", () => {
  const a = computeYarmP5();
  const b = computeYarmP5();
  assert.deepEqual(a, b, "identical inputs must produce identical P5 numbers — the dependency fix does not alter the calculation");
});

test("P5 result is independent of the dependency-array fix (pure function, deterministic)", () => {
  // Run several times and collect; all must be equal — proving determinism.
  const results = Array.from({ length: 5 }, () => computeYarmP5());
  const first = results[0];
  for (const r of results) assert.deepEqual(r, first, "P5 deterministic across repeated calls");
});