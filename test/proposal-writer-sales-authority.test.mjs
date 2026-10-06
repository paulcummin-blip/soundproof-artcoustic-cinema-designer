//
// The proposal writer's prompt authority.
//
// The proposal is a sales document, so the proposal writer is given one
// authority ABOVE the design-explainer voice: sell the experience, prove it with
// the engineering. It is injected after CORE PRINCIPLE and before the detailed
// writing rules — and into the proposal writer's prompt ONLY, because the System
// Design reports and the internal client summary are not sales documents.
//
// The prompt under test is built from the saved live Marquee writer input, so it
// is the prompt the writer is really called with.
//
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import {
  SOUND_PROOF_WRITING_AUTHORITY,
  PROPOSAL_SALES_WRITING_AUTHORITY,
  buildProposalWritingAuthority,
} from '../base44/shared/soundProofWritingAuthority.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import { buildSingleSummaryPrompt } from '../base44/shared/aiSummaryPromptBuilder.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'));
const prompt = buildWriterPrompt({ input: saved.input });

const SALES_HEADER = '=== SELL THE EXPERIENCE, PROVE IT WITH THE ENGINEERING ===';
const AUTHORITY_HEADER = '=== SOUND PROOF WRITING AUTHORITY (how to approach this writing) ===';
const CORE_PRINCIPLE = 'CORE PRINCIPLE';
const NEXT_BLOCK = 'EXPLAIN EVERY OBSERVATION (answer these before moving on)';

test('the proposal prompt carries the sales authority, exactly once and verbatim', () => {
  assert.equal(prompt.split(SALES_HEADER).length - 1, 1, 'the sales authority must appear once');
  for (const line of PROPOSAL_SALES_WRITING_AUTHORITY.split('\n').filter((entry) => entry.trim().length > 0)) {
    assert.ok(prompt.includes(line), `the prompt must carry: ${line}`);
  }
});

test('the sales authority sits after CORE PRINCIPLE and before the detailed writing rules', () => {
  const core = prompt.indexOf(CORE_PRINCIPLE);
  const sales = prompt.indexOf(SALES_HEADER);
  const next = prompt.indexOf(NEXT_BLOCK);
  const authority = prompt.indexOf(AUTHORITY_HEADER);

  assert.ok(authority > -1 && core > authority, 'CORE PRINCIPLE must still sit inside the authority');
  assert.ok(sales > core, 'the sales authority must come after CORE PRINCIPLE');
  assert.ok(next > sales, 'the detailed writing rules must come after the sales authority');
});

test('the authority reaches the writer as readable text, not one character per line', () => {
  // The authority is one string. Carried as one entry it keeps its line breaks;
  // spread into the prompt array it would be spread one character per line.
  assert.ok(
    prompt.includes(`\n${AUTHORITY_HEADER}\n`),
    'the authority header must be a whole line',
  );
  assert.ok(prompt.includes(`${CORE_PRINCIPLE}\n- Never describe a number for the sake of it.`), 'CORE PRINCIPLE must read as a block');
  assert.ok(prompt.includes('Never simply describe a measurement.'), 'the CORE PRINCIPLE must be intact');
  assert.ok(prompt.includes('The engineering data is the authority. The writing explains what that engineering means.'), 'the engineering rule must be intact');
});

test('every existing writer rule survives the addition', () => {
  for (const rule of [
    'Never present something the pack blocks, and never describe a shared result as a change or a gain.',
    'Ground every client-facing claim by citing one or more allowed claim IDs in that section\'s claim_ids.',
    'Never recommend changing the design, and never describe the proposal as an upgrade path.',
    'Copy every figure, Performance Level and product name exactly as the pack states it.',
    '=== THE WRITER INPUT (your only source) ===',
    '=== WHAT TO RETURN ===',
  ]) {
    assert.ok(prompt.includes(rule), `the prompt must still carry: ${rule}`);
  }
  assert.ok(prompt.includes(JSON.stringify(saved.input)), 'the writer input is still carried whole');
});

test('the guiding principle now sells the experience', () => {
  const guiding = 'The client is buying the experience. The specifications and engineering give them confidence that the experience can actually be delivered.';

  assert.ok(prompt.includes(guiding), 'the proposal prompt must carry the new guiding principle');
  assert.ok(SOUND_PROOF_WRITING_AUTHORITY.includes(guiding), 'the shared authority must carry it — the reports and the client summary read the same line');
  assert.ok(buildWritingStyleContract().includes(guiding), 'the report contract must carry it too');
  assert.ok(!prompt.includes('The client is buying confidence, not specifications.'), 'the old line must be gone');
});

test('the sales authority is the proposal writer\'s only — a report is not a sales document', () => {
  const contract = buildWritingStyleContract();

  assert.ok(!contract.includes(SALES_HEADER), 'the report contract must not carry the sales authority');
  assert.ok(!contract.includes('This proposal is a sales document'), 'a report must not be told it is a sales document');

  // The internal client summary reads the same shared authority.
  const summary = buildSingleSummaryPrompt({});
  assert.ok(summary.includes(SOUND_PROOF_WRITING_AUTHORITY), 'the client summary must carry the shared authority');
  assert.ok(!summary.includes(SALES_HEADER), 'the client summary must not carry the sales authority');

  // The authority every surface reads is unchanged apart from the guiding
  // principle line, and the proposal authority is that same text with the sales
  // section inserted into it — so no other surface can be handed the section.
  assert.ok(!SOUND_PROOF_WRITING_AUTHORITY.includes(SALES_HEADER));

  const proposed = buildProposalWritingAuthority();
  const tail = SOUND_PROOF_WRITING_AUTHORITY.slice(SOUND_PROOF_WRITING_AUTHORITY.indexOf('\nEXPLAIN EVERY OBSERVATION') + 1);
  assert.ok(proposed.startsWith(SOUND_PROOF_WRITING_AUTHORITY.slice(0, SOUND_PROOF_WRITING_AUTHORITY.indexOf('\nEXPLAIN EVERY OBSERVATION'))));
  assert.ok(proposed.endsWith(tail), 'every rule after CORE PRINCIPLE must follow the sales authority unchanged');
});