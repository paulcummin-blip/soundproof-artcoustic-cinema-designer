/**
 * design-summary-short-form.test.mjs
 * ----------------------------------
 * The Design Summary of a TV-based media room is a recommendation, not an essay.
 * This suite reads the one authority that briefs it (designSummaryBrief.js), the
 * input the writer is actually given, and the limit the returned draft is
 * validated against.
 *
 * No figure, level, product, claim or validation rule is read or changed here:
 * the brief is wording and length only.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DESIGN_OVERVIEW_SHORT_FORM,
  DESIGN_SUMMARY_SHORT_FORM,
  applyDesignSummaryBrief,
  isTvListenerLevelDesign,
} from '../base44/shared/proposalWriter/designSummaryBrief.js';
import {
  contractSectionsOf,
  writerSectionRequirements,
} from '../base44/shared/proposalWriter/writerContractSchema.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** A minimal frozen pack: only the facts the brief reads. */
const packWith = ({ display = 'tv', bed = 5, overhead = 0, rows = 1, mode = 'single' } = {}) => ({
  schema_version: 2,
  mode,
  options: [{
    version_id: 'v1',
    version_name: 'Original Design',
    label: 'A',
    strength_stories: [],
    omitted_stories: [],
    facts: {
      screen: { display_type: display },
      system: { channel_layout: { bed_channels: bed, overhead_channels: overhead } },
      seating: { row_count: rows },
    },
  }],
});

const summaryOf = (sections) => sections.find((entry) => entry.section === DESIGN_SUMMARY_SHORT_FORM.section);

// ── TEST 1 — the case is read from the frozen evidence ─────────────────────
test('TEST 1 — a TV, a listener-level layout and one row of seating is the case', () => {
  assert.equal(isTvListenerLevelDesign(packWith(), 'single'), true);
  // A projection screen is a different document.
  assert.equal(isTvListenerLevelDesign(packWith({ display: 'projector_screen', bed: 9, overhead: 6 }), 'single'), false);
  // A TV design with a height layer is not a listener-level system.
  assert.equal(isTvListenerLevelDesign(packWith({ overhead: 4 }), 'single'), false);
  assert.equal(isTvListenerLevelDesign(packWith({ bed: 7 }), 'single'), false);
  // More than one row of seating is not the single-row media room.
  assert.equal(isTvListenerLevelDesign(packWith({ rows: 2 }), 'single'), false);
  // A comparison document keeps its own contract.
  assert.equal(isTvListenerLevelDesign(packWith({ mode: 'comparison' }), 'comparison'), false);
  assert.equal(isTvListenerLevelDesign(null, 'single'), false);
});

// ── TEST 2 — the Design Summary is briefed short and plainly ───────────────
test('TEST 2 — the Design Summary is briefed to two short paragraphs', () => {
  const sections = applyDesignSummaryBrief(writerSectionRequirements('single'), { pack: packWith(), mode: 'single' });
  const summary = summaryOf(sections);
  assert.equal(summary.word_limit, DESIGN_SUMMARY_SHORT_FORM.word_limit);
  assert.equal(summary.word_limit, 140);
  assert.match(summary.requirement, /two short paragraphs/i);
  assert.match(summary.requirement, /80 to 120 words/);
  // The contract's own long-form brief is gone from this section.
  assert.doesNotMatch(summary.requirement, /three or four paragraphs/i);
  assert.doesNotMatch(summary.requirement, /180 to 250 words/);
});

// ── TEST 3 — nothing else is briefed differently ───────────────────────────
test('TEST 3 — every other section keeps the contract\'s own brief', () => {
  const contract = writerSectionRequirements('single');
  const briefed = applyDesignSummaryBrief(contract, { pack: packWith(), mode: 'single' });
  for (const entry of contract) {
    const same = briefed.find((row) => row.section === entry.section);
    if (entry.section === DESIGN_SUMMARY_SHORT_FORM.section) continue;
    // The Design Overview is briefed by the same authority, for the same case.
    if (entry.section === DESIGN_OVERVIEW_SHORT_FORM.section) continue;
    assert.equal(same.requirement, entry.requirement, `${entry.section} is unchanged`);
    assert.equal(same.word_limit, entry.word_limit, `${entry.section} keeps its limit`);
  }
  // A design that is not a TV media room keeps the contract exactly as it is.
  const other = applyDesignSummaryBrief(contract, { pack: packWith({ display: 'projector_screen', bed: 9, overhead: 6 }), mode: 'single' });
  assert.equal(summaryOf(other).word_limit, summaryOf(contract).word_limit);
  assert.match(summaryOf(other).requirement, /three or four paragraphs/i);
});

// ── TEST 4 — the limit the draft is validated against is the briefed one ───
test('TEST 4 — validation reads the limit from the input the writer was given', () => {
  const sections = applyDesignSummaryBrief(writerSectionRequirements('single'), { pack: packWith(), mode: 'single' });
  const input = { section_requirements: sections };
  const readBack = contractSectionsOf(input).find((entry) => entry.section === DESIGN_SUMMARY_SHORT_FORM.section);
  assert.equal(readBack.word_limit, 140, 'the draft is held to the shorter limit');
  // And the input carries the same limit in its own word_limits map.
  const builder = read('base44/shared/proposalWriter/writerInputBuilder.js');
  assert.match(builder, /applyDesignSummaryBrief\(/);
  assert.match(builder, /word_limits: Object\.fromEntries\(sections\.map/);
});

// ── TEST 5 — the instruction says the things the copy must say ────────────
test('TEST 5 — the point is stated plainly, and the hollow phrases are refused', () => {
  const requirement = summaryOf(applyDesignSummaryBrief(writerSectionRequirements('single'), { pack: packWith(), mode: 'single' })).requirement;
  // The plain point: a well-designed 5.1 system performs extremely well here.
  assert.match(requirement, /well-designed 5\.1 system performs extremely well/i);
  assert.match(requirement, /delivers excellent performance/i);
  // The display is named from the frozen evidence, never invented.
  assert.match(requirement, /name the display exactly as the frozen evidence names it/i);
  // What the client hears, and when.
  for (const phrase of ['clear dialogue', 'surround movement', 'bass support', 'sport, box sets, films and music']) {
    assert.ok(requirement.includes(phrase), `the brief says ${phrase}`);
  }
  // The reasoning is not owed to the client.
  assert.match(requirement, /does not need the reasoning/i);
  assert.match(requirement, /do not explain the seating arrangement/i);
  // The phrases the copy must never use are named to the writer.
  for (const phrase of [
    'the basis of the viewing experience',
    'listener-level surround arrangement',
    'the relationship between the TV, the front stage and the seating',
    'tonal assessment',
  ]) {
    assert.ok(requirement.includes(phrase), `the brief refuses ${phrase}`);
  }
  // It is written as a shape, never as one sentence to paste.
  assert.equal(/write exactly: "/.test(requirement), false);
});

// ── TEST 6 — wording and length only ──────────────────────────────────────
test('TEST 6 — no calculation, evidence or report authority is touched', () => {
  const source = read('base44/shared/proposalWriter/designSummaryBrief.js');
  assert.equal(/^import\s/m.test(source), false, 'the brief stands alone');
  for (const forbidden of ['publishEngineering', 'reportEvidenceAuthority', 'rp22BassMetrics', 'speakerDesignRows', 'ProjectAnalysisCache', 'writerOutputValidator']) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is untouched`);
  }
  assert.match(source, /Wording only\./);
});