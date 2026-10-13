// client-benefit-writing-standard.test.mjs
// ----------------------------------------
// Guards the Sound Proof Client Benefit Writing Standard: the editorial philosophy
// that the engineering is the evidence and the cinema experience is the story.
//
// It checks three things and nothing else:
//   - the standard is composed into the one shared authority the client-facing
//     writing surfaces read, once and whole, and that it is NOT yet in the
//     production report contract;
//   - the standard and the parameter reference it carries hold their rules: the
//     reasoning is not a checklist, every parameter has a stated practical intent,
//     nothing is graded, and no em dash or banned sales phrase is carried;
//   - the seating clearance (P1) is explained from a project's own geometry, in
//     client terms, and differently for two different rooms.
//
// Text and geometry only: no RP22 grade, threshold or engineering value is read
// or changed, and no model is called.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIENT_BENEFIT_WRITING_STANDARD,
  PROPOSAL_SALES_WRITING_AUTHORITY,
  SOUND_PROOF_WRITING_AUTHORITY,
  buildProposalWritingAuthority,
} from '../base44/shared/soundProofWritingAuthority.js';
import {
  RP22_CLIENT_BENEFIT_INTENT,
  clientBenefitIntentLines,
} from '../base44/shared/rp22ClientBenefitIntent.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import {
  buildSeatingBoundaryExplanation,
  readSeatBoundaryGeometry,
} from '../base44/shared/seatingBoundaryPrinciple.js';
import {
  SEATING_BOUNDARY_TWO_MEASUREMENTS,
  buildInterpretationSeatingBoundary,
  seatingBoundaryLines,
} from '../base44/shared/adiSeatingBoundary.js';

const EM_DASH = '\u2014';

test('the standard is composed into the one authority the client-facing surfaces read', () => {
  const authority = buildProposalWritingAuthority();

  assert.equal(authority.split(CLIENT_BENEFIT_WRITING_STANDARD).length, 2, 'the standard appears once, whole');
  assert.ok(authority.includes(SOUND_PROOF_WRITING_AUTHORITY.slice(0, SOUND_PROOF_WRITING_AUTHORITY.indexOf('\nEXPLAIN EVERY OBSERVATION'))), 'the shared authority still leads');
  assert.ok(authority.indexOf(PROPOSAL_SALES_WRITING_AUTHORITY) < authority.indexOf(CLIENT_BENEFIT_WRITING_STANDARD), 'the standard follows the sales authority');
});

test('production report generation is untouched for now', () => {
  const contract = buildWritingStyleContract();

  assert.ok(!contract.includes(CLIENT_BENEFIT_WRITING_STANDARD), 'the report contract must not carry the standard yet');
  assert.ok(!contract.includes('=== THE SOUND PROOF CLIENT BENEFIT STANDARD ==='), 'the report contract is unchanged');
  assert.ok(SOUND_PROOF_WRITING_AUTHORITY.includes('The client is buying the experience.'), 'the shared authority itself is intact');
});

test('the core rule and the five reasoning questions are stated as reasoning', () => {
  const standard = CLIENT_BENEFIT_WRITING_STANDARD;

  assert.ok(standard.includes('The engineering is the evidence. The cinema experience is the story.'));
  assert.ok(standard.includes('Never simply describe what a parameter measures'));
  assert.match(standard, /never state a result without saying what it means for this cinema/);
  assert.match(standard, /They are reasoning, not a checklist\./);

  for (const question of [
    '1. What matters to this particular project?',
    '2. What is the acoustic, visual or practical reason behind the design principle?',
    '3. What does the published result actually establish?',
    '4. What benefit or limitation can reasonably be explained to the client?',
    '5. How does this relate to the complete cinema recommendation?',
  ]) {
    assert.ok(standard.includes(question), `the standard must carry the reasoning "${question}"`);
  }
});

test('every RP22 parameter carries a practical design intent, and none is graded', () => {
  const lines = clientBenefitIntentLines();

  for (let id = 1; id <= 21; id += 1) {
    assert.ok(
      RP22_CLIENT_BENEFIT_INTENT.some((entry) => entry.parameter === `P${id}`),
      `P${id} must carry a stated practical intent`,
    );
  }
  assert.ok(RP22_CLIENT_BENEFIT_INTENT.some((entry) => entry.parameter === 'RP23'), 'RP23 must carry a stated practical intent');
  assert.equal(lines.length, RP22_CLIENT_BENEFIT_INTENT.length, 'every intent is carried into the prompt');

  // The reference explains intent. It never grades, and it never states a level.
  for (const entry of RP22_CLIENT_BENEFIT_INTENT) {
    assert.ok(entry.matters && entry.establishes, `${entry.parameter} must state why it matters and what a result establishes`);
    assert.ok(!/\bLevel [1-9]\b|\bL[1-4]\b|\bdB\b/.test(entry.matters), `${entry.parameter} must not grade or quote a level`);
    assert.ok(!entry.matters.includes(EM_DASH), `${entry.parameter} must not carry an em dash`);
  }
});

test('the standard forbids recitation, protects the compromise protocol and holds the voice', () => {
  const standard = CLIENT_BENEFIT_WRITING_STANDARD;

  assert.ok(standard.includes('The parameters are not a list to be mentioned.'));
  assert.ok(standard.includes('Never insert a generic educational paragraph'));
  assert.ok(standard.includes('Explain the selected considerations naturally, as part of one coherent professional recommendation'));

  assert.ok(standard.includes('Explain the design principle that is affected.'));
  assert.ok(standard.includes('Acknowledge the practical constraint plainly, and never hide it.'));
  assert.ok(standard.includes('Explain what the selected arrangement achieves within that constraint.'));
  assert.ok(standard.includes('Never imply that an alternative arrangement has been assessed'));
  assert.ok(standard.includes('A lower RP22 level is not a poor cinema.'));
  assert.ok(standard.includes('Never invent a designer intent.'));
  assert.ok(standard.includes('Never claim a physical outcome beyond what the calculated evidence establishes.'));

  assert.ok(standard.includes('No parameter recitation, no formulaic structure, and no repeated paragraph shape.'));
  assert.ok(standard.includes('No exaggerated sales claims and no unsupported acoustic guarantees.'));
  assert.ok(standard.includes('No em dashes.'));
  assert.ok(standard.includes('the sales authority governs'), 'the proposal precedence rule must be stated');

  assert.ok(!standard.includes(EM_DASH), 'the standard is read by the model, so it carries no em dash');
  for (const phrase of ['revolutionary', 'breathtaking', 'game-changing', 'world-class', 'uncompromising', 'brings movies to life']) {
    assert.ok(!standard.includes(phrase), `the standard must not carry the sales phrase "${phrase}"`);
  }
});

test('the seating clearance is explained in client terms, from the project geometry', () => {
  // Two rooms, two clearances: the same design consideration, stated differently.
  const constrained = buildSeatingBoundaryExplanation(readSeatBoundaryGeometry({
    seats: [
      { id: 'a', x: 3.0, y: 3.2, row: 1 },
      { id: 'b', x: 1.4, y: 3.2, row: 1 },
      { id: 'c', x: 3.0, y: 4.2, row: 2 },
    ],
    roomDims: { widthM: 3.6, lengthM: 4.8 },
  }));
  const generous = buildSeatingBoundaryExplanation(readSeatBoundaryGeometry({
    seats: [
      { id: 'a', x: 3.2, y: 5.2, row: 1 },
      { id: 'b', x: 1.8, y: 5.2, row: 1 },
      { id: 'c', x: 3.2, y: 7.4, row: 2 },
    ],
    roomDims: { widthM: 6.4, lengthM: 9.6 },
  }));

  assert.equal(constrained.available, true);
  assert.equal(generous.available, true);
  assert.notEqual(constrained.situation, generous.situation, 'the explanation must follow the geometry, not a template');
  assert.equal(constrained.trade_off, true, 'a tight room is stated as the practical constraint');
  assert.equal(generous.trade_off, false, 'a favourable room is not presented as a compromise');

  const clientCopy = [constrained.situation, generous.situation, ...(constrained.rules || [])].join(' ');
  assert.ok(!/\bdB\b|\bLevel [1-9]\b|\bL[1-4]\b|%/.test(clientCopy), 'a client explanation states no level, grade or percentage');
  assert.ok(!clientCopy.includes(EM_DASH), 'a client explanation carries no em dash');
});

test('the interpretation carries the seating clearance, with the two measurements kept apart', () => {
  const block = buildInterpretationSeatingBoundary({
    snapshot: { seats: [{ id: 'a', position: { x: 2.7, y: 6.0 }, row: 1 }, { id: 'b', position: { x: 2.7, y: 6.7 }, row: 2 }] },
    roomDims: { widthM: 5.4, lengthM: 7.2 },
  });

  assert.equal(block.available, true);
  assert.equal(block.the_two_measurements, SEATING_BOUNDARY_TWO_MEASUREMENTS);
  assert.ok(block.nearest_boundary_m > 0 && block.distance_to_rear_wall_m > 0, 'both measurements are stated');

  const lines = seatingBoundaryLines(block).join('\n');
  assert.match(lines, /nearest room boundary is the/);
  assert.match(lines, /two measurements, never merged/);
  assert.ok(!/\bLevel [1-9]\b|\bdB\b/.test(lines), 'the prompt lines state no level');

  const absent = buildInterpretationSeatingBoundary({ snapshot: { seats: [] }, roomDims: null });
  assert.equal(absent.available, false, 'no geometry means no invented clearance');
  assert.match(seatingBoundaryLines(absent).join('\n'), /no clearance is explained and none is invented/);
});

test('the shared authority still carries its own rules unchanged', () => {
  for (const rule of [
    'Never describe a number for the sake of it. Explain what the number means.',
    'The engineering data is the authority. The writing explains what that engineering means.',
    'The client is buying the experience.',
  ]) {
    assert.ok(SOUND_PROOF_WRITING_AUTHORITY.includes(rule), `the shared authority must still carry: ${rule}`);
  }
});