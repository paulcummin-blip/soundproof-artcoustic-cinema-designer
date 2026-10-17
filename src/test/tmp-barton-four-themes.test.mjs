/**
 * Temporary verification — Barton Solutions (Cheyne Walk / Cinema Room,
 * Original Design), from the exact published values read out of the live
 * publication eng:v1:448768:
 *
 *   P2 L4 · P3 L4 · P4 L4 · P5 L3 · P6 L2 · P7 L4 · P9 L3 · P10 L3 · P11 L4
 *   P12 L4 (110 dB SPL (C)) · P13 L3 (102) · P14 L3 (115)
 *   P16 L4 · P17 L4 · P18 L2 (22 Hz, authoritative) · P19 L4 (±0 dB, RSP, authoritative)
 *   P20 L1 across the 8 assessed seats · layout 9.1.6 · 3 active subwoofers · 6 overheads
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildAdiDesignHighlights } from '../components/report/projectReport/adiDesignHighlights.js';
import { estimateHighlightsMm } from '../components/report/projectReport/projectReportPageBudget.js';
import { PROJECT_REPORT_PAGE_BUDGET_MM } from '../components/report/projectReport/projectReportPageBudget.js';

const seats = (level, value) => Object.fromEntries(
  Array.from({ length: 8 }, (_, index) => [`seat-r1-c${index + 1}`, {
    state: 'scored', level, valueFormatted: value, priority: index < 3 ? 'primary' : 'secondary',
  }]),
);

const room = (key, level, weight) => ({ key, scope: 'room', state: 'scored', level, weight, effectiveWeight: weight });
const seat = (key, level, value, weight) => ({
  key, scope: 'seat', state: 'scored', level, weight, effectiveWeight: weight, seats: seats(level, value),
});

const BARTON_ENGINEERING_SUMMARY = {
  parameterAuthority: {
    p2: room('p2', 'L4', 8), p3: room('p3', 'L4', 3), p7: room('p7', 'L4', 4), p11: room('p11', 'L4', 4),
    p12: room('p12', 'L4', 8), p13: room('p13', 'L3', 7), p14: room('p14', 'L3', 9),
    p18: room('p18', 'L2', 12),
    p4: seat('p4', 'L4', '±1.8 dB', 5),
    p5: seat('p5', 'L3', '49.6°', 6),
    p6: seat('p6', 'L2', '±3.2 dB', 5),
    p9: seat('p9', 'L3', '43.0°', 5),
    p10: seat('p10', 'L3', '±2.1 dB', 5),
    p16: seat('p16', 'L4', '±1.4 dB', 5),
    p17: seat('p17', 'L4', '±1.9 dB', 5),
    // The publication states P19's seat entry as provisional: P19 is RSP-only, and
    // its authority is the published reference-position result read below.
    p19: { key: 'p19', scope: 'seat', state: 'provisional', level: null, weight: 9, seats: seats('L4', '±0 dB') },
    p20: seat('p20', 'L1', '±4.1 dB', 9),
  },
  roomResultsByParameter: {
    12: { level: 'L4', formatted: '110 dB SPL (C)', value: 110, isAuthoritative: true },
    13: { level: 'L3', formatted: '102 dB SPL (C)', value: 102, isAuthoritative: true },
    14: { level: 'L3', formatted: '115 dB SPL (C)', value: 115, isAuthoritative: true },
    18: { level: 'L2', formatted: '22 Hz', value: 22.15261174862453, designHz: 22, isAuthoritative: true, status: 'scored' },
    19: { level: 'L4', formatted: '±0 dB', value: 0.8296784904439392, status: 'complete', isAuthoritative: true },
  },
};

const BARTON_PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'SC-3 × 3' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'SL-1 × 2, SBL-1 × 2' },
    { key: 'overheads', area: 'Overheads', value: 'TFL-1 × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB4-12 × 3' },
  ],
};

const BARTON = {
  engineeringSummary: BARTON_ENGINEERING_SUMMARY,
  productsSelected: BARTON_PRODUCTS,
  dolbyConfig: '9.1.6',
  sevenBedLayoutType: 'rears',
};

const themeOf = (themes, id) => themes.find((theme) => theme.id === id);

test('Barton: the page states EXACTLY the four themes', () => {
  const themes = buildAdiDesignHighlights(BARTON);
  console.log('[BARTON FOUR THEMES]', JSON.stringify(themes.map((t) => ({
    id: t.id, title: t.title, level: t.level,
    evidence: t.evidence.map((e) => `${e.key} ${e.level} · ${e.value}`),
    copy: t.explanation,
  })), null, 1));
  assert.deepEqual(themes.map((t) => t.title), [
    'Spatial Resolution', 'Timbre Matching', 'Dynamic Range', 'Bass Performance',
  ]);
  assert.equal(themes.length, 4);
  // No separate placement card, no seating-clearance card, no other extra card.
  for (const gone of ['seating-clearance', 'viewing-geometry', 'immersive-layout', 'spatial-placement']) {
    assert.equal(themes.some((t) => t.id === gone), false, gone);
  }
});

test('Barton: SPATIAL RESOLUTION is grounded in the actual 9.3.6 architecture', () => {
  const spatial = themeOf(buildAdiDesignHighlights(BARTON), 'spatial-resolution');
  const copy = spatial.explanation;
  assert.match(copy, /9\.3\.6/, 'the client format, not the codec 9.1.6');
  assert.doesNotMatch(copy, /9\.1\.6/);
  assert.match(copy, /front wides/i);
  assert.match(copy, /side surrounds and rear surrounds/i);
  assert.match(copy, /6 overhead speakers/i);
  assert.match(copy, /recommended RP22 position zones/i);
  assert.deepEqual(spatial.evidence.map((e) => e.key), ['P2', 'P7', 'P11', 'P9']);
  for (const item of spatial.evidence) assert.ok(item.level, JSON.stringify(item));
  assert.doesNotMatch(copy, /highly precise|enveloping|immersive|\bL[1-4]\b/);
});

test('Barton: TIMBRE MATCHING uses supported tonal evidence only', () => {
  const timbre = themeOf(buildAdiDesignHighlights(BARTON), 'timbre-matching');
  assert.match(timbre.explanation, /maintain close tonal consistency within their respective layers/);
  assert.equal(timbre.level, 'L4');
  assert.deepEqual(timbre.evidence.map((e) => e.key), ['P16', 'P17']);
  assert.match(timbre.explanation, /8 assessed seating positions/);
  assert.doesNotMatch(timbre.explanation, /exceptional|remarkab|\bL[1-4]\b/);
});

test('Barton: DYNAMIC RANGE is ONE whole-system story (P12+P13+P14+P18)', () => {
  const dynamic = themeOf(buildAdiDesignHighlights(BARTON), 'dynamic-range');
  const copy = dynamic.explanation;
  assert.deepEqual(dynamic.evidence.map((e) => e.key), ['P12', 'P13', 'P14', 'P18']);
  for (const figure of ['110 dB SPL (C)', '102 dB SPL (C)', '115 dB SPL (C)', '22 Hz']) {
    assert.ok(copy.includes(figure), `the copy states ${figure}`);
  }
  assert.match(copy, /one system rather than by the screen channels alone/);
  assert.doesNotMatch(copy, /serious cinema-level|\bL[1-4]\b/);
});

test('Barton: BASS PERFORMANCE states 22 Hz, the P19 result, and the honest P20 limit', () => {
  const bass = themeOf(buildAdiDesignHighlights(BARTON), 'bass-performance');
  const copy = bass.explanation;
  assert.match(copy, /22 Hz/);
  assert.ok(bass.evidence.find((e) => e.key === 'P19' && e.level === 'L4'), 'P19 is stated at its published RSP level');
  assert.ok(bass.evidence.find((e) => e.key === 'P20' && e.level === 'L1'), 'P20 is stated at its published level');
  assert.match(copy, /main limitation/);
  assert.match(copy, /not held equally/);
  assert.doesNotMatch(copy, /powerful|huge|exceptional|\bL[1-4]\b/);
});

test('Barton: all four themes fit the highlights page budget together', () => {
  const themes = buildAdiDesignHighlights(BARTON);
  const height = estimateHighlightsMm(themes);
  assert.ok(height <= PROJECT_REPORT_PAGE_BUDGET_MM.page, `${height}mm must fit ${PROJECT_REPORT_PAGE_BUDGET_MM.page}mm`);
});