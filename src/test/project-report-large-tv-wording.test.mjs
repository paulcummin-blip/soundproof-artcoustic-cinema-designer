/**
 * project-report-large-tv-wording.test.mjs
 * ---------------------------------------
 * THE Project Report headline wording rule, as a regression fixture.
 *
 * The headline describes the actual design — the system format and the display
 * it is built around — never an imagined mood or lifestyle. It avoids generic
 * praise (relaxed, high-performance, large) and uses 'discreet' only where the
 * speaker selection (on-wall or in-ceiling) supports it.
 *
 * Fixtures: Marquee Home / Original Design (100" TV, 5.1) and the same design
 * built around a 65" TV. Read the two designs through the report's own opening
 * authority; nothing is recalculated here.
 */
import { describe, test, expect } from "vitest";

import { buildProjectReportOpening } from "@/components/report/projectReport/projectReportOpening";
import { classifyProjectIntent, PROJECT_INTENT } from "@/components/report/projectReport/projectIntentClassification";

const ROOM = { widthM: 5.42, lengthM: 5.25, heightM: 2.4 };
const SEATS = [
  { id: "s1", x: 1.6, y: 3.4 }, { id: "s2", x: 2.1, y: 3.4 },
  { id: "s3", x: 2.6, y: 3.4 }, { id: "s4", x: 3.1, y: 3.4 },
];
const PRODUCTS = {
  rows: [
    { key: "lcr", area: "Screen channels", value: "C4-1, EVOLVE 3-1 × 2" },
    { key: "surrounds", area: "Surrounds / wides", value: "EVOLVE 2-1 × 2" },
    { key: "subwoofers", area: "Subwoofers", value: "SUB2-12 × 2 (rear)" },
    { key: "acoustic_treatment", area: "Acoustic treatment", value: "Artcoustic Abfuser × 6" },
  ],
  lcr: ["C4-1", "EVOLVE 3-1 × 2"],
  surrounds: ["EVOLVE 2-1 × 2"],
  overheads: [],
  subwoofers: ["SUB2-12 × 2 (rear)"],
  acoustic_treatment: ["Artcoustic Abfuser × 6"],
};

/** Marquee Home: a single-row 5.1 design around a television of the given size. */
const tvDesign = (presetKey, widthMm) => ({
  tv_preset_key: presetKey,
  tv_width_mm: widthMm,
  dolby_config: "5.1",
  screen_mount_mode: "baffle",
  mlp_basis: "middle",
});

const open = (projectDetails) => buildProjectReportOpening({
  projectDetails,
  roomDims: ROOM,
  productsSelected: PRODUCTS,
  seatingPositions: SEATS,
});

const MARQUEE_100 = tvDesign("tv100", 2230);
const LOUNGE_65 = tvDesign("tv65", 1440);
const BOUNDARY_77 = tvDesign("tv77", 1717);

describe("the design-specific headline wording rule", () => {
  test('100" TV headline is design-specific, discreet, and never "large"', () => {
    const opening = open(MARQUEE_100);
    expect(opening.headline).toBe('A discreet cinema system built around a 100" TV');
    // The intent paragraph (unchanged) still carries the display scale it always did.
    expect(opening.intent).toContain('built around a large 100" TV');
    expect(opening.intent).toContain("designed for sport, box sets, films and music");
  });

  test("77\" TV headline names the display without 'large'", () => {
    const opening = open(BOUNDARY_77);
    expect(opening.headline).toContain('77" TV');
    expect(opening.headline).not.toMatch(/\blarge\b/i);
    // The intent paragraph (unchanged) still describes the 77" as large.
    expect(opening.intent).toContain('large 77" TV');
  });

  test('65" TV headline is design-specific and never called large', () => {
    const opening = open(LOUNGE_65);
    expect(classifyProjectIntent({ projectDetails: LOUNGE_65 }).intent).toBe(PROJECT_INTENT.MEDIA_LOUNGE);
    expect(opening.headline).toBe('A discreet cinema system built around a 65" TV');
    expect(opening.intent).toContain('built around a 65" TV');
    // The opening carries no supporting line: the screen, the room and the
    // seating are stated by the page's own fact sheet instead.
    expect(opening.supportingLine).toBeUndefined();
    [opening.headline, opening.intent].forEach((text) => {
      // The headline never says "large"; the intent for a 65" set never did either.
      expect(text).not.toMatch(/\blarge\b/i);
    });
  });

  test('a 65" room still reads as a media lounge, not a dedicated cinema', () => {
    const opening = open(LOUNGE_65);
    expect(opening.headline).toContain("cinema system");
    expect(opening.intent).not.toMatch(/dedicated cinema|cinema bunker|compact dedicated/i);
  });

  test("a 65\" design keeps the 'sensible and intentional' system wording in the intent", () => {
    const opening = open(LOUNGE_65);
    expect(opening.intent).toContain("with a sensible surround system that keeps the room comfortable while still delivering impact when needed");
  });

  test("no seating over-emphasis and no absent overhead language, at either size", () => {
    [MARQUEE_100, LOUNGE_65].forEach((design) => {
      const { intent } = open(design);
      expect(intent).not.toMatch(/single seating row|seating row sits/i);
      expect(intent).not.toMatch(/overhead|Atmos|immersive/i);
    });
  });

  test("the headline never uses banned lifestyle or generic praise language", () => {
    [MARQUEE_100, LOUNGE_65, BOUNDARY_77].forEach((design) => {
      const { headline } = open(design);
      expect(headline).not.toMatch(/relaxed|high-performance|luxurious|exceptional|stunning/i);
      expect(headline).not.toMatch(/\blarge\b/i);
    });
  });

  test("a system format is stated in the headline when supplied", () => {
    const opening = buildProjectReportOpening({
      projectDetails: MARQUEE_100,
      roomDims: ROOM,
      productsSelected: PRODUCTS,
      seatingPositions: SEATS,
      systemFormat: "5.2",
    });
    expect(opening.headline).toBe('A discreet 5.2 cinema system built around a 100" TV');
  });

  test("an 83\" TV uses the correct article 'an'", () => {
    const design83 = tvDesign("tv83", 1872);
    const opening = buildProjectReportOpening({
      projectDetails: design83,
      roomDims: ROOM,
      productsSelected: PRODUCTS,
      seatingPositions: SEATS,
      systemFormat: "5.2.2",
    });
    expect(opening.headline).toBe('A discreet 5.2.2 cinema system built around an 83" TV');
  });

  test("a projection cinema keeps its dedicated-cinema headline", () => {
    const projectionDesign = {
      screen_size: 140,
      aspect_ratio: "2.35:1",
      dolby_config: "7.4.6",
      screen_mount_mode: "baffle",
    };
    const opening = buildProjectReportOpening({
      projectDetails: projectionDesign,
      roomDims: { widthM: 6, lengthM: 8, heightM: 3 },
      productsSelected: PRODUCTS,
      seatingPositions: SEATS,
      systemFormat: "7.4.6",
    });
    expect(opening.headline).toContain("cinema designed around a");
    expect(opening.headline).toContain('7.4.6');
    expect(opening.headline).not.toMatch(/media room|cinema system/i);
  });
});