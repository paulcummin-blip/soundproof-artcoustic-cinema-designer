// project-report-overheads-p10.test.mjs
// Validates the System & Products overheads row now carries the published
// P10 (Upper Speaker SPL Difference) result, driven ONLY by the existing
// authoritative published-parameter reader — never by channel configuration.
//
// Rules verified:
//   - P10 applicable + assessed (L1–L4) → RP22 P10 + coloured level pill +
//     short engineering description with the stated value.
//   - P10 applicable + genuine FAIL → the actual FAIL level is shown.
//   - P10 NOT applicable (no height layer, or only one overhead row e.g. a .2
//     layout → published level "N/A") → the existing descriptive system-role
//     statement is retained; no N/A, FAIL, "missing data" or "not assessed"
//     is shown for a parameter that does not apply.
//   - P10 applicable but not yet assessed (no terminal result published) →
//     descriptive fallback; no result is invented.
//   - No overhead speakers specified (5.1 / 7.1) → the Overheads row is omitted
//     entirely.
//   - Other roles' connections are unchanged.
//
// Run: node --import ./test/_mount-loader.mjs test/project-report-overheads-p10.test.mjs

import assert from "node:assert/strict";
import { buildSpecificationConnections } from "../src/components/report/projectReport/adiDesignHighlights.js";

const overheadsProducts = { rows: [{ key: "overheads", value: "SP-1 On-Wall × 4", area: "Overheads" }] };

const summaryWithP10 = (p10Entry) => ({
  parameter_index: p10Entry ? { P10: p10Entry } : {},
});

// ── 1. P10 applicable + assessed (L2) → RP22 P10 result line ────────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: overheadsProducts,
    engineeringSummary: summaryWithP10({ level: "L2", formatted: "1.5 dB" }),
    dolbyConfig: "7.1.4",
  });
  assert.equal(conns.overheads.length, 1, "one connection line for overheads");
  const line = conns.overheads[0];
  assert.equal(line.parameter, "RP22 P10", "parameter labelled RP22 P10");
  assert.equal(line.level, "L2", "published level carried to the pill");
  assert.ok(/overhead speaker level matching/i.test(line.text), "engineering description present");
  assert.ok(/1\.5 dB/.test(line.text), "stated value included in the description");
  console.log("✓ P10 assessed → RP22 P10 + level pill + engineering description");
}

// ── 2. P10 applicable + genuine FAIL → actual FAIL shown ───────────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: overheadsProducts,
    engineeringSummary: summaryWithP10({ level: "FAIL", formatted: "6.0 dB" }),
    dolbyConfig: "7.1.4",
  });
  assert.equal(conns.overheads[0].parameter, "RP22 P10");
  assert.equal(conns.overheads[0].level, "FAIL", "actual FAIL level shown");
  console.log("✓ P10 genuine FAIL → actual FAIL shown, not hidden");
}

// ── 3. P10 NOT applicable (single overhead row / .2 layout) → descriptive ──
{
  const conns = buildSpecificationConnections({
    productsSelected: overheadsProducts,
    engineeringSummary: summaryWithP10({ level: "N/A", formatted: "N/A", applicable: false }),
    dolbyConfig: "5.1.2",
  });
  const line = conns.overheads[0];
  assert.equal(line.parameter, null, "no RP22 parameter when P10 not applicable");
  assert.equal(line.level, null, "no level when P10 not applicable");
  assert.ok(/overhead layer/i.test(line.text), "descriptive system-role statement retained");
  assert.ok(/5\.1\.2/.test(line.text), "dolby config named in the fallback");
  assert.ok(!/N\/A|FAIL|not assessed/i.test(line.text), "no N/A / FAIL / not-assessed wording");
  console.log("✓ P10 not applicable (single row) → descriptive fallback, no N/A/FAIL");
}

// ── 4. P10 applicable but not yet assessed → descriptive fallback ──────────
{
  const conns = buildSpecificationConnections({
    productsSelected: overheadsProducts,
    engineeringSummary: summaryWithP10(null),
    dolbyConfig: "7.1.4",
  });
  const line = conns.overheads[0];
  assert.equal(line.parameter, null, "no RP22 parameter when P10 unassessed");
  assert.equal(line.level, null, "no level when P10 unassessed");
  assert.ok(/overhead layer/i.test(line.text), "descriptive fallback retained");
  console.log("✓ P10 not yet assessed → descriptive fallback, no invented result");
}

// ── 5. P10 published as a neutral dash → descriptive fallback ─────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: overheadsProducts,
    engineeringSummary: summaryWithP10({ level: "—", formatted: "—" }),
    dolbyConfig: "7.1.4",
  });
  assert.equal(conns.overheads[0].parameter, null, "neutral dash → no RP22 parameter");
  assert.equal(conns.overheads[0].level, null, "neutral dash → no level");
  console.log("✓ P10 neutral dash → descriptive fallback");
}

// ── 6. No overheads specified (5.1 / 7.1) → row omitted entirely ───────────
{
  const conns = buildSpecificationConnections({
    productsSelected: { rows: [] },
    engineeringSummary: summaryWithP10({ level: "L2", formatted: "1.5 dB" }),
    dolbyConfig: "5.1",
  });
  assert.deepEqual(conns.overheads, [], "no overheads specified → no connection");
  console.log("✓ no overheads specified → Overheads row omitted");
}

// ── 7. Other roles' connections unchanged ──────────────────────────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: { rows: [{ key: "lcr", value: "SP-2-8 × 3", area: "LCR" }] },
    engineeringSummary: { parameter_index: { P12: { level: "L4", formatted: "105 dB" } } },
    dolbyConfig: "5.1",
  });
  assert.equal(conns.lcr.length, 1, "lcr connection still built");
  assert.deepEqual(conns.overheads, [], "overheads still omitted without overhead products");
  console.log("✓ other roles' connections unchanged");
}

console.log("\nAll Project Report overheads P10 tests passed.");