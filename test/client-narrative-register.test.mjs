/**
 * client-narrative-register.test.mjs
 * ----------------------------------
 * A client-facing document tells the story the client is buying. It does not count
 * the system's channels, name the layer the design does not have, explain what a
 * mechanism does, or quote a boundary measurement in the main narrative.
 *
 * This suite reads the register the writer is given, the deterministic backstop the
 * narrative sanitizer applies to the returned prose, and the brief a TV media
 * room's Design Overview is written under. No figure, level, product, claim or
 * validation rule is changed by any of it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLIENT_NARRATIVE_REGISTER_RULE,
  PROPOSAL_PARAMETER_RESTRAINT_RULE,
  removeParameterCommentary,
} from '../base44/shared/clientNarrativeRegister.js';
import { sanitizeNarrativeHtml } from '../base44/shared/proposalNarrativeSanitizer.js';
import {
  DESIGN_OVERVIEW_SHORT_FORM,
  applyDesignSummaryBrief,
} from '../base44/shared/proposalWriter/designSummaryBrief.js';
import { writerSectionRequirements } from '../base44/shared/proposalWriter/writerContractSchema.js';

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

const SECTION_OF = (sections, section) => sections.find((entry) => entry.section === section);

/** The Design Overview a real generation returned for a TV media room. */
const GENERATED_OVERVIEW = `<p>The soundtrack is arranged around the audience through a 5.1 layout with 5 discrete channels. Front left, centre and right channels carry the picture-related sound, while side surrounds extend the soundtrack beside the seating; no overhead channels are specified. The 100" TV occupies the front wall, opposite the single seating row. Two SUB2-12 subwoofers sit at the rear and reproduce the system's low-frequency content. The seating is also part of the acoustic arrangement, with 1.29m to the nearest room boundary. Clearance from boundaries matters because nearby walls influence reflections, bass behaviour and the relationship between listeners and surround loudspeakers.</p>`;

// ── TEST 1 — the instruction refuses the words this copy kept using ─────────
test('TEST 1 — the register names every phrase the copy must never carry', () => {
  for (const phrase of [
    '5 discrete channels',
    'no overhead channels are specified',
    "reproduce the system's low-frequency content",
    'part of the acoustic arrangement',
    'relationship between the listeners',
    'standing waves',
  ]) {
    assert.ok(CLIENT_NARRATIVE_REGISTER_RULE.includes(phrase), `the register refuses ${phrase}`);
  }
  // The plain words for this kind of room are supplied, not left to the model.
  for (const phrase of ['relaxed high-performance TV room', 'clear dialogue', 'proper bass weight']) {
    assert.ok(CLIENT_NARRATIVE_REGISTER_RULE.includes(phrase), `the register supplies ${phrase}`);
  }
  // Evidence supports the story, and the sections it stays out of are named.
  assert.match(PROPOSAL_PARAMETER_RESTRAINT_RULE, /EVIDENCE SUPPORTS THE STORY/);
  assert.match(PROPOSAL_PARAMETER_RESTRAINT_RULE, /boundary distance/);
  for (const section of ['Design Summary', 'Design Overview', 'Key Performance Highlights']) {
    assert.ok(PROPOSAL_PARAMETER_RESTRAINT_RULE.includes(section), `the restraint rule names ${section}`);
  }
});

// ── TEST 2 — the deterministic backstop removes it anyway ──────────────────
test('TEST 2 — the sanitised paragraph carries none of the commentary', () => {
  const cleaned = sanitizeNarrativeHtml(GENERATED_OVERVIEW, { sectionType: 'what_stays_same' });
  for (const banned of [
    /discrete channels/i,
    /no overhead channels/i,
    /low-frequency content/i,
    /1\.29/,
    /nearest room boundary/i,
    /part of the acoustic arrangement/i,
    /relationship between listeners/i,
    /Clearance from boundaries matters/i,
    /picture-related sound/i,
  ]) {
    assert.doesNotMatch(cleaned, banned, `the copy keeps ${banned}`);
  }
  // The arrangement is still stated, and the facts are untouched.
  assert.match(cleaned, /is delivered through a 5\.1 layout/);
  assert.match(cleaned, /100" TV/);
  assert.match(cleaned, /SUB2-12/);
});

// ── TEST 3 — assessed results are never lost ───────────────────────────────
test('TEST 3 — a sentence stating a result is left exactly as it stands', () => {
  for (const evidence of [
    '<p>The system reaches 105 dB at the reference seat.</p>',
    '<p>Bass extension reaches 25 Hz, with P19 reading Excellent at the reference position.</p>',
    '<p>The front left and right loudspeakers sit 2.4 m apart.</p>',
  ]) {
    assert.equal(removeParameterCommentary(evidence), evidence);
  }
});

// ── TEST 4 — nothing readable is ever lost to the rule ─────────────────────
test('TEST 4 — a body that was only commentary is kept rather than emptied', () => {
  const onlyCommentary = '<p>The seating is also part of the acoustic arrangement, with 1.29m to the nearest room boundary.</p>';
  assert.equal(removeParameterCommentary(onlyCommentary), onlyCommentary);
});

// ── TEST 5 — the Design Overview is briefed short and plainly ──────────────
test('TEST 5 — a TV media room\'s Design Overview is briefed to two short paragraphs', () => {
  const sections = applyDesignSummaryBrief(writerSectionRequirements('single'), { pack: packWith(), mode: 'single' });
  const overview = SECTION_OF(sections, DESIGN_OVERVIEW_SHORT_FORM.section);
  assert.equal(overview.word_limit, DESIGN_OVERVIEW_SHORT_FORM.word_limit);
  assert.equal(overview.word_limit, 150);
  assert.match(overview.requirement, /80 to 130 words/);
  assert.match(overview.requirement, /no more than five sentences/);
  // What the copy has to say.
  for (const phrase of [
    'well-executed 5.1 system',
    'dialogue and screen sound locked to the picture',
    'movement and space around the seating',
    'bass support',
    'clear and controlled',
  ]) {
    assert.ok(overview.requirement.includes(phrase), `the brief says ${phrase}`);
  }
  // And what it may never say, named to the writer.
  for (const phrase of [
    '5 discrete channels',
    'no overhead channels are specified',
    "reproduce the system's low-frequency content",
    'the seating is part of the acoustic arrangement',
    'the relationship between listeners and surround loudspeakers',
    'boundary distance',
  ]) {
    assert.ok(overview.requirement.includes(phrase), `the brief refuses ${phrase}`);
  }
  // The multi-cabinet arrangement stays a design fact, not a channel count.
  assert.match(overview.requirement, /multi_cabinet_channels/);
});

// ── TEST 6 — a cinema keeps the contract's own brief ───────────────────────
test('TEST 6 — a design that is not a TV media room is unchanged', () => {
  const cinema = applyDesignSummaryBrief(writerSectionRequirements('single'), {
    pack: packWith({ display: 'projector_screen', bed: 9, overhead: 6 }),
    mode: 'single',
  });
  const overview = SECTION_OF(cinema, DESIGN_OVERVIEW_SHORT_FORM.section);
  assert.equal(overview.word_limit, 180);
  assert.doesNotMatch(overview.requirement, /80 to 130 words/);
  // And the contract itself no longer asks for a channel count or for where the
  // overhead channels are placed.
  const contract = SECTION_OF(writerSectionRequirements('single'), DESIGN_OVERVIEW_SHORT_FORM.section);
  assert.doesNotMatch(contract.requirement, /loudspeaker layout and its channel count/);
  assert.doesNotMatch(contract.requirement, /the overhead channels are placed/);
  assert.match(contract.requirement, /never state a channel count/);
  assert.match(contract.requirement, /any overhead loudspeakers the design actually has/);
});

// ── TEST 7 — the rule reaches the writer and the sanitizer ─────────────────
test('TEST 7 — the register is carried by the writer input, the sanitizer and every report section', () => {
  const builder = read('base44/shared/proposalWriter/writerInputBuilder.js');
  assert.match(builder, /narrative_register: CLIENT_NARRATIVE_REGISTER_RULE/);
  assert.match(builder, /evidence_in_narrative: PROPOSAL_PARAMETER_RESTRAINT_RULE/);
  const sanitizer = read('base44/shared/proposalNarrativeSanitizer.js');
  assert.match(sanitizer, /removeParameterCommentary\(withoutAbsentFeatures\)/);
  const reportSections = read('base44/shared/systemDesignSummarySections.js');
  assert.match(reportSections, /CLIENT_NARRATIVE_REGISTER_RULE/);
});

// ── TEST 8 — wording and length only ──────────────────────────────────────
test('TEST 8 — no calculation, evidence or validation authority is touched', () => {
  const source = read('base44/shared/clientNarrativeRegister.js');
  assert.equal(/^import\s/m.test(source), false, 'the register stands alone');
  for (const forbidden of [
    'publishEngineering', 'reportEvidenceAuthority', 'rp22BassMetrics', 'writerOutputValidator',
    'ProjectAnalysisCache', 'generateProposal',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is untouched`);
  }
  assert.match(source, /Wording only\./);
});