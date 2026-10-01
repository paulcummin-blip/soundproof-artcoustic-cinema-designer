// visual-report-no-design-assumptions.test.mjs
// ---------------------------------------------------------------------------
// Product rule:
//   Visual Report = strengths and experience of the design.
//   Technical Report = assumptions and engineering caveats.
//
//   TEST 1  The Visual Report carries no "Design Assumptions" block
//   TEST 2  Background Noise Floor / Early Reflections are absent from the
//           Visual Report headline area (screen + print paths)
//   TEST 3  The Technical Report still presents the P15/P21 assumptions
//   TEST 4  No data loss: the assumed-parameter authority is untouched
//   TEST 5  The Visual Report still consumes the published engineering
//           summary for its real content (removal is presentation-only)
//
// Source scan only — no calculation, no assumed-parameter handling change.
// Run: npx vitest run src/test/visual-report-no-design-assumptions.test.mjs

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const HIGHLIGHTS = "src/components/report/client/ClientDesignHighlights.jsx";
const PRINT_PAGE = "src/components/report/client/ClientReportPage.jsx";
const VISUAL_PAGE = "src/pages/RP22ClientReport.jsx";

const VISUAL_SURFACES = [HIGHLIGHTS, PRINT_PAGE, VISUAL_PAGE];
const ASSUMPTION_WORDS = [
  "Design Assumptions",
  "designAssumptions",
  "Background Noise Floor",
  "Early Reflections",
];

describe("Design Assumptions removed from the Visual Report", () => {
  it("TEST 1 — no Design Assumptions block in any Visual Report surface", () => {
    for (const file of VISUAL_SURFACES) {
      const src = read(file);
      expect(src).not.toMatch(/Design Assumptions/);
      expect(src).not.toMatch(/designAssumptions/);
    }
  });

  it("TEST 2 — Background Noise Floor / Early Reflections absent from the Visual headline area", () => {
    for (const file of VISUAL_SURFACES) {
      const src = read(file);
      for (const word of ASSUMPTION_WORDS) {
        expect(src, `${file} must not mention "${word}"`).not.toContain(word);
      }
    }
  });

  it("TEST 2b — the highlights component takes no assumptions prop", () => {
    const src = read(HIGHLIGHTS);
    expect(src).toMatch(/export default function ClientDesignHighlights\(\{ highlights, print, recommendationFooter, coverageSentence \}\)/);
    expect(src).not.toMatch(/assumptions\.p15|assumptions\.p21/);
  });

  it("TEST 3 — the Technical Report still presents the P15/P21 assumptions", () => {
    const control = read("src/components/report/P15P21AssumptionControl.jsx");
    expect(control).toMatch(/NCB 22/);

    const grid = read("src/components/report/RP22ReportParameterGrid.jsx");
    expect(grid).toMatch(/P15P21AssumptionControl/);

    const meta = read("src/components/report/technical/technicalParameterMeta.js");
    expect(meta).toMatch(/Background Noise Floor/);
    expect(meta).toMatch(/Early Reflections/);
  });

  it("TEST 4 — no data loss in the assumed-parameter authority", () => {
    const authority = read("src/components/utils/assumedParameterAuthority.js");
    expect(authority).toMatch(/P15_LEVEL_TO_NCB/);
    expect(authority).toMatch(/P21_LEVEL_TO_DB/);
  });

  it("TEST 5 — the Visual Report still reads the published engineering summary", () => {
    const src = read(VISUAL_PAGE);
    expect(src).toMatch(/engineeringSummary/);
    expect(src).toMatch(/selectClientDesignHighlights/);
  });
});