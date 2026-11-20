/**
 * Design Context feature — focused regression tests.
 *
 * These tests cover the pure data model and the hybrid discovery that the
 * Design Context review dialog, the Technical Report Design Intent generation
 * and the Client Proposal generation all rely on.
 *
 * What is proved here:
 *
 *   - Skipped questions are never persisted; only answered and no-reason
 *     items survive normalisation, so skipping all questions creates no
 *     DesignContext record content.
 *   - Merge preserves items that were not re-asked, and replaces items that
 *     were re-asked with the same question_id.
 *   - recordedIntentFromContext carries only answered items (a no-reason
 *     confirmation is never turned into a motivation), so the writer is
 *     never handed an invented reason.
 *   - Confirmed question ids (answered + no-reason) suppress re-asking,
 *     but a changed decision fingerprint marks a saved item as stale.
 *   - The deterministic discovery falls back to the parent Project's room
 *     dimensions where the version's own design state carries none, so a
 *     question that is genuinely justified by the saved design (Dixon:
 *     3.36 m behind the seating row) is actually asked.
 *   - Discovery never crashes when the project is absent or the design
 *     state is sparse.
 *
 * Pure: no React, no SDK, no provider calls. The AI discovery is injected
 * as a stub so no LLM is reached.
 */
import { describe, it, expect } from 'vitest';

import {
  CONTEXT_STATUS,
  normaliseContextItems,
  mergeContextItems,
  partitionByCurrency,
  recordedIntentFromContext,
  confirmedQuestionIds,
  contextItemIsCurrent,
} from '../base44/shared/designContext/designContextModel.js';
import {
  discoverDeterministicQuestions,
  discoverDesignContextQuestions,
  MAX_DISCOVERY_QUESTIONS,
} from '../base44/shared/designContext/designContextDiscovery.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const USER = { full_name: 'Test Designer', email: 'test@example.com' };
const NOW = '2026-11-20T12:00:00.000Z';

/** A version whose design_state carries the room dims and seating. */
function versionWith(state) {
  return { id: 'v1', project_id: 'proj', version_number: 1, design_state: state };
}

/** A Dixon-style version: no room dims in design_state, seats at y=3.33. */
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

/** The Dixon project: room dims on the Project entity, not in design_state. */
function dixonProject() {
  return {
    id: 'proj',
    roomDims: '{"widthM":5.6,"lengthM":6.69,"heightM":2.7}',
    room_width: 5.6,
    room_length: 6.69,
    room_height: 2.7,
  };
}

/* ── 1. Skipped questions are never persisted ─────────────────────────────── */

describe('Skip handling', () => {
  it('drops skipped items and keeps only answered and no-reason items', () => {
    const raw = [
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'answered', answer: 'For the bar.' },
      { question_id: 'q2', question: 'Why B?', area: 'subwoofers', status: 'skipped' },
      { question_id: 'q3', question: 'Why C?', area: 'treatment', status: 'no_reason' },
      { question_id: 'q4', question: 'Why D?', area: 'layout', status: 'answered', answer: '' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });

    expect(items.map((i) => i.question_id)).toEqual(['q1', 'q3']);
    expect(items.find((i) => i.question_id === 'q1').status).toBe(CONTEXT_STATUS.ANSWERED);
    expect(items.find((i) => i.question_id === 'q1').answer).toBe('For the bar.');
    expect(items.find((i) => i.question_id === 'q3').status).toBe(CONTEXT_STATUS.NO_REASON);
    expect(items.find((i) => i.question_id === 'q3').answer).toBeNull();
  });

  it('produces no items when every question is skipped', () => {
    const raw = [
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'skipped' },
      { question_id: 'q2', question: 'Why B?', area: 'subwoofers', status: 'skipped' },
    ];
    expect(normaliseContextItems(raw, { user: USER, now: NOW })).toEqual([]);
  });

  it('deduplicates by question_id (last wins)', () => {
    const raw = [
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'answered', answer: 'first' },
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'answered', answer: 'second' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });
    expect(items).toHaveLength(1);
    expect(items[0].answer).toBe('second');
  });
});

/* ── 2. Merge preserves items not re-asked ────────────────────────────────── */

describe('Merge', () => {
  it('replaces items that were re-asked and preserves the rest', () => {
    const existing = [
      { question_id: 'q1', status: 'answered', answer: 'old', decision_fingerprint: 'fp1' },
      { question_id: 'q2', status: 'no_reason', answer: null, decision_fingerprint: 'fp2' },
    ];
    const incoming = [
      { question_id: 'q1', status: 'answered', answer: 'new', decision_fingerprint: 'fp1' },
    ];
    const merged = mergeContextItems(existing, incoming);

    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.question_id === 'q1').answer).toBe('new');
    expect(merged.find((m) => m.question_id === 'q2').status).toBe('no_reason');
  });

  it('returns existing items unchanged when incoming is empty', () => {
    const existing = [{ question_id: 'q1', status: 'answered', answer: 'a' }];
    expect(mergeContextItems(existing, [])).toEqual(existing);
  });
});

/* ── 3. Recorded intent carries only answered items ───────────────────────── */

describe('Recorded intent', () => {
  it('includes answered items and excludes no-reason and skipped', () => {
    const items = [
      { question_id: 'q1', status: 'answered', answer: 'For the bar.', area: 'seating' },
      { question_id: 'q2', status: 'no_reason', answer: null, area: 'subwoofers' },
      { question_id: 'q3', status: 'skipped', answer: null, area: 'treatment' },
    ];
    const intent = recordedIntentFromContext(items);
    expect(intent).toEqual(['seating: For the bar.']);
  });

  it('returns empty when nothing was answered', () => {
    const items = [
      { question_id: 'q1', status: 'no_reason', answer: null },
      { question_id: 'q2', status: 'skipped', answer: null },
    ];
    expect(recordedIntentFromContext(items)).toEqual([]);
  });

  it('omits the area prefix when no area is recorded', () => {
    const items = [{ question_id: 'q1', status: 'answered', answer: 'Reason.', area: null }];
    expect(recordedIntentFromContext(items)).toEqual(['Reason.']);
  });
});

/* ── 4. Confirmed questions suppress re-asking; stale items don't ──────────── */

describe('Suppression and currency', () => {
  it('confirmed ids include answered and no-reason but not skipped', () => {
    const items = [
      { question_id: 'q1', status: 'answered' },
      { question_id: 'q2', status: 'no_reason' },
      { question_id: 'q3', status: 'skipped' },
    ];
    expect([...confirmedQuestionIds(items)].sort()).toEqual(['q1', 'q2']);
  });

  it('a matching fingerprint keeps an item current; a mismatch marks it stale', () => {
    const item = { question_id: 'q1', decision_fingerprint: 'fp1' };
    expect(contextItemIsCurrent(item, 'fp1')).toBe(true);
    expect(contextItemIsCurrent(item, 'fp2')).toBe(false);
  });

  it('a missing fingerprint on either side is treated as current', () => {
    expect(contextItemIsCurrent({ question_id: 'q1', decision_fingerprint: null }, 'fp1')).toBe(true);
    expect(contextItemIsCurrent({ question_id: 'q1', decision_fingerprint: 'fp1' }, null)).toBe(true);
  });

  it('partitionByCurrency separates current from stale', () => {
    const items = [
      { question_id: 'q1', decision_fingerprint: 'fp1' },
      { question_id: 'q2', decision_fingerprint: 'fp2' },
    ];
    const fps = new Map([['q1', 'fp1'], ['q2', 'changed']]);
    const { current, stale } = partitionByCurrency(items, fps);
    expect(current.map((i) => i.question_id)).toEqual(['q1']);
    expect(stale.map((i) => i.question_id)).toEqual(['q2']);
  });
});

/* ── 5. Discovery falls back to project room dims (Dixon) ──────────────────── */

describe('Discovery room-dimension fallback', () => {
  it('asks the seating question for a Dixon-style version using project room dims', () => {
    // The version's design_state carries NO room dims. The seats sit at
    // y=3.33 in a 6.69 m room, leaving 3.36 m behind the row — generous
    // clearance. The question is justified by the saved design.
    const questions = discoverDeterministicQuestions(dixonVersion(), dixonProject());
    const ids = questions.map((q) => q.question_id);

    expect(ids).toContain('seating_forward_of_rear_wall');
    const seating = questions.find((q) => q.question_id === 'seating_forward_of_rear_wall');
    expect(seating.area).toBe('seating');
    expect(seating.decision_fingerprint).toMatch(/^dc1-/);
  });

  it('does not ask the seating question when no project fallback is supplied', () => {
    // Without the project fallback, the room dims are unknown, so the check
    // cannot run. This proves the fallback is what makes the question fire.
    const questions = discoverDeterministicQuestions(dixonVersion(), null);
    expect(questions.map((q) => q.question_id)).not.toContain('seating_forward_of_rear_wall');
  });

  it('prefers the version design_state room dims over the project when both exist', () => {
    const version = versionWith({
      roomDims: '{"widthM":4.0,"lengthM":5.0,"heightM":2.4}',
      seating_positions: [{ id: 's1', x: 2.0, y: 2.0, row: 1 }],
    });
    const project = { id: 'p', room_length: 99 };
    const questions = discoverDeterministicQuestions(version, project);
    // 5.0 m room, seat at y=2.0 → 3.0 m behind — generous → question fires.
    expect(questions.map((q) => q.question_id)).toContain('seating_forward_of_rear_wall');
  });

  it('respects the MAX_DISCOVERY_QUESTIONS cap', () => {
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
    const questions = discoverDeterministicQuestions(version, null);
    expect(questions.length).toBeLessThanOrEqual(MAX_DISCOVERY_QUESTIONS);
  });

  it('never crashes on an empty design state', () => {
    expect(discoverDeterministicQuestions({ id: 'v1', design_state: {} }, null)).toEqual([]);
    expect(discoverDeterministicQuestions({ id: 'v1', design_state: null }, null)).toEqual([]);
  });
});

/* ── 6. Hybrid discovery with AI fallback ─────────────────────────────────── */

describe('Hybrid discovery', () => {
  it('returns deterministic questions without calling the LLM when three are found', async () => {
    let llmCalled = false;
    const invokeLLM = async () => { llmCalled = true; return { questions: [] }; };
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      seating_positions: [{ id: 's1', x: 2.0, y: 3.0, row: 1 }],
      acoustic_treatment_enabled: true,
      selected_abfuser_qty: 6,
      screen_mount_mode: 'floating',
      float_depth_m: 0.3,
    });
    const questions = await discoverDesignContextQuestions({ version, project: null, invokeLLM });
    expect(llmCalled).toBe(false);
    expect(questions.length).toBeLessThanOrEqual(MAX_DISCOVERY_QUESTIONS);
  });

  it('fills remaining slots from guarded AI discovery', async () => {
    const version = versionWith({
      subwooferInstances: [{ id: 'sub1', enabled: true, position: { x: 1, y: 0.5 } }],
      roomDims: '{"widthM":4,"lengthM":5,"heightM":2.4}',
    });
    const invokeLLM = async () => ({
      questions: [{
        question_id: 'ai_question',
        question: 'An AI-suggested question.',
        area: 'layout',
      }],
    });
    const questions = await discoverDesignContextQuestions({ version, project: null, invokeLLM });
    expect(questions.map((q) => q.question_id)).toContain('ai_question');
  });

  it('proceeds with deterministic questions only when AI discovery fails', async () => {
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      seating_positions: [{ id: 's1', x: 2.0, y: 3.0, row: 1 }],
    });
    const invokeLLM = async () => { throw new Error('provider down'); };
    const questions = await discoverDesignContextQuestions({ version, project: null, invokeLLM });
    expect(questions.map((q) => q.question_id)).toContain('seating_forward_of_rear_wall');
  });

  it('returns no questions for a version with no id', async () => {
    const questions = await discoverDesignContextQuestions({ version: {}, project: null, invokeLLM: null });
    expect(questions).toEqual([]);
  });
});