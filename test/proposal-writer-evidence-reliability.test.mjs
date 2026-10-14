/**
 * test/proposal-writer-evidence-reliability.test.mjs
 * --------------------------------------------------
 * The evidence corrections of the controlled proposal writer, verified in memory:
 *
 *   1. a complete model identifier is a NAME, never a quantity ("C4-1 cabinets"
 *      asserts no cabinet count), while a real quantity stated against that model
 *      ("2 x C4-1 (mono)") is read — and a wrong one ("3 x C4-1") still fails;
 *   2. a saved ADI interpretation that contradicts the frozen evidence is corrected
 *      field by field, and its valid project-specific statements are kept;
 *   3. the five classes of statement stay apart, and bass evidence that is not
 *      published stays provisional and supports no positive performance claim;
 *   4. every substantive request in the designer's brief is traceable to what the
 *      draft did with it.
 *
 * No backend function is invoked and nothing is written.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { packVocabulary } from '../base44/shared/proposalWriter/writerVocabulary.js';

import {
  cabinetCounts,
  logicalChannelCounts,
} from '../base44/shared/proposalWriter/writerCabinetLanguage.js';
import { multiCabinetChannelViolations } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import {
  INTERPRETATION_CORRECTION_REASON,
  bassPublishedForEveryOption,
  checkInterpretationAgainstEvidence,
  frozenDisplayIdentities,
  supportsWholeSeatBassConsistency,
} from '../base44/shared/proposalWriter/writerInterpretationEvidenceCheck.js';
import {
  EVIDENCE_CLASS,
  buildEvidenceClassification,
} from '../base44/shared/proposalWriter/writerEvidenceClasses.js';
import {
  BRIEF_ITEM_STATUS,
  buildClientBriefCoverage,
} from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';

/** The frozen centre arrangement of the Genesis design: two cabinets, one channel. */
const CENTRE = { position: 'centre', label: 'Centre', cabinets: 2, channels: 1, models: ['C4-1'] };

/** A writer input carrying that arrangement, and nothing else. */
const centreInput = {
  multi_cabinet_channels: { required: [] },
  allowed_claims: [],
  evidence_pack: {
    mode: 'single',
    options: [{
      version_id: 'v1',
      version_name: 'Original Design',
      facts: {
        system: {
          front_stage: {
            physical_centre_cabinets: 2,
            logical_centre_channels: 1,
            centre: 'two C4-1 cabinets working as one logical centre channel',
          },
        },
      },
    }],
  },
};

/** A pack whose display is a television and whose bass result is published. */
const tvPack = {
  options: [{
    version_id: 'v1',
    version_name: 'Original Design',
    facts: {
      screen: { screen_type: 'TV', size_inches: 115 },
      bass: { available: true, subwoofer_strategy_summary: 'Extension to 24 Hz' },
    },
  }],
  allowed_claims: [{ claim_id: 'claim_p19_modest_result_01', area: 'p19', basis: { levels: ['L4'] } }],
  blocked_claims: [{ block_id: 'block_p20_no_changed_values_01', reason: 'no_solved_bass_consistency' }],
};

/** The same design, with no published bass result at all. */
const provisionalBassPack = {
  options: [{
    version_id: 'v1',
    version_name: 'Level 4 version',
    facts: { screen: { screen_type: 'Projection screen' }, bass: { available: false } },
  }],
  allowed_claims: [],
  blocked_claims: [],
};

/** A saved ADI interpretation, as Stage 1 wrote it for the television design. */
const savedView = {
  source: 'saved-adi-project-interpretation',
  room_type: 'Multi-row cinema',
  presentation: 'Projection',
  intended_use: 'Discreet system with low visual impact',
  defining_feature: 'Multi-row layout',
  seating_story: 'Central seats are strongest',
  strongest_areas: [{ area: 'Spatial Resolution', evidence: 'project floor L2' }],
  constraints: ['Rear row geometry'],
  design_decisions: [
    'Spitfire Q Series selected for headroom and dialogue clarity',
    'Acoustically transparent screen selected so the LCR can sit behind it',
    'Four subs chosen for seat-to-seat consistency',
  ],
};

// 1 — MODEL IDENTIFIERS ARE NAMES, NOT QUANTITIES

test('a model identifier asserts no cabinet quantity', () => {
  assert.deepEqual(cabinetCounts('C4-1 cabinets', CENTRE), [], 'C4-1 cabinets states no count');
  assert.deepEqual(cabinetCounts('the centre uses C4-1 cabinets for dialogue', CENTRE), []);
  assert.deepEqual(cabinetCounts('C4-1 cabinets for the centre', CENTRE), []);
});

test('a quantity stated against the arrangement’s own model is a cabinet quantity', () => {
  assert.deepEqual(cabinetCounts('2 x C4-1 (mono)', CENTRE), [2]);
  assert.deepEqual(logicalChannelCounts('2 x C4-1 (mono)', CENTRE), [1], 'mono states one channel');
  assert.deepEqual(cabinetCounts('two C4-1 cabinets', CENTRE), [2]);
  assert.deepEqual(cabinetCounts('C4-1 × 2', CENTRE), [2]);
  assert.deepEqual(cabinetCounts('C4-1 cabinets × 2', CENTRE), [2]);
});

test('a wrong stated cabinet quantity still fails', () => {
  assert.equal(cabinetCounts('3 x C4-1', CENTRE).includes(3), true);
  const wrong = multiCabinetChannelViolations({
    input: centreInput,
    sections: [{ section: 'what_changes', text: 'The centre uses 3 x C4-1 cabinets.', claim_ids: [] }],
  });
  assert.equal(
    wrong.some((row) => row.detail === 'cabinet_count_contradicts_the_frozen_specification:centre:3'),
    true,
  );
});

test('a wrong logical channel count still fails', () => {
  const wrong = multiCabinetChannelViolations({
    input: centreInput,
    sections: [{
      section: 'what_stays_same',
      text: 'The centre uses two C4-1 cabinets as two discrete channels.',
      claim_ids: [],
    }],
  });
  assert.equal(
    wrong.some((row) => row.detail.startsWith('physical_cabinets_described_as_multiple_channels')),
    true,
  );
});

test('the Genesis centre wording is accepted rather than falsely rejected', () => {
  const violations = multiCabinetChannelViolations({
    input: centreInput,
    sections: [{
      section: 'what_stays_same',
      text: 'The LCR stage features high-performance cabinets, with the centre channel consisting of two '
        + 'physical cabinets that function as one logical source for consistent dialogue delivery.',
      claim_ids: [],
    }],
  });
  assert.deepEqual(
    violations,
    [],
    'two physical cabinets stated as one logical source describes the arrangement in full',
  );
  assert.equal(
    violations.some((row) => row.detail.startsWith('cabinet_count_contradicts')),
    false,
    'the numeral inside a model name is never read as a cabinet count',
  );
});

// 1B — NUMERIC SEATING EVIDENCE IS READ WITHOUT WEAKENING THE GUARD

test('a report-stated seating distance is allowed and a different distance is still unsupported', () => {
  const vocabulary = packVocabulary({
    options: [{
      version_id: 'v1',
      facts: { seating: { per_seat: [{ seat_id: 'seat-r1-c1', distance_m: 3.86 }] } },
    }],
  });

  assert.equal(vocabulary.measurements.has('3.86 m'), true, 'the exact RP23 distance is evidence');
  assert.equal(vocabulary.measurements.has('3.9 m'), true, 'the approved one-decimal report form is evidence');
  assert.equal(vocabulary.measurements.has('3.87 m'), false, 'an unsupported distance is still rejected');
});

// 2 — THE SAVED INTERPRETATION IS CHECKED AGAINST THE FROZEN EVIDENCE

test('the frozen display identity is read from the pack, not inferred from a size', () => {
  const [identity] = frozenDisplayIdentities(tvPack);
  assert.equal(identity.is_tv, true);
  assert.equal(identity.display_type, 'tv');
  const [screen] = frozenDisplayIdentities(provisionalBassPack);
  assert.equal(screen.is_tv, false);
  assert.equal(screen.screen_type, 'Projection screen');
});

test('contradictory interpretation fields are removed and valid ones are kept', () => {
  const { view, corrections, context } = checkInterpretationAgainstEvidence({ view: savedView, pack: tvPack });

  assert.equal(context.isTv, true);
  assert.equal(view.presentation, null, 'a projection assumption cannot describe a television design');
  assert.equal(
    view.design_decisions.includes('Acoustically transparent screen selected so the LCR can sit behind it'),
    false,
  );
  assert.equal(
    view.design_decisions.includes('Four subs chosen for seat-to-seat consistency'),
    false,
    'an unproven seat-to-seat outcome is not carried',
  );
  // The valid, project-specific reading is preserved.
  assert.equal(
    view.design_decisions.includes('Spitfire Q Series selected for headroom and dialogue clarity'),
    true,
  );
  assert.deepEqual(view.constraints, ['Rear row geometry']);
  assert.equal(view.room_type, 'Multi-row cinema');
  assert.equal(view.seating_story, 'Central seats are strongest');
  assert.deepEqual(view.strongest_areas, [{ area: 'Spatial Resolution', evidence: 'project floor L2' }]);

  assert.equal(corrections.length, 3);
  assert.deepEqual(
    corrections.map((row) => row.reason).sort(),
    [
      INTERPRETATION_CORRECTION_REASON.SCREEN_ASSUMPTION,
      INTERPRETATION_CORRECTION_REASON.SCREEN_ASSUMPTION,
      INTERPRETATION_CORRECTION_REASON.SEAT_CONSISTENCY,
    ].sort(),
  );
  // The frozen evidence itself is never rewritten.
  assert.equal(tvPack.options[0].facts.screen.screen_type, 'TV');
});

test('a provisional bass reading supports no published bass statement', () => {
  const view = {
    ...savedView,
    presentation: 'Projection',
    design_decisions: ['Bass response measured at the reference position', 'Four subwoofers used for consistent output'],
  };
  const { view: checked, corrections } = checkInterpretationAgainstEvidence({ view, pack: provisionalBassPack });
  assert.equal(checked.design_decisions.includes('Bass response measured at the reference position'), false);
  assert.equal(
    corrections.some((row) => row.reason === INTERPRETATION_CORRECTION_REASON.PROVISIONAL_BASS),
    true,
  );
});

test('a whole-seat positively graded P20 result is what supports seat-to-seat wording', () => {
  assert.equal(supportsWholeSeatBassConsistency(tvPack), false);
  const supported = {
    ...tvPack,
    allowed_claims: [
      { claim_id: 'claim_p20_shared_result_01', area: 'p20', scope: 'all', basis: { levels: ['L4'] } },
    ],
  };
  assert.equal(supportsWholeSeatBassConsistency(supported), true);
  const { view } = checkInterpretationAgainstEvidence({ view: savedView, pack: supported });
  assert.equal(view.design_decisions.includes('Four subs chosen for seat-to-seat consistency'), true);
});

// 3 — EVIDENCE CLASSIFICATION

test('the five classes of statement stay apart, and bass evidence states what it permits', () => {
  const classification = buildEvidenceClassification(tvPack);
  assert.equal(classification.bass.status, 'published');
  assert.equal(classification.bass.options[0].p19_permitted, true);
  assert.equal(classification.bass.options[0].p14_p18_permitted, true);
  assert.equal(classification.bass.options[0].whole_seat_consistency_permitted, false);
  assert.equal(
    classification.classes[EVIDENCE_CLASS.DESIGNER_INTENTION].includes('never an achieved outcome'),
    true,
  );
  assert.equal(classification.classes[EVIDENCE_CLASS.PREDICTION].includes('never written as a result'), true);
  assert.equal(classification.counts.supported_results, 1);
  assert.equal(classification.counts.unknown_or_unsupported, 1);

  const provisional = buildEvidenceClassification(provisionalBassPack);
  assert.equal(provisional.bass.status, 'provisional');
  assert.equal(provisional.bass.options[0].p19_permitted, false);
  assert.equal(provisional.bass.options[0].p14_p18_permitted, false);
  assert.equal(provisional.bass.options[0].whole_seat_consistency_permitted, false);
  assert.equal(bassPublishedForEveryOption(provisionalBassPack), false);
});

// 4 — CLIENT BRIEF COVERAGE IS TRACEABLE

test('every substantive brief request is addressed, unaddressed or unsupported', () => {
  const brief = {
    supplied: true,
    client_brief: [
      '• Explain the 9.1.6 system layout',
      '• Explain the four-subwoofer front/rear configuration',
      '• Explain the bass extension result',
      '• Emphasise the 220 inch screen',
    ].join('\n'),
  };
  const sections = [
    { section: 'what_stays_same', text: 'The system is arranged as a 9.1.6 layout with subwoofers at the front and rear.', claim_ids: [] },
    { section: 'timbre_matching', text: 'Tonal character is maintained across the seating area.', claim_ids: [] },
  ];
  const coverage = buildClientBriefCoverage({ brief, pack: tvPack, sections });

  assert.equal(coverage.supplied, true);
  assert.equal(coverage.items.length, 4);

  const layout = coverage.items.find((row) => /9\.1\.6/.test(row.item));
  assert.equal(layout.status, BRIEF_ITEM_STATUS.ADDRESSED);
  assert.deepEqual(layout.subjects, ['system_layout']);
  assert.equal(layout.sections.includes('what_stays_same'), true);

  const subwoofers = coverage.items.find((row) => /four-subwoofer/.test(row.item));
  assert.equal(subwoofers.status, BRIEF_ITEM_STATUS.ADDRESSED);

  const extension = coverage.items.find((row) => /extension/.test(row.item));
  assert.equal(extension.status, BRIEF_ITEM_STATUS.UNADDRESSED, 'the evidence supports it and the draft omits it');

  const display = coverage.items.find((row) => /220 inch/.test(row.item));
  assert.equal(display.status, BRIEF_ITEM_STATUS.UNSUPPORTED, 'the evidence states nothing about it');

  assert.equal(coverage.addressed_count, 2);
  assert.equal(coverage.unaddressed_count, 1);
  assert.equal(coverage.unsupported_count, 1);
});