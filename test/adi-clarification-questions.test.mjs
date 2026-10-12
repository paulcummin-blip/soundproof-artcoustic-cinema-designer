/**
 * ADI clarification questions — Phase 1 acceptance tests.
 *
 * ADI may ask at most THREE optional questions about important design decisions
 * the frozen evidence records no reason for. The questions must be about this
 * design's actual geometry, must skip anything already explained, must never be
 * re-asked once answered or passed, and must never be turned into proposal copy:
 * they collect an answer, and the answer is stored as project-specific context
 * separately from the Client Brief.
 *
 * Fixtures only: no proposal is generated, no model is called, nothing is written.
 */
import { describe, it, expect } from 'vitest';

import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import {
  MAX_CLARIFICATION_QUESTIONS,
  buildClarificationQuestions,
} from '../base44/shared/proposalClarification/adiClarificationQuestions.js';
import { verifiedInterpretation } from '../base44/shared/proposalClarification/verifiedInterpretation.js';
import {
  answeredClarifications,
  normaliseClarificationAnswers,
  passedClarifications,
} from '../base44/shared/proposalClarification/clarificationAnswers.js';
import {
  buildClarificationAnswers,
  buildWriterDesignContext,
} from '../base44/shared/proposalWriter/writerDesignContext.js';

/** Genesis: a 115" TV design, 9.1.6 with six overheads, four subs, two rows, P20 L1. */
function genesisSnapshot(overrides = {}) {
  return {
    available: true,
    project: { name: 'Genesis AV' },
    version: { id: 'v1', name: 'Original Design', number: 1 },
    identity: { versionId: 'v1' },
    room: {
      dimensions_text: '5.1m × 4.6m × 2.6m (L × W × H)',
      volume_m3: 61.4,
      seating: {
        total_seats: 8,
        row_count: 2,
        row_spacing_m: 1.8,
        interpretation: '2 rows: 4 seats in row 1, 4 seats in row 2.',
      },
      screen: {
        display_type: 'tv',
        television: true,
        diagonal_inches: 115,
        size_inches: 100,
        manual_dimensions: true,
        manual_width_m: 2.5458721439408083,
        manual_height_m: 1.4320530809667047,
        aspect_ratio: '16:9',
        interpretation: '115" TV on the front wall.',
      },
      acoustic_treatment: {
        enabled: true,
        product: 'Artcoustic Abfuser',
        quantity: 6,
        interpretation: '6 Artcoustic Abfuser panels (designer-specified quantity).',
      },
    },
    system: {
      configuration: { dolby_config: '9.1.6', text: '9.1.6 Dolby Atmos configuration' },
      channel_layout: { bed_channels: 9, overhead_channels: 6, total_discrete: 15, subwoofer_count: 4 },
      subwoofer_strategy: { count: 4 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 9, title: 'Overhead spacing', achieved_level: 'L2', formatted_value: '66.5°' },
        { parameter_id: 18, title: 'Bass extension', achieved_level: 'L2', formatted_value: '24 Hz' },
        { parameter_id: 20, title: 'Bass consistency', achieved_level: 'L1', formatted_value: '±10.8 dB' },
      ],
    },
    bass: {
      p18: { achieved_level: 'L2', formatted_value: '24 Hz' },
      p19: { rsp: { level: 'L1', display_value: '6 dB' }, per_seat: [] },
      p20: { project_floor: 'L1', formatted_value: '±10.8 dB', per_seat: [{ status: 'current' }] },
    },
    viewing: {
      available: true,
      summary: 'Viewing angles calculated for 8 seats.',
      primary_floor: 'L4',
      project_floor: 'L4',
      per_seat: [{ seat_id: 's1', horizontal_angle_deg: 57.3, rp23_level: 'L4', priority: 'primary' }],
    },
    seats: [],
    ...overrides,
  };
}

/** Marquee: a 9.1.6 with four overheads, four subs, three rows, P20 L3. */
function marqueeSnapshot(overrides = {}) {
  const base = genesisSnapshot({ version: { id: 'v2', name: 'Alternative', number: 2 }, identity: { versionId: 'v2' } });
  return {
    ...base,
    system: {
      ...base.system,
      channel_layout: { bed_channels: 9, overhead_channels: 4, total_discrete: 15, subwoofer_count: 4 },
    },
    ...overrides,
  };
}

const sources = (snapshot) => [{ version_id: snapshot.identity.versionId, facts: buildNarrativeFacts(snapshot), snapshot }];
const genesis = () => sources(genesisSnapshot());
const genesisFacts = () => buildNarrativeFacts(genesisSnapshot());
const questionIds = (list) => list.map((entry) => entry.question_id);

describe('A. Genesis — the questions ADI may ask', () => {
  it('asks about the six overheads with this design\'s own figures', () => {
    const list = buildClarificationQuestions({ versions: genesis(), material: '' });
    expect(list[0].question_id).toBe('overhead_speaker_reason');
    expect(list[0].question).toBe(
      'What was the main reason for selecting six overhead loudspeakers for this two-row cinema?',
    );
    expect(list[0].belongs_to).toBe('what_stays_same');
    expect(list[0].version_ids).toEqual(['v1']);
  });

  it('never asks more than three questions', () => {
    // All four candidates apply to Genesis, so the limit is what decides.
    const list = buildClarificationQuestions({ versions: genesis(), material: '' });
    expect(list.length).toBe(MAX_CLARIFICATION_QUESTIONS);
    expect(questionIds(list)).not.toContain('acoustic_treatment_reason');
  });

  it('asks about the configuration, never about a performance outcome', () => {
    const sub = buildClarificationQuestions({ versions: genesis(), material: '' })
      .find((entry) => entry.question_id === 'subwoofer_arrangement_reason');
    expect(sub.question).toBe('What was the main reason for the four-subwoofer arrangement in this room?');
    expect(sub.question).not.toMatch(/consisten|seat-to-seat|equal/i);
  });

  it('names nothing the frozen evidence does not state', () => {
    for (const entry of buildClarificationQuestions({ versions: genesis(), material: '' })) {
      expect(entry.question).not.toMatch(/\d/);
      expect(entry.question).not.toMatch(/screen|projector|aspect/i);
    }
  });
});

describe('B. Nothing is asked when the context is already complete', () => {
  it('asks nothing when the reason for every decision is recorded', () => {
    const material = [
      'The six overhead loudspeakers were chosen to give even coverage across both seating rows.',
      'The four subwoofers were positioned for consistency across the seats.',
      'The front row was prioritised as the primary viewing position.',
      'The six Abfuser panels were specified to control early reflections.',
    ].join(' ');
    expect(buildClarificationQuestions({ versions: genesis(), material })).toEqual([]);
  });

  it('still asks about the count when only the loudspeaker model choice is explained', () => {
    // A reason for choosing WHICH overhead to use is a different decision from the
    // reason for the NUMBER of overheads, so it does not answer the question.
    const material = 'Architect / Spitfire Cloud selected for dedicated overhead coverage.';
    expect(questionIds(buildClarificationQuestions({ versions: genesis(), material })))
      .toContain('overhead_speaker_reason');
  });

  it('does not read a brief REQUEST as a recorded reason', () => {
    const material = 'Explain the overhead speaker spacing logic';
    expect(questionIds(buildClarificationQuestions({ versions: genesis(), material })))
      .toContain('overhead_speaker_reason');
  });

  it('asks nothing when the design states no such decision at all', () => {
    const quiet = genesisSnapshot({
      room: {
        ...genesisSnapshot().room,
        seating: { total_seats: 2, row_count: 1 },
        acoustic_treatment: { enabled: false, quantity: 0 },
        screen: { display_type: 'projector_screen', size_inches: 120, aspect_ratio: '16:9' },
      },
      system: { configuration: { dolby_config: '5.1' }, channel_layout: { overhead_channels: 0, subwoofer_count: 1 } },
      rp22: undefined,
      bass: undefined,
    });
    expect(buildClarificationQuestions({ versions: sources(quiet), material: '' })).toEqual([]);
  });
});

describe('C. A question is never asked twice in one preparation', () => {
  it('skips a question that has been answered', () => {
    const list = buildClarificationQuestions({
      versions: genesis(),
      material: '',
      askedQuestionIds: ['overhead_speaker_reason'],
    });
    expect(questionIds(list)).not.toContain('overhead_speaker_reason');
    expect(list.length).toBeLessThanOrEqual(MAX_CLARIFICATION_QUESTIONS);
  });

  it('skips a question that has been passed, without treating it as answered', () => {
    const list = buildClarificationQuestions({
      versions: genesis(),
      material: '',
      askedQuestionIds: ['overhead_speaker_reason', 'subwoofer_arrangement_reason'],
    });
    expect(questionIds(list)).not.toContain('overhead_speaker_reason');
    expect(questionIds(list)).not.toContain('subwoofer_arrangement_reason');
    // The limit is not filled up with further questions beyond the three allowed.
    expect(list.length).toBeLessThanOrEqual(3);
  });
});

describe('D. A comparison never misdescribes one of its options', () => {
  it('asks nothing about overheads when the versions have different overhead counts', () => {
    const versions = [
      ...sources(genesisSnapshot()),
      ...sources(marqueeSnapshot()),
    ];
    const list = buildClarificationQuestions({ versions, material: '' });
    expect(questionIds(list)).not.toContain('overhead_speaker_reason');
    // The subwoofer count is the same in both, so that question is still valid.
    expect(questionIds(list)).toContain('subwoofer_arrangement_reason');
  });
});

describe('E. A stale or contradictory interpretation cannot influence a question', () => {
  it('removes a projection statement where the frozen evidence states a TV', () => {
    const interpretation = {
      presentation: 'Projection',
      primary_design_intent: 'A reference cinema for the family.',
      important_design_decisions: ['Four subs chosen for seat-to-seat consistency'],
    };
    const verified = verifiedInterpretation({
      snapshot: genesisSnapshot(),
      facts: genesisFacts(),
      interpretation,
    });
    expect(verified.text).not.toMatch(/projection/i);
    expect(verified.text).toContain('A reference cinema for the family.');
    // Genesis's frozen P20 is L1, so a four-subwoofer DESIGN INTENTION is never
    // read as proven seat-to-seat consistency.
    expect(verified.text).not.toMatch(/seat-to-seat/i);
    expect(verified.dropped.map((entry) => entry.reason)).toEqual([
      'contradicts_the_frozen_tv_display_identity',
      'claims_seat_to_seat_consistency_the_frozen_p20_result_does_not_support',
    ]);
    // Genesis must remain a TV design.
    expect(verified.context.isTv).toBe(true);
    expect(verified.context.tvPhrase).toBe('115" TV');
  });

  it('keeps a seat-to-seat statement where the frozen P20 result does support it', () => {
    const snapshot = genesisSnapshot({
      rp22: {
        parameter_headlines: [
          { parameter_id: 20, title: 'Bass consistency', achieved_level: 'L3', formatted_value: '3 dB' },
        ],
      },
    });
    const verified = verifiedInterpretation({
      snapshot,
      facts: buildNarrativeFacts(snapshot),
      interpretation: { important_design_decisions: ['Four subs chosen for seat-to-seat consistency'] },
    });
    expect(verified.text).toContain('seat-to-seat consistency');
  });

  it('leaves a design with no interpretation with no recorded reasoning', () => {
    const verified = verifiedInterpretation({
      snapshot: genesisSnapshot(),
      facts: genesisFacts(),
      interpretation: null,
    });
    expect(verified.text).toBe('');
  });
});

describe('F. An answer is stored as project-specific context, a pass is not an answer', () => {
  const records = normaliseClarificationAnswers([
    { question_id: 'overhead_speaker_reason', question: 'Q1', area: 'overheads', belongs_to: 'what_stays_same', status: 'answered', answer: 'Front, middle and rear coverage for both rows.' },
    { question_id: 'seating_priority_reason', question: 'Q2', area: 'seating', status: 'passed' },
    { question_id: 'fourth_question_reason', status: 'answered', answer: 'Should be dropped: never more than three.' },
    { question_id: 'fifth_question_reason', status: 'answered', answer: 'Also dropped.' },
  ], {
    projectId: 'p1',
    versionIds: ['v1'],
    user: { full_name: 'Designer' },
    now: '2026-10-12T10:00:00.000Z',
  });

  it('keeps at most three records, each project- and version-scoped', () => {
    expect(records.length).toBe(3);
    expect(records[0].project_id).toBe('p1');
    expect(records[0].version_ids).toEqual(['v1']);
    expect(records[0].source).toBe('proposal_wizard');
    expect(records[0].answered_by).toBe('Designer');
  });

  it('never stores a passed question as an answer, and never shares an answer', () => {
    const passed = passedClarifications(records);
    expect(passed).toHaveLength(1);
    expect(passed[0].answer).toBeNull();
    expect(records.every((entry) => entry.shared === false)).toBe(true);
  });

  it('carries only the real answers into the writer context', () => {
    const block = buildClarificationAnswers({ proposal: null, clarificationAnswers: records });
    expect(block.supplied).toBe(true);
    expect(block.answers).toHaveLength(1);
    expect(block.answers[0].belongs_to).toBe('what_stays_same');
    expect(block.passed_questions).toEqual(['seating_priority_reason']);
    expect(answeredClarifications(records)).toHaveLength(1);
  });
});

describe('G. The writer receives the answers as instructions, never as copy', () => {
  it('hands answered questions to the writer for the sections they belong to', () => {
    const context = buildWriterDesignContext({
      proposal: {
        client_brief: 'The client wants reference-level film sound.',
        metadata: {
          clarification_answers: [
            { question_id: 'overhead_speaker_reason', question: 'Q1', area: 'overheads', belongs_to: 'what_stays_same', status: 'answered', answer: 'Front, middle and rear coverage for both rows.' },
            { question_id: 'seating_priority_reason', question: 'Q2', area: 'seating', status: 'passed' },
          ],
        },
      },
      projectId: 'p1',
      versionIds: ['v1'],
      pack: null,
    });
    expect(context.clarification_answers.supplied).toBe(true);
    expect(context.clarification_answers.answers[0]).toEqual({
      question_id: 'overhead_speaker_reason',
      question: 'Q1',
      area: 'overheads',
      belongs_to: 'what_stays_same',
      answer: 'Front, middle and rear coverage for both rows.',
    });
    expect(context.clarification_answers.passed_questions).toEqual(['seating_priority_reason']);
    // The rule forbids printing an answer as a standalone statement.
    expect(context.clarification_answers.rule).toMatch(/never print the question/i);
    // The Client Brief is untouched and still carried as instructions.
    expect(context.editorial_brief.client_brief).toBe('The client wants reference-level film sound.');
  });

  it('states plain rules when the designer answered nothing', () => {
    const block = buildClarificationAnswers({ proposal: { metadata: {} } });
    expect(block.supplied).toBe(false);
    expect(block.answers).toEqual([]);
  });
});