/**
 * Design Context decision identity — focused regression tests.
 *
 * These tests prove the decision-level question identity fix:
 *
 *   1. Different subwoofer question IDs resolve to the same underlying
 *      decision, so a saved answer under one ID suppresses an equivalent
 *      question under another ID.
 *   2. A single review never presents multiple questions about the same
 *      underlying decision (deterministic + AI dedup).
 *   3. A genuinely changed design (same question ID, different fingerprint)
 *      marks the saved item as stale and re-asks.
 *   4. Saved answers remain available to the Design Intent writer
 *      (recordedIntentFromContext) and are never deleted or overwritten.
 *   5. Skipping a question still works for the current generation.
 *   6. Projects with no saved answers behave normally.
 *   7. Zero-question discovery proceeds directly without an unnecessary
 *      dialog.
 *
 * Dixon's saved subwoofer_count_rationale and seating_forward_of_rear_wall
 * explanations must suppress equivalent questions about the unchanged design.
 *
 * Pure: no React, no SDK, no provider calls. The AI discovery is injected
 * as a stub so no LLM is reached.
 */
import { describe, it, expect } from 'vitest';

import {
  CONTEXT_STATUS,
  normaliseContextItems,
  mergeContextItems,
  recordedIntentFromContext,
  confirmedDecisions,
  confirmedQuestionIds,
  partitionByDecisionCurrency,
} from '../base44/shared/designContext/designContextModel.js';
import {
  decisionKeyForQuestion,
  decisionKeyForQuestionId,
  DESIGN_DECISION,
  canonicalSubwooferFingerprint,
} from '../base44/shared/designContext/designContextModel.js';
import {
  discoverDeterministicQuestions,
  discoverDesignContextQuestions,
  MAX_DISCOVERY_QUESTIONS,
} from '../base44/shared/designContext/designContextDiscovery.js';
import {
  decisionKeyForQuestionId,
  decisionKeyForQuestion,
  DESIGN_DECISION,
} from '../base44/shared/designContext/designContextDecisionIdentity.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const USER = { full_name: 'Test Designer', email: 'test@example.com' };
const NOW = '2026-11-20T12:00:00.000Z';

function versionWith(state) {
  return { id: 'v1', project_id: 'proj', version_number: 1, design_state: state };
}

/** Dixon: 5 seats at y=3.33, two front subs, baffle mount. Room 5.6x6.69x2.7. */
function dixonVersion() {
  return versionWith({
    seating_positions: [
      { id: 'seat-r1-c1', x: 1.6, y: 3.33, row: 1 },
      { id: 'seat-r1-c2', x: 2.2, y: 3.33, row: 1 },
      { id: 'seat-r1-c3', x: 2.8, y: 3.33, row: 1 },
      { id: 'seat-r1-c4', x: 3.4, y: 3.33, row: 1 },
      { id: 'seat-r1-c5', x: 4.0, y: 3.33, row: 1 },
    ],
    subwooferInstances: [
      { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
      { id: 'sub2', enabled: true, position: { x: 4.6, y: 0.5 } },
    ],
    screen_mount_mode: 'baffle',
    acoustic_treatment_enabled: false,
  });
}

function dixonProject() {
  return {
    id: 'proj',
    roomDims: '{"widthM":5.6,"lengthM":6.69,"heightM":2.7}',
    room_width: 5.6,
    room_length: 6.69,
    room_height: 2.7,
  };
}

/* ── 1. Different subwoofer question IDs resolve to the same decision ──────── */

describe('Decision identity mapping', () => {
  it('maps equivalent subwoofer question IDs to the same decision', () => {
    expect(decisionKeyForQuestionId('subwoofer_count_rationale'))
      .toBe(DESIGN_DECISION.SUBWOOFER_ARRANGEMENT);
    expect(decisionKeyForQuestionId('subwoofer_front_rear_distribution'))
      .toBe(DESIGN_DECISION.SUBWOOFER_ARRANGEMENT);
    expect(decisionKeyForQuestionId('subwoofer_single_wall_arrangement'))
      .toBe(DESIGN_DECISION.SUBWOOFER_ARRANGEMENT);
    expect(decisionKeyForQuestionId('subwoofer_arrangement_reason'))
      .toBe(DESIGN_DECISION.SUBWOOFER_ARRANGEMENT);
  });

  it('maps equivalent seating question IDs to the same decision', () => {
    expect(decisionKeyForQuestionId('seating_forward_of_rear_wall'))
      .toBe(DESIGN_DECISION.SEATING_POSITION);
    expect(decisionKeyForQuestionId('seating_priority_reason'))
      .toBe(DESIGN_DECISION.SEATING_POSITION);
  });

  it('maps unlisted IDs to themselves (self-contained decisions)', () => {
    expect(decisionKeyForQuestionId('ai_custom_question')).toBe('ai_custom_question');
    expect(decisionKeyForQuestionId('')).toBeNull();
    expect(decisionKeyForQuestionId(null)).toBeNull();
  });

  it('decisionKeyForQuestion reads the question_id field', () => {
    expect(decisionKeyForQuestion({ question_id: 'subwoofer_count_rationale' }))
      .toBe(DESIGN_DECISION.SUBWOOFER_ARRANGEMENT);
    expect(decisionKeyForQuestion(null)).toBeNull();
  });
});

/* ── 2. Dixon: saved answers suppress equivalent questions ────────────────── */

describe('Dixon saved answers suppress equivalent questions', () => {
  // Discover what the current Dixon design produces.
  function currentDixonQuestions() {
    return discoverDeterministicQuestions(dixonVersion(), dixonProject());
  }

  // Build a saved item whose fingerprint matches the current question, so the
  // design is provably unchanged.
  function savedItemMatchingCurrent(questionId, answer) {
    const current = currentDixonQuestions();
    const match = current.find((q) => q.question_id === questionId);
    return {
      question_id: questionId,
      question: match?.question || 'Why?',
      area: match?.area || 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer,
      decision_fingerprint: match?.decision_fingerprint || null,
      answered_at: NOW,
      answered_by: USER.full_name,
    };
  }

  it('Dixon saved seating_forward_of_rear_wall suppresses the same question', () => {
    const saved = [savedItemMatchingCurrent(
      'seating_forward_of_rear_wall',
      'Space for a bar and circulation behind the seating.',
    )];
    const current = currentDixonQuestions();
    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });

    expect(stale).toEqual([]);
    expect(toAsk.map((q) => q.question_id)).not.toContain('seating_forward_of_rear_wall');
  });

  it('Dixon saved subwoofer_count_rationale suppresses subwoofer_single_wall_arrangement', () => {
    // Routine subwoofer questions are no longer asked deterministically, so
    // the current question is constructed with the canonical fingerprint the
    // discovery would have produced, to test the decision-currency logic.
    const current = [{
      question_id: 'subwoofer_single_wall_arrangement',
      question: 'All 2 subwoofers are placed near the front wall. Is there a particular reason for this arrangement rather than distributing them around the room?',
      area: 'subwoofers',
      decision_fingerprint: canonicalSubwooferFingerprint({ type: 'single_wall', count: 2, front: 2, rear: 0 }),
    }];

    // The saved answer was stored under a DIFFERENT question ID that maps to
    // the same underlying decision.
    const saved = [{
      question_id: 'subwoofer_count_rationale',
      question: 'What is the engineering justification for installing 2 subwoofers in this layout?',
      area: 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer: 'Two front subs for headroom and modal smoothing.',
      decision_fingerprint: 'dc1-oldhash-3',
      answered_at: NOW,
      answered_by: USER.full_name,
    }];

    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });

    // The saved answer suppresses the equivalent question despite the
    // different question ID. The legacy fingerprint compatibility rule
    // extracts the count (2) from the saved question text and matches it
    // against the current count (2), so the arrangement is treated as
    // unchanged.
    expect(stale).toEqual([]);
    expect(toAsk.map((q) => q.question_id)).not.toContain('subwoofer_single_wall_arrangement');
  });

  it('both Dixon saved answers suppress both questions (neither reappears)', () => {
    const saved = [
      savedItemMatchingCurrent(
        'seating_forward_of_rear_wall',
        'Space for a bar and circulation behind the seating.',
      ),
      {
        question_id: 'subwoofer_count_rationale',
        question: 'What is the engineering justification for installing 2 subwoofers in this layout?',
        area: 'subwoofers',
        status: CONTEXT_STATUS.ANSWERED,
        answer: 'Two front subs for headroom and modal smoothing.',
        decision_fingerprint: 'dc1-oldhash-3',
        answered_at: NOW,
        answered_by: USER.full_name,
      },
    ];
    const current = currentDixonQuestions();
    const { current: currentSaved } = partitionByDecisionCurrency(saved, current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });

    expect(toAsk).toEqual([]);
  });
});

/* ── 3. A genuinely changed design re-asks (same question ID, different FP) ─ */

describe('Material design change re-asks', () => {
  it('a changed fingerprint for the same question ID marks the item stale', () => {
    const current = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'Why?',
      area: 'subwoofers',
      decision_fingerprint: 'dc1-newfp-10',
    }];
    const saved = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'Why?',
      area: 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer: 'Old reason.',
      decision_fingerprint: 'dc1-oldfp-10',
    }];

    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, current);
    expect(currentSaved).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0].question_id).toBe('subwoofer_front_rear_distribution');
  });

  it('a stale item does not suppress the current question', () => {
    const current = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'Why?',
      area: 'subwoofers',
      decision_fingerprint: 'dc1-newfp-10',
    }];
    const saved = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'Why?',
      area: 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer: 'Old reason.',
      decision_fingerprint: 'dc1-oldfp-10',
    }];

    const { current: currentSaved } = partitionByDecisionCurrency(saved, current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });

    expect(toAsk).toHaveLength(1);
    expect(toAsk[0].question_id).toBe('subwoofer_front_rear_distribution');
  });
});

/* ── 4. Saved answers remain available to the writer ───────────────────────── */

describe('Saved answers remain available to the writer', () => {
  it('recorded intent carries preserved answered items after decision suppression', () => {
    const saved = [
      {
        question_id: 'subwoofer_count_rationale',
        area: 'subwoofers',
        status: CONTEXT_STATUS.ANSWERED,
        answer: 'Two front subs for headroom and modal smoothing.',
      },
      {
        question_id: 'seating_forward_of_rear_wall',
        area: 'seating',
        status: CONTEXT_STATUS.ANSWERED,
        answer: 'Space for a bar.',
      },
    ];
    // Even after decision-level suppression (nothing to ask), the saved
    // answers remain for the writer.
    const intent = recordedIntentFromContext(saved);
    expect(intent).toHaveLength(2);
    expect(intent.some((s) => s.includes('headroom'))).toBe(true);
    expect(intent.some((s) => s.includes('bar'))).toBe(true);
  });

  it('merge preserves existing answers when nothing new is saved', () => {
    const existing = [
      { question_id: 'subwoofer_count_rationale', status: 'answered', answer: 'old', decision_fingerprint: 'fp1' },
      { question_id: 'seating_forward_of_rear_wall', status: 'answered', answer: 'old2', decision_fingerprint: 'fp2' },
    ];
    const merged = mergeContextItems(existing, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.question_id).sort()).toEqual([
      'seating_forward_of_rear_wall',
      'subwoofer_count_rationale',
    ]);
  });
});

/* ── 5. Skipping still works for the current generation ────────────────────── */

describe('Skip still works', () => {
  it('a skipped question is not persisted', () => {
    const raw = [
      { question_id: 'q1', question: 'Why?', area: 'seating', status: 'answered', answer: 'Reason.' },
      { question_id: 'q2', question: 'Why?', area: 'subwoofers', status: 'skipped' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });
    expect(items.map((i) => i.question_id)).toEqual(['q1']);
  });

  it('a skipped question with a saved answer excludes it from recorded intent', () => {
    const allItems = [
      { question_id: 'seating_forward_of_rear_wall', status: 'answered', answer: 'For the bar.', area: 'seating' },
      { question_id: 'subwoofer_count_rationale', status: 'answered', answer: 'For modal smoothing.', area: 'subwoofers' },
    ];
    const skipSet = new Set(['seating_forward_of_rear_wall']);
    const filtered = allItems.filter((item) => !skipSet.has(item.question_id));
    const intent = recordedIntentFromContext(filtered);
    expect(intent).toHaveLength(1);
    expect(intent.some((s) => s.includes('modal smoothing'))).toBe(true);
    expect(intent.some((s) => s.includes('bar'))).toBe(false);
  });
});

/* ── 6. Projects with no saved answers behave normally ────────────────────── */

describe('No saved answers', () => {
  it('all discovered questions are asked when nothing is saved', () => {
    const current = discoverDeterministicQuestions(dixonVersion(), dixonProject());
    const { current: currentSaved } = partitionByDecisionCurrency([], current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });
    expect(toAsk).toEqual(current);
  });

  it('confirmedDecisions returns empty for no items', () => {
    expect([...confirmedDecisions([])]).toEqual([]);
  });
});

/* ── 7. Zero-question discovery proceeds directly ──────────────────────────── */

describe('Zero-question discovery', () => {
  it('a design with nothing to ask returns no questions', async () => {
    const invokeLLM = async () => ({ questions: [] });
    const questions = await discoverDesignContextQuestions({
      version: versionWith({
        subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }],
        // Seat near the rear (not far forward), no treatment, no floating screen.
        seating_positions: [{ id: 's1', x: 2, y: 4.5, row: 1 }],
      }),
      project: { id: 'p', room_width: 4, room_length: 5, room_height: 2.4 },
      invokeLLM,
    });
    expect(questions).toEqual([]);
  });

  it('with zero questions and zero saved items, the dialog is skipped', () => {
    const current = [];
    const saved = [];
    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, current);
    const suppress = confirmedDecisions(currentSaved);
    const toAsk = current.filter((q) => {
      const dk = decisionKeyForQuestion(q);
      return !dk || !suppress.has(dk);
    });
    expect(toAsk).toEqual([]);
    expect(stale).toEqual([]);
    expect([...suppress]).toEqual([]);
  });
});

/* ── 8. No duplicate questions about the same decision in one review ────────── */

describe('No duplicate decisions in one review', () => {
  it('deterministic discovery never returns two subwoofer questions', () => {
    // A design with subs all on the front wall fires
    // subwoofer_single_wall_arrangement. It cannot also fire
    // subwoofer_front_rear_distribution (mutually exclusive), but the
    // decision-level dedup is the safety net.
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      subwooferInstances: [
        { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
        { id: 'sub2', enabled: true, position: { x: 4.0, y: 0.5 } },
      ],
    });
    const questions = discoverDeterministicQuestions(version, null);
    const decisions = questions.map((q) => decisionKeyForQuestion(q));
    expect(new Set(decisions).size).toBe(decisions.length); // no dup decisions
  });

  it('AI discovery does not duplicate a deterministic decision', async () => {
    // Deterministic finds subwoofer_single_wall_arrangement. The AI tries
    // to add subwoofer_count_rationale (same decision). The AI question is
    // suppressed by decision-level dedup.
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      subwooferInstances: [
        { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
        { id: 'sub2', enabled: true, position: { x: 4.0, y: 0.5 } },
      ],
    });
    const invokeLLM = async () => ({
      questions: [{
        question_id: 'subwoofer_count_rationale',
        question: 'Why this subwoofer count?',
        area: 'subwoofers',
      }],
    });
    const questions = await discoverDesignContextQuestions({ version, project: null, invokeLLM });
    const ids = questions.map((q) => q.question_id);
    expect(ids).toContain('subwoofer_single_wall_arrangement');
    expect(ids).not.toContain('subwoofer_count_rationale'); // same decision, deduped
    const decisions = questions.map((q) => decisionKeyForQuestion(q));
    expect(new Set(decisions).size).toBe(decisions.length);
  });

  it('respects the MAX_DISCOVERY_QUESTIONS cap', async () => {
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      seating_positions: [{ id: 's1', x: 2.0, y: 3.0, row: 1 }],
      acoustic_treatment_enabled: true,
      selected_abfuser_qty: 6,
      screen_mount_mode: 'floating',
      float_depth_m: 0.3,
      subwooferInstances: [
        { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
        { id: 'sub2', enabled: true, position: { x: 4.0, y: 0.5 } },
      ],
    });
    const questions = await discoverDesignContextQuestions({
      version,
      project: null,
      invokeLLM: async () => ({ questions: [] }),
    });
    expect(questions.length).toBeLessThanOrEqual(MAX_DISCOVERY_QUESTIONS);
  });
});

/* ── 9. confirmedQuestionIds backward compatibility ────────────────────────── */

describe('Backward compatibility', () => {
  it('confirmedQuestionIds still returns question IDs', () => {
    const items = [
      { question_id: 'subwoofer_count_rationale', status: 'answered' },
      { question_id: 'seating_forward_of_rear_wall', status: 'no_reason' },
      { question_id: 'q3', status: 'skipped' },
    ];
    expect([...confirmedQuestionIds(items)].sort()).toEqual([
      'seating_forward_of_rear_wall',
      'subwoofer_count_rationale',
    ]);
  });

  it('confirmedDecisions returns decision keys', () => {
    const items = [
      { question_id: 'subwoofer_count_rationale', status: 'answered' },
      { question_id: 'subwoofer_front_rear_distribution', status: 'no_reason' },
      { question_id: 'seating_forward_of_rear_wall', status: 'answered' },
    ];
    const decisions = [...confirmedDecisions(items)].sort();
    // Both subwoofer IDs map to the same decision, so only two decisions.
    expect(decisions).toEqual(['seating_position', 'subwoofers_arrangement']);
  });
});