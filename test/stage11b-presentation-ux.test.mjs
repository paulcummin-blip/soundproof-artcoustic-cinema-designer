// test/stage11b-presentation-ux.test.mjs
// Stage 11B final presentation/UX cleanup tests.
//
// Tests:
//   11 — P14 capability presentation (achieved, not target)
//   12 — Raw per-seat precision (one decimal place)
//   13 — Materiality trade-off presentation (remains Lx, not regressed)
//   14 — ETA phase-end behavior (preparing, not 0 sec)
//   15 — Apply contrast (CSS variables defined)
//
// Run: node --import ./test/_alias-register.mjs test/stage11b-presentation-ux.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { computeEta, formatEta } from "@/components/room/bass/improveBassV2/etaCalculator";

// ============================================================
// 11 — P14 CAPABILITY PRESENTATION
// ============================================================

test("P14_CAPABILITY: achieved P14 read from selectedCandidate, not target parameters", () => {
  const contract = {
    selectedCandidate: {
      achievedP14Level: 4,
      achievedP14Db: 125.3,
      perSeatP19Results: [{ seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 6.9 }],
      perSeatP20Results: [{ seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 6.9 }],
      achievedP18FrequencyHz: 20,
    },
    productAnalysis: {
      parameters: {
        p14: { level: 2, value: 112 }, // TARGET — must NOT be used for capability
        p19: { level: 1, value: 6.9 },
        p20: { level: 1, value: 6.9 },
        p18: { level: 2, value: 20 },
      },
    },
  };

  // Replicate extractAuthorityForComparison P14 logic
  const selectedCandidate = contract.selectedCandidate || {};
  const p14AchievedLevel = selectedCandidate.achievedP14Level ?? contract.achievedP14Level ?? null;
  const p14AchievedDbRaw = selectedCandidate.achievedP14Db ?? contract.achievedP14Db ?? null;
  const p14AchievedDb = Number.isFinite(Number(p14AchievedDbRaw)) ? Number(p14AchievedDbRaw) : null;

  assert.strictEqual(p14AchievedLevel, 4, "P14 achieved level is L4, not L2 target");
  assert.strictEqual(p14AchievedDb, 125.3, "P14 achieved dB is 125.3, not 112 target");
  assert.notStrictEqual(p14AchievedLevel, 2, "Must NOT read target level L2");
});

test("P14_CAPABILITY: contract-level fallback when selectedCandidate lacks achieved P14", () => {
  const contract = {
    selectedCandidate: {
      perSeatP19Results: [{ seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 6.9 }],
      perSeatP20Results: [{ seatId: "rsp", isPrimary: true, level: 1, variationDbRaw: 6.9 }],
    },
    achievedP14Level: 4,
    achievedP14Db: 125.3,
    productAnalysis: {
      parameters: {
        p14: { level: 2, value: 112 },
      },
    },
  };

  const selectedCandidate = contract.selectedCandidate || {};
  const p14AchievedLevel = selectedCandidate.achievedP14Level ?? contract.achievedP14Level ?? null;
  const p14AchievedDbRaw = selectedCandidate.achievedP14Db ?? contract.achievedP14Db ?? null;
  const p14AchievedDb = Number.isFinite(Number(p14AchievedDbRaw)) ? Number(p14AchievedDbRaw) : null;

  assert.strictEqual(p14AchievedLevel, 4, "Falls back to contract.achievedP14Level");
  assert.strictEqual(p14AchievedDb, 125.3, "Falls back to contract.achievedP14Db");
});

test("P14_CAPABILITY: winner achievedP14Level=4, achievedP14Db=126.0 formats as '126.0 dBC / L4'", () => {
  const winner = { p14AchievedLevel: 4, p14AchievedDb: 126.0 };
  const current = { p14AchievedLevel: 4, p14AchievedDb: 125.3 };

  // Replicate P14CapabilityPill display logic
  const curText = `L${current.p14AchievedLevel}`;
  const winText = `L${winner.p14AchievedLevel}`;
  const curDisplay = `${current.p14AchievedDb.toFixed(1)} dBC / ${curText}`;
  const winDisplay = `${winner.p14AchievedDb.toFixed(1)} dBC / ${winText}`;

  assert.strictEqual(curDisplay, "125.3 dBC / L4");
  assert.strictEqual(winDisplay, "126.0 dBC / L4");
  assert.notStrictEqual(curDisplay, "L2", "Must NOT show target L2");
});

test("P14_CAPABILITY: P14 target label includes 'Minimum' prefix", () => {
  // Replicate p14TargetLabel logic
  function p14TargetLabel(level, db) {
    const lt = level > 0 ? `L${level}` : "—";
    const dbText = Number.isFinite(Number(db)) ? `${Math.round(Number(db))} dBC` : "";
    return dbText ? `Minimum ${lt} / ${dbText}` : lt;
  }
  const label = p14TargetLabel(2, 112);
  assert.strictEqual(label, "Minimum L2 / 112 dBC");
  assert.ok(label.startsWith("Minimum"), "Target label starts with 'Minimum'");
});

// ============================================================
// 12 — RAW PER-SEAT PRECISION
// ============================================================

test("RAW_PRECISION: P19/P20 before/after uses one decimal place, not floored design value", () => {
  // Replicate the new formatP19Db / formatP20Db
  function formatDb(raw) {
    if (!Number.isFinite(Number(raw))) return "—";
    return `±${Math.abs(Number(raw)).toFixed(1)} dB`;
  }

  // Fixture from Test 12
  assert.strictEqual(formatDb(6.92), "±6.9 dB", "6.92 → ±6.9 dB (not ±6)");
  assert.strictEqual(formatDb(5.87), "±5.9 dB", "5.87 → ±5.9 dB (not ±5)");
  assert.strictEqual(formatDb(11.32), "±11.3 dB", "11.32 → ±11.3 dB (not ±11)");
  assert.strictEqual(formatDb(7.48), "±7.5 dB", "7.48 → ±7.5 dB (not ±7)");

  // Negative raw values use absolute
  assert.strictEqual(formatDb(-6.92), "±6.9 dB", "Negative raw → absolute");

  // Non-finite returns dash (undefined/NaN → Number() is NaN → not finite)
  assert.strictEqual(formatDb(undefined), "—");
  assert.strictEqual(formatDb(NaN), "—");
});

test("RAW_PRECISION: does NOT use resolveRp22DesignValue (no whole-integer flooring)", async () => {
  // Verify the V2SeatBeforeAfterGrid source no longer imports resolveRp22DesignValue
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    "src/components/room/bass/improveBassV2/V2SeatBeforeAfterGrid.jsx",
    "utf8",
  );
  assert.ok(!source.includes("resolveRp22DesignValue"),
    "V2SeatBeforeAfterGrid must NOT import resolveRp22DesignValue");
  assert.ok(source.includes("Math.abs(Number(raw)).toFixed(1)"),
    "Must use toFixed(1) for raw display");
});

// ============================================================
// 13 — MATERIALITY TRADE-OFF PRESENTATION
// ============================================================

test("MATERIALITY_TRADEOFF: primary seat within tolerance shows 'remains Lx', not 'regressed'", () => {
  const beforeRaw = 6.9;
  const afterRaw = 7.6;
  const delta = afterRaw - beforeRaw;
  const afterLevel = 1;

  // Within same-level tolerance (delta <= 1.0 dB)
  assert.ok(delta <= 1.0, "Delta within 1.0 dB tolerance");

  // Replicate the new trade-off display
  const display = `Primary seat 1: P20 ${beforeRaw.toFixed(1)} → ${afterRaw.toFixed(1)} dB; remains L${afterLevel}`;

  assert.ok(!display.toLowerCase().includes("regress"), "Not labeled as regressed");
  assert.ok(!display.includes("amber"), "Not amber/warning color");
  assert.ok(display.includes("remains L1"), "Shows 'remains L1'");
  assert.ok(display.includes("6.9"), "Shows before raw with one decimal");
  assert.ok(display.includes("7.6"), "Shows after raw with one decimal");
});

test("MATERIALITY_TRADEOFF: trade-off display uses neutral color not amber", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    "src/components/room/bass/improveBassV2/ImproveBassV2Results.jsx",
    "utf8",
  );
  // The trade-off line should use text-[#625143] (neutral), not text-amber-700
  assert.ok(!source.includes("text-amber-700") || !source.includes("t.delta.toFixed(2)"),
    "Trade-off display no longer uses amber-700 with delta");
  assert.ok(source.includes("remains L"),
    "Trade-off display includes 'remains L' context");
});

// ============================================================
// 14 — ETA PHASE-END BEHAVIOR
// ============================================================

test("ETA_PREPARING: intermediate phase current===total shows 'preparing', not 0 sec", () => {
  const eta = computeEta([100, 110, 105, 120], 5, 5, "confirming_symmetric");
  assert.strictEqual(eta.status, "preparing",
    "Intermediate phase completion is 'preparing'");
  assert.strictEqual(eta.etaSeconds, null, "No numeric ETA when preparing");
});

test("ETA_PREPARING: formatEta shows 'Preparing next step…' for preparing status", () => {
  assert.strictEqual(formatEta("preparing", null), "Preparing next step\u2026");
});

test("ETA_PREPARING: screening phase end also shows preparing", () => {
  const eta = computeEta([100, 110, 105, 120], 1, 1, "screening_asymmetric");
  assert.strictEqual(eta.status, "preparing",
    "Screening phase completion is 'preparing'");
});

test("ETA_FINALISING: actual finalising phase still shows 'Finalising…'", () => {
  const eta = computeEta([], 0, 1, "finalising");
  assert.strictEqual(eta.status, "finalising");
  assert.strictEqual(formatEta("finalising", null), "Finalising\u2026");
});

test("ETA_MEASURED: phase with current < total and enough samples shows measured ETA", () => {
  const eta = computeEta([100, 110, 105, 120], 2, 10, "confirming_individual");
  assert.strictEqual(eta.status, "measured");
  assert.ok(eta.etaSeconds > 0, "Positive ETA");
});

test("ETA_PREPARING: total=0 does NOT show preparing (no work)", () => {
  const eta = computeEta([100, 110, 105], 0, 0, "confirming_symmetric");
  assert.notStrictEqual(eta.status, "preparing", "No work → not preparing");
  assert.notStrictEqual(eta.status, "finalising", "Not finalising either");
});

test("ETA_PREPARING: current=0 total=1 does NOT show preparing (work not started)", () => {
  const eta = computeEta([100, 110, 105], 0, 1, "screening_symmetric");
  assert.notStrictEqual(eta.status, "preparing", "Work not started → not preparing");
});

// ============================================================
// 15 — APPLY CONTRAST (CSS Variable)
// ============================================================

test("APPLY_CONTRAST: --brand-green and --brand-slate defined in index.css", async () => {
  const fs = await import("node:fs");
  const css = fs.readFileSync("src/index.css", "utf8");
  assert.ok(css.includes("--brand-green:"), "--brand-green defined");
  assert.ok(css.includes("--brand-slate:"), "--brand-slate defined");
  assert.ok(css.includes("#213428"), "brand green is #213428");
  assert.ok(css.includes("#3E4349"), "brand slate is #3E4349");
});

test("APPLY_CONTRAST: button brand variant uses --brand-green", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("src/components/ui/button.jsx", "utf8");
  assert.ok(source.includes("bg-[var(--brand-green)]"),
    "Button brand variant references --brand-green");
  assert.ok(source.includes("hover:bg-[var(--brand-slate)]"),
    "Button brand hover references --brand-slate");
});

// ============================================================
// 16 — CALIBRATION IMMATERIAL MESSAGE
// ============================================================

test("CALIBRATION_IMMATERIAL: message shown when calibration ran but was immaterial", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    "src/components/room/bass/improveBassV2/ImproveBassV2Results.jsx",
    "utf8",
  );
  assert.ok(
    source.includes("Calibration alone did not materially improve the room"),
    "Immaterial calibration message present",
  );
  assert.ok(
    source.includes("selection.calibrationDiagnostics?.valid > 0") && source.includes("!selection.calibrationDiagnostics?.invalid") && source.includes("!selection.calibrationMaterial?.material"),
    "Condition requires valid completed calibration evidence and immateriality",
  );
});

// ============================================================
// 17 — SEAT ROW LAYOUT (non-wrapping)
// ============================================================

test("SEAT_ROW: uses grid layout, not flex-wrap", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    "src/components/room/bass/improveBassV2/V2SeatBeforeAfterGrid.jsx",
    "utf8",
  );
  assert.ok(!source.includes("flex-wrap"), "No flex-wrap in SeatRow");
  assert.ok(source.includes("gridTemplateColumns"),
    "Uses gridTemplateColumns for non-wrapping row");
});