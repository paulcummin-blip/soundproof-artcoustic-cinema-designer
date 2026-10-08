/**
 * assumed-parameter-proposal-filtering.test.mjs
 * ---------------------------------------------
 * Contract: P8 (upfiring / elevation speakers), P15 (background noise floor) and
 * P21 (early reflections) are assumed or administrative checks. They stay in the
 * Technical Report's RP22 evidence and never enter a client-facing proposal —
 * not the frozen evidence pack, not the writer input, not a generated sentence,
 * not a chip, not a comparison row and not a highlight row — unless the designer
 * explicitly asks for one, and then only as a labelled assumption that is never
 * used as a differentiator.
 *
 * Fixtures only: no SDK, no database, no GPT call.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  ASSUMED_PARAMETER_LABEL,
  assumedParameterUseIssue,
  buildExcludedParameterPolicy,
  excludeExcludedClientParameterRows,
  isAssumedAdministrativeParameter,
  isClientFacingProposalParameter,
  isExplicitlyRequestedAssumedParameter,
} from '../base44/shared/clientFacingParameterAuthority.js';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  buildNarrativeFacts,
} from '../base44/shared/adiNarrativeFacts.js';
import { validateNarrativeChip } from '../base44/shared/adiNarrativeAuthority.js';
import { buildHighlightDisplayRows } from '../src/components/proposal/keyPerformanceHighlightsAuthority.js';
import {
  excludeClientFacingRows,
} from '../src/components/proposal/designIndexRowAuthority.js';
import { resolveComparisonDisplay } from '../src/components/proposal/comparisonDisplayAuthority.js';
import { RP22_CATALOG } from '../src/components/data/rp22Catalog.jsx';
import { PARAM_HUMAN_TITLES } from '../src/components/report/technical/technicalParameterMeta.js';

import { EVIDENCE_AT as AT, option, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { amend, validDraft } from './fixtures/proposalWriterFixtures.mjs';

/** A version whose reports state the assumed parameters alongside the rest. */
const withAssumedParameters = (id) => option(id, {
  levels: { 12: 'L4', 13: 'L4', 14: 'L4', 15: 'L2', 18: 'L4', 19: 'L4', 20: 'L4', 21: 'L2', 8: 'Yes' },
  values: { 12: '112 dBC', 13: '108 dBC', 14: '115 dB', 15: 'NCB 22', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-3 dB', 21: '-10 dB', 8: 'Yes' },
});

const versionsWithAssumed = () => [withAssumedParameters('a'), withAssumedParameters('b')];
const codes = (result) => result.violations.map((entry) => entry.code);
const validate = (input, output) => validateWriterOutput({ input, output });

/* ── 1. The one authority ──────────────────────────────────────────────────── */

test('the ONE assumed-parameter authority answers admission, and the client-facing set', () => {
  assert.equal(isAssumedAdministrativeParameter(8), true);
  assert.equal(isAssumedAdministrativeParameter(15), true);
  assert.equal(isAssumedAdministrativeParameter(21), true);
  assert.equal(isAssumedAdministrativeParameter(14), false);

  for (const id of [8, 15, 21]) assert.equal(isClientFacingProposalParameter(id), false, `P${id} is not client-facing`);
  for (const id of [2, 4, 5, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]) {
    assert.equal(isClientFacingProposalParameter(id), true, `P${id} is client-facing`);
  }

  // No request context, no admission.
  assert.equal(isExplicitlyRequestedAssumedParameter(15, {}), false);
  assert.equal(isExplicitlyRequestedAssumedParameter(15, { clientBrief: 'Please include the P15 background noise floor assumption.' }), true);
  assert.equal(isExplicitlyRequestedAssumedParameter(21, { clientBrief: 'Please include the P15 background noise floor assumption.' }), false);
  assert.equal(isExplicitlyRequestedAssumedParameter(15, buildExcludedParameterPolicy({ clientBrief: 'show P15' })), true);
});

/* ── 2. The frozen evidence pack ───────────────────────────────────────────── */

test('by default the pack carries no assumed parameter and no admission policy', () => {
  const pack = buildProposalEvidence({ versions: versionsWithAssumed(), generatedAt: AT });
  const carried = pack.options.flatMap((entry) => entry.facts.parameters.map((row) => row.parameter_id));
  for (const id of [8, 15, 21]) assert.ok(!carried.includes(id), `P${id} must not reach the pack`);
  assert.equal(pack.assumed_parameter_policy, undefined);
  assert.equal(pack.options[0].facts.assumed_parameters, undefined);
  assert.ok(!pack.blocked_claims.some((block) => String(block.reason).includes('assumed')));
});

test('an explicit request admits that parameter only, as a labelled assumption', () => {
  const pack = buildProposalEvidence({
    versions: versionsWithAssumed(),
    generatedAt: AT,
    requestContext: { clientBrief: 'Please include the P15 background noise floor assumption.' },
  });

  assert.deepEqual(pack.assumed_parameter_policy.requested, ['P15']);
  assert.deepEqual(pack.assumed_parameter_policy.excluded, ['P8', 'P21']);
  assert.equal(pack.assumed_parameter_policy.label, ASSUMED_PARAMETER_LABEL);

  for (const entry of pack.options) {
    const ids = entry.facts.parameters.map((row) => row.parameter_id);
    assert.ok(ids.includes(15), 'the requested parameter is carried');
    assert.ok(!ids.includes(8) && !ids.includes(21), 'the others stay excluded');
    const p15 = entry.facts.parameters.find((row) => row.parameter_id === 15);
    assert.equal(p15.structure, null, 'an assumed parameter supports no client-facing structure');
    assert.equal(p15.kind, 'assumed_parameter');
    assert.equal(p15.assumption_label, ASSUMED_PARAMETER_LABEL);
    assert.equal(entry.facts.assumed_parameters.length, 1);
  }

  const assumptionBlock = pack.blocked_claims.find((block) => block.reason === 'no_assumed_parameter_differentiator');
  assert.ok(assumptionBlock, 'the differentiator ban is minted with the pack');
  assert.match(assumptionBlock.prohibited, /differentiator/i);
  assert.doesNotMatch(pack.assumed_parameter_policy.excluded.join(', '), /P15/);

  // The writer input carries the same rule, so validation reads the admission it
  // was written against.
  const input = buildWriterInput({ pack });
  assert.deepEqual(input.assumed_parameter_policy.requested, ['P15']);
});

/* ── 3. The writer validator ───────────────────────────────────────────────── */

test('the validator blocks P8, P15 and P21 in generated prose by default', () => {
  const input = buildWriterInput({
    pack: buildProposalEvidence({ versions: twoOptions(), generatedAt: AT }),
  });
  assert.equal(input.assumed_parameter_policy, null);

  const blocked = [
    'The upfiring P8 allowance is satisfied in this design.',
    'The background noise floor is an assumption (P15) at NCB 22.',
    'The early reflection assumption (P21) is recorded at -10 dB.',
  ];
  for (const sentence of blocked) {
    const result = validate(input, amend(input, { section: 'dynamic_range', sentence }));
    assert.ok(
      codes(result).includes(WRITER_REJECTION.ASSUMED_PARAMETER_MENTION),
      `${sentence} -> assumed_parameter_mention (${JSON.stringify(codes(result))})`,
    );
  }
});

test('a requested assumed parameter is allowed only when labelled as an assumption', () => {
  const input = buildWriterInput({
    pack: buildProposalEvidence({
      versions: twoOptions(),
      generatedAt: AT,
      requestContext: { clientBrief: 'Please show P15 and mention the P21 early reflection assumption.' },
    }),
  });

  const labelled = amend(input, {
    section: 'dynamic_range',
    sentence: 'The background noise floor (P15) is stated as a design assumption rather than a measured result.',
  });
  assert.ok(!codes(validate(input, labelled)).includes(WRITER_REJECTION.ASSUMED_PARAMETER_MENTION));

  const unlabelled = amend(input, {
    section: 'dynamic_range',
    sentence: 'P21 early reflections sit at -10 dB in this design.',
  });
  assert.ok(codes(validate(input, unlabelled)).includes(WRITER_REJECTION.ASSUMED_PARAMETER_MENTION));

  const differentiator = amend(input, {
    section: 'what_changes',
    sentence: 'The P15 background noise floor is a better result than the other option.',
  });
  assert.ok(codes(validate(input, differentiator)).includes(WRITER_REJECTION.ASSUMED_PARAMETER_MENTION));

  // A compliant draft is still a compliant draft: the rule is not a blanket refusal.
  assert.deepEqual(codes(validate(input, validDraft(input))), []);
});

/* ── 4. ADI chips ──────────────────────────────────────────────────────────── */

test('ADI chips never suggest an assumed parameter unless it was asked for', () => {
  const facts = buildNarrativeFacts(twoOptions()[0].snapshot);
  const policy = buildExcludedParameterPolicy();

  for (const label of [
    'Compare the noise floor across versions',
    'Discuss the upfiring speaker allowance',
    'Explain early reflection control in the room',
  ]) {
    const check = validateNarrativeChip(label, facts, policy);
    assert.equal(check.status, 'rejected', `${label} must not be suggested`);
    assert.match(check.violations[0].rule, /assumed_parameter/);
  }

  // Room treatment genuinely controls early reflections: that copy is design
  // information, not the P21 administrative assumption.
  assert.equal(
    validateNarrativeChip('Explain the acoustic treatment that controls early reflections', facts, policy).status,
    'passed',
  );

  // Requested and labelled: allowed.
  const requested = buildExcludedParameterPolicy({ clientBrief: 'Please show the P15 background noise floor assumption.' });
  assert.equal(
    validateNarrativeChip('Mention the P15 background noise assumption', facts, requested).status,
    'passed',
  );
  assert.equal(
    validateNarrativeChip('Mention the P21 early reflection assumption', facts, requested).status,
    'rejected',
  );
});

/* ── 5. Rows: comparison, highlights, legacy and recovered ─────────────────── */

const assumedRows = [
  { key: 'p15', area: 'Background noise floor', result: 'L2' },
  { key: 'p8_upfiring', area: 'Upfiring speakers', result: 'Yes' },
  { key: 'legacy', area: 'Early reflections', result: '-10 dB' },
];

test('assumed rows are dropped from a stored, legacy or recovered comparison table', () => {
  const table = {
    versions: [{ version_id: 'a', version_name: 'Level 1' }, { version_id: 'b', version_name: 'Level 4' }],
    rows: [
      ...assumedRows.map((row) => ({ ...row, values: ['L2', 'L2'], change: null })),
      { key: 'p12', area: 'Screen Dynamic Range', values: ['112 dBC', '118 dBC'], change: 'L4 → L4' },
    ],
  };
  const display = resolveComparisonDisplay(table.rows, table.versions);
  assert.deepEqual(display.rows.map((row) => row.key), ['p12']);

  // And the shared filter drops the same rows wherever a client-facing surface
  // reads them.
  assert.deepEqual(excludeExcludedClientParameterRows(assumedRows), []);
  assert.deepEqual(excludeClientFacingRows(assumedRows), []);
});

test('assumed rows are dropped from Key Performance Highlights', () => {
  const rows = [
    ...assumedRows.map((row) => ({ ...row, what_the_room_gains: 'A stated administrative check.' })),
    { key: 'p2', area: 'Spatial Resolution', result: 'L4', what_the_room_gains: 'More positions around the seats.' },
  ];
  const display = buildHighlightDisplayRows(rows);
  assert.deepEqual(display.map((row) => row.key), ['p2']);
});

/* ── 6. Technical Report retention is untouched ────────────────────────────── */

test('the assumed parameters remain Technical Report RP22 evidence', () => {
  for (const id of ['8', '15', '21']) {
    assert.ok(RP22_CATALOG[id], `P${id} is in the RP22 catalogue`);
  }
  assert.equal(PARAM_HUMAN_TITLES[8], 'Upfiring / Elevation Speakers');
  assert.equal(PARAM_HUMAN_TITLES[15], 'Background Noise Floor');
  assert.equal(PARAM_HUMAN_TITLES[21], 'Early Reflections');
});

/* ── 7. The one helper decides every boundary the same way ─────────────────── */

test('the shared rule is the single answer for a sentence and for a chip label', () => {
  const closed = buildExcludedParameterPolicy();
  const open = buildExcludedParameterPolicy({ clientBrief: 'show P15 / P21' });

  assert.deepEqual(assumedParameterUseIssue('The noise floor is assumed at NCB 22.', closed), {
    rule: 'assumed_parameter_not_requested', code: 'P15',
  });
  assert.equal(assumedParameterUseIssue('The noise floor (P15) is a design assumption.', open), null);
  assert.deepEqual(assumedParameterUseIssue('P15 improves the dynamic range.', open), {
    rule: 'assumed_parameter_used_as_a_differentiator', code: 'P15',
  });
  // A bare subject reference is caught for a chip, and left alone in prose.
  assert.equal(assumedParameterUseIssue('Compare the noise floor', closed, { broad: true })?.code, 'P15');
  assert.equal(assumedParameterUseIssue('Compare the noise floor', closed), null);
});