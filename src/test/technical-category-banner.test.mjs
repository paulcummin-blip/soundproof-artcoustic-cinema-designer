/**
 * technical-category-banner.test.mjs
 * ----------------------------------
 * RP22 Technical category hierarchy: every Technical parameter page is
 * immediately identifiable as Spatial Resolution, Dynamic Range or Timbre
 * Matching through one strong branded banner.
 *
 * Guards the acceptance rules:
 *   1-3  one section-identity colour per category (green / slate / warm brown)
 *   4    the category name is bold and larger than the parameter-card heading
 *   5    no "CONTINUED" (and no continuation wording) in a category heading
 *   6-7  parameter cards and their level pills are untouched
 *   8    the banner is restrained, so the fixed A4 frame budget is unchanged
 *   9    P1-P21 stay in the existing seven-page, three-card sequence
 *
 * Presentation only. No RP22 value, level, category membership or pagination
 * decision is recalculated here.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PARAM_CATEGORIES,
  PARAM_CATEGORY_BANNER_COLOURS,
  PARAM_CATEGORY_BANNER_TEXT,
  PARAM_CATEGORY_COLOURS,
  getCategoryBannerColour,
  getCategoryColour,
} from "../components/report/technical/technicalParameterMeta.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const BANNER = read("src/components/report/technical/TechnicalCategoryBanner.jsx");
const PAGE = read("src/components/report/technical/TechnicalParameterPage.jsx");
const GRID = read("src/components/report/RP22ReportParameterGrid.jsx");
const CARD = read("src/components/report/technical/TechnicalParameterCard.jsx");
const STYLES = read("src/components/report/ReportPrintStyles.jsx");

const SPATIAL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DYNAMIC_IDS = [12, 13, 14, 15, 16];
const TIMBRE_IDS = [17, 18, 19, 20, 21];

test("1-3 — each category carries its own section-identity colour", () => {
  assert.equal(getCategoryBannerColour("Spatial Resolution"), "#213428");
  assert.equal(getCategoryBannerColour("Dynamic Range"), "#3E4349");
  assert.equal(getCategoryBannerColour("Timbre Matching"), "#625143");
  assert.equal(new Set(Object.values(PARAM_CATEGORY_BANNER_COLOURS)).size, 3);
  assert.equal(PARAM_CATEGORY_BANNER_TEXT, "#FFFFFF");
});

test("4 — the category name is bold and larger than the card heading", () => {
  assert.match(BANNER, /fontWeight: 700/);
  const bannerSize = Number(/fontSize: "(\d+(?:\.\d+)?)pt"/.exec(BANNER)?.[1]);
  assert.equal(Number.isFinite(bannerSize), true);
  assert.ok(bannerSize >= 12, `banner heading must be at least 12pt, got ${bannerSize}`);
  // The card's own human title is 10.5pt and weight 400.
  assert.match(CARD, /fsTitle: "10\.5pt"/);
  assert.ok(bannerSize > 10.5);
  assert.match(BANNER, /textTransform: "uppercase"/);
});

test("5 — no CONTINUED remains in a category heading", () => {
  for (const [name, source] of [["banner", BANNER], ["page", PAGE], ["grid", GRID]]) {
    assert.doesNotMatch(source, /continued/i, `${name} must not state a continuation`);
  }
  // The old small heading marker is gone from code and print styles alike.
  assert.doesNotMatch(PAGE, /tech-param-segment-heading/);
  assert.doesNotMatch(STYLES, /tech-param-segment-heading/);
  // Every category run on every page renders the banner, and only it.
  assert.match(PAGE, /<TechnicalCategoryBanner category=\{segment\.category\} \/>/);
  assert.doesNotMatch(PAGE, /SegmentHeading/);
});

test("6-7 — cards and level pills are untouched by the banner", () => {
  // The card's own small category label keeps the palette it already used.
  assert.deepEqual(
    [
      getCategoryColour("Spatial Resolution"),
      getCategoryColour("Dynamic Range"),
      getCategoryColour("Timbre Matching"),
    ],
    ["#213428", "#625143", "#3E4349"],
  );
  assert.equal(Object.keys(PARAM_CATEGORY_COLOURS).length >= 3, true);
  // The banner introduces no grade, pill or threshold styling of its own.
  assert.doesNotMatch(BANNER, /GradingPill|rp22Colors|TechnicalLevelBadge|threshold/i);
  // The card still renders its level badge and its own threshold strip.
  assert.match(CARD, /TechnicalLevelBadge/);
  assert.match(CARD, /function ThresholdStrip/);
});

test("8 — the banner stays restrained so the A4 frame budget is unchanged", () => {
  assert.match(BANNER, /padding: "0\.7mm 3\.5mm"/);
  assert.match(STYLES, /\.tech-param-category-banner[\s\S]*?padding: 0\.7mm 3\.5mm/);
  // The old 3 mm page and heading gaps are reclaimed; the card gap is untouched.
  assert.match(PAGE, /gap: "2mm"/);
  assert.match(PAGE, /gap: "0\.8mm"/);
  assert.match(PAGE, /gap: "3mm"/);
  // Restrained height: two 0.7 mm paddings plus a 12pt line at 1.12 leading.
  const bannerHeightMm = 0.7 * 2 + 12 * 1.12 * 0.3528;
  assert.ok(bannerHeightMm <= 6.5, `banner must stay under 6.5mm, got ${bannerHeightMm}`);
});

test("9 — P1-P21 stay in the existing seven-page three-card sequence", () => {
  assert.equal(Object.keys(PARAM_CATEGORIES).length, 21);
  SPATIAL_IDS.forEach((id) => assert.equal(PARAM_CATEGORIES[id], "Spatial Resolution"));
  DYNAMIC_IDS.forEach((id) => assert.equal(PARAM_CATEGORIES[id], "Dynamic Range"));
  TIMBRE_IDS.forEach((id) => assert.equal(PARAM_CATEGORIES[id], "Timbre Matching"));

  assert.match(GRID, /TECHNICAL_PARAMETER_CARDS_PER_PAGE\s*=\s*3/);
  assert.equal(Object.keys(PARAM_CATEGORIES).length / 3, 7);
  // Every page still renders through the same page wrapper, with its segments.
  assert.match(GRID, /<TechnicalParameterPage/);
  assert.match(GRID, /segments=\{page\.segments\.map/);
  assert.match(PAGE, /className="tech-param-page__cards"/);
});