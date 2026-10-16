// tmp-limited-data-explanation.test.mjs
// ---------------------------------------------------------------------------
// TEMPORARY VERIFICATION — the RP22 Speaker Comparison info drawer's
// "LIMITED DATA" explanation (DATA QUALITY section).
//
// Feeds the M&K IW5's own stored record fields through the real classification
// chain (classifyComparisonRow → buildCandidate), renders the new section and
// asserts the requested lines and the explanatory sentence are present, that the
// wording "missing" is never used, and that a Good Data row renders no section.
// Read-only: nothing here writes, and no engineering value is calculated.

import { test } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ComparisonDataQualitySection from '../components/spl/ComparisonDataQualitySection.jsx';
import { buildCandidate } from '../components/utils/spl/speakerDbComparisonCandidates.js';

// The M&K IW5 exactly as stored: no published continuous power rating, no
// published continuous SPL, both measurement bases unstated, and a recommended
// amplifier maximum of 125 W as the only stated power authority.
const IW5 = {
  manufacturer: 'M&K Sound',
  model: 'IW5',
  product_type: 'In-wall',
  retail_price_inc_vat: 0,
  rated_impedance_ohm: 4,
  sensitivity_value_db: 84,
  sensitivity_reference: '2.83V/1m',
  continuous_power_w: null,
  published_max_continuous_spl_db_1m: null,
  sensitivity_measurement_basis: '',
  max_spl_measurement_basis: '',
  recommended_amp_min_w: 25,
  recommended_amp_max_w: 125,
  power_rating_type: '',
  source_url: 'https://www.mksound.com/wp-content/uploads/2020/04/MK-IW5-85-95-manual_udskudt_rev2.pdf',
  active: true,
  published: true,
  publish_source: 'spreadsheet',
};

// A fully published row: rated power, published continuous SPL and both spaces
// stated. It must still classify as Good Data.
const GOOD = {
  ...IW5,
  manufacturer: 'Example',
  model: 'Published',
  continuous_power_w: 200,
  power_rating_type: 'Continuous',
  published_max_continuous_spl_db_1m: 112,
  sensitivity_measurement_basis: 'Half Space',
  max_spl_measurement_basis: 'Half Space',
};

const candidateFor = (row) => buildCandidate({ row, id: `speakerdb:${row.model}`, published: true });
const render = (candidate) => renderToStaticMarkup(React.createElement(ComparisonDataQualitySection, {
  record: candidate.record,
  badgeLabel: candidate.badgeLabel,
}));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const has = (html, text) => html.includes(text);

test('IW5 is classified Limited Data and the section renders for it', () => {
  const candidate = candidateFor(IW5);
  assert(candidate.badgeLabel === 'Limited Data', `expected "Limited Data", got "${candidate.badgeLabel}"`);
  const html = render(candidate);
  assert(has(html, 'Data quality'), 'DATA QUALITY heading is missing');
  assert(has(html, 'Limited published data'), 'the "Limited published data" line is missing');
});

test('the section states which published figures are absent, using "Not published"', () => {
  const html = render(candidateFor(IW5));
  [
    'Continuous power',
    'Published continuous SPL',
    'Sensitivity measurement basis',
    'SPL measurement basis',
    'Power authority',
    'Final capability',
  ].forEach((label) => assert(has(html, label), `row "${label}" is missing`));
  assert(!/missing/i.test(html), 'the section must never use the word "missing"');
});

test('the IW5 rows read exactly as specified', () => {
  const html = render(candidateFor(IW5));
  assert(has(html, 'Unstated — half-space assumed'), 'the unstated half-space basis wording is missing');
  assert(has(html, 'Manufacturer recommended amplifier maximum'), 'power authority wording is missing');
  assert(has(html, 'Calculated from published sensitivity and amplifier data'), 'final capability wording is missing');
  // Two absent figures, both stated as "Not published".
  const notPublished = html.split('Not published').length - 1;
  assert(notPublished >= 2, `expected both absent figures to read "Not published", found ${notPublished}`);
});

test('the explanatory sentence is present verbatim', () => {
  const html = render(candidateFor(IW5));
  assert(
    has(html, 'Sound Proof has calculated the comparison capability from the available manufacturer data. Treat this result as an informed estimate rather than a directly published continuous SPL figure.'),
    'the explanatory sentence is missing or altered',
  );
});

test('a Good Data row shows no DATA QUALITY section and keeps its badge', () => {
  const candidate = candidateFor(GOOD);
  assert(candidate.badgeLabel === 'Good Data', `expected "Good Data", got "${candidate.badgeLabel}"`);
  assert(render(candidate) === '', 'a Good Data row must render no DATA QUALITY section');
});

test('the explanation lives in the info drawer only, never in the comparison row', () => {
  const source = fs.readFileSync('src/pages/SPLCalculator.jsx', 'utf8');
  assert(source.includes('dataQuality={<ComparisonDataQualitySection'), 'the drawer is not wired to the section');
  assert(!source.includes('informed estimate'), 'the explanation must not be repeated outside the drawer');
  assert(source.includes('{candidate.badgeLabel}'), 'the existing short badge must remain');
});