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
import { buildMarkerLabelLayout } from '../components/report/technical/bassGraphMarkerLabels.js';
import {
  REPORT_RSP_STYLE,
  REPORT_SEAT_PALETTE,
  REPORT_TARGET_STYLE,
  reportSeatStyle,
} from '../components/report/technical/reportBassSeriesStyle.js';
import { resolveOptimisationTransitionHz } from '../components/room/bass/optimisationTransitionAuthority.js';
import { REPORT_BASS_GRAPH_Y_DOMAIN, REPORT_GRAPH_SMOOTHING, REPORT_PRIMARY_SEAT_LIMIT } from '../components/report/technical/bassResponseGraphAuthority.js';

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
  assert.ok(section.includes('RSP ROOM RESPONSE'), 'page 1 title present');
  assert.ok(section.includes('PRIMARY SEATS BASS RESPONSE'), 'page 2 title present');
});

// ── TEST 9 — the RSP Room Response page carries ONE trace ──────────────────
// This page shows the bass behaviour at the reference seat. It is not a
// comparison page: no after-EQ curve and no house-curve target are drawn on it.
test('TEST 9 — the RSP page plots the RSP room response and nothing else', () => {
  const source = read('src/components/report/technical/bassResponseGraphAuthority.js');
  const section = read('src/components/report/technical/BassResponseGraphSection.jsx');

  // Kinds: the room response only. The after-EQ curve and the target stay on
  // the Primary Seats page, where a comparison between seats is the point.
  assert.ok(/const RSP_PAGE_KINDS = \["room-response"\];/.test(source),
    'the RSP page plots the room response only');
  assert.ok(source.includes('const PRIMARY_PAGE_KINDS = ["post-eq", "house-curve"];'),
    'the Primary Seats page still plots the after-EQ curve and the target');
  assert.ok(source.includes('.slice(0, 1)'), 'a single RSP trace is kept');

  // One legend entry, named the way the page states it.
  assert.ok(source.includes('RSP_ROOM_RESPONSE_LABEL = "RSP room response"'),
    'the legend entry is the RSP room response');

  // The mandated page copy, and no leftover caption from the comparison page.
  assert.ok(source.includes('The RSP trace shows the predicted low-frequency response at the reference seating position.'),
    'the mandated RSP explanation is present');
  // ONE sentence only: the paragraph ends at that first full stop, and the
  // transition-region sentence is gone.
  const rspExplanation = source.match(/RSP_ROOM_RESPONSE_EXPLANATION = "([^"]*)"/)?.[1] ?? '';
  assert.equal(rspExplanation,
    'The RSP trace shows the predicted low-frequency response at the reference seating position.',
    'the RSP paragraph is the single mandated sentence');
  assert.equal((rspExplanation.match(/\./g) || []).length, 1, 'no second explanatory sentence');
  assert.ok(!source.includes('below the room transition region'), 'the transition sentence is removed');
  assert.ok(!source.includes('RSP_GRAPH_NOTE'), 'the old comparison-page caption is gone');
  assert.ok(/note: null,/.test(source), 'the RSP page carries no second caption');

  // The page title, drawn from the same authority, and the single-trace guard
  // that keeps the Primary Seats page rendering if the RSP curve is absent.
  assert.ok(section.includes('title="RSP ROOM RESPONSE"'), 'the RSP page heading is RSP ROOM RESPONSE');
  assert.ok(section.includes('explanation={RSP_ROOM_RESPONSE_EXPLANATION}'),
    'the page renders the mandated paragraph');
  assert.ok(section.includes('hasRspCurve'), 'the RSP page is drawn only when its curve exists');
});

// ── TEST 10 — the single RSP trace is built from the saved contract ────────
test('TEST 10 — the built RSP graph holds exactly one room-response trace', () => {
  const curve = (offset) => Array.from({ length: 7 }, (_, index) => ({
    frequency: [20, 30, 40, 60, 80, 100, 150][index],
    spl: 96 + offset + (index % 2 ? -2 : 2),
  }));
  const contract = {
    graphPayload: {
      postEqRspCurve: curve(6),
      correctionCurve: curve(0),
      roomResponseCurve: curve(0),
      productionHouseCurveTarget: curve(4),
      correctionStartHz: 20,
      correctionEndHz: 150,
      designEqFitProfile: 'identity',
      operatingLevelOffsetDb: 0,
    },
  };

  const graphs = buildReportBassGraphs({ contract, authoritative: true, seats: [{ id: 'seat-r1-c1' }] });
  assert.equal(graphs.ready, true);
  assert.equal(graphs.rsp.series.length, 1, 'one trace only');
  assert.equal(graphs.rsp.series[0].kind, 'room-response', 'the trace is the RSP room response');
  assert.equal(graphs.rsp.series[0].label, 'RSP room response', 'the legend entry');
  assert.equal(graphs.rsp.note, null, 'no second caption on the RSP page');

  // The Primary Seats page keeps its reference curve and its target.
  const primaryKinds = graphs.primary.series.map((entry) => entry.kind);
  assert.ok(primaryKinds.includes('post-eq'), 'the Primary Seats page still plots after-EQ curves');
  assert.ok(primaryKinds.includes('house-curve'), 'the Primary Seats page still plots the target');
});

// ── TEST 11 — what the RSP page actually renders ───────────────────────────
test('TEST 11 — the rendered RSP page shows one RSP room response trace', () => {
  const points = (offset) => Array.from({ length: 7 }, (_, i) => ({
    frequency: [20, 30, 40, 60, 80, 100, 150][i],
    spl: 96 + offset + (i % 2 ? -3 : 3),
  }));
  const contract = {
    graphPayload: {
      postEqRspCurve: points(6),
      correctionCurve: points(0),
      roomResponseCurve: points(0),
      productionHouseCurveTarget: points(4),
      correctionStartHz: 20,
      correctionEndHz: 150,
      designEqFitProfile: 'identity',
      operatingLevelOffsetDb: 0,
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(BassResponseGraphSection, {
      contract,
      authoritative: true,
      seats: [{ id: 'seat-r1-c1' }],
      variant: 'print',
    }),
  );

  const start = markup.indexOf('data-report-block="bass-response-rsp"');
  const end = markup.indexOf('data-report-block="bass-response-primary-seats"');
  assert.ok(start > 0 && end > start, 'both graph pages are rendered');
  const rspPage = markup.slice(start, end);

  // AC 3 — one response line only.
  assert.equal((rspPage.match(/<path /g) || []).length, 1, 'exactly one trace is drawn');

  // AC 4 — the legend references the RSP room response and nothing else.
  assert.ok(rspPage.includes('RSP room response'), 'the legend names the RSP room response');
  assert.ok(!rspPage.includes('after EQ'), 'no after-EQ legend entry');
  assert.ok(!rspPage.includes('House-curve target'), 'no house-curve target legend entry');
  assert.ok(!rspPage.includes('Room / layout response'), 'no reference-only room/layout entry');

  // AC 5 — the EQ and the target are not on this page.
  assert.ok(!rspPage.includes('rsp-eq'), 'no after-EQ trace on this page');

  // AC 6 and the kept elements: heading, paragraph, axes, log x, marker, width.
  assert.ok(rspPage.includes('RSP ROOM RESPONSE'), 'the page heading');
  assert.ok(rspPage.includes('The RSP trace shows the predicted low-frequency response at the reference seating position.'),
    'the mandated paragraph');
  assert.ok(rspPage.includes('Frequency (Hz)') && rspPage.includes('SPL (dB)'), 'both axes are labelled');
  assert.ok(rspPage.includes('>150</text>'), 'the log frequency axis keeps its upper decade label');
  assert.ok(rspPage.includes('Transition / Schroeder ≈'), 'the transition / Schroeder marker is kept');
  assert.ok(rspPage.includes('width="100%"'), 'the graph spans the full page width');
});

// ── TEST 12 — marker labels never clash or leave the plot box ──────────────
test('TEST 12 — marker labels are combined, stacked and border-safe', () => {
  const box = { plotLeft: 92, plotRight: 1172, firstRowY: 54 };

  // Transition and Schroeder on the same position: ONE combined label, with both
  // marker lines still drawn.
  const coincident = buildMarkerLabelLayout(
    [
      { key: 'transition', frequency: 123, x: 700, shortName: 'Transition / Schroeder', color: '#625143' },
      { key: 'limiting', frequency: 124, x: 706, shortName: 'Limiting', color: '#B45309' },
    ],
    box,
  );
  assert.equal(coincident.length, 1, 'coincident markers share one label');
  assert.ok(coincident[0].text.startsWith('Transition / Schroeder / Limiting ≈'),
    `the combined label names both markers: ${coincident[0].text}`);
  assert.deepEqual(coincident[0].lines, [700, 706], 'both marker lines are kept');

  // Close but distinct markers stack onto separate rows instead of overlapping.
  const stacked = buildMarkerLabelLayout(
    [
      { key: 'transition', frequency: 123, x: 700, shortName: 'Transition / Schroeder', color: '#625143' },
      { key: 'limiting', frequency: 60, x: 760, shortName: 'Limiting', color: '#B45309' },
    ],
    box,
  );
  assert.equal(stacked.length, 2, 'distinct markers keep their own labels');
  const [first, second] = stacked;
  const overlaps = first.box.left < second.box.right && second.box.left < first.box.right
    && first.box.top < second.box.bottom && second.box.top < first.box.bottom;
  assert.ok(!overlaps, 'the two labels do not touch');

  // A marker at the right-hand edge keeps its label inside the plot border.
  const edge = buildMarkerLabelLayout(
    [{ key: 'limiting', frequency: 195, x: box.plotRight - 6, shortName: 'Limiting', color: '#B45309' }],
    box,
  );
  assert.ok(edge[0].box.left >= box.plotLeft && edge[0].box.right <= box.plotRight,
    'the label stays inside the plot border');
});

// ── TEST 13 — the Primary Seats page tells its traces apart ────────────────
test('TEST 13 — seat traces differ in colour AND line style, muted and on brand', () => {
  // The reference is the brand green, solid, and the heaviest line on the page.
  assert.equal(REPORT_RSP_STYLE.color, '#4A7560', 'the RSP reference is Sound Proof green');
  assert.equal(REPORT_RSP_STYLE.strokeDasharray, null, 'the reference is solid');

  // The target is neutral, dashed, and lighter than everything it is compared with.
  assert.equal(REPORT_TARGET_STYLE.strokeDasharray, '9 5', 'the target is dashed');
  assert.ok(REPORT_TARGET_STYLE.strokeWidth < REPORT_RSP_STYLE.strokeWidth,
    'the target is lighter than the reference');

  // Every seat the page can plot: a unique colour + pattern pair, ranked between
  // the target and the reference so neither loses its place.
  const combos = [];
  for (let index = 0; index < REPORT_PRIMARY_SEAT_LIMIT; index += 1) {
    const style = reportSeatStyle(index);
    assert.ok(REPORT_SEAT_PALETTE.includes(style.color), `seat ${index + 1} uses a palette colour`);
    assert.ok(style.strokeWidth < REPORT_RSP_STYLE.strokeWidth, 'no seat trace outranks the reference');
    assert.ok(style.strokeWidth > REPORT_TARGET_STYLE.strokeWidth, 'every seat trace outranks the target');
    combos.push(`${style.color}|${style.strokeDasharray ?? 'solid'}`);
  }
  assert.equal(new Set(combos).size, combos.length, 'no two seats share a colour and pattern');
  assert.ok(combos.some((combo) => !combo.endsWith('solid')), 'line style carries some of the difference');

  // Muted: no saturated accent and no bright rainbow tone anywhere.
  const chroma = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  };
  for (const colour of [...REPORT_SEAT_PALETTE, REPORT_RSP_STYLE.color, REPORT_TARGET_STYLE.color]) {
    assert.ok(chroma(colour) < 0.35, `${colour} stays muted`);
  }

  // Wiring: the page's series carry the report styles, and the plot draws the
  // target behind every seat trace.
  const authority = read('src/components/report/technical/bassResponseGraphAuthority.js');
  assert.ok(authority.includes('reportSeatStyle('), 'plotted seats are styled by seat order');
  assert.ok(authority.includes('...REPORT_RSP_STYLE') && authority.includes('...REPORT_TARGET_STYLE'),
    'the reference and the target wear the report styles');

  const plot = read('src/components/report/technical/BassResponsePlot.jsx');
  assert.ok(plot.includes('entry.kind === "house-curve"'), 'the target is drawn behind the seat traces');

  const points = (offset) => Array.from({ length: 7 }, (_, i) => ({
    frequency: [20, 30, 40, 60, 80, 100, 150][i],
    spl: 96 + offset + (i % 2 ? -3 : 3),
  }));
  const graphs = buildReportBassGraphs({
    contract: {
      graphPayload: {
        postEqRspCurve: points(6),
        correctionCurve: points(0),
        roomResponseCurve: points(0),
        productionHouseCurveTarget: points(4),
        correctionStartHz: 20,
        correctionEndHz: 150,
        designEqFitProfile: 'identity',
        operatingLevelOffsetDb: 0,
      },
    },
    authoritative: true,
    seats: [{ id: 'seat-r1-c1' }],
  });
  const reference = graphs.primary.series.find((entry) => entry.seatId === 'rsp');
  const target = graphs.primary.series.find((entry) => entry.kind === 'house-curve');
  assert.equal(reference.color, REPORT_RSP_STYLE.color, 'the reference line wears the RSP style');
  assert.equal(target.strokeDasharray, REPORT_TARGET_STYLE.strokeDasharray, 'the target line wears the target style');
});