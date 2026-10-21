/**
 * test/proposal-capability-figure-authority.test.mjs
 * --------------------------------------------------
 * THE FIGURE AUTHORITY OF A CITED CAPABILITY CLAIM.
 *
 * A Parameter 14 result reaches the writer as saved numbers (achieved capability,
 * selected target, headroom) and the report's own prose states the same result in
 * its own words. A draft that quotes the capability exactly as the writer contract
 * shows it — two decimal places — therefore states a supported figure, and the
 * measurement scanner must accept it. Every other figure stays refused, and the
 * general rule is unchanged: only values carried by claims the section CITES are
 * admitted, never a neighbour of the value and never a number the draft invented.
 *
 * Run: node --test test/proposal-capability-figure-authority.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  capabilityDisplayForms,
  claimFigureTokens,
} from '../base44/shared/proposalWriter/writerClaimFigures.js';
import {
  MARQUEE_CLAIMS,
  marqueeAcceptanceDraft,
  marqueePack,
} from './fixtures/marqueeOriginalGuardFixture.mjs';

/** The authoritative P14 values this case was rejected on. */
const ACHIEVED = 117.38702597538882;
const TARGET = 112;
const HEADROOM = 5.387025975388823;

/** The Marquee pack with its Parameter 14 claim carrying the saved capability. */
function capabilityPack() {
  const pack = marqueePack();
  const claim = pack.allowed_claims.find((entry) => entry.area === 'p14' && entry.kind === 'supporting_result');
  assert.ok(claim, 'the pack must carry a Parameter 14 supporting result');
  claim.capability = {
    achieved_capability_db: ACHIEVED,
    selected_target_db: TARGET,
    headroom_or_shortfall_db: HEADROOM,
    assessment_basis: 'C-weighted',
    limiting_speaker_group: 'subwoofers',
  };
  return pack;
}

const capabilityInput = () => buildWriterInput({ pack: capabilityPack() });

/** The Parameter 14 claim, as the writer input carries it. */
function p14Claim(input) {
  const claim = input.allowed_claims.find((entry) => entry.area === 'p14' && entry.kind === 'supporting_result');
  assert.ok(claim, 'the writer input must carry the Parameter 14 claim');
  return claim;
}

/** One sentence placed in Dynamic Range, citing the claims given. */
function figureCodes(input, sentence, claimIds) {
  const draft = marqueeAcceptanceDraft(input);
  const target = draft.sections.find((entry) => entry.section === 'dynamic_range');
  assert.ok(target, 'the acceptance draft has no dynamic_range section');
  target.text = sentence;
  target.claim_ids = claimIds;
  return validateWriterOutput({ input, output: draft })
    .violations
    .filter((violation) => violation.section === 'dynamic_range')
    .map((violation) => violation.code);
}

/* ── The rounding rule itself ─────────────────────────────────────────────── */

test('the permitted display forms come from the authoritative value, not from prose', () => {
  assert.deepEqual(capabilityDisplayForms(ACHIEVED), ['117.39']);
  assert.deepEqual(capabilityDisplayForms(HEADROOM), ['5.39']);
  assert.deepEqual(capabilityDisplayForms(TARGET), ['112.00', '112']);
  // A neighbour of the value is never derived.
  assert.ok(!capabilityDisplayForms(ACHIEVED).includes('117.4'));
  assert.ok(!capabilityDisplayForms(ACHIEVED).includes('117.50'));
  assert.ok(!capabilityDisplayForms(HEADROOM).includes('5.4'));
});

test('the writer is given the capability figures under the same rounding rule', () => {
  const claim = p14Claim(capabilityInput());
  assert.equal(claim.capability.achieved_capability_db, 117.39);
  assert.equal(claim.capability.selected_target_db, 112);
  assert.equal(claim.capability.headroom_or_shortfall_db, 5.39);
});

test('claim figure tokens cover dB and dB(C) for every stated capability value', () => {
  const tokens = claimFigureTokens([{
    capability: {
      achieved_capability_db: ACHIEVED,
      selected_target_db: TARGET,
      headroom_or_shortfall_db: HEADROOM,
    },
  }]);
  assert.ok(tokens.has('117.39 dbc'));
  assert.ok(tokens.has('117.39 db'));
  assert.ok(tokens.has('5.39 db'));
  assert.ok(tokens.has('112 db'));
  assert.ok(!tokens.has('117.4 dbc'));
  assert.ok(!tokens.has('120 dbc'));
});

/* ── The accepted figures ─────────────────────────────────────────────────── */

test('P14 achieved capability written as 117.39 dBC is accepted', () => {
  const input = capabilityInput();
  const codes = figureCodes(
    input,
    'At the reference position, predicted bass capability is 117.39 dBC against the selected target.',
    [p14Claim(input).claim_id],
  );
  assert.ok(
    !codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `the authoritative capability must be accepted: ${JSON.stringify(codes)}`,
  );
});

test('P14 headroom written as 5.39 dB is accepted', () => {
  const input = capabilityInput();
  const codes = figureCodes(
    input,
    'That leaves a margin of 5.39 dB for demanding low-frequency effects.',
    [p14Claim(input).claim_id],
  );
  assert.ok(
    !codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `the authoritative headroom must be accepted: ${JSON.stringify(codes)}`,
  );
});

/* ── Still refused ────────────────────────────────────────────────────────── */

test('a changed capability figure is still refused', () => {
  const input = capabilityInput();
  for (const sentence of [
    'Predicted bass capability is 117.49 dBC at the reference position.',
    'That leaves a margin of 5.49 dB for demanding low-frequency effects.',
    'Predicted bass capability is 117.4 dBC at the reference position.',
    'That leaves a margin of 5.4 dB for demanding low-frequency effects.',
  ]) {
    const codes = figureCodes(input, sentence, [p14Claim(input).claim_id]);
    assert.ok(
      codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
      `a neighbour of the authoritative value must be refused: ${sentence} → ${JSON.stringify(codes)}`,
    );
  }
});

test('an invented capability figure is still refused', () => {
  const input = capabilityInput();
  const codes = figureCodes(
    input,
    'Predicted bass capability is 120 dBC at the reference position.',
    [p14Claim(input).claim_id],
  );
  assert.ok(codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE));
});

test('a capability figure is admitted only when the section cites that claim', () => {
  const input = capabilityInput();
  const codes = figureCodes(
    input,
    'Predicted bass capability is 117.39 dBC at the reference position.',
    [MARQUEE_CLAIMS.spatial],
  );
  assert.ok(
    codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `an uncited claim must not authorise its figures: ${JSON.stringify(codes)}`,
  );
});

test('the pack’s own report-stated figures keep passing', () => {
  const input = capabilityInput();
  const codes = figureCodes(
    input,
    'The reference position is predicted to reach 115 dB, and bass reaches 26 Hz in the room.',
    [p14Claim(input).claim_id, MARQUEE_CLAIMS.bass],
  );
  assert.ok(
    !codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `report-stated figures must still pass: ${JSON.stringify(codes)}`,
  );
});

test('a claim with no capability evidence authorises no figure', () => {
  const input = buildWriterInput({ pack: marqueePack() });
  const codes = figureCodes(
    input,
    'Predicted bass capability is 117.39 dBC at the reference position.',
    [p14Claim(input).claim_id],
  );
  assert.ok(
    codes.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `without capability evidence the figure is unsupported: ${JSON.stringify(codes)}`,
  );
});