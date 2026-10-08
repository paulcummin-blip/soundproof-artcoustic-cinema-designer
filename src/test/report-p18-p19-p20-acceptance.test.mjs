// report-p18-p19-p20-acceptance.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the three corrected report behaviours, plus the Marquee Home /
// Level 4 published baseline they were corrected against.
//
//   P18  one published authority, both reports, basis-matched thresholds
//   P19  RSP-only, no per-seat requirement, post-EQ RSP vs target graph
//   P20  factual variation commentary, never an unsupported consistency claim
//
// The tests read the real adapters and render the real components. They change
// no calculation, no grading, no scoring and no report layout.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { readReportParameter } from '../components/report/reportParameterEvidence.js';
import { resolveParamThresholds } from '../components/report/technical/roomParameterLevelAuthority.js';
import { gradeP18ForBasis, p18ThresholdsForBasis } from '../components/utils/p18ExtensionAuthority.js';
import { selectClientBassPerformance } from '../components/report/client/selectClientBassPerformance.js';
import { resolveP20SeatDisplay } from '../components/room/bass/p20DisplayAuthority.js';
import P19RspGraphContent, { P19_GRAPH_EVIDENCE_WARNING } from '../components/report/P19RspGraphContent.jsx';
import ClientP19RspPresentation from '../components/report/client/ClientP19RspPresentation.jsx';
import ClientBassResponse from '../components/report/client/ClientBassResponse.jsx';
import {
  P19_RSP_EXPLANATION,
  P19_RSP_LABEL,
  P19_TARGET_LABEL,
  buildP19RspGraph,
} from '../components/report/technical/bassResponseGraphAuthority.js';
import { REPORT_RSP_STYLE, REPORT_TARGET_STYLE } from '../components/report/technical/reportBassSeriesStyle.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
/** The file with block and line comments removed — claims are made in copy, not in code notes. */
const readCopy = (relative) => read(relative)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join('\n');

// ── The Marquee Home / Level 4 published baseline, read from the database ───
// P18 16 Hz on the Recommended row (L3) · P19 L4 RSP-only · nine L1 P20 seats.
const BASELINE_P20_ROWS = [
  ['seat-r1-c1', 10.486186039446352, '±10.5 dB'],
  ['seat-r1-c2', 8.94760512797832, '±8.9 dB'],
  ['seat-r1-c3', 8.620016330945631, '±8.6 dB'],
  ['seat-r1-c4', 8.158856628461919, '±8.2 dB'],
  ['seat-r2-c1', 12.899319069941441, '±12.9 dB'],
  ['seat-r2-c2', 13.208042085292163, '±13.2 dB'],
  ['seat-r2-c3', 10.726408043288941, '±10.7 dB'],
  ['seat-r2-c4', 8.92007264911409, '±8.9 dB'],
  ['seat-r2-c5', 9.131559326814056, '±9.1 dB'],
].map(([seatId, value, valueFormatted]) => ({
  seatId,
  priority: 'primary',
  level: 'L1',
  value,
  valueFormatted,
}));

const BASELINE = {
  roomResultsByParameter: {
    14: { level: 'L4', value: 118, achievedCapabilityDb: 125, isAuthoritative: true },
    18: {
      level: 'L3',
      value: 16.596890802647643,
      formatted: '16 Hz',
      designHz: 16,
      targetBasis: 'recommended',
      targetBasisLabel: 'Recommended',
      isAuthoritative: true,
    },
    19: { level: 'L4', value: 0.9326074248371867, formatted: '±0 dB', isAuthoritative: true },
  },
  parameterSummaries: {
    project: { p14: { level: 'L4' }, p18: { level: 'L3' }, p19: { level: 'L4' }, p20: { level: 'L1' } },
  },
  p19SeatAuthority: { seats: [], project: { summary: 'P19 is RSP-only' } },
  project: {
    reportCounts: { seatResultsByParameter: { p19: [], p20: BASELINE_P20_ROWS } },
  },
};

const BASELINE_SEATS = [
  ['seat-r1-c1', 1.5, 2.4], ['seat-r1-c2', 2.0, 2.4], ['seat-r1-c3', 2.5, 2.4], ['seat-r1-c4', 3.0, 2.4],
  ['seat-r2-c1', 1.4, 4.2], ['seat-r2-c2', 1.95, 4.2], ['seat-r2-c3', 2.5, 4.2], ['seat-r2-c4', 3.05, 4.2], ['seat-r2-c5', 3.6, 4.2],
].map(([id, x, y]) => ({ id, x, y, priority: 'primary' }));

/** The saved contract fixture the graph authority reads (same shape as the live payload). */
const graphContract = (offset) => {
  const points = (delta) => Array.from({ length: 7 }, (_, i) => ({
    frequency: [20, 30, 40, 60, 80, 100, 150][i],
    spl: 96 + delta + (i % 2 ? -3 : 3),
  }));
  return {
    graphPayload: {
      postEqRspCurve: points(offset + 6),
      correctionCurve: points(offset),
      roomResponseCurve: points(offset),
      productionHouseCurveTarget: points(offset + 4),
      correctionStartHz: 20,
      correctionEndHz: 150,
      designEqFitProfile: 'identity',
      operatingLevelOffsetDb: 0,
    },
    assessmentEnvelope: { assessmentStartHz: 20, assessmentEndHz: 150 },
  };
};

// ══════════════════════════════════════════════════════════════════════════
// P18 — ONE PUBLISHED AUTHORITY
// ══════════════════════════════════════════════════════════════════════════

test('P18 SINGLE AUTHORITY — a stored legacy copy cannot override the published result', () => {
  // A legacy parameter_index row states L4 / 15 Hz. The published room result
  // states L3 / 16 Hz on the Recommended basis. The published result must win.
  const summary = {
    ...BASELINE,
    parameter_index: {
      P18: { key: 'P18', level: 'L4', value: '15 Hz', authority_level: 'L4', authority_value: '15 Hz' },
    },
  };
  const resolved = readReportParameter(summary, 18);
  assert.equal(resolved.level, 'L3', 'the published P18 grade is L3, not the stored L4');
  assert.equal(resolved.value, '16 Hz', 'the published P18 value is 16 Hz, not the stored 15 Hz');

  // Every other parameter keeps its established source order.
  const other = readReportParameter({ parameter_index: { P12: { key: 'P12', level: 'L3', value: '105 dB' } } }, 12);
  assert.equal(other.level, 'L3', 'a non-P18 parameter is untouched');

  // With no published room result the legacy row is still the only source.
  assert.equal(
    readReportParameter({ parameter_index: { P18: { key: 'P18', level: 'L2', value: '25 Hz' } } }, 18).level,
    'L2',
    'a legacy-only report still states its own row',
  );

  // The adapter carries no legacy P18 value through.
  const performance = selectClientBassPerformance(summary, BASELINE_SEATS);
  assert.equal(performance.p18.achievedLevel, 'L3', 'the Visual Report states the published grade');
  assert.equal(JSON.stringify(performance).includes('15 Hz'), false, 'no legacy P18 value survives');
});

test('P18 VISUAL REPORT AUTHORITY — grade, value and basis all come from the published result', () => {
  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  assert.equal(performance.p18.achievedLevel, 'L3', 'grade from the published result');
  assert.equal(performance.p18.achievedHz, 16.596890802647643, 'value from the published result');
  assert.equal(performance.p18.targetBasis, 'recommended', 'basis from the published result');
  assert.equal(performance.p18.targetBasisLabel, 'Recommended', 'basis label from the published result');
  assert.equal(performance.p18.publicationVerified, true, 'the result is published, not previewed');
});

test('P18 TECHNICAL REPORT AUTHORITY — the grid reads the same published room result', () => {
  const grid = read('src/components/report/technical/useParameterGridAuthority.jsx');
  assert.ok(grid.includes('(id === 18 && result?.level)'),
    'P18 takes its grade from the published room result first');
  assert.ok(grid.includes('roomResultFor(engineeringSummary, 18)?.targetBasis'),
    'P18 takes its grading basis from the same published room result');
  assert.ok(grid.includes('readReportParameter(engineeringSummary, Number(param?.id)).level'),
    'the grid HUD level reads the shared parameter authority');
});

test('P18 THRESHOLD BASIS MATCHES — the strip grades on the published basis, not the legacy flat row', () => {
  // The legacy flat thresholds are the Minimum row. 16 Hz grades L4 on Minimum
  // and L3 on Recommended — so the basis is what decides the displayed grade.
  const legacyFlatRow = { id: 18, thresholds: { L1: 35, L2: 30, L3: 20, L4: 18 } };
  const recommended = resolveParamThresholds(legacyFlatRow, 'minimum', 'minimum', 'minimum', 'recommended');

  assert.deepEqual(recommended, { ...legacyFlatRow.thresholds, ...p18ThresholdsForBasis('recommended') },
    'the strip resolves the published Recommended row');
  assert.deepEqual(recommended, { L1: 30, L2: 25, L3: 18, L4: 15 }, 'the Recommended thresholds');
  assert.equal(gradeP18ForBasis(16, 'recommended'), 3, '16 Hz grades L3 on the published basis');
  assert.equal(gradeP18ForBasis(16, 'minimum'), 4,
    'the same 16 Hz would grade L4 on the legacy flat row — the basis is decisive');

  // The basis the strip receives is the published one.
  const grid = read('src/components/report/technical/useParameterGridAuthority.jsx');
  assert.ok(grid.includes('const p18Mode = roomResultFor(engineeringSummary, 18)?.targetBasis'),
    'the strip basis is the published target basis');
});

// ══════════════════════════════════════════════════════════════════════════
// P19 — RSP ONLY
// ══════════════════════════════════════════════════════════════════════════

test('P19 RSP ONLY — the Visual Report states the published RSP result and no per-seat scope', () => {
  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  assert.ok(performance.p19, 'the P19 page data is produced');
  assert.equal(performance.p19.scope, 'rsp', 'P19 is RSP-scoped');
  assert.equal(performance.p19.achievedLevel, 'L4', 'the published RSP level');
  assert.ok(performance.p19.rspResult, 'the single published RSP result is carried');
  assert.equal(performance.p19.rspResult.level, 'L4', 'the published RSP grade');
  assert.equal(performance.p19.rspResult.displayedValue, '±0 dB', 'the published RSP deviation');

  // The shared parameter authority scopes P19 to the RSP too.
  assert.equal(readReportParameter(BASELINE, 19).scope, 'rsp', 'readReportParameter scopes P19 to the RSP');
  const evidence = read('src/components/report/reportParameterEvidence.js');
  assert.ok(evidence.includes("id === 19 ? 'rsp' : 'room'"), 'P19 is labelled RSP, P20 is not');
});

test('P19 DOES NOT REQUIRE PER-SEAT RECORDS — zero P19 seat rows still produces a page', () => {
  // The published authority states no per-seat P19 rows at all.
  assert.equal(BASELINE.project.reportCounts.seatResultsByParameter.p19.length, 0, 'no P19 seat rows');
  assert.equal(BASELINE.p19SeatAuthority.seats.length, 0, 'no P19 seat authority');

  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  assert.deepEqual(performance.p19.perSeatResults, [], 'P19 carries no per-seat rows');
  assert.equal(performance.p19.achievedLevel, 'L4', 'P19 is still assessed from the RSP result');

  const adapter = read('src/components/report/client/selectClientBassPerformance.js');
  assert.ok(adapter.includes('const p19 = (p19Room || p19Rows.length)'),
    'the RSP room result alone is enough for P19');
  assert.ok(adapter.includes('they are never required'), 'the per-seat rows are explicitly optional');
});

test('P19 PAGE NOT BLANK WITH RSP EVIDENCE — the Visual Report renders its page', () => {
  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  const p19Graph = buildP19RspGraph({ contract: graphContract(0), authoritative: true });
  const rsp = { x: 2.5, y: 2.4 };

  const markup = renderToStaticMarkup(
    React.createElement(ClientP19RspPresentation, {
      bassPerformance: performance,
      p19Graph,
      roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
      seatingPositions: BASELINE_SEATS,
      rsp,
      screenFrontPlaneM: 0.2,
      screenWidthM: 3,
      subwooferInstances: [],
    }),
  );

  assert.ok(markup.length > 0, 'the page renders');
  assert.ok(markup.includes('P19 Bass Response at RSP'), 'the page heading is present');
  assert.ok(markup.includes('>L4<'), 'the published RSP grade is stated');
  assert.ok(markup.includes('±0 dB from the target response at the reference seating position.'),
    'the published deviation is stated');
  assert.ok(markup.includes('Reference Seating Position only'), 'the RSP-only scope is stated');
  assert.ok(markup.includes('RSP post-EQ response'), 'the evidence graph is drawn on the page');
});

test('P19 GRAPH USES POST-EQ RSP RESPONSE — the room/layout response is never plotted as P19', () => {
  const contract = graphContract(0);
  const graph = buildP19RspGraph({ contract, authoritative: true });

  assert.equal(graph.ready, true, 'the graph is ready from the saved contract');
  assert.deepEqual(graph.series.map((entry) => entry.kind).sort(), ['house-curve', 'post-eq'],
    'exactly the post-EQ response and the target');

  const response = graph.series.find((entry) => entry.kind === 'post-eq');
  assert.equal(response.label, P19_RSP_LABEL, 'the response is named the RSP post-EQ response');
  assert.equal(response.color, REPORT_RSP_STYLE.color, 'the response wears the RSP style');
  assert.equal(response.seatId, 'rsp', 'the response is the reference-seat curve');

  // The room/layout curve IS in the payload — and is still not plotted.
  assert.ok(contract.graphPayload.roomResponseCurve.length > 0, 'the room response exists in the payload');
  assert.equal(graph.series.some((entry) => entry.kind === 'room-response'), false,
    'the room/layout response is not on the P19 page');

  const authority = read('src/components/report/technical/bassResponseGraphAuthority.js');
  assert.ok(/const P19_RSP_KINDS = \["post-eq", "house-curve"\];/.test(authority), 'the P19 kinds are locked');
  assert.ok(!authority.includes('"room-response"'), 'the room response is never a P19 kind');
});

test('P19 GRAPH SHOWS TARGET AND IS LABELLED — both traces named, never the room response', () => {
  const graph = buildP19RspGraph({ contract: graphContract(0), authoritative: true });
  const target = graph.series.find((entry) => entry.kind === 'house-curve');
  assert.ok(target, 'the target is plotted');
  assert.equal(target.label, P19_TARGET_LABEL, 'the target legend entry');
  assert.equal(target.strokeDasharray, REPORT_TARGET_STYLE.strokeDasharray, 'the target wears the target style');

  assert.ok(P19_RSP_EXPLANATION.includes('Reference Seating Position (RSP)'), 'the paragraph names the RSP');
  assert.ok(P19_RSP_EXPLANATION.includes('assessed separately under P20'), 'P20 stays a separate parameter');

  const markup = renderToStaticMarkup(React.createElement(P19RspGraphContent, { graph }));
  assert.equal((markup.match(/<path /g) || []).length, 2, 'the response and the target are drawn');
  assert.ok(markup.includes(P19_RSP_LABEL), 'the legend names the RSP post-EQ response');
  assert.ok(markup.includes(P19_TARGET_LABEL), 'the legend names the target');
  assert.ok(!markup.includes('Room / layout response'), 'no room/layout legend entry');

  assert.deepEqual(graph.xDomain, [15, 150], 'the x window is the P19 assessment band');
});

test('P19 MISSING EVIDENCE MESSAGE — a clear statement, never a substituted curve', () => {
  // The post-EQ curve is absent from the saved contract.
  const noCurve = buildP19RspGraph({
    contract: { graphPayload: { roomResponseCurve: graphContract(0).graphPayload.roomResponseCurve } },
    authoritative: true,
  });
  assert.equal(noCurve.ready, false, 'the authority reports not-ready');
  assert.equal(noCurve.series.length, 0, 'no unrelated curve is supplied');

  const markup = renderToStaticMarkup(React.createElement(P19RspGraphContent, { graph: noCurve }));
  assert.ok(markup.includes(P19_GRAPH_EVIDENCE_WARNING.slice(0, 60)), 'the missing-evidence message is stated');
  assert.ok(!markup.includes('<path'), 'no curve is drawn from other evidence');

  // The ready case carries no warning.
  const ready = renderToStaticMarkup(
    React.createElement(P19RspGraphContent, { graph: buildP19RspGraph({ contract: graphContract(0), authoritative: true }) }),
  );
  assert.ok(!ready.includes(P19_GRAPH_EVIDENCE_WARNING.slice(0, 60)), 'no warning when the evidence exists');
});

// ══════════════════════════════════════════════════════════════════════════
// P20 — FACTUAL COMMENTARY
// ══════════════════════════════════════════════════════════════════════════

test('P20 NO UNSUPPORTED CONSISTENCY CLAIMS — nine L1 seats vary by 5 dB and are not called consistent', () => {
  const banned = [
    /powerful and controlled/i,
    /\b(is|are|remains?|stays?)\s+(consistent|uniform)\b/i,
    /consistency (is|remains|stays) (strong|uniform)/i,
    /broadly consistent/i,
  ];
  for (const file of [
    'src/components/report/client/ClientBassResponse.jsx',
    'src/components/report/technical/TechnicalPerformanceSummary.jsx',
    'src/components/report/technical/BassResponseGraphSection.jsx',
  ]) {
    const copy = readCopy(file);
    for (const pattern of banned) {
      assert.ok(!pattern.test(copy), `${file} copy must not match ${pattern}`);
    }
  }

  // The one place the word appears is the parameter's own name and its scope
  // statement — never a claim about the measured result.
  const client = read('src/components/report/client/ClientBassResponse.jsx');
  assert.ok(client.includes('Seat-to-seat bass variation is assessed'), 'variation is the subject, not consistency');
  assert.ok(!client.includes('primaryBest'), 'no primary/secondary quality inference');
});

test('P20 FACTUAL VARIATION COMMENTARY — the sentence states the measured range, floored', () => {
  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  assert.equal(performance.p20.perSeatResults.length, 9, 'all nine seats are stated');

  const markup = renderToStaticMarkup(
    React.createElement(ClientBassResponse, {
      bassPerformance: performance,
      roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
      seatingPositions: BASELINE_SEATS,
      rsp: { x: 2.5, y: 2.4 },
      screenFrontPlaneM: 0.2,
      screenWidthM: 3,
    }),
  );

  // The sentence quotes the SAME floored display authority the pills use.
  const best = resolveP20SeatDisplay({ variationDbRaw: 8.158856628461919 })?.displayVariationText;
  const worst = resolveP20SeatDisplay({ variationDbRaw: 13.208042085292163 })?.displayVariationText;
  assert.ok(best && worst, 'the display authority resolves both ends');
  assert.ok(markup.includes(`ranges from ${best} to ${worst}`),
    `the measured range is stated factually (${best} to ${worst})`);

  const source = read('src/components/report/client/ClientBassResponse.jsx');
  assert.ok(source.includes('resolveP20SeatDisplay'), 'the rounding comes from the canonical P20 display authority');
  assert.ok(/formatP20Deviation\(value\)[\s\S]{0,120}resolveP20SeatDisplay\(\{ variationDbRaw: value \}\)/.test(source),
    'the only deviation formatter delegates to the canonical display authority');
});

test('P20 REMAINS SEAT-SCOPED — per-seat rows, and no P19 or RSP wording', () => {
  const performance = selectClientBassPerformance(BASELINE, BASELINE_SEATS);
  assert.equal(performance.p20.perSeatResults.every((row) => row.seatId && row.level), true,
    'P20 is stated seat by seat');
  assert.equal(performance.p19.scope, 'rsp', 'P19 stays the RSP-scoped parameter');

  // The P20 page states per-seat P20 only — never a per-seat P19 row.
  const markup = renderToStaticMarkup(
    React.createElement(ClientBassResponse, {
      bassPerformance: performance,
      roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
      seatingPositions: BASELINE_SEATS,
      rsp: { x: 2.5, y: 2.4 },
      screenFrontPlaneM: 0.2,
      screenWidthM: 3,
    }),
  );
  assert.ok(markup.includes('P20 Consistency'), 'the per-seat row is the P20 row');
  assert.ok(!markup.includes('P19 Consistency'), 'no per-seat P19 row exists');
  assert.equal((markup.match(/>L1</g) || []).length >= 9, true, 'each of the nine seats states its own L1 grade');

  const client = read('src/components/report/client/ClientBassResponse.jsx');
  assert.ok(client.includes('singleLevel={seat.p20Level}'), 'the seat halo carries the P20 level only');

  // The Technical summary states P20 seat results without any P19 wording.
  const technical = read('src/components/report/technical/TechnicalPerformanceSummary.jsx');
  assert.ok(!/P19/.test(technical), 'the Technical summary uses no P19 language');
  assert.ok(!/bass (response|consistency)/i.test(technical),
    'the Technical summary makes no bass-consistency claim');
});