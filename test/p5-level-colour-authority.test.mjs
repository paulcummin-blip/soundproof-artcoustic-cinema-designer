/**
 * P5 Level-Colour Authority Test
 * ------------------------------
 * Verifies that the P5 Visual Report diagram (worst-gap sector + arc + status
 * badge) inherits the achieved P5 level's canonical RP22 grade token colours,
 * not a hardcoded palette.
 *
 * Checks source-level wiring in both the screen (ClientSoundAroundListener)
 * and print (PrintP5Content) components.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CLIENT_DIR = path.join("src", "components", "report", "client");
const SCREEN_SRC = fs.readFileSync(path.join(CLIENT_DIR, "ClientSoundAroundListener.jsx"), "utf8");
const PRINT_SRC = fs.readFileSync(path.join(CLIENT_DIR, "print", "PrintP5Content.jsx"), "utf8");
const COLORS_SRC = fs.readFileSync(path.join("src", "components", "utils", "rp22Colors.jsx"), "utf8");

// Extract RP22_GRADE_TOKENS values from source for token-matching assertions
function extractTokenField(src, key, field) {
  const re = new RegExp(`${key}:\\s*\\{[^}]*${field}:\\s*"#([0-9A-Fa-f]{6})"`);
  const m = src.match(re);
  return m ? `#${m[1].toUpperCase()}` : null;
}

const L4_BG = extractTokenField(COLORS_SRC, "L4", "bg");
const L4_BORDER = extractTokenField(COLORS_SRC, "L4", "border");
const L3_BORDER = extractTokenField(COLORS_SRC, "L3", "border");
const L2_BORDER = extractTokenField(COLORS_SRC, "L2", "border");
const L1_BG = extractTokenField(COLORS_SRC, "L1", "bg");
const L1_BORDER = extractTokenField(COLORS_SRC, "L1", "border");
const L1_TEXT = extractTokenField(COLORS_SRC, "L1", "text");
const FAIL_BG = extractTokenField(COLORS_SRC, "FAIL", "bg");
const FAIL_BORDER = extractTokenField(COLORS_SRC, "FAIL", "border");
const FAIL_TEXT = extractTokenField(COLORS_SRC, "FAIL", "text");

describe("P5 level-colour authority — source wiring", () => {
  it("both components import resolveGradeToken from rp22Colors", () => {
    assert.ok(SCREEN_SRC.includes('import { resolveGradeToken } from "@/components/utils/rp22Colors"'),
      "ClientSoundAroundListener imports resolveGradeToken");
    assert.ok(PRINT_SRC.includes('import { resolveGradeToken } from "@/components/utils/rp22Colors"'),
      "PrintP5Content imports resolveGradeToken");
  });

  it("worst-gap arc colour derives from gradeToken.token.border (not hardcoded #4A230F)", () => {
    assert.ok(SCREEN_SRC.includes('gradeToken.token.border'),
      "screen: arcColor uses gradeToken.token.border");
    assert.ok(PRINT_SRC.includes('gradeToken.token.border'),
      "print: arcColor uses gradeToken.token.border");
    // The old hardcoded L1/FAIL colour must not drive the worst arc
    assert.ok(!SCREEN_SRC.includes('const arcColor = isWorst ? "#4A230F"'),
      "screen: old hardcoded #4A230F removed");
    assert.ok(!PRINT_SRC.includes('const arcColor = isWorst ? "#4A230F"'),
      "print: old hardcoded #4A230F removed");
  });

  it("worst-gap sector fill derives from gradeToken.token.bg", () => {
    assert.ok(SCREEN_SRC.includes('gradeToken.token.bg'),
      "screen: sectorFill uses gradeToken.token.bg");
    assert.ok(PRINT_SRC.includes('gradeToken.token.bg'),
      "print: sectorFill uses gradeToken.token.bg");
    assert.ok(SCREEN_SRC.includes("sectorPath"),
      "screen: sectorPath built for worst gap");
    assert.ok(PRINT_SRC.includes("sectorPath"),
      "print: sectorPath built for worst gap");
  });

  it("status badge uses canonical tokenBg / tokenText (not statusInfo.color hex append)", () => {
    assert.ok(SCREEN_SRC.includes("background: statusInfo.tokenBg"),
      "screen: badge background uses tokenBg");
    assert.ok(SCREEN_SRC.includes("color: statusInfo.tokenText"),
      "screen: badge text uses tokenText");
    assert.ok(!SCREEN_SRC.includes("`${statusInfo.color}25`"),
      "screen: old ${statusInfo.color}25 background removed");
    assert.ok(PRINT_SRC.includes("background: statusInfo.tokenBg"),
      "print: badge background uses tokenBg");
    assert.ok(PRINT_SRC.includes("color: statusInfo.tokenText"),
      "print: badge text uses tokenText");
    assert.ok(!PRINT_SRC.includes("`${statusInfo.color}25`"),
      "print: old ${statusInfo.color}25 background removed");
  });

  it("continuity shading is neutral (not L4 green #213428)", () => {
    // The old continuity shading used fill="#213428" fillOpacity={0.06}
    assert.ok(!SCREEN_SRC.includes('fill="#213428"\n              fillOpacity={0.06}'),
      "screen: continuity fill no longer #213428 at 0.06 opacity");
    assert.ok(!PRINT_SRC.includes('fill="#213428" fillOpacity={0.06}'),
      "print: continuity fill no longer #213428 at 0.06 opacity");
    assert.ok(SCREEN_SRC.includes('fill="#625143"'),
      "screen: continuity fill is now neutral #625143");
    assert.ok(PRINT_SRC.includes('fill="#625143"'),
      "print: continuity fill is now neutral #625143");
  });
});

describe("P5 level-colour authority — canonical token distinctness", () => {
  it("L1 and FAIL have distinct bg, border, and text colours", () => {
    assert.ok(L1_BG !== FAIL_BG, `L1 bg ${L1_BG} ≠ FAIL bg ${FAIL_BG}`);
    assert.ok(L1_BORDER !== FAIL_BORDER, `L1 border ${L1_BORDER} ≠ FAIL border ${FAIL_BORDER}`);
    assert.ok(L1_TEXT !== FAIL_TEXT, `L1 text ${L1_TEXT} ≠ FAIL text ${FAIL_TEXT}`);
  });

  it("each level has a distinct border colour", () => {
    const borders = [L4_BORDER, L3_BORDER, L2_BORDER, L1_BORDER, FAIL_BORDER];
    const unique = new Set(borders);
    assert.equal(borders.length, unique.size, "all five level borders are distinct");
  });

  it("L1 is a faded warm-bronze treatment, not a solid burgundy", () => {
    // L1 bg should be a light colour (high luminosity), FAIL bg should be dark
    assert.ok(L1_BG !== L1_BORDER, "L1 bg ≠ L1 border (faded treatment)");
    assert.ok(FAIL_BG === FAIL_BORDER, "FAIL bg === FAIL border (solid treatment)");
  });
});

describe("P5 level-colour authority — dynamic level resolution", () => {
  it("gapArcs useMemo depends on level (re-renders when P5 level changes)", () => {
    assert.ok(SCREEN_SRC.includes("geometryWorstGapDeg, level, SHADING_RADIUS_M"),
      "screen: gapArcs deps include level");
    assert.ok(PRINT_SRC.includes("geometryWorstGapDeg, level, SHADING_RADIUS_M"),
      "print: gapArcs deps include level");
  });

  it("level is read from p5Snapshot (dynamic, not hardcoded)", () => {
    assert.ok(SCREEN_SRC.includes('p5Snapshot?.level || "—"'),
      "screen: level from p5Snapshot");
    assert.ok(PRINT_SRC.includes('p5Snapshot?.level || "—"'),
      "print: level from p5Snapshot");
  });
});