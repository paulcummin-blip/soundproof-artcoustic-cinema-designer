/**
 * Comparison section semantics — the contract
 * -------------------------------------------
 * A proposal's section names must match its type.
 *
 *   single version  ->  System Design Summary     | Key Performance Highlights
 *   comparison      ->  System Options Summary    | Key Differences
 *
 * A comparison is not describing one system. It presents multiple SYSTEM OPTIONS
 * and explains how they differ, so it may not be titled, or written, as a single
 * system design.
 *
 * The backend naming authority (base44/shared/systemDesignSummarySections.js)
 * cannot be imported here — it is server-side — so the parts of this contract
 * that live there are asserted against its source text, exactly as the other
 * proposal contract suites do. Everything on the frontend side is exercised
 * directly: the section names, the editor's labels and the printed-page body
 * rules are all run as real functions.
 *
 * What this suite proves:
 *   TEST A  the backend and the editor name the sections identically
 *   TEST B  generation and regeneration write the comparison names
 *   TEST C  the printed pack and the editor show the resolved name
 *   TEST D  the opening section introduces every option
 *   TEST E  single-version reports are never renamed
 *   TEST F  shared facts are kept and the differences lead
 *   TEST G  the option columns are headed by the official version name
 *   TEST H  the opening section keeps every option, and a single-system page
 *           keeps its prose-only three-paragraph limit
 *   TEST I  no calculation, report or evidence path is touched
 * ---------------------------------------------------------------------------
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMPARISON_SECTION_TITLES as UI_SECTION_TITLES,
  getSectionLabel,
  resolveSectionTitle as resolveUiSectionTitle,
} from '../components/proposal/proposalSections.js';
import { prepareSectionBody } from '../components/proposal/sectionBodyAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const BACKEND_SECTIONS = 'base44/shared/systemDesignSummarySections.js';
const COMPARISON_TABLE = 'base44/shared/comparisonTable.js';

const EXPECTED_COMPARISON_TITLES = {
  system_design_summary: 'System Options Summary',
  key_performance_highlights: 'Key Differences',
};

// ── TEST A — the two authorities name the sections identically ──────────────
test('TEST A — the backend and the editor rename the same two sections', () => {
  assert.deepEqual(
    { ...UI_SECTION_TITLES },
    EXPECTED_COMPARISON_TITLES,
    'the editor names the two comparison sections',
  );

  const backend = read(BACKEND_SECTIONS);
  assert.ok(backend.includes("export const HIGHLIGHTS_SECTION_TYPE = 'key_performance_highlights';"));
  assert.ok(
    backend.includes("system_design_summary: 'System Options Summary'")
      && backend.includes("[HIGHLIGHTS_SECTION_TYPE]: 'Key Differences'"),
    'the backend names the same two sections for a comparison',
  );
  // Only a comparison renames a section.
  assert.ok(
    backend.includes("if (proposalType !== 'comparison') return title;")
      && backend.includes('return COMPARISON_SECTION_TITLES[sectionType] || title;'),
    'the backend rename is scoped to a comparison',
  );
});

// ── TEST B — generation and regeneration write the comparison names ─────────
test('TEST B — a generated and a regenerated comparison is named for options', () => {
  const generator = read('base44/functions/generateProposal/entry.ts');
  assert.ok(
    generator.includes('title: resolveSectionTitle(s.type, s.title, resolvedType),'),
    'a comparison proposal is created with its own section titles',
  );

  const regeneration = read('base44/functions/regenerateProposalSection/entry.ts');
  assert.ok(
    regeneration.includes('resolveSectionTitle(') && regeneration.includes('proposal.proposal_type'),
    'a refined comparison section is written under the comparison name',
  );
});

// ── TEST C — the printed pack and the editor show the resolved name ─────────
test('TEST C — no comparison page is titled as a single system design', () => {
  const pack = read('src/components/proposal/print/ProposalPackDocument.jsx');
  assert.ok(pack.includes('resolveSectionTitle('), 'the printed page resolves the report type');
  assert.ok(!pack.includes("'System comparison'"), 'the comparison table page carries its own name');
  assert.ok(pack.includes('title={displayTitle}'), 'every page header prints the resolved name');

  const editor = read('src/pages/ProposalEditor.jsx');
  assert.ok(
    editor.includes('resolveSectionTitle(section.section_type, section.title, proposal?.proposal_type)'),
    'the editor headline is the resolved name',
  );
  assert.ok(editor.includes('proposalType={proposal?.proposal_type}'), 'the section list knows the report type');

  const nav = read('src/components/proposal/ProposalSectionNav.jsx');
  assert.ok(
    nav.includes('getSectionLabel(section.section_type, proposalType)'),
    'the section list is named for the report type',
  );

  // A single-system report is unaffected: the resolved name is the stored one.
  assert.equal(
    resolveUiSectionTitle('system_design_summary', 'System Design Summary', 'system_summary'),
    'System Design Summary',
  );
});

// ── TEST D — the opening section introduces every option ───────────────────
test('TEST D — the opening section compares options, it does not describe one system', () => {
  const backend = read(BACKEND_SECTIONS);

  assert.ok(backend.includes('export const SYSTEM_OPTIONS_SUMMARY_PROMPT'));
  assert.match(backend, /how many system options the report compares/);
  assert.match(backend, /one short paragraph for each option/);
  assert.match(backend, /exact supplied version name/);
  assert.match(backend, /what every option shares/);
  assert.match(backend, /do not rank them, recommend one, or express a preference/);
  assert.ok(
    backend.includes("proposalType === 'comparison' && sectionType === 'system_design_summary'")
      && backend.includes('? SYSTEM_OPTIONS_SUMMARY_PROMPT'),
    'the options summary is written for a comparison only',
  );

  // The copy rules reach every section of a comparison, not only the opening one.
  assert.match(backend, /never "this design", "the system" or "the selected system"/);
  assert.match(backend, /both versions use/);

  // The comparison table's own introduction is named for the section it opens.
  const table = read(COMPARISON_TABLE);
  assert.ok(table.includes('Write the introduction to the Key Differences section'));
  assert.ok(!table.includes('Write the introduction to the Key Performance Highlights section'));
});

// ── TEST E — single-version reports are never renamed ──────────────────────
test('TEST E — a single-version report keeps its own section names', () => {
  assert.equal(
    resolveUiSectionTitle('key_performance_highlights', 'Key Performance Highlights', 'system_summary'),
    'Key Performance Highlights',
  );
  assert.equal(
    resolveUiSectionTitle('system_design_summary', 'System Design Summary', 'single'),
    'System Design Summary',
  );
  assert.equal(
    resolveUiSectionTitle('system_design_summary', 'System Design Summary', 'comparison'),
    'System Options Summary',
  );
  assert.equal(
    resolveUiSectionTitle('spatial_resolution', 'Spatial Resolution', 'comparison'),
    'Spatial Resolution',
    'a section a comparison does not rename keeps its name',
  );

  assert.equal(getSectionLabel('system_design_summary', 'comparison'), 'System Options Summary');
  assert.equal(getSectionLabel('key_performance_highlights', 'comparison'), 'Key Differences');
  assert.equal(getSectionLabel('system_design_summary', 'system_summary'), 'System Design Summary');

  // A report saved before the names changed is still titled for the report it
  // is: the stored record is never rewritten.
  const backend = read(BACKEND_SECTIONS);
  assert.ok(
    backend.includes("{ type: 'system_design_summary', key: 'system_design_summary', title: 'System Design Summary'"),
    'the stored section set is unchanged',
  );
});

// ── TEST F — shared facts are kept, the differences lead ───────────────────
test('TEST F — the table keeps what is shared and leads with what differs', () => {
  const table = read(COMPARISON_TABLE);

  // An area both versions share is a comparison result, not a missing one.
  assert.ok(!table.includes('size < 2) continue;'), 'a shared area is not dropped');
  assert.ok(table.includes('identical,'), 'the row records that the versions match here');
  assert.ok(table.includes("? 'No change'"), 'and states that it does not change');

  // The differences lead, and the shared areas fill what is left.
  assert.ok(
    table.includes('[...compared.filter((row) => !row.identical), ...compared.filter((row) => row.identical)]'),
    'the differences lead the table and the shared areas follow',
  );

  // Every value still comes from that version's frozen evidence.
  assert.ok(table.includes('evidence.rp22_results'), 'the table reads the calculated results');
  assert.ok(table.includes('buildComparisonTable(versions)'), 'and is built from every selected version');
  assert.ok(table.includes('describeChange(normalised[0], normalised[1])'), 'the change column is derived, never written');
});

// ── TEST G — the option columns carry the official version names ───────────
test('TEST G — each option column is headed by the official saved version name', () => {
  const table = read(COMPARISON_TABLE);
  assert.ok(
    table.includes('version_name: version.version_name || null'),
    'each option column carries its official saved version name',
  );

  // The heading is the saved name itself, not "Option A · Level 1 version".
  const tableComponent = read('src/components/proposal/KeyPerformanceHighlightsTable.jsx');
  assert.ok(
    tableComponent.includes('column?.version_name || column?.label'),
    'the saved version name is the column heading',
  );
});

// ── TEST H — the opening section keeps every option ────────────────────────
test('TEST H — the options summary keeps each option, and a single system keeps its own page', () => {
  const body = [
    '<p>This report compares two system options for the room.</p>',
    '<ul><li>Level 1 version</li><li>Level 4 version</li></ul>',
    '<h3>Level 1 version</h3><p>Level 1 facts.</p>',
    '<h3>Level 4 version</h3><p>Level 4 facts.</p>',
    '<h3>Third option</h3><p>Third facts.</p>',
  ].join('');

  const comparison = prepareSectionBody(body, {
    title: 'System Options Summary',
    sectionType: 'system_design_summary',
    proseOnly: true,
    proposalType: 'comparison',
  });
  assert.ok(comparison.includes('<li>Level 1 version</li>'), 'the options the report compares are kept');
  assert.ok(comparison.includes('Level 4 facts.'), 'every option keeps its own paragraph');
  assert.ok(comparison.includes('Third facts.'), 'and a third option is not cut off');

  const single = prepareSectionBody(body, {
    title: 'System Design Summary',
    sectionType: 'system_design_summary',
    proseOnly: true,
    proposalType: 'system_summary',
  });
  assert.ok(!single.includes('<li>'), 'a single-system page stays prose only');
  assert.ok(single.includes('Level 1 facts.'));
  assert.ok(!single.includes('Third facts.'), 'and is still capped at three paragraphs');
});

// ── TEST I — no calculation, report or evidence path is touched ────────────
test('TEST I — the section names reach no calculation or report path', () => {
  // The naming authority is a presentation module: it reads no evidence, and no
  // RP22, bass or grading authority appears in it.
  const naming = read(BACKEND_SECTIONS);
  assert.doesNotMatch(naming, /grading|metricSchema|regrade|score/i);

  // The highlights writer still writes the introduction only: never a value.
  const table = read(COMPARISON_TABLE);
  assert.ok(table.includes('Return intro_html only'), 'the model still writes no value');
  assert.ok(table.includes('COMPARISON_HIGHLIGHTS_SCHEMA'));
});