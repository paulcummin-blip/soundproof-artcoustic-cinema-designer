/**
 * design-index-scope.test.mjs
 * ---------------------------
 * The Design Index scope and formatting contract.
 *
 * Two different rules apply to two different audiences, and this suite pins both:
 *
 *   CLIENT-FACING PROPOSAL COPY — the index must not appear at all. Not in the
 *   System Design Summary, the System Design Comparison, Key Performance
 *   Highlights, regenerated proposal sections, or preview/export content.
 *
 *   TECHNICAL REPORT — the index may appear, because that document is a
 *   designer / dealer technical document. It must never be shown as a
 *   percentage, never described as a client-facing score, never imply a
 *   pass/fail percentage, and must be labelled as the internal / technical
 *   design index and presented as a diagnostic aid.
 *
 * The rules are read from the shipped authorities — the shared writing contract
 * and the technical display module — so this suite audits the real rule rather
 * than a local copy of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  TECHNICAL_DESIGN_INDEX_LABEL,
  TECHNICAL_DESIGN_INDEX_NOTE,
  TECHNICAL_DESIGN_INDEX_ALLOWED_SAMPLES,
  TECHNICAL_DESIGN_INDEX_FORBIDDEN_SAMPLES,
  normaliseDesignIndex,
  formatDesignIndex,
  auditTechnicalDesignIndexCopy,
} from '../src/components/report/technical/designIndexDisplay.js';

import {
  DESIGN_INDEX_SCOPE_RULE,
  DESIGN_INDEX_HARD_RULES,
  DESIGN_INDEX_BANNED_TERMS,
  mentionsDesignIndex,
} from '../base44/shared/reportWritingStyleContract.js';

import { formatDesignIndexComparison } from '../src/components/report/technical/designRatingPresentation.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/** Every .js / .jsx file below a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// ── 1. Client-facing proposal copy ─────────────────────────────────────────

/** The approved failing samples for proposal copy. */
const PROPOSAL_FORBIDDEN_SAMPLES = [
  'Design Index',
  'Design Score',
  '82%',
  '82% (Primary)',
  'The design achieves an 82 percent score',
  'Primary score',
  'Design Rating',
];

test('proposal copy fails when the Design Index appears in any form', () => {
  for (const sample of PROPOSAL_FORBIDDEN_SAMPLES) {
    assert.equal(
      mentionsDesignIndex(sample),
      true,
      `proposal copy must fail on: ${sample}`,
    );
  }
  // Evidence-led copy stays clean.
  assert.equal(
    mentionsDesignIndex(
      'Spatial resolution is carried by 13 discrete channels, and the screen system reaches 108 dBC of dynamic range.',
    ),
    false,
  );
});

test('no client-facing proposal surface imports the technical index display', () => {
  const offenders = [];
  for (const file of walk(`${SRC}components/proposal`)) {
    if (readFileSync(file, 'utf8').includes('designIndexDisplay')) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    'the technical Design Index display must not reach proposal surfaces',
  );
});

// ── 2. Shared writing contract ─────────────────────────────────────────────

test('the shared contract states the Design Index scope rule verbatim', () => {
  const contract = readSource('../base44/shared/reportWritingStyleContract.js');
  assert.ok(
    contract.includes(DESIGN_INDEX_SCOPE_RULE),
    'the approved scope rule must appear verbatim in the shared contract',
  );
  // The rule itself carries both halves: no proposal evidence, and a
  // non-percentage technical allowance.
  assert.match(DESIGN_INDEX_SCOPE_RULE, /not client-facing proposal evidence/i);
  assert.match(DESIGN_INDEX_SCOPE_RULE, /proposal summaries or proposal comparisons/i);
  assert.match(DESIGN_INDEX_SCOPE_RULE, /Technical Report only as an internal technical diagnostic/i);
  assert.match(DESIGN_INDEX_SCOPE_RULE, /never as a percentage/i);
  // Both approved hard rules remain in force.
  for (const rule of DESIGN_INDEX_HARD_RULES.split('\n')) {
    assert.ok(contract.includes(rule), `the contract must state the hard rule: ${rule}`);
  }
  for (const term of DESIGN_INDEX_BANNED_TERMS) {
    assert.ok(contract.includes(term), `the contract must name "${term}"`);
  }
});

// ── 3. Technical Report: allowed phrasing ──────────────────────────────────

test('technical report copy may name the Design Index without a percentage', () => {
  for (const sample of TECHNICAL_DESIGN_INDEX_ALLOWED_SAMPLES) {
    const audit = auditTechnicalDesignIndexCopy(sample);
    assert.equal(audit.ok, true, `technical copy must allow: ${sample} (${JSON.stringify(audit.violations)})`);
  }
  for (const sample of ['Design Index: 82', 'Technical Design Index: 82', 'Internal Design Index']) {
    assert.equal(auditTechnicalDesignIndexCopy(sample).ok, true, `allowed: ${sample}`);
  }
});

// ── 4. Technical Report: forbidden phrasing ────────────────────────────────

test('technical report copy fails when the index is a percentage or a client score', () => {
  for (const sample of [
    'Design Index: 82%',
    '82% (Primary)',
    'The design scored 82%',
    'Design Index percentage',
  ]) {
    assert.equal(
      auditTechnicalDesignIndexCopy(sample).ok,
      false,
      `technical copy must fail on: ${sample}`,
    );
  }
  // A percentage attached to the index in any wording or spacing.
  for (const sample of ['Design Index is 82 %', 'The index reads 82% for this room', 'index 82 per cent']) {
    assert.equal(
      auditTechnicalDesignIndexCopy(sample).ok,
      false,
      `a percentage attached to the index must fail: ${sample}`,
    );
  }
  for (const sample of TECHNICAL_DESIGN_INDEX_FORBIDDEN_SAMPLES) {
    assert.equal(auditTechnicalDesignIndexCopy(sample).ok, false, `forbidden: ${sample}`);
  }
});

// ── 5. Display normalisation ───────────────────────────────────────────────

test('the index is normalised for display and never carries a percentage', () => {
  assert.equal(normaliseDesignIndex(82), 82, 'stored as 82 displays as 82');
  assert.equal(normaliseDesignIndex(0.82), 82, 'stored as a share displays as 82');
  assert.equal(normaliseDesignIndex('82'), 82);
  assert.equal(normaliseDesignIndex('0.82'), 82);
  assert.equal(normaliseDesignIndex(82.4), 82, 'the index is a whole number');
  assert.equal(normaliseDesignIndex(null), null);
  assert.equal(normaliseDesignIndex(undefined), null);
  assert.equal(normaliseDesignIndex(''), null);

  assert.equal(formatDesignIndex(82), '82');
  assert.equal(formatDesignIndex(0.82), '82');
  assert.equal(formatDesignIndex(0), '0');
  assert.equal(formatDesignIndex(null), null);

  for (const value of [0, 0.82, 1, 58, 82, 124, 82.5]) {
    const text = formatDesignIndex(value);
    assert.ok(!text.includes('%'), `${text} must not carry a percentage sign`);
    assert.ok(!text.includes('/'), `${text} must not read as "out of 100"`);
    assert.doesNotMatch(text, /per ?cent/i, `${text} must not read as a percentage`);
  }
});

// ── 6. Technical presentation ──────────────────────────────────────────────

test('the technical report labels the index as internal and never as a percentage', () => {
  assert.ok(TECHNICAL_DESIGN_INDEX_LABEL.includes('Internal'), 'the label names the index internal');
  assert.ok(TECHNICAL_DESIGN_INDEX_LABEL.includes('Design Index'));
  assert.match(
    TECHNICAL_DESIGN_INDEX_NOTE,
    /internal design diagnostic/i,
    'the index is presented as a diagnostic aid',
  );
  assert.match(TECHNICAL_DESIGN_INDEX_NOTE, /not a client-facing performance score/i);

  // The comparison line is digit-only and internal-labelled.
  assert.equal(
    formatDesignIndexComparison({ designPerformanceIndex: 82 }, { designPerformanceIndex: 95 }),
    `${TECHNICAL_DESIGN_INDEX_LABEL} 82 → 95`,
  );
  assert.doesNotMatch(
    formatDesignIndexComparison({ designPerformanceIndex: 0.82 }, { designPerformanceIndex: 0.95 }),
    /%|percent/i,
    'a share is normalised and never shown as a percentage',
  );
  assert.equal(
    formatDesignIndexComparison({ designPerformanceIndex: 0.82 }, { designPerformanceIndex: 0.95 }),
    `${TECHNICAL_DESIGN_INDEX_LABEL} 82 → 95`,
  );
});

test('technical report surfaces render the index through the shared authority', () => {
  const surfaces = [
    '../src/components/report/technical/ScopedAsdrSummary.jsx',
    '../src/components/report/technical/AsdrSeatingSummary.jsx',
    '../src/components/report/technical/TechnicalPerformanceSummary.jsx',
    '../src/components/report/technical/TechnicalReportRecommendations.jsx',
  ];
  for (const surface of surfaces) {
    const source = readSource(surface);
    assert.match(source, /designIndexDisplay/, `${surface} must use the shared index display`);
    assert.doesNotMatch(
      source,
      /Design Performance Index/,
      `${surface} must use the internal / technical label rather than the legacy wording`,
    );
  }
  assert.doesNotMatch(
    readSource('../src/components/report/technical/designIndexDisplay.js'),
    /%\s*`|`\s*%\s*`/,
    'the display authority never builds a percentage string',
  );
});