/**
 * visual-report-seat-authority.test.mjs
 * -------------------------------------
 * Tests for the Visual Report seat graphics and sheet-inclusion authority.
 *
 * Verifies:
 *   A. Primary seat has bold outer ring.
 *   B. Secondary seat does not have bold outer ring.
 *   C-G. L4/L3/L2/L1/FAIL seat uses canonical semantic tokens.
 *   H. Primary L2 = L2 colour + Primary outline.
 *   I. Secondary L4 = L4 colour + normal outline.
 *   J-L. All-N/A / Not-Assessed / Not-Calculated → no sheet.
 *   M. Genuine FAIL → sheet retained.
 *   N. Mixed calculated/N/A seats → sheet retained.
 *   O. Removed sheets leave no artefact (inclusion returns false cleanly).
 *   P. Visual Report uses the same semantic grade token authority as RP22 pills.
 *   Q. L1 and FAIL are visually distinguishable.
 *   R. PRIORITY_LEGEND explains priority, not grade colour.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  RP22_GRADE_TOKENS,
  resolveGradeToken,
} = await import("@/components/utils/rp22Colors");

const {
  getSeatCircleStyle,
  getSeatGradeColors,
  isAssessedLevel,
  hasAnyAssessedSeat,
  PRIORITY_LEGEND,
} = await import("@/components/report/client/visualReportSeatStyle");

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== VISUAL REPORT SEAT AUTHORITY ===\n");

// --- A. Primary seat has bold outer ring ---
{
  const primary = getSeatCircleStyle("L2", true);
  check("A: Primary seat has bold outer ring (strokeWidth 3.5)",
    primary.zoneStrokeWidth === 3.5,
    `got ${primary.zoneStrokeWidth}`);
}

// --- B. Secondary seat does not have bold outer ring ---
{
  const secondary = getSeatCircleStyle("L4", false);
  check("B: Secondary seat has normal outline (strokeWidth 1.5)",
    secondary.zoneStrokeWidth === 1.5,
    `got ${secondary.zoneStrokeWidth}`);
}

// --- C. L4 seat uses canonical L4 semantic tokens ---
{
  const l4 = getSeatCircleStyle("L4", false);
  check("C: L4 seat fill = canonical L4 bg",
    l4.zoneFill === RP22_GRADE_TOKENS.L4.bg,
    `got ${l4.zoneFill}, expected ${RP22_GRADE_TOKENS.L4.bg}`);
  check("C: L4 seat border = canonical L4 border",
    l4.zoneStroke === RP22_GRADE_TOKENS.L4.border);
}

// --- D. L3 seat uses canonical L3 tokens ---
{
  const l3 = getSeatCircleStyle("L3", false);
  check("D: L3 seat fill = canonical L3 bg",
    l3.zoneFill === RP22_GRADE_TOKENS.L3.bg,
    `got ${l3.zoneFill}, expected ${RP22_GRADE_TOKENS.L3.bg}`);
  check("D: L3 seat border = canonical L3 border",
    l3.zoneStroke === RP22_GRADE_TOKENS.L3.border);
}

// --- E. L2 seat uses canonical L2 tokens ---
{
  const l2 = getSeatCircleStyle("L2", false);
  check("E: L2 seat fill = canonical L2 bg",
    l2.zoneFill === RP22_GRADE_TOKENS.L2.bg,
    `got ${l2.zoneFill}, expected ${RP22_GRADE_TOKENS.L2.bg}`);
  check("E: L2 seat border = canonical L2 border",
    l2.zoneStroke === RP22_GRADE_TOKENS.L2.border);
}

// --- F. L1 seat uses canonical L1 tokens ---
{
  const l1 = getSeatCircleStyle("L1", false);
  check("F: L1 seat fill = canonical L1 bg",
    l1.zoneFill === RP22_GRADE_TOKENS.L1.bg,
    `got ${l1.zoneFill}, expected ${RP22_GRADE_TOKENS.L1.bg}`);
  check("F: L1 seat border = canonical L1 border",
    l1.zoneStroke === RP22_GRADE_TOKENS.L1.border);
}

// --- G. FAIL seat uses canonical FAIL tokens ---
{
  const failStyle = getSeatCircleStyle("FAIL", false);
  check("G: FAIL seat fill = canonical FAIL bg",
    failStyle.zoneFill === RP22_GRADE_TOKENS.FAIL.bg,
    `got ${failStyle.zoneFill}, expected ${RP22_GRADE_TOKENS.FAIL.bg}`);
  check("G: FAIL seat border = canonical FAIL border",
    failStyle.zoneStroke === RP22_GRADE_TOKENS.FAIL.border);
  check("G: FAIL dot fill = canonical FAIL bg (solid)",
    failStyle.dotFill === RP22_GRADE_TOKENS.FAIL.bg);
}

// --- H. Primary L2 = L2 colour + Primary outline ---
{
  const primaryL2 = getSeatCircleStyle("L2", true);
  check("H: Primary L2 has L2 fill",
    primaryL2.zoneFill === RP22_GRADE_TOKENS.L2.bg);
  check("H: Primary L2 has bold outline (3.5)",
    primaryL2.zoneStrokeWidth === 3.5);
  check("H: Primary L2 has L2 border colour",
    primaryL2.zoneStroke === RP22_GRADE_TOKENS.L2.border);
}

// --- I. Secondary L4 = L4 colour + normal outline ---
{
  const secondaryL4 = getSeatCircleStyle("L4", false);
  check("I: Secondary L4 has L4 fill",
    secondaryL4.zoneFill === RP22_GRADE_TOKENS.L4.bg);
  check("I: Secondary L4 has normal outline (1.5)",
    secondaryL4.zoneStrokeWidth === 1.5);
  check("I: Secondary L4 has L4 border colour",
    secondaryL4.zoneStroke === RP22_GRADE_TOKENS.L4.border);
}

// --- J. All-N/A parameter → no sheet ---
{
  check("J: isAssessedLevel(null) === false",
    isAssessedLevel(null) === false);
  check("J: isAssessedLevel('N/A') === false",
    isAssessedLevel("N/A") === false);
  check("J: hasAnyAssessedSeat all-null → false",
    hasAnyAssessedSeat([{ p9Level: null }, { p9Level: null }], "p9Level") === false);
}

// --- K. All-Not-Assessed parameter → no sheet ---
{
  check("K: isAssessedLevel('not_assessed') === false",
    isAssessedLevel("not_assessed") === false);
  check("K: hasAnyAssessedSeat all-not-assessed → false",
    hasAnyAssessedSeat([{ worstLevel: null }, { worstLevel: null }], "worstLevel") === false);
}

// --- L. All-Not-Calculated parameter → no sheet ---
{
  check("L: isAssessedLevel('Not Calculated') === false",
    isAssessedLevel("Not Calculated") === false);
  check("L: isAssessedLevel('—') === false",
    isAssessedLevel("—") === false);
  check("L: isAssessedLevel(undefined) === false",
    isAssessedLevel(undefined) === false);
}

// --- M. Genuine FAIL → sheet retained ---
{
  check("M: isAssessedLevel('FAIL') === true",
    isAssessedLevel("FAIL") === true);
  check("M: hasAnyAssessedSeat with FAIL → true",
    hasAnyAssessedSeat([{ p9Level: "FAIL" }], "p9Level") === true);
  check("M: hasAnyAssessedSeat all-FAIL → true",
    hasAnyAssessedSeat([{ p9Level: "FAIL" }, { p9Level: "FAIL" }], "p9Level") === true);
}

// --- N. Mixed calculated/N/A seats → sheet retained ---
{
  const mixed = [{ p9Level: "L4" }, { p9Level: null }, { p9Level: "L2" }];
  check("N: hasAnyAssessedSeat mixed → true (genuine assessed results exist)",
    hasAnyAssessedSeat(mixed, "p9Level") === true);
  check("N: hasAnyAssessedSeat mixed with FAIL → true",
    hasAnyAssessedSeat([{ p9Level: null }, { p9Level: "FAIL" }], "p9Level") === true);
}

// --- O. Removed sheets leave no artefact ---
{
  // When hasAnyAssessedSeat returns false, the sheet is simply not pushed.
  // This is a clean boolean — no blank/undefined/page-gap.
  const allNa = [{ p9Level: null }, { p9Level: null }];
  const shouldInclude = hasAnyAssessedSeat(allNa, "p9Level");
  check("O: All-N/A returns clean false (no artefact)",
    shouldInclude === false,
    `got ${shouldInclude}`);

  // Simulate the activePages filter: only include when true
  const activePages = [];
  if (hasAnyAssessedSeat([{ p9Level: "L4" }], "p9Level")) {
    activePages.push("p9");
  }
  if (hasAnyAssessedSeat(allNa, "p9Level")) {
    activePages.push("would-be-blank");
  }
  check("O: No blank/undefined entry in activePages",
    activePages.length === 1 && activePages[0] === "p9",
    `got ${JSON.stringify(activePages)}`);
}

// --- P. Visual Report uses the same semantic grade token authority as RP22 pills ---
{
  for (const level of ["L4", "L3", "L2", "L1", "FAIL"]) {
    const grade = getSeatGradeColors(level);
    const token = RP22_GRADE_TOKENS[level];
    check(`P: ${level} fill matches RP22_GRADE_TOKENS`,
      grade.fill === token.bg,
      `got ${grade.fill}, expected ${token.bg}`);
    check(`P: ${level} border matches RP22_GRADE_TOKENS`,
      grade.border === token.border,
      `got ${grade.border}, expected ${token.border}`);
    check(`P: ${level} text matches RP22_GRADE_TOKENS`,
      grade.text === token.text,
      `got ${grade.text}, expected ${token.text}`);
  }
}

// --- Q. L1 and FAIL are visually distinguishable ---
{
  const l1 = getSeatGradeColors("L1");
  const fail = getSeatGradeColors("FAIL");
  check("Q: L1 fill ≠ FAIL fill",
    l1.fill !== fail.fill,
    `L1=${l1.fill}, FAIL=${fail.fill}`);
  check("Q: L1 text ≠ FAIL text",
    l1.text !== fail.text,
    `L1=${l1.text}, FAIL=${fail.text}`);
  check("Q: FAIL is solid (isFail=true)",
    fail.isFail === true);
  check("Q: L1 is not solid (isFail=false)",
    l1.isFail === false);
}

// --- R. PRIORITY_LEGEND explains priority, not grade colour ---
{
  check("R: PRIORITY_LEGEND has 2 entries (Primary / Secondary)",
    PRIORITY_LEGEND.length === 2,
    `got ${PRIORITY_LEGEND.length}`);
  check("R: First entry is 'Primary seat'",
    PRIORITY_LEGEND[0].label === "Primary seat",
    `got ${PRIORITY_LEGEND[0].label}`);
  check("R: Second entry is 'Secondary seat'",
    PRIORITY_LEGEND[1].label === "Secondary seat",
    `got ${PRIORITY_LEGEND[1].label}`);
  check("R: Primary stroke is heavier than Other",
    PRIORITY_LEGEND[0].strokeWidth > PRIORITY_LEGEND[1].strokeWidth,
    `Primary=${PRIORITY_LEGEND[0].strokeWidth}, Other=${PRIORITY_LEGEND[1].strokeWidth}`);
  // Legend entries must NOT use grade colours — they use neutral outline colours
  check("R: Legend fill is 'none' (no grade colour in legend)",
    PRIORITY_LEGEND.every((e) => e.fill === "none"));
}

// --- Additional: numeric level inputs ---
{
  check("Numeric 4 → L4 tokens",
    getSeatGradeColors(4).fill === RP22_GRADE_TOKENS.L4.bg);
  check("Numeric 1 → L1 tokens",
    getSeatGradeColors(1).fill === RP22_GRADE_TOKENS.L1.bg);
  check("Numeric 0 → FAIL tokens",
    getSeatGradeColors(0).fill === RP22_GRADE_TOKENS.FAIL.bg);
}

// --- Additional: primary dot is larger than secondary dot ---
{
  const primary = getSeatCircleStyle("L4", true);
  const secondary = getSeatCircleStyle("L4", false);
  check("Primary dot radius (7) > Secondary dot radius (5)",
    primary.dotR > secondary.dotR,
    `Primary=${primary.dotR}, Secondary=${secondary.dotR}`);
}

console.log(`\n--- Results: ${pass} passed, ${fail} failed ---\n`);

if (fail > 0) {
  process.exit(1);
}