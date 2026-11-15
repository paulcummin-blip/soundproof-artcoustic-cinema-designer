// src/test/p10-single-overhead-row.test.mjs
// P10 single-overhead-row applicability tests.
//
// Verifies that a layout with only one overhead row produces a legitimate
// terminal N/A for P10 (not "insufficient data"), with the correct
// explanation, and that the export validator accepts it. Also verifies that
// genuine insufficient-data failures are preserved for applicable layouts,
// and that the no-overhead-layer and multiple-row cases are unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SINGLE_OVERHEAD_ROW_REASON,
  NO_OVERHEAD_LAYER_REASON,
  buildSingleOverheadRowNotApplicableMetric,
  buildOverheadNotApplicableMetric,
  countDistinctOverheadRows,
  overheadRowFromRole,
  isNotApplicableMetric,
} from "../components/utils/rp22/overheadLayerAuthority.js";

import {
  validateParameterCompleteness,
  validateRequiredParameters,
} from "../components/report/reportParameterCompleteness.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeOverhead(role, x = 2, y = 1, z = 2.5) {
  return { role, model: "OH-1", enabled: true, position: { x, y, z } };
}

function makeSeatMetric(p10) {
  return p10;
}

// Build a parameterAuthority.p10 seat-scoped entry from per-seat metrics.
// Mirrors the design-rating authority's shape: { key, scope, state, seats }.
function buildP10Authority(seatMetrics) {
  const seatIds = Object.keys(seatMetrics);
  const seats = {};
  let allNa = true;
  let hasScored = false;
  for (const id of seatIds) {
    const m = seatMetrics[id];
    const status = String(m?.status || "").toLowerCase();
    const isNa = status === "not_applicable" || status === "na"
      || m?.level === "N/A";
    if (isNa) {
      seats[id] = { state: "na", level: null, reason: null };
    } else if (m?.value != null && m?.level != null && m.level !== "—") {
      seats[id] = { state: "scored", level: m.level };
      hasScored = true;
      allNa = false;
    } else {
      seats[id] = { state: "provisional", level: null };
      allNa = false;
    }
  }
  const state = allNa ? "na" : hasScored ? "scored" : "provisional";
  return { key: "p10", scope: "seat", state, seats };
}

// ── 1. Authority metric shape ───────────────────────────────────────

test("1. buildSingleOverheadRowNotApplicableMetric is a terminal N/A", () => {
  const m = buildSingleOverheadRowNotApplicableMetric();
  assert.equal(m.status, "not_applicable");
  assert.equal(m.level, "N/A");
  assert.equal(m.formatted, "N/A");
  assert.equal(m.applicable, false);
  assert.equal(m.note, SINGLE_OVERHEAD_ROW_REASON);
  assert.ok(!String(m.note).toLowerCase().includes("insufficient data"));
});

test("1b. single-row reason differs from no-overhead-layer reason", () => {
  assert.notEqual(SINGLE_OVERHEAD_ROW_REASON, NO_OVERHEAD_LAYER_REASON);
  assert.ok(SINGLE_OVERHEAD_ROW_REASON.includes("one overhead speaker row"));
  assert.ok(!SINGLE_OVERHEAD_ROW_REASON.includes("no overhead / height"));
});

test("1c. isNotApplicableMetric recognises the single-row metric", () => {
  assert.equal(isNotApplicableMetric(buildSingleOverheadRowNotApplicableMetric()), true);
});

// ── 2. Overhead row counting ─────────────────────────────────────────

test("2. countDistinctOverheadRows: no overheads → 0", () => {
  assert.equal(countDistinctOverheadRows([]), 0);
  assert.equal(countDistinctOverheadRows([{ role: "FL", model: "L", position: { x: 1, y: 1 } }]), 0);
});

test("2b. countDistinctOverheadRows: one row (.2 layout) → 1", () => {
  const speakers = [makeOverhead("TFL"), makeOverhead("TFR")];
  assert.equal(countDistinctOverheadRows(speakers), 1);
});

test("2c. countDistinctOverheadRows: two rows (.4 layout) → 2", () => {
  const speakers = [makeOverhead("TFL"), makeOverhead("TFR"), makeOverhead("TRL"), makeOverhead("TRR")];
  assert.equal(countDistinctOverheadRows(speakers), 2);
});

test("2d. countDistinctOverheadRows: three rows (.6 layout) → 3", () => {
  const speakers = [
    makeOverhead("TFL"), makeOverhead("TFR"),
    makeOverhead("TML"), makeOverhead("TMR"),
    makeOverhead("TRL"), makeOverhead("TRR"),
  ];
  assert.equal(countDistinctOverheadRows(speakers), 3);
});

test("2e. countDistinctOverheadRows ignores disabled / off speakers", () => {
  const speakers = [
    makeOverhead("TFL"), makeOverhead("TFR"),
    { role: "TRL", model: "off", enabled: true, position: { x: 2, y: 5, z: 2.5 } },
  ];
  assert.equal(countDistinctOverheadRows(speakers), 1);
});

test("2f. overheadRowFromRole maps canonical roles", () => {
  assert.equal(overheadRowFromRole("TFL"), "front");
  assert.equal(overheadRowFromRole("TFR"), "front");
  assert.equal(overheadRowFromRole("TML"), "mid");
  assert.equal(overheadRowFromRole("TMR"), "mid");
  assert.equal(overheadRowFromRole("TRL"), "rear");
  assert.equal(overheadRowFromRole("TRR"), "rear");
  assert.equal(overheadRowFromRole("FL"), null);
  assert.equal(overheadRowFromRole("SL"), null);
});

// ── 3. Export validator accepts single-row N/A ──────────────────────

test("3. single-row P10 N/A passes the export validator", () => {
  const metric = buildSingleOverheadRowNotApplicableMetric();
  const parameterAuthority = {
    p10: buildP10Authority({ "seat-1": metric, "seat-2": metric }),
  };
  const result = validateParameterCompleteness({ parameterAuthority, paramId: 10 });
  assert.equal(result.complete, true, `expected complete, got ${result.reason}`);
});

test("3b. single-row P10 N/A passes validateRequiredParameters (P10 in list)", () => {
  const metric = buildSingleOverheadRowNotApplicableMetric();
  const parameterAuthority = {
    p10: buildP10Authority({ "seat-1": metric }),
  };
  const { missing, incomplete } = validateRequiredParameters({
    parameterAuthority,
    requiredParams: [10],
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(incomplete, []);
});

// ── 4. No-overhead-layer N/A still passes (unchanged) ────────────────

test("4. no-overhead-layer P10 N/A passes the export validator", () => {
  const metric = buildOverheadNotApplicableMetric();
  const parameterAuthority = {
    p10: buildP10Authority({ "seat-1": metric }),
  };
  const result = validateParameterCompleteness({ parameterAuthority, paramId: 10 });
  assert.equal(result.complete, true);
});

// ── 5. Genuine insufficient-data is still rejected ───────────────────

test("5. insufficient-data P10 metric is rejected by the validator", () => {
  // Simulate an applicable layout (2 rows) where computation returned null
  // — the engine produces this "insufficient data" formatted string.
  const insufficientMetric = {
    value: null,
    formatted: "N/A (insufficient data)",
    level: "—",
  };
  // The design-rating authority maps this to provisional (not na) because
  // isMetricIneligible catches level '—', but the seat authority state is
  // "na". However, the HUD-level formatted string carries "insufficient
  // data". The validator must reject a parameter whose seats carry the
  // insufficient-data indicator.
  const parameterAuthority = {
    p10: {
      key: "p10",
      scope: "seat",
      state: "na",
      seats: {
        "seat-1": { state: "na", level: "—", formatted: "N/A (insufficient data)" },
      },
    },
  };
  const result = validateParameterCompleteness({ parameterAuthority, paramId: 10 });
  assert.equal(result.complete, false);
});

test("5b. provisional P10 (applicable but not computed) is rejected", () => {
  const parameterAuthority = {
    p10: {
      key: "p10",
      scope: "seat",
      state: "provisional",
      seats: { "seat-1": { state: "provisional", level: null } },
    },
  };
  const result = validateParameterCompleteness({ parameterAuthority, paramId: 10 });
  assert.equal(result.complete, false);
});

// ── 6. Multiple-row scored P10 passes (unchanged) ─────────────────────

test("6. scored P10 with multiple rows passes the validator", () => {
  const scoredMetric = { value: 3, formatted: "3 dB", level: 3, status: "scored" };
  const parameterAuthority = {
    p10: buildP10Authority({ "seat-1": scoredMetric, "seat-2": scoredMetric }),
  };
  const result = validateParameterCompleteness({ parameterAuthority, paramId: 10 });
  assert.equal(result.complete, true);
});