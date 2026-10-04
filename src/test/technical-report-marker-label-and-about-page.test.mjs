// technical-report-marker-label-and-about-page.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — two Technical Report export rules.
//
//   TEST 1  The bass graph's marker label never states "Limiting": the boundary
//           reads "Transition / Schroeder ≈ 122 Hz", and the limiting line is
//           still drawn.
//   TEST 2  The closing About Sound Proof page is never exported while it is
//           still loading, and never exported blank — it is either complete copy
//           or the page does not exist, so the PDF gains no page for it.
//
// TEST 2 is asserted against the page sources: these components read the
// canonical content through the SDK, which the node test environment cannot
// import (src/lib/app-params.js reads `window` at module load). The rules under
// test are therefore checked where they are stated, exactly as the other report
// layout tests in this suite do.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import BassResponsePlot from '../components/report/technical/BassResponsePlot.jsx';
import { buildMarkerLabelLayout } from '../components/report/technical/bassGraphMarkerLabels.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const BOX = { plotLeft: 92, plotRight: 1172, firstRowY: 54 };

/** Source without its comments — what the component actually renders. */
const stripComments = (source) => String(source)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ── TEST 1 — "Limiting" never reaches the graph label ──────────────────────
test('TEST 1 — the marker label reads Transition / Schroeder, never Limiting', () => {
  // A named marker and an unnamed one on the same frequency: ONE label, named by
  // the named marker only, with both marker lines kept.
  const coincident = buildMarkerLabelLayout(
    [
      { key: 'transition', frequency: 122, x: 700, shortName: 'Transition / Schroeder', color: '#625143' },
      { key: 'limiting', frequency: 124, x: 706, shortName: '', color: '#B45309' },
    ],
    BOX,
  );
  assert.equal(coincident.length, 1, 'coincident markers share one label');
  assert.equal(coincident[0].text, 'Transition / Schroeder ≈ 122 Hz',
    `the label names the boundary once: ${coincident[0].text}`);
  assert.deepEqual(coincident[0].lines, [700, 706], 'both marker lines are kept');
  assert.ok(!coincident[0].text.includes('Limiting'), 'no internal vocabulary on the graph');

  // An unnamed marker on its own draws its line and no label at all.
  const alone = buildMarkerLabelLayout(
    [{ key: 'limiting', frequency: 124, x: 706, shortName: '', color: '#B45309' }],
    BOX,
  );
  assert.equal(alone.length, 1, 'the marker is still placed');
  assert.equal(alone[0].text, '', 'an unnamed marker carries no wording');
  assert.deepEqual(alone[0].lines, [706], 'its line is still drawn');

  // The rendered graph states the boundary in the required words, and never says
  // "Limiting", while the limiting marker line is present.
  const markup = renderToStaticMarkup(
    React.createElement(BassResponsePlot, {
      series: [],
      markers: { transitionHz: 122, limitingFrequencyHz: 124 },
      xDomain: [15, 200],
      yDomain: [70, 140],
    }),
  );
  assert.ok(markup.includes('Transition / Schroeder ≈ 122 Hz'), 'the required label wording');
  assert.ok(!markup.includes('Limiting'), 'the word Limiting is never drawn');
  const dashLines = (markup.match(/stroke-dasharray="5 4"/g) || []).length;
  assert.equal(dashLines, 2, 'transition and limiting lines are both drawn');
});

// ── TEST 2 — the About Sound Proof page is complete or absent ──────────────
test('TEST 2 — About Sound Proof is printed complete, or not at all', () => {
  const aboutSource = read('src/components/report/AboutSoundProofReportPage.jsx');

  // The page carries no waiting state at all, and cannot be rendered without
  // copy: an unresolved page is never laid out, so no caller can place an empty
  // page shell (or a "Loading…" label) on paper.
  assert.ok(!stripComments(aboutSource).includes('Loading'),
    'the page component renders no loading label to print');
  assert.ok(aboutSource.includes('if (!hasAboutContent(html)) return null;'),
    'the page renders nothing without resolved copy');
  assert.ok(aboutSource.includes('if (loading || !hasAboutContent(html)) return null;'),
    'a page reading its own content waits silently instead of printing a placeholder');
  assert.ok(aboutSource.includes('html: providedHtml'),
    'a caller that has resolved the copy hands it in, so the print document is synchronous');

  // The Technical Report's closing block is gated on resolved copy, so an
  // unresolved page leaves no block behind to print as a blank final page.
  const sectionSource = read('src/components/report/technical/TechnicalAboutSoundProofSection.jsx');
  assert.ok(sectionSource.includes('const ready = !loading && typeof html === "string" && html.trim().length > 0;'),
    'the block is gated on resolved content');
  assert.ok(sectionSource.includes('if (!ready) return null;'), 'an unresolved page is omitted entirely');
  assert.ok(sectionSource.includes('id="pdf-about-sound-proof"'), 'the page keeps its print identity');
  assert.ok(sectionSource.includes('data-report-block="about-sound-proof"'), 'the page keeps its block marker');
  assert.ok(sectionSource.includes('data-report-page-start="true"'), 'the page keeps its page start');

  // The Technical Report renders the gated block, and no longer renders the page
  // directly (the direct form has no readiness gate of its own).
  const technicalReport = read('src/pages/RP22Report.jsx');
  assert.ok(technicalReport.includes('<TechnicalAboutSoundProofSection />'), 'the gated About page is rendered');
  assert.ok(!technicalReport.includes('<AboutSoundProofReportPage'), 'the ungated About page is gone');

  // The Visual Report's closing page is added only once its copy has resolved,
  // and the resolved copy is what the printed page renders.
  const visualReport = read('src/pages/RP22ClientReport.jsx');
  assert.ok(visualReport.includes('if (aboutSoundProofReady) {'), 'the closing page is gated on resolved copy');
  assert.ok(visualReport.includes('aboutHtml: aboutSoundProofHtml'), 'the resolved copy is handed to the page');
});