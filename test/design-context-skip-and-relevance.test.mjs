/**
 * Design Context — skip behaviour, relevance and recognition regression tests.
 *
 * These focused tests cover the four defects fixed in this change set:
 *
 *   1. The AI fallback receives the parent Project's room dimensions (Dixon's
 *      5.60 x 6.69 x 2.70 m) and never claims they are missing.
 *   2. The AI fallback's question facts no longer include ordinary screen
 *      baffle mounting, and the prompt rules prevent questions that merely
 *      restate a configuration option.
 *   3. A deterministic check recognises meaningful front/rear subwoofer
 *      distribution (not only all-on-one-wall), and existing saved answers
 *      for seating and subwoofer decisions are preserved.
 *   4. Skip exclusions are carried as transient IDs: a skipped question's
 *      previously saved answer is excluded from recorded intent for this
 *      generation without being deleted from storage.
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
  confirmedQuestionIds,
} from '../base44/shared/designContext/designContextModel.js';
import {
  discoverDeterministicQuestions,
  discoverDesignContextQuestions,
  discoverAiQuestions,
  MAX_DISCOVERY_QUESTIONS,
} from '../base44/shared/designContext/designContextDiscovery.js';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const USER = { full_name: 'Test Designer', email: 'test@example.com' };
const NOW = '2026-11-20T12:00:00.000Z';

function versionWith(state) {
  return { id: 'v1', project_id: 'proj', version_number: 1, design_state: state };
}

/** Dixon: no room dims in design_state, seats at y=3.33, two front subs, baffle mount. */
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

/** Dixon's existing saved design context answers. */
function dixonSavedItems() {
  return [
    {
      question_id: 'seating_forward_of_rear_wall',
      question: 'The seating is positioned well forward of the rear wall. Is there a particular reason for leaving this space behind the audience?',
      area: 'seating',
      status: 'answered',
      answer: 'Space for a bar and circulation behind the seating.',
      decision_fingerprint: 'dc1-abc123-4',
      answered_at: '2026-11-19T10:00:00.000Z',
      answered_by: 'Dixon Designer',
    },
    {
      question_id: 'subwoofer_count_rationale',
      question: 'What is the engineering justification for installing 2 subwoofers in this layout?',
      area: 'subwoofers',
      status: 'answered',
      answer: 'Two front subs for headroom and modal smoothing.',
      decision_fingerprint: 'dc1-def456-3',
      answered_at: '2026-11-19T10:00:00.000Z',
      answered_by: 'Dixon Designer',
    },
  ];
}

/* ── 1. Dixon's dimensions are recognised by the AI fallback ─────────────── */

describe('AI fallback room-dimension recognition', () => {
  it('passes the parent project dimensions to the AI facts (Dixon)', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => {
      capturedPrompt = request.prompt;
      return { questions: [] };
    };
    // The version has NO room dims in design_state. Without the project
    // fallback, the AI would see "dimensions not recorded". With the project,
    // it sees the real dimensions.
    await discoverAiQuestions({
      version: dixonVersion(),
      project: dixonProject(),
      deterministicQuestions: [],
      invokeLLM,
    });
    expect(capturedPrompt).not.toBeNull();
    expect(capturedPrompt).toContain('5.6m x 6.69m x 2.7m');
    expect(capturedPrompt).not.toContain('dimensions not recorded');
  });

  it('falls back to project room_width/room_length when roomDims is absent', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => { capturedPrompt = request.prompt; return { questions: [] }; };
    const project = { id: 'p', room_width: 4.5, room_length: 6.0, room_height: 2.4 };
    await discoverAiQuestions({
      version: versionWith({ subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }] }),
      project,
      deterministicQuestions: [],
      invokeLLM,
    });
    expect(capturedPrompt).toContain('4.5m x 6m x 2.4m');
  });
});

/* ── 2. Routine baffle mounting is not an AI question fact ────────────────── */

describe('AI fallback question relevance', () => {
  it('does not include screen_mount in the AI facts', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => { capturedPrompt = request.prompt; return { questions: [] }; };
    await discoverAiQuestions({
      version: versionWith({
        screen_mount_mode: 'baffle',
        subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }],
      }),
      project: { id: 'p', room_width: 5, room_length: 6, room_height: 2.4 },
      deterministicQuestions: [],
      invokeLLM,
    });
    // The facts section (between "Project facts:" and "Rules:") must not
    // list screen_mount. The rules section intentionally mentions "standard
    // baffle mounting" as an example of an ordinary choice to AVOID.
    const factsSection = capturedPrompt.split('Rules:')[0];
    expect(factsSection).not.toContain('screen_mount');
    expect(factsSection).not.toContain('baffle');
  });

  it('does not include screen_mount even when it is floating', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => { capturedPrompt = request.prompt; return { questions: [] }; };
    await discoverAiQuestions({
      version: versionWith({
        screen_mount_mode: 'floating',
        float_depth_m: 0.3,
        subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }],
      }),
      project: { id: 'p', room_width: 5, room_length: 6, room_height: 2.4 },
      deterministicQuestions: [],
      invokeLLM,
    });
    // The AI facts never carry screen_mount: the deterministic floating-screen
    // check handles that decision.
    const factsSection = capturedPrompt.split('Rules:')[0];
    expect(factsSection).not.toContain('screen_mount');
  });

  it('prompt rules state zero questions is acceptable', async () => {
    let capturedPrompt = null;
    const invokeLLM = async (request) => { capturedPrompt = request.prompt; return { questions: [] }; };
    await discoverAiQuestions({
      version: versionWith({ subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }] }),
      project: { id: 'p', room_width: 5, room_length: 6, room_height: 2.4 },
      deterministicQuestions: [],
      invokeLLM,
    });
    expect(capturedPrompt).toContain('Zero questions is acceptable');
    expect(capturedPrompt).toContain('not a target');
  });

  it('AI discovery returns zero questions when nothing meaningful needs clarification', async () => {
    // A simple design with no anomalies: one sub, small room, one row placed
    // near the rear (not far forward), no treatment. Neither the deterministic
    // checks nor the AI find anything to ask about.
    const invokeLLM = async () => ({ questions: [] });
    const questions = await discoverDesignContextQuestions({
      version: versionWith({
        subwooferInstances: [{ id: 's', enabled: true, position: { x: 1, y: 1 } }],
        // Seat at y=4.5 in a 5m room → only 0.5m behind — not generous.
        seating_positions: [{ id: 's1', x: 2, y: 4.5, row: 1 }],
      }),
      project: { id: 'p', room_width: 4, room_length: 5, room_height: 2.4 },
      invokeLLM,
    });
    expect(questions).toEqual([]);
  });
});

/* ── 3. Existing designer explanations are recognised ─────────────────────── */

describe('Existing answer recognition', () => {
  it('preserves existing saved answers through merge', () => {
    const existing = dixonSavedItems();
    // The designer re-reviews but answers nothing new — merge preserves all.
    const merged = mergeContextItems(existing, []);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.question_id)).toContain('seating_forward_of_rear_wall');
    expect(merged.map((m) => m.question_id)).toContain('subwoofer_count_rationale');
  });

  it('recorded intent carries the preserved answered items', () => {
    const items = dixonSavedItems();
    const intent = recordedIntentFromContext(items);
    expect(intent).toHaveLength(2);
    expect(intent.some((s) => s.includes('bar and circulation'))).toBe(true);
    expect(intent.some((s) => s.includes('headroom and modal smoothing'))).toBe(true);
  });

  it('confirmed question IDs suppress re-asking for already-answered decisions', () => {
    const items = dixonSavedItems();
    const confirmed = confirmedQuestionIds(items);
    expect([...confirmed].sort()).toEqual([
      'seating_forward_of_rear_wall',
      'subwoofer_count_rationale',
    ]);
  });

  it('recognises front/rear subwoofer distribution as a deterministic question', () => {
    // Subs spread across front AND rear halves.
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      subwooferInstances: [
        { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
        { id: 'sub2', enabled: true, position: { x: 4.0, y: 7.0 } },
      ],
    });
    const questions = discoverDeterministicQuestions(version, null);
    const ids = questions.map((q) => q.question_id);
    expect(ids).toContain('subwoofer_front_rear_distribution');
    const dist = questions.find((q) => q.question_id === 'subwoofer_front_rear_distribution');
    expect(dist.area).toBe('subwoofers');
    expect(dist.decision_fingerprint).toMatch(/^subarr:/);
  });

  it('still recognises all-on-one-wall arrangements', () => {
    // All subs in the front half.
    const version = versionWith({
      roomDims: '{"widthM":5.6,"lengthM":8.0,"heightM":2.7}',
      subwooferInstances: [
        { id: 'sub1', enabled: true, position: { x: 1.0, y: 0.5 } },
        { id: 'sub2', enabled: true, position: { x: 4.0, y: 0.5 } },
      ],
    });
    const questions = discoverDeterministicQuestions(version, null);
    expect(questions.map((q) => q.question_id)).toContain('subwoofer_single_wall_arrangement');
    expect(questions.map((q) => q.question_id)).not.toContain('subwoofer_front_rear_distribution');
  });

  it('Dixon design triggers the seating question via project dims', () => {
    const questions = discoverDeterministicQuestions(dixonVersion(), dixonProject());
    expect(questions.map((q) => q.question_id)).toContain('seating_forward_of_rear_wall');
  });
});

/* ── 4. Skip exclusions for the current generation ────────────────────────── */

describe('Skip exclusion for current generation', () => {
  it('a skipped question is not persisted (normalise drops it)', () => {
    const raw = [
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'answered', answer: 'Reason.' },
      { question_id: 'q2', question: 'Why B?', area: 'subwoofers', status: 'skipped' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });
    expect(items.map((i) => i.question_id)).toEqual(['q1']);
  });

  it('a skipped question with a previously saved answer is excluded from recorded intent', () => {
    // The saved DesignContext still has the answer. The caller filters it
    // out using the skip IDs before building recorded intent — this mirrors
    // the production flow in buildReportDesignIntentAttempt.
    const allItems = dixonSavedItems();
    const skipSet = new Set(['seating_forward_of_rear_wall']);
    const filtered = allItems.filter((item) => !skipSet.has(item.question_id));
    const intent = recordedIntentFromContext(filtered);
    // Only the subwoofer answer remains; the seating answer is excluded
    // for this generation even though it is still saved.
    expect(intent).toHaveLength(1);
    expect(intent.some((s) => s.includes('headroom and modal smoothing'))).toBe(true);
    expect(intent.some((s) => s.includes('bar and circulation'))).toBe(false);
    // The saved answer is NOT deleted from storage — the full set is intact.
    expect(allItems).toHaveLength(2);
    expect(allItems.map((i) => i.question_id)).toContain('seating_forward_of_rear_wall');
  });

  it('other saved answers remain available when one is skipped', () => {
    const allItems = [
      { question_id: 'q1', status: 'answered', answer: 'Answer 1.', area: 'seating' },
      { question_id: 'q2', status: 'answered', answer: 'Answer 2.', area: 'subwoofers' },
      { question_id: 'q3', status: 'answered', answer: 'Answer 3.', area: 'treatment' },
    ];
    const skipSet = new Set(['q2']);
    const filtered = allItems.filter((item) => !skipSet.has(item.question_id));
    const intent = recordedIntentFromContext(filtered);
    expect(intent).toHaveLength(2);
    expect(intent.some((s) => s.includes('Answer 1.'))).toBe(true);
    expect(intent.some((s) => s.includes('Answer 3.'))).toBe(true);
    expect(intent.some((s) => s.includes('Answer 2.'))).toBe(false);
  });

  it('the review can proceed with no answers (all skipped)', () => {
    const raw = [
      { question_id: 'q1', question: 'Why?', area: 'seating', status: 'skipped' },
      { question_id: 'q2', question: 'Why?', area: 'subwoofers', status: 'skipped' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });
    expect(items).toEqual([]);
    // No recorded intent from an all-skipped review.
    expect(recordedIntentFromContext(items)).toEqual([]);
  });

  it('No particular reason remains a separate explicit saved response', () => {
    const raw = [
      { question_id: 'q1', question: 'Why?', area: 'seating', status: 'no_reason' },
      { question_id: 'q2', question: 'Why?', area: 'subwoofers', status: 'skipped' },
    ];
    const items = normaliseContextItems(raw, { user: USER, now: NOW });
    expect(items.map((i) => i.question_id)).toEqual(['q1']);
    expect(items[0].status).toBe(CONTEXT_STATUS.NO_REASON);
    // No-reason is never turned into a recorded reason.
    expect(recordedIntentFromContext(items)).toEqual([]);
    // But it IS a confirmed question (suppressed from re-asking).
    expect([...confirmedQuestionIds(items)]).toEqual(['q1']);
  });

  it('skipping a previously saved answer does not delete it from the saved set', () => {
    // The merge simulates what saveDesignContext does: incoming items
    // (answered/no_reason only) replace same-ID items; items not in the
    // incoming set are preserved. A skip produces no incoming item for
    // that ID, so the saved answer survives.
    const existing = dixonSavedItems();
    const incoming = []; // designer skipped everything, nothing to save
    const merged = mergeContextItems(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.question_id)).toContain('seating_forward_of_rear_wall');
  });
});