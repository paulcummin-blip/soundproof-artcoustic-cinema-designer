import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(
  new URL("../src/components/report/ReportPrintStyles.jsx", import.meta.url),
  "utf8",
);
const scorecard = await readFile(
  new URL("../src/components/report/technical/TechnicalAsdrScorecard.jsx", import.meta.url),
  "utf8",
);
const recommendations = await readFile(
  new URL("../src/components/report/technical/TechnicalAsdrRecommendations.jsx", import.meta.url),
  "utf8",
);
const parameterPage = await readFile(
  new URL("../src/components/report/technical/TechnicalParameterPage.jsx", import.meta.url),
  "utf8",
);

test("ASDR recommendations stay together and the redesigned scorecard leads with categories", () => {
  assert.match(recommendations, /className="tech-asdr-recommendations"/);
  assert.match(recommendations, /className="tech-rec-columns"/);
  // Redesigned scorecard: four categories lead, seating summaries support
  assert.match(scorecard, /className="tech-asdr-categories"/);
  assert.match(scorecard, /AsdrCategorySection/);
  assert.match(scorecard, /AsdrSeatingSummary/);
  assert.match(scorecard, /getCategoryModalSummaries/);
  // Old per-parameter scorecard table is gone
  assert.doesNotMatch(scorecard, /tech-asdr-scorecard-row/);
  assert.doesNotMatch(scorecard, /tech-asdr-scorecard-group/);
  // Print styles keep recommendations and each category section together
  assert.match(styles, /\.tech-asdr-recommendations[\s\S]*?break-inside:\s*avoid\s*!important/);
  assert.match(styles, /\.tech-asdr-category-section[\s\S]*?break-inside:\s*avoid\s*!important/);
  assert.match(styles, /\.tech-asdr-seating-summary[\s\S]*?break-inside:\s*avoid\s*!important/);
});

test("technical parameter groups break after complete groups without phantom break-before pages", () => {
  assert.match(parameterPage, /breakInside:\s*"auto"/);
  assert.match(parameterPage, /pageBreakInside:\s*"auto"/);
  assert.match(styles, /\.tech-param-page:not\(:last-child\)[\s\S]*?break-after:\s*page/);
  assert.doesNotMatch(styles, /\.tech-param-page\s*\+\s*\.tech-param-page[\s\S]*?break-before:\s*page/);
  assert.match(styles, /\.tech-param-card[\s\S]*?break-inside:\s*avoid\s*!important/);
});