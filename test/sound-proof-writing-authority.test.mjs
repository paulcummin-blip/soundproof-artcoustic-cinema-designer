// sound-proof-writing-authority.test.mjs
// ---------------------------------------
// Guards the Sound Proof Writing Authority: the thinking guide that governs how
// every client-facing surface is written, not merely which words are allowed.
//
// It is one authority (base44/shared/soundProofWritingAuthority.js), shared by
// the System Design reports (through buildWritingStyleContract) and the internal
// AI Client Summary (through aiSummaryPromptBuilder). These checks fail if the
// authority is ever unhooked from either surface, if it stops leading the
// report contract, or if its core rules are softened.
//
// Text only: no calculations, RP22 values or project data are read or touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingStyleContract, BANNED_WORDS } from '../base44/shared/reportWritingStyleContract.js';
import { buildSingleSummaryPrompt, buildComparisonSummaryPrompt } from '../base44/shared/aiSummaryPromptBuilder.js';

test('the authority governs the System Design reports', () => {
  const contract = buildWritingStyleContract();

  // The purpose, the audience and the guiding principle.
  assert.match(contract, /Sound Proof does not write software reports\. It writes professional design advice\./);
  assert.match(contract, /a homeowner, an architect, an interior designer or an installer/);
  assert.match(contract, /They are intelligent\. Do not patronise them/);
  assert.match(contract, /The client is buying the experience\. The specifications and engineering give them confidence that the experience can actually be delivered\./);
  assert.match(contract, /I understand why this has been designed this way, and I trust the reasoning behind it\./);
});

test('the authority leads the contract, before the engineering sections', () => {
  const contract = buildWritingStyleContract();
  const authority = contract.indexOf('=== SOUND PROOF WRITING AUTHORITY');
  assert.ok(authority > -1, 'the authority must be present');

  for (const section of ['=== WHAT THE REPORT MUST ANSWER ===', '=== THE THREE THEMES', '=== LANGUAGE ===', 'FINAL QUALITY CHECK']) {
    const at = contract.indexOf(section);
    assert.ok(at > -1, `${section} must still be present`);
    assert.ok(authority < at, `the authority must lead the contract, before ${section}`);
  }
});

test('the authority explains observations and decisions rather than announcing results', () => {
  const contract = buildWritingStyleContract();

  // The four questions every observation answers.
  for (const question of ['What does this mean?', 'Why does it matter?', 'Why was this chosen?', 'What benefit will the client experience?']) {
    assert.ok(contract.includes(question), `the contract must ask "${question}"`);
  }

  // The approved rewrites, statement by statement.
  assert.match(contract, /This layout gives every seat the best possible surround effect while working within the shape of the room\./);
  assert.match(contract, /The system has enough output to reproduce demanding film soundtracks comfortably without sounding strained\./);
  assert.match(contract, /Sounds move smoothly around the room, creating a convincing sense of movement and placing effects accurately\./);
  assert.match(contract, /Every loudspeaker has been chosen to sound consistent, so voices and effects remain natural as they move around the room\./);

  // The practical examples, in the client's own experience.
  assert.match(contract, /so nobody feels they are sitting in the bad seat/);
  assert.match(contract, /Loud scenes remain effortless without becoming harsh or tiring\./);
  assert.match(contract, /Dialogue stays firmly locked to the screen while effects move naturally around the room\./);
});

test('the authority keeps honesty, experience and the ban on marketing language', () => {
  const contract = buildWritingStyleContract();

  // Honesty about the room, in the approved language.
  for (const phrase of ['Ideally...', 'Because of the room...', 'Within the available space...', 'Given the constraints...', 'The strongest practical solution is...']) {
    assert.ok(contract.includes(phrase), `the contract must offer "${phrase}"`);
  }
  assert.match(contract, /Never hide a compromise\./);

  // Practical experience, without the first person claiming the design.
  assert.match(contract, /In rooms like this\.\.\./);
  assert.match(contract, /never states what the design should be/);
  assert.match(contract, /Never state a design decision or a recommendation in the first person/);

  // AI writing habits are named and refused.
  assert.match(contract, /Do not write symmetrical paragraphs/);
  assert.match(contract, /do not finish every paragraph with a polished conclusion/);
  assert.match(contract, /Natural writing is allowed to feel conversational\./);

  // The author's banned words are banned and stated.
  for (const banned of ['Utilise', 'Transformational', 'Best-in-class', 'Immersive experience', 'Paradigm']) {
    assert.ok(BANNED_WORDS.includes(banned), `"${banned}" must be banned`);
    assert.ok(contract.includes(banned), `the contract must state the ban on "${banned}"`);
  }
});

test('the authority finishes the report on the designer test', () => {
  const contract = buildWritingStyleContract();
  assert.match(contract, /Would an experienced cinema designer actually say this in a client's home\?/);
  assert.match(contract, /Does this sound like software, or like marketing\? If it does, rewrite it\./);
  assert.match(contract, /Does this help the client understand the room and the design\?/);
});

test('the authority governs the client summaries as well as the reports', () => {
  const single = buildSingleSummaryPrompt({});
  const comparison = buildComparisonSummaryPrompt({ payloads: [{}], versionLabels: ['Version A'] });

  for (const [name, prompt] of [['single summary', single], ['comparison summary', comparison]]) {
    assert.ok(
      prompt.includes('=== SOUND PROOF WRITING AUTHORITY (how to approach this writing) ==='),
      `the ${name} prompt must carry the authority`,
    );
    assert.ok(
      prompt.includes('The client is buying the experience. The specifications and engineering give them confidence that the experience can actually be delivered.'),
      `the ${name} prompt must carry the guiding principle`,
    );
    // The neutral voice still governs how the summary addresses the reader.
    assert.ok(prompt.includes('NEUTRAL VOICE (mandatory, applies to every sentence)'), `the ${name} must stay neutral`);
  }
});