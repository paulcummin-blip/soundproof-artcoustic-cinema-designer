// export-comparison-structure.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — a System Design Comparison carries a real comparison table, and
// an unchanged area is stated as unchanged rather than dropped.
//
// Root cause under test: comparison rows were only carried when the two
// versions' values DIFFERED. Two versions of the same room that match on a
// performance area therefore produced no rows at all, no comparison table was
// built, the Key Performance Highlights section was generated as prose, and the
// printed page showed a table's heading over nothing.
//
// The comparison table is built server-side (base44/shared/comparisonTable.js)
// and is not part of the client bundle, so its rules are held here as a source
// contract, with the behaviour it feeds tested directly.
//
//   TEST 1  shared areas are carried, not dropped (source contract)
//   TEST 2  the differences lead, and the table stays one printed block
//   TEST 3  a version missing an area leaves the row out, never blank
//   TEST 4  the client-meaning column never oversells a Level 1/Level 2 result
//   TEST 5  an evenness claim needs a stated level that supports it
//   TEST 6  a low-graded row is stated plainly even when its value is a number
//   TEST 7  the page never prints a heading over nothing
//   TEST 8  the backend refuses to write a comparison with no table
//   TEST 9  Generate Proposal cannot be disabled without saying why
//   TEST 10 the editor opens only on a proposal whose sections are saved
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildHighlightDisplayRows,
  comparisonClientMeaning,
} from '../components/proposal/keyPerformanceHighlightsAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ── TEST 1 — a shared area is a comparison result ──────────────────────────
test('TEST 1 — an area both versions share is carried as a row', () => {
  const source = read('base44/shared/comparisonTable.js');

  assert.ok(
    !source.includes('if (new Set(normalised).size < 2) continue;'),
    'an identical value no longer drops the row',
  );
  assert.ok(source.includes('identical'), 'the row records that the versions match here');
  assert.ok(
    source.includes('!identical && normalised.length === 2'),
    'a change is derived only where the values genuinely differ',
  );
  assert.ok(source.includes('describeChange(normalised[0], normalised[1])'), 'and it is derived from the values');
});

// ── TEST 2 — the table stays one printed block ────────────────────────────
test('TEST 2 — the differences lead, and the table stays within its limit', () => {
  const source = read('base44/shared/comparisonTable.js');

  assert.ok(source.includes('COMPARISON_ROW_LIMIT'), 'the printed limit exists');
  assert.ok(
    source.includes('.filter((row) => !row.identical), ...compared.filter((row) => row.identical)'),
    'the differences fill the table before the areas both versions share',
  );
  assert.ok(
    source.includes('COMPARISON_ROW_ORDER.indexOf(a.key) - COMPARISON_ROW_ORDER.indexOf(b.key)'),
    'and the table still reads in performance order',
  );
  // Every row needs a reliable value from every version.
  assert.ok(source.includes('if (values.some((value) => !value)) continue;'), 'a row is only carried when every version carries it');
  assert.ok(source.includes('isDesignIndexRow'), 'the internal Design Index is still never a client-facing row');
});

// ── TEST 3 — an unassessed version leaves the row out ─────────────────────
test('TEST 3 — a version that was not assessed for an area leaves the row out', () => {
  const source = read('base44/shared/comparisonTable.js');
  assert.ok(
    source.includes('A row needs a reliable value for EVERY version'),
    'omission is the stated rule for a version without a value',
  );
  assert.ok(
    source.includes('const usable = list.length >= 2 && list.every((version) => version?.available === true);'),
    'a comparison still needs at least two versions with evidence',
  );
});

// ── TEST 4 — the client meaning never oversells ───────────────────────────
test('TEST 4 — a Level 1 bass consistency row is not described as a strength', () => {
  const meaning = comparisonClientMeaning({ key: 'p20', values: ['L4 · 2.0 dB', 'L1 · 4.2 dB'] });
  assert.ok(
    !/consistent bass from seat to seat/i.test(meaning),
    'the approved strength line is not used when a version is at Level 1',
  );
  assert.match(meaning, /varies between seats/i, 'the honest line for that parameter is used');

  const strong = comparisonClientMeaning({ key: 'p20', values: ['L3 · 2.0 dB', 'L4 · 1.4 dB'] });
  assert.match(strong, /consistent bass from seat to seat/i, 'a Level 3 / Level 4 result keeps its approved line');
});

// ── TEST 5 — an unstated level supports no claim ──────────────────────────
test('TEST 5 — a consistency claim needs a level in the result that supports it', () => {
  // This is the reported failure: the stored row states a value with no level,
  // and the table printed the strength line anyway.
  const unstated = buildHighlightDisplayRows([
    { key: 'p20', area: 'Bass Performance', result: 'Bass consistency 4.2 dB' },
  ]);
  assert.equal(unstated.length, 1, 'the row is carried');
  assert.ok(
    !/consistent bass from seat to seat/i.test(unstated[0].gain),
    'with no stated level, the evenness claim is not made',
  );
  assert.match(unstated[0].gain, /varies between seats/i, 'the honest line for the parameter prints instead');

  const supported = buildHighlightDisplayRows([
    { key: 'p20', area: 'Bass Performance', result: 'L4 · 1.2 dB' },
  ]);
  assert.match(
    supported[0].gain,
    /consistent bass from seat to seat/i,
    'a stated Level 4 result keeps the approved line',
  );
});

// ── TEST 6 — a numeric result is still graded ─────────────────────────────
test('TEST 6 — a row graded Level 1 in its level field is stated plainly', () => {
  const stated = buildHighlightDisplayRows([
    { key: 'p20', area: 'Bass Performance', result: '4.2 dB', level: 'L1' },
  ]);
  assert.equal(stated.length, 1, 'the row is carried');
  assert.ok(
    !/consistent bass from seat to seat/i.test(stated[0].gain),
    'the value is a number, and the row is still Level 1: the strength line is not used',
  );
});

// ── TEST 7 — never a heading over nothing ─────────────────────────────────
test('TEST 7 — the highlights page says so when no comparison table could be built', () => {
  const table = read('src/components/proposal/KeyPerformanceHighlightsTable.jsx');
  assert.ok(table.includes('comparisonUnavailable'), 'the empty-comparison state exists');
  assert.ok(
    table.includes('No calculated comparison values are available for the selected versions'),
    'and states the reason on the page instead of printing nothing under the heading',
  );
  assert.ok(table.includes('Client meaning'), 'the comparison table carries the client-meaning column');
  assert.ok(table.includes("row.change || 'No change'"), 'an unchanged area is stated as unchanged');

  const pack = read('src/components/proposal/print/ProposalPackDocument.jsx');
  assert.ok(pack.includes('comparisonExpected={isComparisonKind}'), 'the printed pack knows when a comparison was asked for');
  const editor = read('src/pages/ProposalEditor.jsx');
  assert.ok(
    editor.includes("comparisonExpected={proposal?.proposal_type === 'comparison'}"),
    'and so does the editor',
  );
});

// ── TEST 8 — the generator refuses an empty comparison ────────────────────
test('TEST 8 — the backend fails visibly rather than writing an empty table', () => {
  const source = read('base44/functions/generateProposal/entry.ts');
  assert.ok(source.includes('comparisonTable.rows.length === 0'), 'an empty comparison table is detected');
  assert.ok(source.includes('so the comparison table cannot be built'), 'and the generation fails with that reason');
  const refusal = source.indexOf('comparisonTable.rows.length === 0');
  const firstWrite = source.indexOf('ProposalSection.create');
  assert.ok(firstWrite === -1 || refusal < firstWrite, 'the refusal happens before any section is written');
});

// ── TEST 9 — a disabled Generate button always says why ───────────────────
test('TEST 9 — Step 5 names the reason it cannot generate', () => {
  const wizard = read('src/components/proposal/CreateProposalWizard.jsx');
  assert.ok(wizard.includes('generateBlockReason'), 'one reason drives the button');
  assert.ok(wizard.includes('disabled={!!generateBlockReason}'), 'the button is disabled by that reason alone');
  assert.ok(
    !wizard.includes('!engineeringSnapshot || !sourceReady || !readiness.ready'),
    'no unnamed condition is left in the disabled expression',
  );
  assert.ok(wizard.includes('{generateBlockReason}'), 'and the reason is shown beside the button');
  assert.ok(
    wizard.includes('if (selectedVersionIds.length > 1) return null;'),
    'a comparison is not held up by the single-version snapshot requirement',
  );

  const step = read('src/components/proposal/wizard/GenerateStep.jsx');
  for (const phase of ['Generating proposal', 'Writing sections', 'Opening editor', 'Generation failed', 'Proposal ready']) {
    assert.ok(step.includes(phase), `the state "${phase}" is shown`);
  }
  assert.ok(step.includes('Retry Generate Proposal'), 'a failure offers a retry');
  assert.ok(step.includes('onBack'), 'and a way back');
});

// ── TEST 10 — the editor opens on a saved proposal only ───────────────────
test('TEST 10 — the editor handoff is confirmed before it opens', () => {
  const wizard = read('src/components/proposal/CreateProposalWizard.jsx');
  assert.ok(wizard.includes('confirmProposalSectionsSaved(proposalId)'), 'the saved sections are confirmed');
  assert.ok(wizard.includes('if (!handoff.ok) throw new Error(handoff.reason)'), 'and a missing section fails generation');

  const authority = read('src/components/proposal/wizard/proposalHandoffAuthority.js');
  assert.ok(authority.includes('selected_version_ids'), 'the saved version ids are checked');
  assert.ok(authority.includes('proposal_type'), 'the saved report type is checked');
  assert.ok(authority.includes('order_index'), 'the section order is checked');
  assert.ok(authority.includes('key_performance_highlights'), 'the highlights section must exist');
});