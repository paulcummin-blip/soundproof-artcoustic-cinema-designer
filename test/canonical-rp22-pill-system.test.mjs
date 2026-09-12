/**
 * canonical-rp22-pill-system.test.mjs
 * ------------------------------------
 * Regression tests for the unified RP22 grading-pill system.
 * Verifies that the app, compliance report, seat cards, design rating, visual
 * report and recommendation cards all consume ONE canonical token authority,
 * with only size/context variants — never divergent semantic colours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// --- Canonical authority -----------------------------------------------------
const {
  RP22_GRADE_TOKENS,
  resolveGradeToken,
  getLevelColors,
  getLevelHighlightColors,
  RP22_LEVEL_COLORS,
} = await import("@/components/utils/rp22Colors");

// --- Canonical component (JSX → esbuild-transpiled by alias loader) ----------
const { default: RP22GradingPill } = await import("@/components/ui/RP22GradingPill");
const { default: PrintRp23Pill } = await import("@/components/report/PrintRp23Pill");
const { default: TechnicalLevelBadge } = await import("@/components/report/technical/TechnicalLevelBadge");
const { default: SeatScopeBadge } = await import("@/components/report/SeatScopeBadge");

// Recursively render React elements (calling component functions) until we
// reach a host element (string type), then return it so we can inspect props.
function render(el) {
  if (el == null || typeof el !== "object") return el;
  if (typeof el.type === "function") {
    return render(el.type(el.props));
  }
  return el;
}

function styleOf(el) {
  const host = render(el);
  return host?.props?.style || {};
}

function textOf(el) {
  const host = render(el);
  const c = host?.props?.children;
  if (Array.isArray(c)) return c.join("");
  return c ?? "";
}

// ---------------------------------------------------------------------------
// A. All L1–L4 pills use canonical tokens
// ---------------------------------------------------------------------------
test("A: L1–L4 pills use canonical RP22_GRADE_TOKENS", () => {
  for (const n of [1, 2, 3, 4]) {
    const key = `L${n}`;
    const token = RP22_GRADE_TOKENS[key];
    const s = styleOf(RP22GradingPill({ level: n }));
    assert.equal(s.background, token.bg, `L${n} bg must match token`);
    assert.ok(s.border.includes(token.border), `L${n} border must match token`);
    assert.equal(s.color, token.text, `L${n} text must match token`);
  }
  for (const str of ["L1", "L2", "L3", "L4"]) {
    const token = RP22_GRADE_TOKENS[str];
    const s = styleOf(RP22GradingPill({ level: str }));
    assert.equal(s.background, token.bg, `${str} bg must match token`);
  }
});

// ---------------------------------------------------------------------------
// B. FAIL uses canonical failure treatment (solid, white text)
// ---------------------------------------------------------------------------
test("B: FAIL uses canonical solid failure treatment", () => {
  const token = RP22_GRADE_TOKENS.FAIL;
  assert.equal(token.solid, true, "FAIL token must be solid");
  const s = styleOf(RP22GradingPill({ level: "FAIL" }));
  assert.equal(s.background, token.bg, "FAIL bg must be solid #4A230F");
  assert.equal(s.color, token.text, "FAIL text must be white");
  assert.equal(s.fontWeight, 700, "FAIL must have heavier weight");
});

// ---------------------------------------------------------------------------
// C. L1 and FAIL do NOT share the same semantic base colour
// ---------------------------------------------------------------------------
test("C: L1 and FAIL have different hue AND treatment", () => {
  const l1 = RP22_GRADE_TOKENS.L1;
  const fail = RP22_GRADE_TOKENS.FAIL;
  assert.notEqual(l1.bg, fail.bg, "L1 bg must not equal FAIL bg");
  assert.notEqual(l1.text, fail.text, "L1 text must not equal FAIL text");
  assert.notEqual(l1.border, fail.border, "L1 border must not equal FAIL border");
  assert.equal(l1.solid, false, "L1 must be faded, not solid");
  assert.equal(fail.solid, true, "FAIL must be solid");
  // Hue check: L1 is golden bronze (more yellow), FAIL is dark burgundy (more red)
  const l1R = parseInt(l1.text.slice(1, 3), 16);
  const l1G = parseInt(l1.text.slice(3, 5), 16);
  const failR = parseInt(fail.bg.slice(1, 3), 16);
  const failG = parseInt(fail.bg.slice(3, 5), 16);
  assert.ok(l1G / l1R > failG / failR, "L1 hue must be more golden/bronze than FAIL");
  // Lightness: L1 bg is light, FAIL bg is dark (compare by luminance, not lexical)
  const lum = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  assert.ok(lum(l1.bg) > lum(fail.bg), "L1 bg must be lighter than FAIL bg (luminance)");
});

// ---------------------------------------------------------------------------
// D. Visual Report and app consume the same semantic token map
// ---------------------------------------------------------------------------
test("D: report pill and app pill share the same token map", () => {
  for (const n of [1, 2, 3, 4]) {
    const sa = styleOf(RP22GradingPill({ level: n }));
    const sr = styleOf(PrintRp23Pill({ level: n }));
    assert.equal(sa.background, sr.background, `app and report L${n} bg must match`);
    assert.equal(sa.color, sr.color, `app and report L${n} text must match`);
    assert.ok(sr.border.includes(RP22_GRADE_TOKENS[`L${n}`].border), `report L${n} border must match token`);
  }
});

// ---------------------------------------------------------------------------
// E. Seat card and Compliance use the same component/tokens
// ---------------------------------------------------------------------------
test("E: SeatScopeBadge uses canonical SEAT token", () => {
  const token = RP22_GRADE_TOKENS.SEAT;
  const s = styleOf(SeatScopeBadge({}));
  assert.equal(s.background, token.bg, "SEAT bg must match token");
  assert.equal(s.color, token.text, "SEAT text must match token");
  assert.ok(s.border.includes(token.border), "SEAT border must match token");
  assert.equal(textOf(SeatScopeBadge({})), "SEAT", "SEAT label must render");
});

// ---------------------------------------------------------------------------
// F. Compact/report variants change size only, not semantic colour
// ---------------------------------------------------------------------------
test("F: variants change size only, not semantic colour", () => {
  for (const n of [1, 2, 3, 4]) {
    const app = styleOf(RP22GradingPill({ level: n, variant: "app" }));
    const compact = styleOf(RP22GradingPill({ level: n, variant: "compact" }));
    const report = styleOf(RP22GradingPill({ level: n, variant: "report" }));
    assert.equal(app.background, compact.background, `L${n} app/compact bg must match`);
    assert.equal(app.background, report.background, `L${n} app/report bg must match`);
    assert.equal(app.color, compact.color, `L${n} app/compact text must match`);
    assert.equal(app.color, report.color, `L${n} app/report text must match`);
    assert.notEqual(app.padding, compact.padding, "app and compact padding must differ");
    assert.notEqual(app.fontSize, compact.fontSize, "app and compact font size must differ");
    assert.notEqual(app.padding, report.padding, "app and report padding must differ");
  }
});

// ---------------------------------------------------------------------------
// G. N/A / NOT CALCULATED remain neutral (not a performance colour)
// ---------------------------------------------------------------------------
test("G: N/A and NOT CALCULATED are neutral", () => {
  for (const lvl of ["N/A", "NOT CALCULATED", "—", undefined]) {
    const { token } = resolveGradeToken(lvl);
    assert.equal(token.solid, false, `${lvl} must not be solid`);
    const perfTexts = ["L1", "L2", "L3", "L4", "FAIL"].map((k) => RP22_GRADE_TOKENS[k].text);
    assert.ok(!perfTexts.includes(token.text), `${lvl} text must not be a performance colour`);
  }
  assert.equal(textOf(RP22GradingPill({ level: "NOT CALCULATED" })), "NOT CALCULATED", "NOT CALCULATED label must render");
  assert.equal(textOf(RP22GradingPill({ level: "N/A" })), "N/A", "N/A label must render");
  assert.equal(textOf(RP22GradingPill({ level: undefined })), "—", "undefined level must render dash");
});

// ---------------------------------------------------------------------------
// H. No legacy report-only grey grading map remains
// ---------------------------------------------------------------------------
test("H: legacy RP22_LEVEL_COLORS is derived from canonical tokens", () => {
  for (const n of [1, 2, 3, 4]) {
    const legacy = RP22_LEVEL_COLORS[n];
    const canonical = RP22_GRADE_TOKENS[`L${n}`];
    assert.equal(legacy.bg, canonical.bg, `legacy L${n} bg must equal canonical`);
    assert.equal(legacy.text, canonical.text, `legacy L${n} text must equal canonical`);
    assert.equal(legacy.border, canonical.border, `legacy L${n} border must equal canonical`);
  }
  assert.equal(RP22_LEVEL_COLORS.fail.bg, RP22_GRADE_TOKENS.FAIL.bg, "legacy fail must be canonical solid FAIL");
  assert.equal(RP22_LEVEL_COLORS.fail.text, "#FFFFFF", "legacy fail text must be white (not red)");
});

// ---------------------------------------------------------------------------
// I. No legacy seat-card-only grading colour map remains
// ---------------------------------------------------------------------------
test("I: getLevelColors returns canonical tokens (no seat-card-only map)", () => {
  for (const n of [1, 2, 3, 4]) {
    const c = getLevelColors(n);
    const t = RP22_GRADE_TOKENS[`L${n}`];
    assert.equal(c.bg, t.bg);
    assert.equal(c.text, t.text);
    assert.equal(c.border, t.border);
  }
  const f = getLevelColors(0);
  assert.equal(f.bg, RP22_GRADE_TOKENS.FAIL.bg, "getLevelColors(0) must return canonical FAIL");
});

// ---------------------------------------------------------------------------
// TechnicalLevelBadge uses canonical tokens
// ---------------------------------------------------------------------------
test("TechnicalLevelBadge uses canonical tokens", () => {
  for (const n of [1, 2, 3, 4]) {
    const s = styleOf(TechnicalLevelBadge({ level: n }));
    const t = RP22_GRADE_TOKENS[`L${n}`];
    assert.equal(s.background, t.bg, `TechnicalLevelBadge L${n} bg must match token`);
    assert.equal(s.color, t.text, `TechnicalLevelBadge L${n} text must match token`);
  }
  const fs = styleOf(TechnicalLevelBadge({ level: "FAIL" }));
  assert.equal(fs.background, RP22_GRADE_TOKENS.FAIL.bg, "TechnicalLevelBadge FAIL must be solid");
  assert.equal(fs.color, RP22_GRADE_TOKENS.FAIL.text, "TechnicalLevelBadge FAIL text must be white");
});

// ---------------------------------------------------------------------------
// getLevelHighlightColors derives from canonical accents
// ---------------------------------------------------------------------------
test("getLevelHighlightColors derives from canonical tokens", () => {
  for (const n of [1, 2, 3, 4]) {
    const h = getLevelHighlightColors(n);
    const t = RP22_GRADE_TOKENS[`L${n}`];
    assert.equal(h.text, t.text, `highlight text for L${n} must match canonical text`);
  }
  const fh = getLevelHighlightColors(0);
  assert.equal(fh.border, RP22_GRADE_TOKENS.FAIL.bg, "fail highlight border must be canonical FAIL bg");
});

// ---------------------------------------------------------------------------
// Visual L4→FAIL distinction: five clearly distinguishable states
// ---------------------------------------------------------------------------
test("L4 L3 L2 L1 FAIL are five distinguishable states", () => {
  const keys = ["L4", "L3", "L2", "L1", "FAIL"];
  const bgs = keys.map((k) => RP22_GRADE_TOKENS[k].bg);
  assert.equal(new Set(bgs).size, 5, "all five backgrounds must be unique");
  const texts = keys.map((k) => RP22_GRADE_TOKENS[k].text);
  assert.equal(new Set(texts).size, 5, "all five text colours must be unique");
});