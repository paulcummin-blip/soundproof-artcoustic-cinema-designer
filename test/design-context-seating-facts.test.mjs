/**
 * Design Context — verified seating facts and factual question validation.
 *
 * These tests cover the data-grounding correction for the ADI Design Context
 * seating interpretation:
 *
 *   1. The seating-row count is read from the actual rowNumber values, never
 *      inferred from the seat count (the defect: five seats in one row were
 *      reported as two rows).
 *   2. The AI prompt receives the verified row count, and a question that
 *      repeats an incorrect row count is rejected by the factual validator.
 *   3. The validator does not reject legitimate questions that ask only for a
 *      reason, or that state a count matching the verified facts.
 *   4. Existing saved answers remain preserved through merge when the
 *      correction is applied (no context is lost).
 *
 * Pure: no React, no SDK, no provider calls. The AI discovery is injected as
 * a stub so no LLM is reached.
 */
import { describe, it, expect } from 'vitest';

import {
  readVerifiedDesignFacts,
  verifiedSeatingRowCount,
  questionContradictsFacts,
} from '../base44/shared/designContext/designContextFacts.js';
import {
  discoverAiQuestions,
  discoverDesignContextQuestions,
} from '../base44/shared/designContext/designContextDiscovery.js';
import { mergeContextItems } from '../base44/shared/designContext/designContextModel.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function versionWith(state) {
  return { id: 'v1', project_id: 'proj', version_number: 1, design_state: state };
}

/** The affected design: five seats, all rowNumber: 1, in one row. */
function avensysVersion() {
  return versionWith({
    seating_positions: [
      { id: 'seat-r1-c1', x: 1.6, y: 3.33, rowNumber: 1 },
      { id: 'seat-r1-c2', x: 2.2, y: 3.33, rowNumber: 1 },
      { id: 'seat-r1-c3', x: 2.8, y: 3.33, rowNumber: 1 },
      { id: 'seat-r1-c4', x: 3.4, y: 3.33, rowNumber: 1 },
      { id: 'seat-r1-c5', x: 4.0, y: 3.33, rowNumber: 1 },
    ],
    subwooferInstances: [
      { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
      { id: 'sub2', enabled: true, position: { x: 4.6, y: 0.5 } },
    ],
  });
}

function avensysProject() {
  return {
    id: 'proj',
    roomDims: '{"widthM":5.6,"lengthM":6.69,"heightM":2.7}',
    room_width: 5.6,
    room_length: 6.69,
    room_height: 2.7,
  };
}

/* ── 1. Seating-row count is read from rowNumber, not inferred ────────────── */

describe('Verified seating-row count', () => {
  it('reads one row from five seats that all carry rowNumber: 1', () => {
    const facts = readVerifiedDesignFacts(avensysVersion(), avensysProject());
    expect(facts.seat_count).toBe(5);
    expect(facts.seating_rows).toBe(1);
  });

  it('verifiedSeatingRowCount never divides the seat count by three', () => {
    // The defect: Math.ceil(5 / 3) === 2. The verified count is 1.
    const seats = [
      { id: 's1', x: 1, y: 3.33, rowNumber: 1 },
      { id: 's2', x: 2, y: 3.33, rowNumber: 1 },
      { id: 's3', x: 3, y: 3.33, rowNumber: 1 },
      { id: 's4', x: 4, y: 3.33, rowNumber: 1 },
      { id: 's5', x: 5, y: 3.33, rowNumber: 1 },
    ];
    expect(verifiedSeatingRowCount(seats)).toBe(1);
  });

  it('reads two rows from two rows of three seats each', () => {
    const seats = [
      { id: 'f1', x: 1, y: 3.0, rowNumber: 1 },
      { id: 'f2', x: 2, y: 3.0, rowNumber: 1 },
      { id: 'f3', x: 3, y: 3.0, rowNumber: 1 },
      { id: 'b1', x: 1, y: 5.0, rowNumber: 2 },
      { id: 'b2', x: 2, y: 5.0, rowNumber: 2 },
      { id: 'b3', x: 3, y: 5.0, rowNumber: 2 },
    ];
    expect(verifiedSeatingRowCount(seats)).toBe(2);
  });

  it('reads one row for different seat counts within the same row', () => {
    // Three seats, then two more, all rowNumber: 1.
    const seats = [
      { id: 's1', x: 1, y: 3.0, rowNumber: 1 },
      { id: 's2', x: 2, y: 3.0, rowNumber: 1 },
      { id: 's3', x: 3, y: 3.0, rowNumber: 1 },
      { id: 's4', x: 4, y: 3.0, rowNumber: 1 },
      { id: 's5', x: 5, y: 3.0, rowNumber: 1 },
      { id: 's6', x: 6, y: 3.0, rowNumber: 1 },
    ];
    expect(verifiedSeatingRowCount(seats)).toBe(1);
  });

  it('falls back to geometry clustering when rowNumber is absent', () => {
    // No rowNumber, but two clear depth bands at y=3.0 and y=5.0.
    const seats = [
      { id: 'f1', x: 1, y: 3.0 },
      { id: 'f2', x: 2, y: 3.0 },
      { id: 'b1', x: 1, y: 5.0 },
      { id: 'b2', x: 2, y: 5.0 },
    ];
    expect(verifiedSeatingRowCount(seats)).toBe(2);
  });

  it('returns null when neither row metadata nor y-coordinates are available', () => {
    const seats = [{ id: 's1' }, { id: 's2' }];
    expect(verifiedSeatingRowCount(seats)).toBeNull();
  });

  it('returns 0 for no seats', () => {
    expect(verifiedSeatingRowCount([])).toBe(0);
  });
});

/* ── 2. The AI prompt receives the verified row count ────────────────────── */

describe('AI prompt uses the verified row count', () => {
  it('sends seating_rows: 1 for the five-seat single-row design', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => {
      capturedPrompt = request.prompt;
      return { questions: [] };
    };
    await discoverAiQuestions({
      version: avensysVersion(),
      project: avensysProject(),
      deterministicQuestions: [],
      invokeLLM,
    });
    expect(capturedPrompt).not.toBeNull();
    // The verified count is 1, not the inferred 2.
    expect(capturedPrompt).toContain('- seating_rows: 1');
    expect(capturedPrompt).not.toContain('seating_rows: 2');
  });

  it('sends seating_rows: not recorded when row metadata is unavailable', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => {
      capturedPrompt = request.prompt;
      return { questions: [] };
    };
    await discoverAiQuestions({
      version: versionWith({
        subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }],
        // Seats with no row metadata and no y-coordinates.
        seating_positions: [{ id: 's1' }, { id: 's2' }],
      }),
      project: { id: 'p', room_width: 4, room_length: 5, room_height: 2.4 },
      deterministicQuestions: [],
      invokeLLM,
    });
    expect(capturedPrompt).toContain('- seating_rows: not recorded');
  });
});

/* ── 3. The factual validator rejects contradictory questions ────────────── */

describe('Factual question validation', () => {
  const facts = readVerifiedDesignFacts(avensysVersion(), avensysProject());

  it('rejects a question that claims two rows for a one-row design', () => {
    const contradiction = questionContradictsFacts(
      {
        question: 'What was the main reason for the five seats across two rows in this room?',
      },
      facts,
    );
    expect(contradiction).not.toBeNull();
    expect(contradiction.reason).toBe('seating_row_count_mismatch');
    expect(contradiction.claim).toBe(2);
    expect(contradiction.actual).toBe(1);
  });

  it('rejects a question that asserts a row count the facts cannot verify', () => {
    const unverifiableFacts = { ...facts, seating_rows: null };
    const contradiction = questionContradictsFacts(
      { question: 'Why was the two-row layout chosen?' },
      unverifiableFacts,
    );
    expect(contradiction).not.toBeNull();
    expect(contradiction.reason).toBe('unsupported_seating_row_claim');
  });

  it('passes a question that states the correct row count', () => {
    const contradiction = questionContradictsFacts(
      { question: 'Why was the single row positioned here?' },
      facts,
    );
    expect(contradiction).toBeNull();
  });

  it('passes a question that asks only for a reason with no factual claim', () => {
    const contradiction = questionContradictsFacts(
      { question: 'Is there a particular reason for the subwoofer arrangement?' },
      facts,
    );
    expect(contradiction).toBeNull();
  });

  it('rejects a question with the wrong seat count', () => {
    const contradiction = questionContradictsFacts(
      { question: 'Why were three seats chosen for this room?' },
      facts,
    );
    expect(contradiction).not.toBeNull();
    expect(contradiction.reason).toBe('seat_count_mismatch');
    expect(contradiction.claim).toBe(3);
    expect(contradiction.actual).toBe(5);
  });

  it('rejects a question with the wrong subwoofer count', () => {
    const contradiction = questionContradictsFacts(
      { question: 'What was the reason for the four-subwoofer arrangement?' },
      facts,
    );
    expect(contradiction).not.toBeNull();
    expect(contradiction.reason).toBe('subwoofer_count_mismatch');
    expect(contradiction.claim).toBe(4);
    expect(contradiction.actual).toBe(2);
  });

  it('rejects a question with the wrong room dimensions', () => {
    const contradiction = questionContradictsFacts(
      { question: 'Why was the 4.0m x 5.0m room laid out this way?' },
      facts,
    );
    expect(contradiction).not.toBeNull();
    expect(contradiction.reason).toBe('room_dimension_mismatch');
  });

  it('passes a question with the correct room dimensions', () => {
    const contradiction = questionContradictsFacts(
      { question: 'Why was the 5.6m x 6.69m room laid out this way?' },
      facts,
    );
    expect(contradiction).toBeNull();
  });

  it('drops an AI question that contradicts the facts during discovery', async () => {
    const invokeLLM = async () => ({
      questions: [
        {
          question_id: 'seating_two_row_reason',
          question: 'What was the main reason for the five seats across two rows in this room?',
          area: 'seating',
        },
        {
          question_id: 'seating_single_row_reason',
          question: 'Is there a particular reason for the single row of seating?',
          area: 'seating',
        },
      ],
    });
    const questions = await discoverAiQuestions({
      version: avensysVersion(),
      project: avensysProject(),
      deterministicQuestions: [],
      invokeLLM,
    });
    const ids = questions.map((q) => q.question_id);
    expect(ids).not.toContain('seating_two_row_reason');
    expect(ids).toContain('seating_single_row_reason');
  });

  it('does not reject a legitimate question about the reason for a design choice', async () => {
    const invokeLLM = async () => ({
      questions: [
        {
          question_id: 'subwoofer_arrangement_reason',
          question: 'What was the main reason for the two-subwoofer arrangement in this room?',
          area: 'subwoofers',
        },
      ],
    });
    const questions = await discoverAiQuestions({
      version: avensysVersion(),
      project: avensysProject(),
      deterministicQuestions: [],
      invokeLLM,
    });
    // The subwoofer count matches the verified facts, so the question passes.
    expect(questions.map((q) => q.question_id)).toContain('subwoofer_arrangement_reason');
  });
});

/* ── 4. Existing answers remain preserved ────────────────────────────────── */

describe('Existing answers remain preserved', () => {
  it('merge preserves existing saved answers when nothing new is saved', () => {
    const existing = [
      {
        question_id: 'seating_forward_of_rear_wall',
        status: 'answered',
        answer: 'Space for a bar and circulation behind the seating.',
        decision_fingerprint: 'fp1',
      },
      {
        question_id: 'subwoofer_count_rationale',
        status: 'answered',
        answer: 'Two front subs for headroom and modal smoothing.',
        decision_fingerprint: 'fp2',
      },
    ];
    const merged = mergeContextItems(existing, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.question_id).sort()).toEqual([
      'seating_forward_of_rear_wall',
      'subwoofer_count_rationale',
    ]);
  });

  it('hybrid discovery still returns deterministic questions for the affected design', async () => {
    const questions = await discoverDesignContextQuestions({
      version: avensysVersion(),
      project: avensysProject(),
      invokeLLM: async () => ({ questions: [] }),
    });
    // The seating question still fires for the verified geometry.
    expect(questions.map((q) => q.question_id)).toContain('seating_forward_of_rear_wall');
  });
});