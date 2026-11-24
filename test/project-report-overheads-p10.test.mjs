// project-report-overheads-p10.test.mjs
// Validates the System & Products overheads row now carries the published
// P10 (Upper Speaker SPL Difference) result for the PRIMARY seating, with the
// canonical connectionLine shape the schedule renders as the RP22 number +
// coloured level pill + engineering description.
//
// Rules verified:
//   - When P10 primary seating is assessed, overheads = one connectionLine with
//     parameter 'RP22 P10', the published level, and a description that names
//     the primary seating scope.
//   - When P10 is not assessed (no primary scope / neutral level), the row
//     keeps the existing descriptive system-role statement (no invented level).
//   - The descriptive fallback still names the overhead layer's system role.
//
// Run: node --import ./test/_mount-loader.mjs test/project-report-overheads-p10.test.mjs

import assert from "node:assert/strict";
import { buildSpecificationConnections } from "../src/components/report/projectReport/adiDesignHighlights.js";

const productsSelected = (overheadValue) => ({
  rows: [
    { key: "overheads", value: overheadValue, area: "Overheads" },
  ],
});

const engineeringSummaryWithP10 = (primaryLevel, primaryValue) => ({
  parameter_index: {
    P10: {
      scopes: {
        primary: primaryLevel
          ? { level: primaryLevel, value: primaryValue ?? "1.5 dB", scope: "primary" }
          : null,
      },
    },
  },
});

// ── 1. P10 assessed at primary seating → RP22 P10 result line ──────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: productsSelected("SP-1 On-Wall × 4"),
    engineeringSummary: engineeringSummaryWithP10("L2", "1.5 dB"),
    dolbyConfig: "7.1.4",
  });
  assert.equal(conns.overheads.length, 1, "one connection line for overheads");
  const line = conns.overheads[0];
  assert.equal(line.parameter, "RP22 P10", "parameter labelled RP22 P10");
  assert.equal(line.level, "L2", "published primary level carried to the pill");
  assert.ok(/primary seating/i.test(line.text), "description preserves primary seating scope");
  assert.ok(/1\.5 dB/.test(line.text), "published value stated in the description");
  assert.ok(/overhead speaker level matching/i.test(line.text), "engineering description present");
  console.log("✓ P10 assessed → RP22 P10 + level pill + primary-seating description");
}

// ── 2. P10 FAIL at primary seating → FAIL pill (actual result, not hidden) ─
{
  const conns = buildSpecificationConnections({
    productsSelected: productsSelected("SP-1 On-Wall × 4"),
    engineeringSummary: engineeringSummaryWithP10("FAIL", "6.0 dB"),
    dolbyConfig: "7.1.4",
  });
  assert.equal(conns.overheads[0].parameter, "RP22 P10");
  assert.equal(conns.overheads[0].level, "FAIL", "FAIL published as the actual result");
  console.log("✓ P10 FAIL → actual FAIL level shown, not invented or hidden");
}

// ── 3. P10 not assessed → descriptive fallback, no invented level ─────────
{
  const conns = buildSpecificationConnections({
    productsSelected: productsSelected("SP-1 On-Wall × 4"),
    engineeringSummary: engineeringSummaryWithP10(null),
    dolbyConfig: "7.1.4",
  });
  const line = conns.overheads[0];
  assert.equal(line.parameter, null, "no RP22 parameter when P10 unassessed");
  assert.equal(line.level, null, "no level when P10 unassessed");
  assert.ok(/overhead layer/i.test(line.text), "descriptive system-role statement retained");
  assert.ok(/7\.1\.4/.test(line.text), "dolby config still named in the fallback");
  console.log("✓ P10 unassessed → descriptive fallback, no invented result");
}

// ── 4. P10 primary neutral dash → descriptive fallback ────────────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: productsSelected("SP-1 On-Wall × 4"),
    engineeringSummary: {
      parameter_index: {
        P10: {
          scopes: {
            primary: { level: "—", value: "—", scope: "primary" },
          },
        },
      },
    },
    dolbyConfig: "5.1.4",
  });
  assert.equal(conns.overheads[0].parameter, null, "neutral dash → no RP22 parameter");
  assert.equal(conns.overheads[0].level, null, "neutral dash → no level");
  console.log("✓ P10 neutral dash → descriptive fallback");
}

// ── 5. No overheads specified → empty connection (unchanged) ───────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: { rows: [] },
    engineeringSummary: engineeringSummaryWithP10("L2"),
    dolbyConfig: "5.1",
  });
  assert.deepEqual(conns.overheads, [], "no overheads specified → no connection");
  console.log("✓ no overheads specified → empty connection");
}

// ── 6. Other roles' connections unchanged shape ────────────────────────────
{
  const conns = buildSpecificationConnections({
    productsSelected: { rows: [{ key: "lcr", value: "SP-2-8 × 3", area: "LCR" }] },
    engineeringSummary: { parameter_index: { P12: { level: "L4", value: "105 dB" } } },
    dolbyConfig: "5.1",
  });
  assert.equal(conns.lcr.length, 1, "lcr connection still built");
  console.log("✓ other roles' connections unchanged");
}

console.log("\nAll Project Report overheads P10 tests passed.");