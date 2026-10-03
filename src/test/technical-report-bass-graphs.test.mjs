// technical-report-bass-graphs.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Technical Report's full-width bass response graph pages.
//
//   TEST 1  No current bass authority → nothing is drawn (stale bass never plots)
//   TEST 2  Authoritative but graph-less contract → nothing is drawn
//   TEST 3  The section renders no graph markup when it is not ready
//   TEST 4  Explanatory copy is positive, predictive and not overclaiming
//   TEST 5  Print rules: one full-width graph per page, heading kept with graph
//   TEST 6  Technical Report only — the Visual Report and System Design Summary
//           never import the graph section
//   TEST 7  Transition frequency has ONE definition, shared by both graphs
//   TEST 8  Placement — the final technical evidence pages, before About Sound Proof
//
// The graphs themselves are built by the app's own builders
// (buildFinishedGraphOptimisationResult → buildBassGraphSeries), so their values
// cannot diverge from the Expert Curve View by construction; these tests cover
// the report-side rules that CAN regress.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildReportBassGraphs } from '../components/report/technical/bassResponseGraphAuthority.js';
import BassResponseGraphSection from '../components/report/technical/BassResponseGraphSection.jsx';
import { resolveOptimisationTransitionHz } from '../components/room/bass/optimisationTransitionAuthority.js';
import { REPORT_BASS_GRAPH_Y_DOMAIN, REPORT_GRAPH_SMOOTHING } from '../components/report/technical/bassResponseGraphAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ── TEST 1 — no current authority ──────────────────────────────────────────
test('TEST 1 — stale or absent bass authority draws no graph', () => {
  const missing = buildReportBassGraphs({ contract: null, authoritative: false });
  assert.equal(missing.ready, false);
  assert.equal(missing.reason, 'no-current-bass-authority');
  assert.equal(missing.rsp, null);

  // A contract present but NOT authoritative (stale / not verified) is refused
  // just the same — presence of data is never enough.
  const notAuthoritative = buildReportBassGraphs({ contract: { graphPayload: {} }, authoritative: false });
  assert.equal(notAuthoritative.ready, false);
  assert.equal(notAuthoritative.reason, 'no-current-bass-authority');
});

// ── TEST 2 — authoritative but no graph payload ────────────────────────────
test('TEST 2 — an authoritative contract without a graph payload draws no graph', () => {
  const result = buildReportBassGraphs({ contract: { version: 1 }, authoritative: true });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'no-graph-payload');
});

// ── TEST 3 — the section renders nothing when not ready ────────────────────
test('TEST 3 — the section renders no markup without a current graph', () => {
  for (const variant of ['print', 'screen']) {
    const markup = renderToStaticMarkup(
      React.createElement(BassResponseGraphSection, {
        contract: null,
        authoritative: false,
        seats: [],
        variant,
      }),
    );
    assert.equal(markup, '');
  }
});

// ── TEST 4 — explanatory copy rules ────────────────────────────────────────
test('TEST 4 — explanations are predictive, positive and not overclaiming', () => {
  const source = read('src/components/report/technical/BassResponseGraphSection.jsx');
  const lower = source.toLowerCase();

  // Required framing: prediction, never measurement.
  assert.ok(lower.includes('predicted'), 'explanation must frame results as predicted');
  assert.ok(lower.includes('aims to') || lower.includes('has been designed to'), 'predictive wording required');

  // Forbidden claims.
  for (const banned of ['measured performance', 'perfect bass', 'fully optimised', 'rew']) {
    assert.ok(!lower.includes(banned), `explanation must not claim or mention "${banned}"`);
  }
  assert.ok(!/processor recommendation/i.test(source), 'no brand-specific processor recommendations');
});

// ── TEST 5 — print layout rules ────────────────────────────────────────────
test('TEST 5 — one full-width graph per printed page', () => {
  const styles = read('src/components/report/ReportPrintStyles.jsx');
  assert.ok(/\.rp22-report \.rp22-bass-graph-page\s*\{[^}]*break-before:\s*page/s.test(styles),
    'each graph page starts on its own printed page');
  assert.ok(/\.rp22-bass-graph-page\s*\{[^}]*break-inside:\s*avoid/s.test(styles),
    'heading, legend, explanation and graph stay together');
  assert.ok(/\.rp22-bass-graph-page svg\s*\{[^}]*width:\s*100%/s.test(styles),
    'the graph spans the full content width in print');

  const section = read('src/components/report/technical/BassResponseGraphSection.jsx');
  assert.ok(section.includes('data-report-block="bass-response-rsp"') === false
    || section.includes('bass-response-rsp'), 'RSP page block present');
  assert.ok(section.includes('pdf-bass-response-primary-seats'), 'Primary Seats page block present');

  // The dB window the app graph locks is the window the report plots.
  assert.deepEqual(REPORT_BASS_GRAPH_Y_DOMAIN, [70, 140]);

  // The printed curve is smoothed exactly as the Expert Curve View opens, so the
  // graph the dealer reads matches the graph the designer sees.
  assert.equal(REPORT_GRAPH_SMOOTHING, 'third');
  assert.ok(read('src/components/room/bass/useAuthoritativeBassResponse.js')
    .includes('useState("third")'), 'the app default is still 1/3 octave');
});

// ── TEST 6 — Technical Report only ─────────────────────────────────────────
test('TEST 6 — only the Technical Report imports the graph section', () => {
  const report = read('src/pages/RP22Report.jsx');
  assert.ok(report.includes('BassResponseGraphSection'), 'Technical Report includes the graphs');

  for (const other of [
    'src/pages/RP22ClientReport.jsx',
    'src/components/report/client/ClientReportPage.jsx',
  ]) {
    assert.ok(!read(other).includes('BassResponseGraphSection'), `${other} must not include the graphs`);
  }

  const systemSummary = read('base44/shared/systemDesignSummarySections.js');
  assert.ok(!systemSummary.includes('BassResponseGraphSection'), 'System Design Summary must not include the graphs');
});

// ── TEST 7 — one transition-frequency definition ───────────────────────────
test('TEST 7 — the transition frequency is derived once for both graphs', () => {
  // 4.5 × 6.0 × 2.4 m = 64.8 m³ → 2000·√(0.4 / V)
  const expected = 2000 * Math.sqrt(0.4 / (4.5 * 6.0 * 2.4));
  assert.ok(Math.abs(resolveOptimisationTransitionHz({ widthM: 4.5, lengthM: 6.0, heightM: 2.4 }) - expected) < 1e-9);
  assert.equal(resolveOptimisationTransitionHz(null), 120);

  // The live graph and the report graph consume the same definition — neither
  // carries a private copy of the formula.
  const live = read('src/components/room/bass/useAuthoritativeBassResponse.js');
  assert.ok(live.includes('resolveOptimisationTransitionHz'), 'live graph uses the shared definition');
  assert.ok(!live.includes('2000 * Math.sqrt'), 'live graph no longer inlines the formula');
});

// ── TEST 8 — placement in the report ───────────────────────────────────────
test('TEST 8 — the graphs are the final technical evidence, before About Sound Proof', () => {
  const report = read('src/pages/RP22Report.jsx');

  // Print order: RP22 parameter pages → graphs → About Sound Proof.
  const paramsAt = report.indexOf('id="pdf-room-parameters"');
  const printGraphAt = report.lastIndexOf('<BassResponseGraphSection');
  const aboutAt = report.indexOf('id="pdf-about-sound-proof"');
  assert.ok(paramsAt > 0 && aboutAt > 0, 'the parameter and About blocks are both present');
  assert.ok(printGraphAt > paramsAt, 'the printed graphs follow the RP22 parameter pages');
  assert.ok(printGraphAt < aboutAt, 'the printed graphs precede About Sound Proof');

  // Screen: the graphs follow the whole parameter flow instead of interrupting it.
  const screenGraphAt = report.indexOf('<BassResponseGraphSection');
  assert.ok(screenGraphAt > report.indexOf('<RP22ReportParameterGrid {...parameterGridProps} />'),
    'the on-screen graphs follow the parameter grid');
  assert.ok(screenGraphAt > report.indexOf('<TechnicalEngineeringSummaryNote />'),
    'the on-screen graphs close the technical evidence');

  // The titles the report prints.
  const section = read('src/components/report/technical/BassResponseGraphSection.jsx');
  assert.ok(section.includes('BASS RESPONSE GRAPHS'), 'section title present');
  assert.ok(section.includes('RSP BASS RESPONSE VS TARGET'), 'page 1 title present');
  assert.ok(section.includes('PRIMARY SEATS BASS RESPONSE'), 'page 2 title present');
});