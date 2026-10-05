/**
 * p17-diagnostic-evidence.test.mjs
 * --------------------------------
 * ACCEPTANCE — P17 IS A DESIGN GUIDE BASED ON OFF-AXIS SUITABILITY.
 *
 * These are SOURCE CONTRACTS. The P17 engine, the analysis engine and the panel
 * are imported across boundaries that the local test runtime guards, so the
 * behaviour each file must hold is asserted against its own source — the same
 * pattern the other cross-boundary suites in this folder use.
 *
 *   TEST 1  the engine grades from coverage windows and keeps the raw polar delta
 *           as read-only diagnostics
 *   TEST 2  the windows are derived from measured polar data and graded by angle
 *   TEST 3  the analysis engine carries the window grade — no raw deviation score,
 *           no separate coverage cap
 *   TEST 4  the authority exposes the design-guide basis and still reads legacy
 *           saved evidence in its own terms
 *   TEST 5  ADI names the limiting seat and speaker, states the window, and offers
 *           a height action only for an overhead limiter — never for a bed channel
 *   TEST 6  the design rating reads the window grade, L1 included, with no FAIL
 *   TEST 7  the ADI Data surfaces show the effective angle, L4 / L3 / L2 windows,
 *           cause and evidence type
 *   TEST 8  nothing in the diagnostic path writes: reads only
 *
 * Run: node test/p17-diagnostic-evidence.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");

const ENGINE = src("src/components/utils/rp22HfOffAxis.jsx");
const WINDOWS = src("src/components/utils/rp22/p17CoverageWindows.js");
const ANALYSIS = src("src/components/hooks/useRP22AnalysisEngine.jsx");
const AUTHORITY = src("src/components/utils/rp22/p17SeatEvidenceAuthority.js");
const ADI = src("src/components/adi/designGuidance/p17DiagnosticExplanation.js");
const RATING = src("src/components/report/technical/artcousticSystemDesignRating.js");
const PANEL = src("src/components/rp22/P17SeatEvidencePanel.jsx");
const SEAT_TABLE = src("src/components/rp22/P17SeatEvidenceTable.jsx");
const SPEAKER_TABLE = src("src/components/rp22/P17SpeakerBreakdownTable.jsx");
const VERSION_TABLE = src("src/components/rp22/P17VersionComparisonTable.jsx");
const HOOK = src("src/components/hooks/useP17SavedVersionComparison.jsx");
const COMPLIANCE = src("src/components/rp22/RP22CompliancePanel.jsx");

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

/* TEST 1 — the engine grades by coverage window; the polar delta is diagnostic */
test("engine grades the seat from coverage windows and keeps the raw delta as a diagnostic", () => {
  assert.match(ENGINE, /import \{ resolveP17Windows, gradeOffAxisAngle \} from "@\/components\/utils\/rp22\/p17CoverageWindows";/,
    "the engine must grade through the coverage-window authority");
  assert.match(ENGINE, /function gradeSpeakerCoverage\(\{ role, modelKey, modelMeta, offAxisDeg \}\)/,
    "the engine must resolve one speaker's windows and grade its angle");
  const calls = ENGINE.match(/gradeSpeakerCoverage\(/g) || [];
  assert.equal(calls.length, 4,
    "every speaker path (measured polars, estimated overheads, bed layer) must grade through the coverage windows");

  // The graded value is the window the seat sits in, never a raw polar deviation.
  assert.match(ENGINE, /p17Db: worstLossDb,/, "the seat's P17 value must be the deciding coverage window");
  assert.match(ENGINE, /windowLevel: `L\$\{bestLevelNumber\}`,/, "the seat must carry the window grade");
  assert.match(ENGINE, /!worstRole \|\| !isNum\(bestLevelNumber\) \|\| bestLevelNumber === -Infinity/,
    "a seat with no graded channel must report unavailable rather than a grade");
  assert.match(ENGINE, /windows: worstWindows,/, "the deciding channel's windows must be carried");

  // The raw measured delta survives, read-only.
  assert.match(ENGINE, /rawVarianceDb: maxDelta === -Infinity \? null : Number\(Math\.max\(0, maxDelta\)\.toFixed\(2\)\),/,
    "the unfloored seat-versus-RSP delta must survive as a diagnostic");
  assert.match(ENGINE, /limiting: limitingEntry,/, "the worst-delta speaker entry must still be exposed");
  assert.match(ENGINE, /if \(isBeyondNonLcrLimit\) beyondLimit\.push\(speakerEntry\);/,
    "beyond-limit speakers must still be collected");
  // The best-covered channel decides the grade (an away-pointing speaker cannot).
  assert.match(ENGINE, /const isBetterLevel = levelNumber > bestLevelNumber/,
    "the seat must be graded by the channel that covers it best");
});

/* TEST 2 — the windows are a design guide derived from measured polars */
test("coverage windows are derived from measured polar data and graded by angle", () => {
  assert.match(WINDOWS, /export const P17_WINDOW_LEVEL_DB = \{ 4: 1\.5, 3: 3\.0, 2: 4\.0 \};/,
    "the windows must be the 1.5 / 3 / 4 dB design guide");
  assert.match(WINDOWS, /const l4Deg = crossingAngle\(envelope, 1\.5\);/,
    "the 1.5 dB window must be derived from the measured curve");
  assert.match(WINDOWS, /const l3Deg = crossingAngle\(envelope, 3\);/,
    "the 3 dB window must be derived from the measured curve");
  assert.match(WINDOWS, /const l2Deg = crossingAngle\(envelope, 4\);/,
    "the 4 dB window must be derived from the measured curve");
  assert.match(WINDOWS, /evidenceType: P17_EVIDENCE_TYPE\.MEASURED,/,
    "measured-derived windows must be labelled as such");
  assert.match(WINDOWS, /const windows = deriveMeasuredWindows\(meta\?\.polarModel\) \|\| estimatedWindows\(meta, \{ overhead \}\);/,
    "measured polar data must be used to derive the windows, with a declared/estimated fallback");
  assert.match(WINDOWS, /if \(angle <= windows\.l4Deg\) levelNumber = 4;/,
    "grading must be by angle against the 1.5 dB window");
  assert.match(WINDOWS, /else if \(angle <= windows\.l3Deg\) levelNumber = 3;/,
    "grading must be by angle against the 3 dB window");
  assert.match(WINDOWS, /else if \(angle <= windows\.l2Deg\) levelNumber = 2;/,
    "grading must be by angle against the usable 4 dB window");
  assert.match(WINDOWS, /usableDb: 4\.0,/, "the usable design limit must be 4 dB");

  // Raw polar deviation must never become the seat's P17 score.
  assert.doesNotMatch(WINDOWS, /p17Db/, "the windows module must never produce a seat P17 dB score");
});

/* TEST 3 — the analysis engine carries the window grade */
test("analysis engine grades from the coverage window, with no raw-deviation score and no cap", () => {
  for (const field of ["windows", "evidenceType", "cause", "limiting", "beyondLimit", "coverageLimitDeg", "rawVarianceDb"]) {
    assert.ok(ANALYSIS.includes(`${field}:`), `P17 metric must carry ${field}`);
  }
  assert.match(ANALYSIS, /const level17 = \/\^L\[1-4\]\$\/\.test\(String\(p17Data\.windowLevel \|\| ""\)\) \? p17Data\.windowLevel : null;/,
    "the P17 level must be the engine's coverage-window grade, passed through verbatim");
  assert.match(ANALYSIS, /formatted: formatP17WindowResult\(level17\),/,
    "the displayed value must be the window, not a raw deviation");
  assert.match(ANALYSIS, /capApplied: false,/, "the old −3 dB coverage cap must no longer apply");
  assert.match(ANALYSIS, /windows: null,\s*evidenceType: "missing",\s*cause: "missing_evidence",/,
    "a seat with no evidence must be labelled, not graded");
  assert.doesNotMatch(ANALYSIS, /levelP17_wsFR/,
    "raw measured deviation must no longer derive a P17 grade");
});

/* TEST 4 — the authority exposes the design-guide basis, read-only */
test("the authority exposes the design-guide basis and reads legacy evidence in its own terms", () => {
  assert.match(AUTHORITY, /import \{\s*P17_EVIDENCE_TYPE,\s*P17_WINDOW_CAUSE_LABEL,\s*resolveP17Windows,\s*\} from "@\/components\/utils\/rp22\/p17CoverageWindows";/,
    "the authority must read the coverage-window authority");
  assert.match(AUTHORITY, /function resolveRowBasis/, "the row basis must be a pure reader");
  assert.match(AUTHORITY, /function resolveRowWindows/, "the row windows must be resolved, never invented");
  assert.match(AUTHORITY, /basis: "coverage_window",/, "a window-graded row must be labelled as such");
  assert.match(AUTHORITY, /basis: "earlier_variance_basis",/,
    "a saved row from before the design guide must keep its own basis instead of being re-graded");
  assert.match(AUTHORITY, /windowLevel: grade\.windowLevel,/, "the row must carry the window grade");
  assert.match(AUTHORITY, /windowCause: grade\.windowCause,/, "the row must carry the window cause");
  assert.match(AUTHORITY, /effectiveAngleDeg,/, "the row must carry the effective off-axis angle");
  assert.match(AUTHORITY, /export function applySavedSpeakerModels/, "saved rows must read the model windows");
  // The pre-design-guide rule is retained, explicitly labelled legacy.
  assert.match(AUTHORITY, /LEGACY \(read-only\)/, "the variance-versus-cap rule must be marked legacy");
  assert.match(AUTHORITY, /export const P17_COVERAGE_CAP_LEVEL = 2;/);
  assert.match(AUTHORITY, /coverageLimitDeg/, "the authority must carry the −3 dB window through");
  assert.match(AUTHORITY, /isOverheadP17Role/, "the authority must distinguish overhead roles");
});

/* TEST 5 — ADI explains the coverage window and gates the height action */
test("ADI names the limiting seat and speaker, states the window, and gates the height action", () => {
  assert.match(ADI, /export function buildP17DiagnosticExplanation/, "ADI must expose a P17 diagnostic explanation");
  assert.match(ADI, /function headlineFor\(worst\)/, "ADI must headline the limiting seat's grade");
  assert.match(ADI, /P17 L4: \$\{worst\.seatLabel\} is within \$\{role\}'s 1\.5 dB off-axis window/,
    "ADI must state the 1.5 dB window result for the limiting seat");
  assert.match(ADI, /Limiting speaker: \$\{worst\.limitingRole\}/, "ADI must name the limiting speaker");
  assert.match(ADI, /function windowPhrase\(windows\)/, "ADI must state the model's L4 / L3 / L2 windows");
  assert.match(ADI, /derived from this model's measured polar data/,
    "ADI must state when the windows are measured-derived");
  assert.match(ADI, /Under 4 dB is not a failure\./,
    "ADI must state plainly that under 4 dB is not a failure");
  assert.match(ADI, /const heightActionable = isOverheadP17Role\(worst\.limitingRole\);/,
    "the height action must be gated on an overhead limiter");
  assert.match(ADI, /Height is not an available fix here: bed-channel P17 is measured on the horizontal plane/,
    "ADI must state plainly that height is not an available fix for a bed channel");
  assert.match(ADI, /is outside \$\{role\}'s usable coverage/,
    "ADI must say what to move or re-aim when a seat is outside coverage");
});

/* TEST 6 — the design rating reads the window grade, L1 included */
test("the design rating reads the coverage-window grade, with L1 instead of FAIL", () => {
  assert.match(RATING, /function scoreP17\(rawValue\)/, "the rating must score P17 from the window value");
  assert.match(RATING, /return \{ level: "L1" \};/,
    "a seat outside the usable window must score L1, never FAIL");
  assert.match(RATING, /if \(value <= 1\.5\) return \{ level: "L4" \};/,
    "the 1.5 dB window must score L4");
  assert.doesNotMatch(RATING, /levelP17_wsFR/,
    "the rating must not re-derive a grade from a raw deviation");
});

/* TEST 7 — the ADI Data surfaces show the design-guide basis */
test("the ADI Data surfaces show the effective angle, windows, cause and evidence type", () => {
  assert.match(COMPLIANCE, /import P17SeatEvidencePanel from "@\/components\/rp22\/P17SeatEvidencePanel";/,
    "the compliance panel must import the P17 panel");
  assert.match(COMPLIANCE, /<P17SeatEvidencePanel engineeringSummary=\{engineeringSummary\} seats=\{seats\} \/>/,
    "the P17 panel must be mounted in the compliance panel");
  assert.match(PANEL, /Current design — one limiting row per seat/, "the per-seat evidence surface must be present");
  assert.match(PANEL, /Saved versions — Level 1 vs Level 4 P17 diagnostic/, "the saved-version comparison surface must be present");
  assert.match(PANEL, /read only/, "the panel must be labelled read-only");
  assert.match(PANEL, /No value recalculated and no record changed/, "the panel must state that it neither recalculates nor writes");

  for (const column of ["Effective off-axis angle", "L4 window", "L3 window", "L2 / usable window", "Cause", "Evidence type"]) {
    assert.ok(SEAT_TABLE.includes(`"${column}"`), `the seat table must carry the ${column} column`);
  }
  assert.doesNotMatch(SEAT_TABLE, /"Raw variance"/,
    "the raw polar loss must not be a primary column");
  for (const column of ["Level", "L4 / L3 / L2 windows", "Raw Δ (diagnostic)"]) {
    assert.ok(SPEAKER_TABLE.includes(`"${column}"`), `the per-speaker table must carry the ${column} column`);
  }
  for (const column of ["Basis", "Effective off-axis angle", "L4 window", "Evidence type"]) {
    assert.ok(VERSION_TABLE.includes(`"${column}"`), `the comparison table must carry the ${column} column`);
  }
  assert.ok(SEAT_TABLE.includes("measured-derived") === false,
    "the evidence type is read from evidence, never hard-coded in the table");
});

/* TEST 8 — read-only: no writes anywhere on the diagnostic path */
test("the diagnostic path performs no writes", () => {
  for (const [file, source] of [["hook", HOOK], ["panel", PANEL], ["authority", AUTHORITY], ["adi", ADI], ["windows", WINDOWS]]) {
    assert.doesNotMatch(source, /\.(create|bulkCreate|update|bulkUpdate|updateMany|delete|deleteMany|upsert)\(/,
      `${file} must not write`);
  }
  assert.match(HOOK, /base44\.entities\.ProjectVersion\.filter\(/, "the hook must read saved versions with filter()");
  assert.match(HOOK, /base44\.entities\.ProjectAnalysisCache\.filter\(/, "the hook must read published evidence with filter()");
  assert.match(HOOK, /status: "no_version"/, "a missing version must be reported as unavailable");
  assert.match(HOOK, /status: "no_evidence"/, "missing evidence must be reported as unavailable");
  assert.match(VERSION_TABLE, /reported as unavailable rather than recomputed/, "unavailable evidence must be labelled, not generated");
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASSED`);
if (failed.length) process.exitCode = 1;