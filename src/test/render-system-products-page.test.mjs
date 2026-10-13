/**
 * render-system-products-page.test.mjs
 * ------------------------------------
 * Renders page 3 of the Project Report — System & Products — as a standalone A4
 * sheet, so the page can be LOOKED AT in a real browser. That is the check a DOM
 * assertion cannot make: a table can be perfect in the document and still be
 * broken on the sheet, which is exactly how the five-track regression passed its
 * tests while the printed page fell apart.
 *
 * The markup is the real React page, printed exactly as the report prints it, laid
 * on the report's own A4 frame (210 × 297 mm with the shared 12 mm page margin)
 * and styled by the app's own compiled stylesheet plus the report's typography and
 * print styles. The only thing this file does is write that page out.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ProjectReportSystemOverview from '../components/report/projectReport/ProjectReportSystemOverview.jsx';
import ReportPrintStyles from '../components/report/ReportPrintStyles.jsx';
import ReportTypographyStyles from '../components/report/typography/ReportTypographyStyles.jsx';
import liveEvidence from './fixtures/marqueeLiveAdiEvidence.json';

const OUT = '/tmp/system-products-page.html';

/** The compiled stylesheet the running app serves, when one has been built. */
function compiledCss() {
  for (const dir of [path.resolve('dist/assets'), path.resolve('dist-verify/assets')]) {
    if (!fs.existsSync(dir)) continue;
    const file = fs.readdirSync(dir).filter((name) => name.endsWith('.css')).sort().pop();
    if (file) {
      // The webfont is fetched over the network; the sheet is rendered here without
      // it, so nothing can block the page's first paint. The report's own fallback
      // stack carries the same geometry.
      return fs.readFileSync(path.join(dir, file), 'utf8').replace(/@import[^;]+;/g, '');
    }
  }
  // No build on disk: the sheet still renders, and the table's own column tracks
  // and cell placement are inline styles either way.
  return '';
}

// The page as the design states it: the specification schedule and the viewing
// geometry of both seating rows, in the sheet's own units.
const PROJECT = {
  dolby_config: '9.1.6',
  aspect_ratio: '2.35:1',
  screen_size: 150,
  screen_height_from_floor: 0.5,
  screen_wall: 'front',
  room_length: 7.4,
  room_width: 5.2,
  room_height: 2.7,
  manual_dimensions: true,
  manual_width_m: 5.2,
  manual_height_m: 2.2,
};

const PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'Q4-3 × 3' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'EVOLVE 2-1 × 6' },
    { key: 'overheads', area: 'Overheads', value: 'SPITFIRE CLOUD × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB3-12 × 2 (front), SUB3-12 × 2 (rear)' },
    { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'Artcoustic Abfuser × 6' },
  ],
};

const seatingRow = (rowIndex, label, angleDeg) => ({
  rowIndex,
  label,
  seats: Array.from({ length: 4 }, () => ({ level: 'L3', angleDeg })),
});

const ROWS = [seatingRow(1, 'Front row', 66.5), seatingRow(2, 'Rear row', 44.1)];

test('the System & Products page renders as a standalone A4 sheet', () => {
  const page = renderToStaticMarkup(React.createElement(ProjectReportSystemOverview, {
    projectDetails: PROJECT,
    productsSelected: PRODUCTS,
    engineeringSummary: liveEvidence.engineeringSummary,
    rows: ROWS,
    print: true,
  }));

  const styles = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(ReportTypographyStyles, null),
    React.createElement(ReportPrintStyles, null),
  ));

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>System &amp; Products — Project Report page 3</title>
<style>${compiledCss()}</style>
<style>
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  /* The report's own frame: A4 portrait with the shared 12 mm page margin. */
  .sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 12mm; margin: 0 auto; background: #FFFFFF; }
</style>
</head>
<body>
${styles}
<div class="sheet rp22-report">${page}</div>
</body>
</html>`;

  fs.writeFileSync(OUT, html);
  const size = fs.statSync(OUT).size;
  assert.ok(size > 5000, 'the sheet was written');
  console.log(`[RENDER] ${OUT} (${Math.round(size / 1024)} KB)`);
});