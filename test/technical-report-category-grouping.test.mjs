/**
 * Technical Report category grouping, category banners, assumed-parameter
 * exclusion and category colour authority.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  PARAM_CATEGORIES,
  PARAM_CATEGORY_BANNER_COLOURS,
  PARAM_CATEGORY_BANNER_TEXT,
  PARAM_CATEGORY_COLOURS,
  getCategoryBannerColour,
  getCategoryColour,
} from "../src/components/report/technical/technicalParameterMeta.js";
import {
  ASSUMED_FLOOR_EXCLUDED_KEYS,
  getCategoryFloorSummaries,
} from "../src/components/report/technical/designRatingPresentation.js";

const CATEGORY_IDS = {
  "Spatial Resolution": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "Dynamic Range": [12, 13, 14, 15, 16],
  "Timbre Matching": [17, 18, 19, 20, 21],
};

test("A — P12 to P16 all sit under Dynamic Range, P17 onward under Timbre Matching", () => {
  for (const [category, ids] of Object.entries(CATEGORY_IDS)) {
    for (const id of ids) {
      assert.equal(PARAM_CATEGORIES[id], category, `P${id} must be ${category}`);
    }
  }
});

test("A/B — a parameter never appears under two categories", () => {
  const assigned = Object.values(PARAM_CATEGORIES);
  assert.equal(new Set(assigned).size, 3);
  assert.equal(assigned.length, 21);
});

test("B — the category floor ranges follow the same grouping", () => {
  const rating = {
    status: "ASSESSED",
    contributions: [
      { key: "p12", parameter: 12, resultLevel: "L4" },
      { key: "p16", parameter: 16, resultLevel: "L4" },
    ],
  };
  const dynamicRange = getCategoryFloorSummaries(rating).find((c) => c.label === "Dynamic Range");
  assert.equal(dynamicRange.hasContribs, true);
  assert.equal(dynamicRange.floorLevel, "L4");
  assert.ok(
    dynamicRange.paramDetails.some((parameter) => parameter.key === "p16"),
    "P16 belongs to Dynamic Range, so its detail sits in that group",
  );
});

test("assumed parameters do not appear as the Timbre Matching group either", () => {
  const rating = {
    status: "ASSESSED",
    contributions: [
      { key: "p17", parameter: 17, resultLevel: "L4" },
      { key: "p18", parameter: 18, resultLevel: "L3" },
    ],
  };
  const timbre = getCategoryFloorSummaries(rating).find((c) => c.label === "Timbre Matching");
  assert.equal(timbre.floorLevel, "L3");
});

test("E — an assumed level never lowers the seat floor, and never limits the group", () => {
  const rating = {
    status: "ASSESSED",
    contributions: [
      { key: "p12", parameter: 12, resultLevel: "L4" },
      { key: "p13", parameter: 13, resultLevel: "L4" },
      { key: "p15", parameter: 15, resultLevel: "L2" }, // assumed noise floor
      { key: "p16", parameter: 16, resultLevel: "L4" },
      { key: "p17", parameter: 17, resultLevel: "L4" },
      { key: "p21", parameter: 21, resultLevel: "L2" }, // assumed early reflections
    ],
  };
  const categories = getCategoryFloorSummaries(rating);
  assert.equal(categories.find((c) => c.label === "Dynamic Range").floorLevel, "L4");
  assert.equal(categories.find((c) => c.label === "Timbre Matching").floorLevel, "L4");

  const keys = categories.flatMap((c) => c.paramDetails || []).map((parameter) => parameter.key);
  assert.equal(keys.includes("p15"), false, "assumed P15 is never a limiting parameter");
  assert.equal(keys.includes("p21"), false, "assumed P21 is never a limiting parameter");
  assert.deepEqual([...ASSUMED_FLOOR_EXCLUDED_KEYS], ["p8", "p15", "p21"]);
});

test("E — a genuine FAIL still governs the category floor", () => {
  const rating = {
    status: "ASSESSED",
    contributions: [
      { key: "p12", parameter: 12, resultLevel: "L4" },
      { key: "p13", parameter: 13, resultLevel: "FAIL" },
      { key: "p15", parameter: 15, resultLevel: "L2" },
    ],
  };
  const dynamicRange = getCategoryFloorSummaries(rating).find((c) => c.label === "Dynamic Range");
  assert.equal(dynamicRange.hasFail, true);
  assert.equal(dynamicRange.floorLevel, "FAIL");
});

test("E — a measured result marked assumed:false still counts", () => {
  const rating = {
    status: "ASSESSED",
    contributions: [{ key: "p15", parameter: 15, resultLevel: "L2", assumed: false }],
  };
  const dynamicRange = getCategoryFloorSummaries(rating).find((c) => c.label === "Dynamic Range");
  assert.equal(dynamicRange.floorLevel, "L2");
});

test("G — the three categories use distinct on-brand colours", () => {
  const spatial = getCategoryColour("Spatial Resolution");
  const dynamic = getCategoryColour("Dynamic Range");
  const timbre = getCategoryColour("Timbre Matching");
  assert.deepEqual([spatial, dynamic, timbre], ["#213428", "#625143", "#3E4349"]);
  assert.equal(new Set([spatial, dynamic, timbre]).size, 3);
  assert.equal(Object.keys(PARAM_CATEGORY_COLOURS).length >= 3, true);
});

test("G — the category banner carries its own section-identity palette", () => {
  // Green for Spatial Resolution, slate for Dynamic Range, warm brown for
  // Timbre Matching. The parameter card's own small category label keeps the
  // palette asserted above, unchanged.
  assert.deepEqual(
    [
      getCategoryBannerColour("Spatial Resolution"),
      getCategoryBannerColour("Dynamic Range"),
      getCategoryBannerColour("Timbre Matching"),
    ],
    ["#213428", "#3E4349", "#625143"],
  );
  assert.equal(PARAM_CATEGORY_BANNER_TEXT, "#FFFFFF");
  assert.equal(Object.keys(PARAM_CATEGORY_BANNER_COLOURS).length >= 3, true);
});

test("B/C/D/H — continuation heading, mid-page divider and print rules are wired", async () => {
  const page = await readFile(
    new URL("../src/components/report/technical/TechnicalParameterPage.jsx", import.meta.url),
    "utf8",
  );
  const grid = await readFile(
    new URL("../src/components/report/RP22ReportParameterGrid.jsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/components/report/ReportPrintStyles.jsx", import.meta.url),
    "utf8",
  );

  // One uniform banner heads every category run, on the category's first page
  // and on a page that continues it alike. The heading states the canonical
  // category name only — no page note, and no continuation flag anywhere.
  assert.doesNotMatch(page, /continued/i);
  assert.doesNotMatch(grid, /continued/i);
  assert.match(page, /<TechnicalCategoryBanner category=\{segment\.category\} \/>/);
  assert.match(banner, /data-report-section-heading="true"/);
  assert.match(page, /breakInside: "avoid"/);
  assert.match(page, /pageBreakInside: "avoid"/);
  assert.match(page, /className="tech-param-page__cards"/);

  // The banner strip itself owns the colour authority and the bold heading.
  const banner = await readFile(
    new URL("../src/components/report/technical/TechnicalCategoryBanner.jsx", import.meta.url),
    "utf8",
  );
  assert.match(banner, /getCategoryBannerColour/);
  assert.match(banner, /fontWeight: 700/);
  assert.doesNotMatch(banner, /continued/i);

  // Print: heading travels with its cards and the divider page reclaims height.
  assert.match(styles, /\.tech-param-segment[\s\S]*?break-inside:\s*avoid\s*!important/);
  assert.match(styles, /\.tech-param-page--multi/);
});

test("F — the report still marks exactly P8, P15 and P21 as assumed", async () => {
  const source = await readFile(
    new URL("../src/components/engineering/engineeringSummaryAuthority.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /key === "p15" \|\| key === "p21" \|\| key === "p8"/);
  assert.match(source, /\? "assumed" : "calculated"/);
});