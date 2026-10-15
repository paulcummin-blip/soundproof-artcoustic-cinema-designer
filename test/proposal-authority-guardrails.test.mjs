/**
 * test/proposal-authority-guardrails.test.mjs
 * -------------------------------------------
 * THE PROPOSAL AUTHORITY GUARDRAILS — CRITICAL, NON-OPTIONAL.
 *
 * SCOPE: the proposal writer, the evidence validator, the Narrative Steer
 * authority and the copy pass, and nothing else. No RP22/RP23 calculation, no
 * ASDR, no report and no project data is touched: every guard exercises the real
 * shared authority and reads only the frozen Marquee fixture.
 *
 * WHY THIS SUITE EXISTS. One proposal evidence bug came back because the
 * safeguards that had already been agreed — mixed strength-story and
 * scoped-result provenance, the descriptive "recommended position" distinction,
 * the conditional recommendation authority, the persisted Narrative Steer, and
 * the regression test itself — were silently dropped by later proposal work.
 * Each guard below protects one of those safeguards by EXERCISING it, so the
 * suite fails if the behaviour stops happening, whatever the code looks like.
 *
 * RESTORE-PROTECTION RULE. These tests are accepted product behaviour. Where one
 * fails, do NOT update the expected result to make the suite green. First decide
 * whether the agreed product authority has intentionally changed; where it has
 * not, the behaviour regressed and the behaviour is what must be restored.
 *
 * Run: npm run test:proposal-authority
 * Preflight before any proposal-authority change: npm run verify:proposal-authority
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { displayTerminologyIssue } from '../base44/shared/proposalWriter/writerEditorialRules.js';
import {
  buildNarrativeSteerBlock,
  normaliseNarrativeSteer,
} from '../base44/shared/proposalWriter/writerNarrativeSteerRules.js';
import { suppressedAreasFromTopics } from '../base44/shared/narrativePriorityAuthority.js';
import {
  resolveExcludedTopics,
  suppressExcludedNarrative,
} from '../base44/shared/proposalNarrativeExclusions.js';
import { performanceSentence } from '../base44/shared/performanceLanguageAuthority.js';
import { bassExtensionSentence } from '../src/shared/bassExtensionLanguage.js';
import {
  equipmentQuantityMessage,
  isStatedQuantity,
  unresolvedQuantities,
} from '../src/components/proposal/print/equipmentQuantityAuthority.js';
import {
  steerFromPayload,
  steerPayload,
  steerPreferences,
} from '../src/components/proposal/wizard/narrativeSteer.js';
import {
  MARQUEE_CLAIMS,
  MARQUEE_EQUIPMENT,
  MARQUEE_GENERATED_AT,
  marqueeAcceptanceDraft,
  marqueePack,
  marqueeVersion,
} from './fixtures/marqueeOriginalGuardFixture.mjs';

const readApp = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The Marquee writer input: the frozen pack, no steer applied. */
const marqueeInput = () => buildWriterInput({ pack: marqueePack() });

/** One section rewritten, so a single sentence can be judged on its own. */
function sentenceCodes(input, section, sentence, claimIds) {
  const draft = marqueeAcceptanceDraft(input);
  const target = draft.sections.find((entry) => entry.section === section);
  assert.ok(target, `the acceptance draft has no ${section} section`);
  target.text = sentence;
  target.claim_ids = claimIds;
  return validateWriterOutput({ input, output: draft })
    .violations
    .filter((violation) => violation.section === section)
    .map((violation) => violation.code);
}

/** A first-pass narrative carrying the P1 seating rationale and the seat results. */
const SEATING_INCLUSIVE_COPY = '<p>P1: the seating is set 4.2 m from the screen and kept clear of the rear '
  + 'wall, so the room works with the layout rather than against it.</p>'
  + '<p>Across the primary seats the modelled response holds within +/-3 dB, and the secondary seats '
  + 'are consistent with them.</p>'
  + '<p>Bass performance reaches 26 Hz; front-stage dynamic range is 112 dBC with surrounds at 108 dBC.</p>';

/* ── GUARD 1 ───────────────────────────────────────────────────────────────── */

test('GUARD 1 — a benefit carried by a strength story AND its scoped result is valid', () => {
  const input = marqueeInput();
  const sentence = 'Deep bass adds scale to music and effects, supported by a remarkably composed '
    + 'modelled response at the reference position.';
  const claims = [MARQUEE_CLAIMS.bass, MARQUEE_CLAIMS.p20];

  // The two claim kinds the benefit rests on are exactly one ranked strength
  // story and the scoped primary-seat result — the mixed provenance that was lost.
  const kinds = claims.map((id) => input.allowed_claims.find((claim) => claim.claim_id === id)?.kind);
  assert.deepEqual(kinds, ['strength_story', 'scoped_result']);

  for (const section of ['key_performance_highlights', 'dynamic_range']) {
    assert.deepEqual(
      sentenceCodes(input, section, sentence, claims),
      [],
      `${section} must accept a benefit carried by a strength story plus its scoped result`,
    );
  }
});

/* ── GUARD 2 ───────────────────────────────────────────────────────────────── */

test('GUARD 2 — a bare scoped result still cannot authorise an invented benefit', () => {
  const codes = sentenceCodes(
    marqueeInput(),
    'key_performance_highlights',
    'The primary seats gain total immunity from room modes.',
    [MARQUEE_CLAIMS.p20],
  );
  assert.ok(
    codes.includes(WRITER_REJECTION.INVENTED_BENEFIT),
    `a scoped result alone must not widen the authority: ${JSON.stringify(codes)}`,
  );
});

/* ── GUARD 3 ───────────────────────────────────────────────────────────────── */

test('GUARD 3 — a descriptive "recommended position" is not new design advice', () => {
  const input = marqueeInput();
  const codes = sentenceCodes(
    input,
    'spatial_resolution',
    'The speakers occupy their recommended positions.',
    [MARQUEE_CLAIMS.spatial, MARQUEE_CLAIMS.p4],
  );
  assert.ok(
    !codes.includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION),
    `achieved geometry must not be read as a recommendation: ${JSON.stringify(codes)}`,
  );
  // The distinction is real rather than a blanket exemption: this pack carries no
  // recommendation claim at all, so the sentence above passes as description,
  // while GUARD 4 shows a genuine recommendation is still refused.
  assert.equal(input.allowed_claims.some((claim) => claim.kind === 'recommendation'), false);
});

/* ── GUARD 4 ───────────────────────────────────────────────────────────────── */

test('GUARD 4 — a real recommendation still requires recommendation authority', () => {
  const codes = sentenceCodes(
    marqueeInput(),
    'spatial_resolution',
    'We recommend adding two more subwoofers.',
    [MARQUEE_CLAIMS.spatial, MARQUEE_CLAIMS.p4],
  );
  assert.ok(
    codes.includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION),
    `an unsupported recommendation must still be refused: ${JSON.stringify(codes)}`,
  );
});

/* ── GUARD 5 ───────────────────────────────────────────────────────────────── */

test('GUARD 5 — the Narrative Steer survives persistence, value for value', () => {
  const steer = {
    system_approach: { state: 'prefer', label: '5.1 system approach' },
    screen_tonal: { state: 'prefer', label: 'Tonal consistency' },
    display: { state: 'prefer', label: '100" TV' },
    seating_arrangement: { state: 'do_not_discuss', label: 'Seating arrangement' },
  };
  const PREFERRED = ['5.1 system approach', 'Tonal consistency', '100" TV'];
  const EXCLUDED = ['Seating arrangement'];

  const payload = steerPreferences(steer);
  assert.deepEqual(payload.preferred_topics, PREFERRED);
  assert.deepEqual(payload.excluded_topics, EXCLUDED);
  assert.deepEqual(payload.excluded_topic_keys, ['seating_arrangement']);

  // Round trip through the shapes a stored record and a resumed draft carry.
  const reloaded = steerPreferences(steerFromPayload(JSON.parse(JSON.stringify(steerPayload(steer)))));
  assert.deepEqual(reloaded.preferred_topics, PREFERRED);
  assert.deepEqual(reloaded.excluded_topics, EXCLUDED);
  assert.deepEqual(reloaded.excluded_topic_keys, ['seating_arrangement']);

  // The normalisation the generation path applies keeps all four values exactly.
  const record = normaliseNarrativeSteer({
    preferred_topics: PREFERRED,
    excluded_topics: EXCLUDED,
    excluded_topic_keys: ['seating_arrangement'],
  });
  assert.deepEqual(record.preferred_topics, PREFERRED);
  assert.deepEqual(record.excluded_topics, EXCLUDED);
  assert.deepEqual(record.excluded_topic_keys, ['seating_arrangement']);

  // The proposal schema is what stops the persistence being stripped on write.
  const schema = JSON.parse(readApp('base44/entities/Proposal.jsonc'));
  const declared = schema.properties.metadata.properties.narrative_steer;
  assert.ok(declared, 'Proposal metadata must declare narrative_steer, or the record is stripped on write');
  for (const field of ['preferred_topics', 'excluded_topics', 'excluded_topic_keys']) {
    assert.equal(declared.properties[field]?.items?.type, 'string', `${field} must be declared as strings`);
  }

  // And the writer is handed the same values, with their softness stated.
  const block = buildNarrativeSteerBlock(record);
  assert.equal(block.supplied, true);
  assert.deepEqual(block.preferred_topics, PREFERRED);
  assert.deepEqual(block.excluded_topics, EXCLUDED);
  assert.deepEqual(block.excluded_topic_keys, ['seating_arrangement']);
});

/* ── GUARD 6 ───────────────────────────────────────────────────────────────── */

test('GUARD 6 — the seating exclusion reaches the writer, and every figure stays', () => {
  const record = normaliseNarrativeSteer({
    preferred_topics: ['Bass performance'],
    excluded_topics: ['Seating arrangement'],
    excluded_topic_keys: ['seating_arrangement'],
  });
  assert.deepEqual(resolveExcludedTopics(record.excluded_topics), ['seating_arrangement']);

  // The copy pass: the whole seating conversation goes, the figures stay.
  const cleaned = suppressExcludedNarrative(SEATING_INCLUSIVE_COPY, { excluded: record.excluded_topics });
  assert.doesNotMatch(cleaned, /\bseat/i);
  assert.doesNotMatch(cleaned, /\b(?:primary|secondary)\b/i);
  assert.doesNotMatch(cleaned, /P1\b|boundary clearance|clear of the rear wall/i);
  assert.match(cleaned, /26 Hz/);
  assert.match(cleaned, /112 dBC/);
  assert.match(cleaned, /108 dBC/);
  assert.equal(suppressExcludedNarrative(SEATING_INCLUSIVE_COPY, { excluded: [] }), SEATING_INCLUSIVE_COPY);

  // The writer is told, from the persisted record: the exclusion reaches the input.
  const steeredInput = buildWriterInput({ pack: marqueePack(), narrativeSteer: record });
  assert.equal(steeredInput.narrative_steer.supplied, true);
  assert.deepEqual(steeredInput.narrative_steer.excluded_topics, ['Seating arrangement']);
  assert.deepEqual(steeredInput.narrative_steer.excluded_topic_keys, ['seating_arrangement']);
  assert.match(steeredInput.narrative_steer.exclude_rule, /not written about in any client-facing section/i);

  // The pack-level suppression the seating topic drives, through the real topic
  // resolver: the seat-scope narrative authority is withdrawn (no P20 claim, the
  // seating rationale suppressed) and the technical results stay exactly as they were.
  const areas = suppressedAreasFromTopics(['seating_arrangement']);
  assert.ok(
    areas.includes('client_experience'),
    `the seating topic must withdraw the client-experience narrative authority: ${JSON.stringify(areas)}`,
  );

  const plainPack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: MARQUEE_GENERATED_AT });
  const plain = buildWriterInput({ pack: plainPack });
  const suppressed = buildWriterInput({
    pack: buildProposalEvidence({
      versions: [marqueeVersion()],
      generatedAt: MARQUEE_GENERATED_AT,
      narrativeContext: { excluded_topics: ['seating_arrangement'], suppressed_areas: areas },
    }),
  });
  const plainIds = plain.allowed_claims.map((claim) => claim.claim_id);
  const suppressedIds = suppressed.allowed_claims.map((claim) => claim.claim_id);
  assert.ok(plainIds.includes(MARQUEE_CLAIMS.p20), 'the fixture must mint the P20 seat result to guard it');
  assert.equal(suppressedIds.includes(MARQUEE_CLAIMS.p20), false);
  assert.deepEqual(
    suppressedIds,
    plainIds.filter((id) => id !== MARQUEE_CLAIMS.p20),
    'the seating exclusion may withdraw the seat-scope narrative authority and nothing else',
  );

  const rationale = suppressed.evidence.options[0].design_rationale;
  assert.equal(rationale.suppressed, true, 'the seating rationale must be suppressed, not left writable');
});

/* ── GUARD 7 ───────────────────────────────────────────────────────────────── */

test('GUARD 7 — the P18 wording is valid at its own level, and no other figure passes', () => {
  const input = marqueeInput();
  const canonical = bassExtensionSentence('L2 · 26 Hz');
  assert.equal(canonical, performanceSentence('bass_extension', 'L2'));
  assert.equal(canonical, 'Deep bass that adds scale, impact and excitement to films and music.');

  assert.deepEqual(
    sentenceCodes(input, 'dynamic_range', canonical, [MARQUEE_CLAIMS.lowFrequency]),
    [],
  );
  // The same wording with the pack's own 26 Hz figure is valid...
  assert.deepEqual(
    sentenceCodes(
      input,
      'dynamic_range',
      'Deep bass that adds scale, impact and excitement to films and music, reaching 26 Hz in the room.',
      [MARQUEE_CLAIMS.lowFrequency],
    ),
    [],
  );
  // ...and the negative control: swap it for an unsupported 21 Hz and it fails.
  const altered = sentenceCodes(
    input,
    'dynamic_range',
    'Deep bass that adds scale, impact and excitement to films and music, reaching 21 Hz in the room.',
    [MARQUEE_CLAIMS.lowFrequency],
  );
  assert.ok(
    altered.includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    `an unsupported figure must be refused: ${JSON.stringify(altered)}`,
  );
});

/* ── GUARD 8 ───────────────────────────────────────────────────────────────── */

test('GUARD 8 — the display is a 100" TV, and neither 88" nor projection wording is allowed', () => {
  assert.equal(displayTerminologyIssue({ text: 'The 100" TV occupies the front wall.', displayType: 'tv' }), null);
  assert.equal(
    displayTerminologyIssue({ text: 'The 88" screen is paired with the front speakers.', displayType: 'tv' })?.rule,
    'screen_for_the_display',
  );
  assert.equal(
    displayTerminologyIssue({ text: 'The projection screen spans the front wall.', displayType: 'tv' })?.rule,
    'projector_terminology',
  );
});

/* ── GUARD 9 ───────────────────────────────────────────────────────────────── */

test('GUARD 9 — the Marquee equipment package states 1/1/1/2/2, and a 0 count fails', () => {
  assert.deepEqual(MARQUEE_EQUIPMENT.map((row) => row.qty), [1, 1, 1, 2, 2]);
  assert.equal(MARQUEE_EQUIPMENT.every((row) => isStatedQuantity(row.qty)), true);
  assert.deepEqual(unresolvedQuantities(MARQUEE_EQUIPMENT), []);
  assert.deepEqual(
    unresolvedQuantities([...MARQUEE_EQUIPMENT, { role: 'Overheads', model: 'EVOLVE 1-1', qty: 0 }]),
    [{ role: 'Overheads', model: 'EVOLVE 1-1' }],
  );
  assert.match(equipmentQuantityMessage([{ role: 'Overheads', model: 'EVOLVE 1-1', qty: 0 }]), /positive whole number/);
});

/* ── GUARD 10 ──────────────────────────────────────────────────────────────── */

test('GUARD 10 — the frozen Marquee acceptance case validates end to end', () => {
  const input = marqueeInput();
  const draft = marqueeAcceptanceDraft(input);
  const result = validateWriterOutput({ input, output: draft });

  assert.equal(result.valid, true, JSON.stringify(result.violations));
  assert.deepEqual(result.violations.map((violation) => violation.code), []);

  const documentText = draft.sections.map((section) => section.text).join(' ');
  assert.doesNotMatch(documentText, /\bseat/i);
  assert.doesNotMatch(documentText, /\bP(?:1|20)\b/);
  assert.doesNotMatch(documentText, /88/);
  assert.doesNotMatch(documentText, /projector|projection|aspect ratio|diagonal/i);
});

/* ── GUARD 11 ──────────────────────────────────────────────────────────────── */

test('GUARD 11 — a SAVED proposal keeps its steer, and the seating story stays out of the final copy', () => {
  // The shape a saved proposal carries, with its steer as the value lists the
  // record persists — no second storage format, no live wizard state.
  const savedProposal = {
    proposal_type: 'single',
    version_id: 'a',
    selected_version_ids: ['a'],
    title: 'Marquee Home — Original Design',
    status: 'generated',
    narrative_goal: 'luxury_cinema',
    client_brief: 'A 100" TV with a 5.1 system approach and a consistent tonal balance.',
    metadata: {
      audience: 'Homeowner',
      word_count: 'standard',
      language: 'en-GB',
      tone: 'professional',
      narrative_steer: {
        preferred_topics: ['5.1 system approach', 'Tonal consistency', '100" TV'],
        excluded_topics: ['Seating arrangement'],
        excluded_topic_keys: ['seating_arrangement'],
      },
    },
  };
  const saved = JSON.parse(JSON.stringify(savedProposal));
  assert.deepEqual(saved.metadata.narrative_steer.preferred_topics, ['5.1 system approach', 'Tonal consistency', '100" TV']);
  assert.deepEqual(saved.metadata.narrative_steer.excluded_topics, ['Seating arrangement']);

  // The real read and normalisation path the generation takes from the record.
  const record = normaliseNarrativeSteer(saved.metadata.narrative_steer);
  assert.deepEqual(record.preferred_topics, ['5.1 system approach', 'Tonal consistency', '100" TV']);
  assert.deepEqual(record.excluded_topics, ['Seating arrangement']);
  assert.deepEqual(record.excluded_topic_keys, ['seating_arrangement']);
  // The seating exclusion is still recognised — by its value, and by its key,
  // which is what lets the persisted lists drive the topic-keyed suppression.
  assert.deepEqual(resolveExcludedTopics(record.excluded_topics), ['seating_arrangement']);
  assert.deepEqual(resolveExcludedTopics([...record.excluded_topics, ...record.excluded_topic_keys]), ['seating_arrangement']);

  // The writer is instructed from the SAVED record, not from a live draft.
  const steeredInput = buildWriterInput({ pack: marqueePack(), narrativeSteer: record });
  assert.equal(steeredInput.narrative_steer.supplied, true);
  assert.deepEqual(steeredInput.narrative_steer.excluded_topics, ['Seating arrangement']);

  // The final client narrative: the copy pass removes the P1 rationale and the
  // P20 primary-seat narrative, and the technical evidence is untouched.
  const finalCopy = suppressExcludedNarrative(SEATING_INCLUSIVE_COPY, { excluded: record.excluded_topics });
  assert.doesNotMatch(finalCopy, /P1\b|clear of the rear wall|boundary clearance/i);
  assert.doesNotMatch(finalCopy, /primary seats?|secondary seats?/i);
  assert.doesNotMatch(finalCopy, /\bseat/i);
  assert.match(finalCopy, /26 Hz/);
  assert.match(finalCopy, /112 dBC/);
  assert.match(finalCopy, /108 dBC/);

  // And the copy that remains is still a valid proposal, written under the
  // exclusion the saved steer drives.
  const areas = suppressedAreasFromTopics(record.excluded_topic_keys);
  const excludedInput = buildWriterInput({
    pack: marqueePack({ excluded_topics: ['seating_arrangement'], suppressed_areas: areas }),
    narrativeSteer: record,
  });
  const finalDraft = marqueeAcceptanceDraft(excludedInput);
  const result = validateWriterOutput({ input: excludedInput, output: finalDraft });
  assert.equal(result.valid, true, JSON.stringify(result.violations));

  const finalText = finalDraft.sections.map((section) => section.text).join(' ');
  assert.doesNotMatch(finalText, /\bseat/i);
  assert.doesNotMatch(finalText, /\bP(?:1|20)\b/);
  assert.match(finalText, /26 Hz/);
});