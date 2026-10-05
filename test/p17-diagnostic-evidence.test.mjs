/**
 * p17-diagnostic-evidence.test.mjs
 * --------------------------------
 * ACCEPTANCE — P17 diagnostics expose the evidence, and only the evidence.
 *
 * These are SOURCE CONTRACTS. The P17 engine, the analysis engine and the panel
 * are imported across boundaries that the local test runtime guards, so the
 * behaviour each file must hold is asserted against its own source — the same
 * pattern the other cross-boundary suites in this folder use.
 *
 *   TEST 1  raw variance, limiting speaker, beyond-limit speakers and the model
 *           coverage limit are exposed on the engine's per-seat result
 *   TEST 2  the analysis engine carries the evidence onto the P17 metric — and
 *           the RP22 coverage cap still grades exactly Level 2
 *   TEST 3  the authority decides cap-versus-variance with the SAME level rule
 *           the engine grades with (levelP17_wsFR + numericRp22Level)
 *   TEST 4  ADI names the limiting seat and speaker, and offers a height action
 *           only for an overhead limiter — never for a bed channel
 *   TEST 5  the panel is mounted in the Room Designer compliance panel
 *   TEST 6  nothing in the diagnostic path writes: reads only, and the panel
 *           and hook reach for filter() alone
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
const ANALYSIS = src("src/components/hooks/useRP22AnalysisEngine.jsx");
const AUTHORITY = src("src/components/utils/rp22/p17SeatEvidenceAuthority.js");
const ADI = src("src/components/adi/designGuidance/p17DiagnosticExplanation.js");
const PANEL = src("src/components/rp22/P17SeatEvidencePanel.jsx");
const SEAT_TABLE = src("src/components/rp22/P17SeatEvidenceTable.jsx");
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

/* TEST 1 — engine exposure (P17 RAW VARIANCE / LIMITING SPEAKER / SEAT ANGLE /
   COVERAGE LIMIT / BEYOND-LIMIT SPEAKERS) */
test("engine exposes raw variance, limiting speaker, beyond-limit set and coverage limit", () => {
  assert.match(ENGINE, /rawVarianceDb:\s*Number\(Math\.max\(0, maxDelta\)\.toFixed\(2\)\)/,
    "per-seat result must expose the unfloored raw variance");
  assert.match(ENGINE, /limiting:\s*limitingEntry/, "per-seat result must expose the limiting speaker entry");
  assert.match(ENGINE, /beyondLimit,/, "per-seat result must expose the beyond-limit speakers");
  assert.match(ENGINE, /coverageLimitDeg:\s*isNum\(limitingEntry\?\.coverageLimitDeg\)/,
    "per-seat result must expose the limiting model's coverage limit");
  assert.match(ENGINE, /limitingEntry = speakerEntry;/, "the limiting entry must be captured where the worst is captured");
  assert.match(ENGINE, /if \(isBeyondNonLcrLimit\) beyondLimit\.push\(speakerEntry\);/,
    "beyond-limit speakers must be collected from the existing flag");
  // Seat + RSP angles and per-speaker loss on the limiting entry.
  assert.match(ENGINE, /rspAngleDeg:\s*isNum\(resultAtRsp\?\.offAxisDeg\)/, "seat and RSP angles must be exposed");
  assert.match(ENGINE, /seatLossDb|lossAtSeat:/, "per-speaker seat/RSP loss must be exposed");
});

/* TEST 2 — analysis engine carries the evidence; grading unchanged */
test("analysis engine carries the evidence and still caps at Level 2", () => {
  for (const field of ["rawVarianceDb", "uncappedLevel", "capApplied", "limiting", "beyondLimit", "coverageLimitDeg"]) {
    assert.ok(ANALYSIS.includes(`${field}:`), `P17 metric must carry ${field}`);
  }
  assert.match(ANALYSIS, /if \(p17Data\.p17HasNaAngles\) \{\s*const cappedLevel17 = Math\.min\(level17, 2\);/,
    "the existing −3 dB coverage cap at Level 2 must be preserved verbatim");
  assert.match(ANALYSIS, /let level17 = uncappedLevel17;/, "grading must still start from the variance-derived level");
});

/* TEST 3 — the authority decides the cause with the engine's own level rule */
test("authority decides cap versus variance using the engine's level authority", () => {
  assert.match(AUTHORITY, /import \{ levelP17_wsFR, numericRp22Level \} from "@\/components\/utils\/rp22\/levels";/,
    "the authority must grade with the same level functions the engine uses");
  assert.match(AUTHORITY, /export const P17_COVERAGE_CAP_LEVEL = 2;/, "the cap constant must be Level 2");
  assert.match(AUTHORITY, /export function resolveP17Cause/, "the cap-versus-variance decision must be a pure authority");
  assert.match(AUTHORITY, /cause: capApplied \? "coverage_cap" : "raw_variance"/,
    "the authority must return one of the two causes");
  assert.match(AUTHORITY, /coverageLimitDeg/, "the authority must carry the coverage limit through");
  assert.match(AUTHORITY, /readModelCoverageLimitDeg/, "the authority must read the model coverage limit");
  assert.match(AUTHORITY, /isOverheadP17Role/, "the authority must distinguish overhead roles");
});

/* TEST 4 — ADI names the cause and never sells a height change that cannot work */
test("ADI names the limiting seat and speaker and gates the height action by role", () => {
  assert.match(ADI, /export function buildP17DiagnosticExplanation/, "ADI must expose a P17 diagnostic explanation");
  assert.match(ADI, /Limiting seat \$\{worst\.seatLabel\}/, "ADI must name the limiting seat");
  assert.match(ADI, /Limiting speaker: \$\{worst\.limitingRole\}/, "ADI must name the limiting speaker");
  assert.match(ADI, /const heightActionable = isOverheadP17Role\(worst\.limitingRole\);/,
    "the height action must be gated on an overhead limiter");
  assert.match(ADI, /Height is not an available fix here: bed-channel P17 is measured on the horizontal plane/,
    "ADI must state plainly that height is not an available fix for a bed channel");
  assert.match(ADI, /the coverage cap on \$\{worst\.limitingRole/, "ADI must attribute the cap to the named speaker");
  assert.match(ADI, /grades \$\{worst\.uncappedLevel\}/, "ADI must state what the variance alone grades");
});

/* TEST 5 — mounted, visible, read-only surfaces */
test("panel is mounted in the compliance panel and renders all three diagnostic surfaces", () => {
  assert.match(COMPLIANCE, /import P17SeatEvidencePanel from "@\/components\/rp22\/P17SeatEvidencePanel";/,
    "the compliance panel must import the P17 panel");
  assert.match(COMPLIANCE, /<P17SeatEvidencePanel engineeringSummary=\{engineeringSummary\} seats=\{seats\} \/>/,
    "the P17 panel must be mounted in the compliance panel");
  assert.match(PANEL, /Current design — per-seat P17 evidence/, "the per-seat evidence surface must be present");
  assert.match(PANEL, /Saved versions — Level 1 vs Level 4 P17 diagnostic/, "the saved-version comparison surface must be present");
  assert.match(PANEL, /read only/, "the panel must be labelled read-only");
  assert.match(PANEL, /No value recalculated and no record changed/, "the panel must state that it neither recalculates nor writes");
  // The required comparison columns.
  for (const column of ["Version", "Seat", "P17 level", "Raw var dB", "Coverage cap?", "Limiting role", "Coverage limit", "Cause"]) {
    assert.ok(VERSION_TABLE.includes(`"${column}"`), `the comparison table must carry the ${column} column`);
  }
  for (const column of ["Raw var dB", "Seat ∠", "RSP ∠", "Cov. limit"]) {
    assert.ok(SEAT_TABLE.includes(`"${column}"`), `the seat table must carry the ${column} column`);
  }
});

/* TEST 6 — read-only: no writes anywhere on the diagnostic path */
test("the diagnostic path performs no writes", () => {
  for (const [file, source] of [["hook", HOOK], ["panel", PANEL], ["authority", AUTHORITY], ["adi", ADI]]) {
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