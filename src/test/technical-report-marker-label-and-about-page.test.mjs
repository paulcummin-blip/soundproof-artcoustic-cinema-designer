// technical-report-marker-label-and-about-page.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — two Technical Report export rules.
//
//   TEST 1  The bass graph's marker label never states "Limiting": the boundary
//           reads "Transition / Schroeder ≈ 122 Hz", and the limiting line is
//           still drawn.
//   TEST 2  The closing About Sound Proof page is MANDATORY in both reports and
//           always carries finished copy: the published copy, or the built-in
//           fallback bundled with the app. It is never omitted, never blank and
//           never exported as a waiting "Loading…" page.
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
import { DEFAULT_ABOUT_SOUND_PROOF_HTML } from '../components/publicationContent/defaultContent.js';

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

// ── TEST 2 — the About Sound Proof page is mandatory, and never blank ──────
test('TEST 2 — About Sound Proof is always printed, with finished copy', () => {
  const aboutSource = read('src/components/report/AboutSoundProofReportPage.jsx');

  // The page carries no waiting state, and resolves its copy through the one copy
  // authority — the published copy, or the built-in fallback. It can therefore
  // never render nothing and never render a placeholder.
  assert.ok(!stripComments(aboutSource).includes('Loading'),
    'the page component renders no loading label to print');
  assert.ok(aboutSource.includes('const copy = resolveAboutSoundProofHtml(html);'),
    'the page resolves published-copy-or-fallback before rendering');
  assert.ok(!aboutSource.includes('return null'), 'the page is never omitted for want of copy');
  assert.ok(aboutSource.includes('html: providedHtml'),
    'a caller that has already read the copy hands it in, so the print document is synchronous');

  // The Technical Report's closing block is a mandatory page: it always renders.
  const sectionSource = read('src/components/report/technical/TechnicalAboutSoundProofSection.jsx');
  assert.ok(!sectionSource.includes('return null'), 'the block is never omitted');
  assert.ok(sectionSource.includes('const { html } = usePublicationContent("about_sound_proof");'),
    'the copy is used as it arrives — it is never awaited');
  assert.ok(sectionSource.includes('id="pdf-about-sound-proof"'), 'the page keeps its print identity');
  assert.ok(sectionSource.includes('data-report-block="about-sound-proof"'), 'the page keeps its block marker');
  assert.ok(sectionSource.includes('data-report-page-start="true"'), 'the page keeps its page start');

  // The Technical Report renders the closing block, and not the page directly.
  const technicalReport = read('src/pages/RP22Report.jsx');
  assert.ok(technicalReport.includes('<TechnicalAboutSoundProofSection />'), 'the About page is rendered');
  assert.ok(!technicalReport.includes('<AboutSoundProofReportPage'), 'the page is not rendered a second time');

  // The Visual Report adds the closing page unconditionally, with the copy it
  // resolved, so the page is always in the exported report.
  const visualReport = read('src/pages/RP22ClientReport.jsx');
  assert.ok(!visualReport.includes('if (aboutSoundProofReady)'), 'the closing page is no longer conditional');
  assert.ok(visualReport.includes('id: "about-sound-proof"'), 'the closing page is always added');
  assert.ok(visualReport.includes('aboutHtml: aboutSoundProofHtml'), 'the resolved copy is handed to the page');

  // The fallback is bundled with the app and has content, and the copy hook starts
  // from it — so a print taken before the published read resolves still has copy.
  assert.ok(DEFAULT_ABOUT_SOUND_PROOF_HTML.trim().length > 0,
    'the built-in fallback copy ships with the app and is never empty');
  assert.ok(!stripComments(DEFAULT_ABOUT_SOUND_PROOF_HTML).includes('Loading'),
    'the fallback copy carries no loading state');
  const hookSource = read('src/components/publicationContent/usePublicationContent.js');
  assert.ok(hookSource.includes('useState(() => getDefaultContentHtml(contentKey) || null)'),
    'the copy hook starts from the bundled fallback — synchronous, with no wait');
});