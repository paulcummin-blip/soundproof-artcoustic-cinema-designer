//
// Approved GPT Proposal Writer integration.
//
// The writer's own contract returns its copy in nine sections of its own. The
// proposal document is composed of the report's own sections, which the editor,
// the image planner, the page-break rules and the printed pack all read. These
// cases pin the boundary between the two, and pin that the live generation path
// goes through the approved writer and nothing else.
//
// Fixtures only: no SDK, no provider call, no entity written.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WRITER_SECTION_IDS,
  writerSectionsForMode,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  PROPOSAL_SECTION_FOR_WRITER_SECTION,
  composeWriterSectionBodies,
  narrativeHtml,
} from '../base44/shared/proposalWriter/writerSectionMapping.js';
import { SYSTEM_SUMMARY_SECTIONS } from '../base44/shared/systemDesignSummarySections.js';

const live = readFileSync(new URL('../base44/functions/generateProposal/entry.ts', import.meta.url), 'utf8');

/** The section vocabulary generation creates, in document order. */
const SECTION_TYPES = SYSTEM_SUMMARY_SECTIONS.map((section) => section.type);

/** A draft in the contract's exact shape: all nine sections, in order. */
function draft({ text = 'A firm, confident sentence about the room.' } = {}) {
  return {
    contract_version: 1,
    pack_fingerprint: 'pack-fixture',
    sections: WRITER_SECTION_IDS.map((section) => ({
      section,
      text,
      claim_ids: ['claim_fixture'],
    })),
  };
}

/* ── The draft reaches the document, whole ───────────────────────────────── */

test('every writer section is published into the proposal and none is dropped', () => {
  const { bodies, unmapped } = composeWriterSectionBodies({
    output: draft(),
    mode: 'single',
    sectionTypes: SECTION_TYPES,
  });

  assert.deepEqual(unmapped, [], 'a writer section had no section to be published into');

  // The approved document order is SECTION_TYPES, not the writer's JSON order.
  // Every writer section still reaches exactly one published home.
  const published = bodies.flatMap((body) => body.writer_sections);
  assert.deepEqual([...published].sort(), [...WRITER_SECTION_IDS].sort());
  assert.equal(published.length, new Set(published).size);
  assert.deepEqual(bodies.map((body) => body.section_type), SECTION_TYPES.filter((type) => bodies.some((body) => body.section_type === type)));

  // Every body lands on a section the report type really has.
  for (const body of bodies) {
    assert.ok(SECTION_TYPES.includes(body.section_type), `${body.section_type} is not a section of this report`);
    assert.ok(body.html.length > 0);
  }
});

test('a section taking several writer sections keeps each one under its own heading', () => {
  const { bodies } = composeWriterSectionBodies({
    output: draft({ text: 'Weight and movement are never strained.' }),
    mode: 'single',
    sectionTypes: SECTION_TYPES,
  });

  const summary = bodies.find((body) => body.section_type === 'system_design_summary');
  assert.deepEqual(summary.writer_sections, ['decision_summary', 'what_stays_same', 'what_changes']);

  // The writer's own labels for those three, as the single-option contract names
  // them, each heading its own part.
  const titles = new Map(writerSectionsForMode('single').map((entry) => [entry.section, entry.title]));
  for (const id of summary.writer_sections) {
    assert.ok(summary.html.includes(`<h2>${titles.get(id)}</h2>`), `${id} lost its heading`);
  }
  assert.equal((summary.html.match(/<h2>/g) || []).length, 3);

  // A section carrying one writer section is written under the section's own
  // heading on the page, so its body carries none of its own.
  const dynamic = bodies.find((body) => body.section_type === 'dynamic_range');
  assert.deepEqual(dynamic.writer_sections, ['dynamic_range']);
  assert.equal(dynamic.html.includes('<h2>'), false);
});

test('the draft prose becomes document paragraphs and its markup is escaped', () => {
  assert.equal(narrativeHtml('One.\n\nTwo.'), '<p>One.</p><p>Two.</p>');
  // A newline inside a paragraph is a soft wrap, not a new paragraph.
  assert.equal(narrativeHtml('One\nwrapped.'), '<p>One wrapped.</p>');
  assert.equal(narrativeHtml('   '), '');
  assert.equal(narrativeHtml(null), '');

  // A draft can never inject markup into the document: it is written as text.
  const hostile = narrativeHtml('Bass <table><tr><td>5 dB</td></tr></table> & more.');
  assert.equal(/<table|<tr|<td/.test(hostile), false, 'a draft reached the document as markup');
  assert.ok(hostile.includes('&lt;table&gt;'));
  assert.ok(hostile.includes('&amp;'));
});

test('a writer section this report type cannot hold is reported, never dropped', () => {
  // The legacy ten-section report type has no home for the writer's opening
  // three or its specialist sections. Publishing part of a validated draft would
  // print a proposal with copy missing from it, so the call says so instead.
  const legacyTypes = ['cover', 'executive_summary', 'design_philosophy', 'system_overview',
    'room_images', 'performance', 'products', 'comparison', 'conclusion', 'appendix'];

  const { unmapped } = composeWriterSectionBodies({
    output: draft(),
    mode: 'single',
    sectionTypes: legacyTypes,
  });

  assert.ok(unmapped.length > 0, 'a draft was published into a report type that cannot hold it');
  assert.ok(unmapped.includes('decision_summary'));
});

test('a comparison draft keeps the report’s comparison section for its highlights', () => {
  const { bodies } = composeWriterSectionBodies({
    output: draft(),
    mode: 'comparison',
    sectionTypes: SECTION_TYPES,
  });

  // 'comparison' and 'single' differ only in the labels the writer is given: the
  // section IDs, and so the published bodies, are the same shape either way.
  const single = composeWriterSectionBodies({ output: draft(), mode: 'single', sectionTypes: SECTION_TYPES });
  assert.deepEqual(bodies.map((body) => body.section_type), single.bodies.map((body) => body.section_type));
  assert.ok(bodies.some((body) => body.section_type === 'key_performance_highlights'));
  // The mapping returns bodies only: the section's own calculated comparison
  // table is metadata the caller leaves exactly as it was.
  for (const body of bodies) assert.deepEqual(Object.keys(body), ['section_type', 'html', 'writer_sections']);
});

test('every writer section has one published home', () => {
  const homes = WRITER_SECTION_IDS.map((id) => PROPOSAL_SECTION_FOR_WRITER_SECTION[id]);
  assert.equal(homes.filter(Boolean).length, WRITER_SECTION_IDS.length, 'a writer section has no home');
  for (const home of homes) assert.ok(SECTION_TYPES.includes(home), `${home} is not a section of the report`);
});

/* ── The live path goes through the approved writer, and only it ─────────── */

test('the live generation path writes with the approved writer authority', () => {
  // The approved writer: its pack, its input, its provider call, its validator
  // and its append-only record — the shared Phase 6 orchestration, unchanged.
  assert.match(live, /runProposalCopyGeneration\(/);
  assert.match(live, /generationEntityPayload\(\{ record: auditRecord/);

  // The validated copy is published into the proposal's own sections, which is
  // what the editor and the PDF read.
  assert.match(live, /composeWriterSectionBodies\(\{/);
  assert.match(live, /attempt\.record\.gpt_output/);
  assert.match(live, /ProposalSection\.update\(section\.id, \{/);

  // It is still gated on the canonical Current Project Report: the frozen
  // report evidence and the one readiness authority, read once and reused as
  // the writer's only source.
  assert.match(live, /readProposalReportEvidence\(/);
  assert.match(live, /resolveProposalReadinessGate\(\{/);
  assert.match(live, /readEvidence: async \(\) => suppliedSnapshots/);
});

test('there is no legacy generator and no fallback in the live path', () => {
  assert.doesNotMatch(live, /generateProposalDraftContent/);
  assert.doesNotMatch(live, /buildProjectContext/);
  // A refusal and a rejected draft both end the generation with a reason.
  assert.match(live, /if \(!attempt\.ok\)/);
  assert.match(live, /if \(attempt\.valid !== true\)/);
  assert.match(live, /WRITER_DRAFT_REJECTED_MESSAGE/);
  // The attempt is filed BEFORE the validity gate, so a copy that failed its
  // evidence check leaves a record to diagnose rather than nothing at all. It is
  // written exactly once, and a failed attempt is filed on the draft identity it
  // was written under — never on the proposal that is rolled back.
  const recordAt = live.indexOf('ProposalGeneration.create');
  const validAt = live.indexOf('if (attempt.valid !== true)');
  assert.ok(recordAt > 0 && recordAt < validAt, 'the attempt record is written after the draft has been judged');
  assert.equal((live.match(/ProposalGeneration\.create\(/g) || []).length, 1);
  assert.match(live, /draftAttemptRecord\(attempt\.record, \{ draftProposalId: proposal\.id \}\)/);
});

test('the writer is not gated on the controlled-test flag', () => {
  // Generating a proposal IS the writer's job. Only the flag's model override is
  // read, so a proposal is never refused because a test flag is off.
  assert.match(live, /flag: \{ enabled: true, model: writerConfig\.model \}/);
  assert.doesNotMatch(live, /resolveGptWriterFlag/);
  assert.match(live, /normaliseGptWriterConfig\(record\?\.\[GPT_WRITER_FLAG_FIELD\]/);
});

test('the frozen evidence the report prints is preserved, not rewritten by copy', () => {
  // The highlights rows are read from the frozen snapshot the report was
  // generated from, so the table the page prints is unchanged by this pass, and
  // a comparison keeps the table its section already carries.
  assert.match(live, /mergeHighlightRows\(selectHighlightRows\(engineering_snapshot\), null\)/);
  assert.match(live, /resolvedType === 'system_summary'/);
  assert.match(live, /resolvedType === 'comparison'/);
});

/* ── One section vocabulary, in both mirrors ─────────────────────────────── */

test('the report section vocabulary and its frontend mirror agree', () => {
  // The backend names the highlights section by the shared constant rather than
  // by a literal, so the constant is resolved before the two lists are compared.
  const typesFrom = (source) => {
    const start = source.indexOf('export const SYSTEM_SUMMARY_SECTIONS = [');
    assert.ok(start >= 0, 'SYSTEM_SUMMARY_SECTIONS not found');
    const block = source
      .slice(start, source.indexOf('\n];', start))
      .replace(/HIGHLIGHTS_SECTION_TYPE/g, "'key_performance_highlights'")
      .replace(/PRESENTED_OPTIONS_SECTION_TYPE/g, "'presented_options'");
    return [...block.matchAll(/type:\s*'([a-z_]+)'/g)].map((match) => match[1]);
  };

  const backend = typesFrom(readFileSync(new URL('../base44/shared/systemDesignSummarySections.js', import.meta.url), 'utf8'));
  const frontend = typesFrom(readFileSync(new URL('../src/components/proposal/proposalSections.js', import.meta.url), 'utf8'));

  // The editor only renders a section its own definition list knows, so a
  // section the generator writes and the mirror does not know would be saved and
  // never shown.
  assert.deepEqual(frontend, backend);
  assert.ok(backend.includes('appendix'), 'the writer’s closing source note has no section to be published into');
});