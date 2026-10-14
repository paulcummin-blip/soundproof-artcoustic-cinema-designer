/**
 * project-report-large-tv-wording.test.mjs
 * ---------------------------------------
 * THE large-television wording rule, as a regression fixture.
 *
 * The Project Report's opening copy describes a television as "large" only from
 * 77" upwards. A smaller single-row television design is still a media lounge /
 * media room, but it names the set it is built around — `65" TV` — and never
 * calls it large.
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

describe("the large-television wording rule", () => {
  test('100" TV is large, and the media-room intent is unchanged', () => {
    const opening = open(MARQUEE_100);
    expect(opening.headline).toBe('A relaxed high-performance media room built around a large 100" TV');
    expect(opening.intent).toContain('built around a large 100" TV');
    expect(opening.intent).toContain("designed for sport, box sets, films and music");
  });

  test("77\" TV is large (the rule's own boundary)", () => {
    const opening = open(BOUNDARY_77);
    expect(opening.headline).toContain('large 77" TV');
    expect(opening.intent).toContain('large 77" TV');
  });

  test('65" TV is a media lounge, and is never called large', () => {
    const opening = open(LOUNGE_65);
    expect(classifyProjectIntent({ projectDetails: LOUNGE_65 }).intent).toBe(PROJECT_INTENT.MEDIA_LOUNGE);
    expect(opening.headline).toBe('A relaxed high-performance media room built around a 65" TV');
    expect(opening.intent).toContain('built around a 65" TV');
    [opening.headline, opening.supportingLine, opening.intent].forEach((text) => {
      expect(text).not.toMatch(/\blarge\b/i);
    });
  });

  test('a 65" room still reads as a media room, not a dedicated cinema', () => {
    const opening = open(LOUNGE_65);
    expect(opening.headline).toContain("media room");
    expect(opening.intent).not.toMatch(/dedicated cinema|cinema bunker|compact dedicated/i);
  });

  test("a 65\" design keeps the 'sensible and intentional' system wording", () => {
    const opening = open(LOUNGE_65);
    expect(opening.intent).toContain("with a sensible 5.1 system that keeps the room comfortable while still delivering impact when needed");
  });

  test("no seating over-emphasis and no absent overhead language, at either size", () => {
    [MARQUEE_100, LOUNGE_65].forEach((design) => {
      const { intent } = open(design);
      expect(intent).not.toMatch(/single seating row|seating row sits/i);
      expect(intent).not.toMatch(/overhead|Atmos|immersive/i);
    });
  });
});