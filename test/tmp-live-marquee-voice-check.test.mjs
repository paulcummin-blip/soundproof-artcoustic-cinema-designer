/**
 * TEMPORARY live-regeneration check (deleted after the run).
 *
 * Reads the REAL Marquee Home / Original Design records dumped from the live
 * database, and reports:
 *   - the writer input a fresh generation will now be given, and the prompt text
 *     built from it;
 *   - the published Design Summary / Design Overview copy as it stands today, and
 *     the same copy after the register's deterministic rules;
 *   - the At-a-Glance facts the printed page states.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WRITER_PROMPT_VERSION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { removeAbsentFeatureFraming } from '../base44/shared/proposalWriter/absentFeatureFraming.js';
import { removeParameterCommentary } from '../base44/shared/clientNarrativeRegister.js';

const d = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'tmp-live-marquee.json'), 'utf8'));
const pack = d.generation.gpt_input.evidence_pack;
const publishedBody = d.sections.find((s) => s.section_type === 'system_design_summary').body;
const plain = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const words = (html) => plain(html).split(/\s+/).filter(Boolean).length;
const parts = (html) => {
  const heads = [...html.matchAll(/<h2>(.*?)<\/h2>/g)];
  return heads.map((match, index) => ({
    title: match[1],
    html: html.slice(match.index + match[0].length, index + 1 < heads.length ? heads[index + 1].index : html.length),
  }));
};
const BANNED = [
  [/discrete channels/i, 'channel count as a selling point'],
  [/no overhead channels/i, 'absent overhead layer'],
  [/low-frequency content/i, 'mechanism explained'],
  [/nearest room boundary|\b1\.29\b/i, 'boundary distance'],
  [/part of the acoustic arrangement|seating theory/i, 'seating explained acoustically'],
  [/relationship between (the )?listeners/i, 'listener/loudspeaker relationship'],
  [/basis of the viewing experience/i, 'hollow clause'],
  [/listener-level/i, 'listener-level wording'],
];

test('LIVE 1 — the writer input a fresh generation is given', () => {
  const input = buildWriterInput({ pack });
  console.log('LIVE prompt_version:', input.prompt_version, '| expected:', WRITER_PROMPT_VERSION);
  const designSummary = input.section_requirements.find((s) => s.section === 'decision_summary');
  const designOverview = input.section_requirements.find((s) => s.section === 'what_stays_same');
  console.log('LIVE Design Summary limit:', designSummary.word_limit);
  console.log('LIVE Design Overview limit:', designOverview.word_limit);
  console.log('LIVE Design Overview requirement:', designOverview.requirement);
  assert.equal(input.prompt_version, 'proposal-writer-prompt-23');
  assert.equal(designSummary.word_limit, 140);
  assert.equal(designOverview.word_limit, 150);
  assert.match(designOverview.requirement, /80 to 130 words/);
  assert.match(designOverview.requirement, /no overhead channels are specified/);
  assert.match(designOverview.requirement, /multi_cabinet_channels/);
  assert.match(input.editorial_rules.narrative_register, /TELL THE STORY, NEVER THE MECHANISM/);
  assert.match(input.editorial_rules.evidence_in_narrative, /EVIDENCE SUPPORTS THE STORY/);

  const prompt = buildWriterPrompt({ input });
  const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  for (const phrase of ['5 discrete channels', 'no overhead channels are specified', 'TELL THE STORY, NEVER THE MECHANISM', '80 to 130 words']) {
    assert.ok(text.includes(phrase), `the prompt carries ${phrase}`);
  }
  console.log('LIVE prompt bytes:', text.length, '| carries the register: yes');
});

test('LIVE 2 — the published copy as it stands, and after the register', () => {
  const blocks = parts(publishedBody);
  console.log('LIVE published parts:', blocks.map((b) => `${b.title} (${words(b.html)} words)`).join(' | '));
  let afterAll = '';
  for (const block of blocks) {
    const before = plain(block.html);
    const after = plain(removeParameterCommentary(removeAbsentFeatureFraming(block.html, {})));
    afterAll += ` ${after}`;
    console.log(`\nLIVE BEFORE [${block.title}] ${words(block.html)}w\n${before}`);
    console.log(`\nLIVE AFTER [${block.title}] ${after.split(/\s+/).filter(Boolean).length}w\n${after}\n`);
  }
  const violations = BANNED.filter(([pattern]) => pattern.test(afterAll)).map(([, label]) => label);
  console.log('LIVE banned phrasing left after the register:', violations.length ? violations.join(', ') : 'none');
  for (const [pattern, label] of BANNED) {
    assert.doesNotMatch(afterAll, pattern, `${label} survived`);
  }
  assert.ok(afterAll.split(/\s+/).filter(Boolean).length > 200, 'the copy is not hollowed out');
  assert.match(afterAll, /100" TV/);
  const summaryAfter = plain(removeParameterCommentary(removeAbsentFeatureFraming(blocks[0].html, {})));
  const overviewAfter = plain(removeParameterCommentary(removeAbsentFeatureFraming(blocks[1].html, {})));
  console.log('LIVE summary after:', summaryAfter.split(/\s+/).filter(Boolean).length, 'words | overview after:', overviewAfter.split(/\s+/).filter(Boolean).length, 'words');
  assert.ok(summaryAfter.split(/\s+/).filter(Boolean).length > 40, 'the summary is not hollowed out');
  assert.ok(overviewAfter.split(/\s+/).filter(Boolean).length > 20, 'the overview is not hollowed out');
});

test('LIVE 3 — the At-a-Glance facts the printed page states', () => {
  const snap = d.snapshots.find((s) => s.type === 'project');
  const ev = snap.payload.reportEvidence;
  console.log('LIVE display:', JSON.stringify(ev.screen?.display || ev.screen || {}));
  console.log('LIVE package rows:', JSON.stringify(ev.system.products_selected));
  const facts = pack.options[0].facts;
  assert.equal(facts.screen.size_inches, 100);
  assert.equal(facts.screen.display_type, 'tv');
  const blob = JSON.stringify(snap.payload);
  assert.equal(/88"/.test(blob), false, 'no 88" screen anywhere in the frozen evidence');
  const quantities = (ev.system.products_selected || [])
    .filter((row) => row.role !== 'Acoustic treatment')
    .map((row) => `${row.model}|${row.quantity}`);
  console.log('LIVE quantities:', quantities.join(', '));
  assert.deepEqual(quantities.sort(), ['C4-1|1', 'EVOLVE 2-1|2', 'EVOLVE 3-1|2', 'SUB2-12|2'].sort());
  assert.equal(ev.system.acoustic_treatment?.[0]?.quantity, 6);
});

test('LIVE 4 — the live writer path publishes through the register', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'base44/functions/generateProposal/entry.ts'), 'utf8');
  assert.match(source, /removeParameterCommentary\(removeAbsentFeatureFraming\(body\.html, \{\}\)\)/);
});