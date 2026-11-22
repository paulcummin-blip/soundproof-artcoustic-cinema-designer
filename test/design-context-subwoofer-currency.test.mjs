/**
 * Design Context — subwoofer arrangement decision currency regression tests.
 *
 * These tests prove the canonical subwoofer fingerprint and the legacy
 * compatibility rule work correctly across the four required cases:
 *
 *   A. Dixon unchanged (4 front/rear) — suppress the repeated question.
 *   B. Material change (4 front/rear → 2 front-only) — re-ask.
 *   C. Wording / question-ID change only (same arrangement) — suppress.
 *   D. Minor position adjustment (same count + distribution) — suppress.
 *
 * Also verifies that seating explanations remain suppressed when seating
 * is unchanged but are reconsidered after a meaningful seating-layout change.
 *
 * Legacy Dixon data uses a dc1-{hash}-{length} fingerprint that was computed
 * with a different formula than the current canonical subarr: format.  The
 * compatibility rule extracts the subwoofer count from the saved question
 * text and compares it against the current count from the canonical
 * fingerprint, so Dixon's unchanged arrangement is still covered.
 *
 * Pure: no React, no SDK, no provider calls.
 */
import { describe, it, expect } from 'vitest';

import {
  CONTEXT_STATUS,
  confirmedDecisions,
  partitionByDecisionCurrency,
} from '../base44/shared/designContext/designContextModel.js';
import {
  discoverDeterministicQuestions,
} from '../base44/shared/designContext/designContextDiscovery.js';
import {
  decisionKeyForQuestion,
  DESIGN_DECISION,
  canonicalSubwooferFingerprint,
  parseSubwooferSignature,
  extractSubwooferCountFromQuestionText,
  compareSubwooferArrangementAcrossIds,
} from '../base44/shared/designContext/designContextDecisionIdentity.js';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const NOW = '2026-11-22T10:00:00.000Z';
const USER_NAME = 'Paul Cummin';

function versionWith(state) {
  return { id: 'v1', project_id: 'proj', version_number: 1, design_state: state };
}

/** Dixon's real project: room dims on the Project entity. */
function dixonProject() {
  return {
    id: 'proj',
    roomDims: '{"widthM":5.6,"lengthM":6.69,"heightM":2.7}',
    room_width: 5.6,
    room_length: 6.69,
    room_height: 2.7,
  };
}

/** Dixon's real seating: 5 seats at y=3.33 (forward of rear wall). */
function dixonSeats() {
  return [
    { id: 'seat-r1-c1', x: 1.6, y: 3.33, row: 1 },
    { id: 'seat-r1-c2', x: 2.2, y: 3.33, row: 1 },
    { id: 'seat-r1-c3', x: 2.8, y: 3.33, row: 1 },
    { id: 'seat-r1-c4', x: 3.4, y: 3.33, row: 1 },
    { id: 'seat-r1-c5', x: 4.0, y: 3.33, row: 1 },
  ];
}

/** Dixon's real saved subwoofer answer (legacy fingerprint + question text). */
function dixonSavedSubwooferItem() {
  return {
    question_id: 'subwoofer_count_rationale',
    question: 'What is the engineering justification for installing 4 subwoofers in a 5-seat layout?',
    area: 'subwoofers',
    status: CONTEXT_STATUS.ANSWERED,
    answer: 'subwoofers at the front and rear of the room are required to deliver smooth deep bass to all seats. the room modes means dips in deeper bass frequencies would reduce the performance of this system without this design',
    decision_fingerprint: 'dc1-fda338c0-40',
    answered_at: '2026-11-20T17:47:03.244Z',
    answered_by: USER_NAME,
  };
}

/** Dixon's real saved seating answer (legacy fingerprint). */
function dixonSavedSeatingItem() {
  return {
    question_id: 'seating_forward_of_rear_wall',
    question: 'The seating is positioned well forward of the rear wall. Is there a particular reason for leaving this space behind the audience?',
    area: 'seating',
    status: CONTEXT_STATUS.ANSWERED,
    answer: 'The seating allows space behind for the bar, as well as being perfectly positioned for the large 140" screen',
    decision_fingerprint: 'dc1-7ddfee69-32',
    answered_at: '2026-11-20T17:47:03.244Z',
    answered_by: USER_NAME,
  };
}

/** Suppress helper: partition + filter to get the questions to ask. */
function questionsToAsk(savedItems, currentQuestions) {
  const { current: currentSaved } = partitionByDecisionCurrency(savedItems, currentQuestions);
  const suppress = confirmedDecisions(currentSaved);
  return currentQuestions.filter((q) => {
    const dk = decisionKeyForQuestion(q);
    return !dk || !suppress.has(dk);
  });
}

/* ── Case A: Dixon unchanged — suppress ─────────────────────────────────── */

describe('Case A — Dixon unchanged (4 front/rear)', () => {
  it('does not re-ask the subwoofer question when the arrangement is unchanged', () => {
    // Dixon's current design: 4 subs, 2 front, 2 rear.
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());

    // The current question is subwoofer_front_rear_distribution.
    expect(current.map((q) => q.question_id)).toContain('subwoofer_front_rear_distribution');
    const subQ = current.find((q) => q.question_id === 'subwoofer_front_rear_distribution');
    expect(subQ.decision_fingerprint).toBe('subarr:front_rear:4:2:2');

    // Dixon's saved answer (legacy fingerprint, question text mentions "4 subwoofers").
    const saved = [dixonSavedSubwooferItem()];
    const toAsk = questionsToAsk(saved, current);

    // The subwoofer question is suppressed.
    expect(toAsk.map((q) => q.question_id)).not.toContain('subwoofer_front_rear_distribution');
  });

  it('does not re-ask the seating question when seating is unchanged', () => {
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());
    expect(current.map((q) => q.question_id)).toContain('seating_forward_of_rear_wall');

    const saved = [dixonSavedSeatingItem()];
    const toAsk = questionsToAsk(saved, current);

    expect(toAsk.map((q) => q.question_id)).not.toContain('seating_forward_of_rear_wall');
  });

  it('both Dixon saved answers suppress both questions', () => {
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());
    const saved = [dixonSavedSeatingItem(), dixonSavedSubwooferItem()];
    const toAsk = questionsToAsk(saved, current);
    expect(toAsk).toEqual([]);
  });
});

/* ── Case B: Material change — re-ask ────────────────────────────────────── */

describe('Case B — Material change (4 front/rear → 2 front-only)', () => {
  it('re-asks the subwoofer question after a material arrangement change', () => {
    // Current design: 2 subs, both front (changed from 4 front/rear).
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());

    // The current question is now subwoofer_single_wall_arrangement.
    expect(current.map((q) => q.question_id)).toContain('subwoofer_single_wall_arrangement');
    const subQ = current.find((q) => q.question_id === 'subwoofer_single_wall_arrangement');
    expect(subQ.decision_fingerprint).toBe('subarr:single_wall:2:2:0');

    // Dixon's saved answer mentions "4 subwoofers" — count 4 ≠ current 2.
    const saved = [dixonSavedSubwooferItem()];
    const toAsk = questionsToAsk(saved, current);

    // The subwoofer question is re-asked.
    expect(toAsk.map((q) => q.question_id)).toContain('subwoofer_single_wall_arrangement');
  });

  it('marks the saved subwoofer item as stale after the material change', () => {
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());
    const saved = [dixonSavedSubwooferItem()];

    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, current);
    expect(currentSaved).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0].question_id).toBe('subwoofer_count_rationale');
  });
});

/* ── Case C: Wording change only — suppress ──────────────────────────────── */

describe('Case C — Wording / question-ID change only', () => {
  it('suppresses when the question ID changes but the arrangement is the same', () => {
    // Same 4 front/rear arrangement, but the current question carries a
    // different question ID (e.g. subwoofer_arrangement_reason) with the
    // same canonical fingerprint as the saved item.
    const current = [{
      question_id: 'subwoofer_arrangement_reason',
      question: 'Why are the subwoofers arranged this way?',
      area: 'subwoofers',
      decision_fingerprint: 'subarr:front_rear:4:2:2',
    }];

    // Saved under a different question ID but with the same canonical fingerprint.
    const saved = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'The 4 subwoofers are distributed across the front and rear.',
      area: 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer: 'For smooth bass across all seats.',
      decision_fingerprint: 'subarr:front_rear:4:2:2',
      answered_at: NOW,
      answered_by: USER_NAME,
    }];

    const toAsk = questionsToAsk(saved, current);
    expect(toAsk).toEqual([]);
  });
});

/* ── Case D: Minor position adjustment — suppress ───────────────────────── */

describe('Case D — Minor position adjustment', () => {
  it('does not re-ask when positions shift slightly without changing count or distribution', () => {
    // Original positions (saved).
    const savedVersion = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const savedQuestions = discoverDeterministicQuestions(savedVersion, dixonProject());
    const subQ = savedQuestions.find((q) => q.question_id === 'subwoofer_front_rear_distribution');

    // Slightly adjusted positions (current) — same 4 subs, 2 front, 2 rear.
    const currentVersion = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.0, y: 0.2 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.5, y: 0.2 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.5, y: 6.4 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.0, y: 6.4 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(currentVersion, dixonProject());

    // Both produce the same canonical fingerprint.
    const currentSubQ = current.find((q) => q.question_id === 'subwoofer_front_rear_distribution');
    expect(currentSubQ.decision_fingerprint).toBe(subQ.decision_fingerprint);

    // Saved with the canonical fingerprint — suppresses the current question.
    const saved = [{
      question_id: 'subwoofer_front_rear_distribution',
      question: 'The 4 subwoofers are distributed across the front and rear.',
      area: 'subwoofers',
      status: CONTEXT_STATUS.ANSWERED,
      answer: 'For smooth bass across all seats.',
      decision_fingerprint: subQ.decision_fingerprint,
      answered_at: NOW,
      answered_by: USER_NAME,
    }];

    const toAsk = questionsToAsk(saved, current);
    expect(toAsk.map((q) => q.question_id)).not.toContain('subwoofer_front_rear_distribution');
  });
});

/* ── Seating: suppressed when unchanged, reconsidered after change ────────── */

describe('Seating currency', () => {
  it('seating is reconsidered after a meaningful seating-layout change', () => {
    // Original: seats at y=3.33 (3.36m behind, generous clearance).
    const originalVersion = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const originalQuestions = discoverDeterministicQuestions(originalVersion, dixonProject());
    const seatQ = originalQuestions.find((q) => q.question_id === 'seating_forward_of_rear_wall');

    // Changed: seats moved back to y=6.0 (only 0.69m behind, not generous).
    // The seating question should NOT fire (clearance is no longer generous).
    // But if we simulate the same question firing with a different fingerprint,
    // the saved item should be stale.
    const changedVersion = versionWith({
      seating_positions: [
        { id: 'seat-r1-c1', x: 1.6, y: 6.0, row: 1 },
        { id: 'seat-r1-c2', x: 2.2, y: 6.0, row: 1 },
        { id: 'seat-r1-c3', x: 2.8, y: 6.0, row: 1 },
      ],
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const changedQuestions = discoverDeterministicQuestions(changedVersion, dixonProject());

    // The seating question does NOT fire when clearance is not generous.
    // This is the existing behaviour: a meaningful layout change can remove
    // the question entirely. The saved item is preserved but irrelevant.
    expect(changedQuestions.map((q) => q.question_id)).not.toContain('seating_forward_of_rear_wall');

    // Simulate: the same question ID fires but with a different fingerprint
    // (the seating layout changed enough to alter the fingerprint).
    const currentWithChangedFp = [{
      question_id: 'seating_forward_of_rear_wall',
      question: 'The seating is positioned well forward of the rear wall.',
      area: 'seating',
      decision_fingerprint: 'dc1-changedfp-99',
    }];
    const saved = [dixonSavedSeatingItem()];
    const { current: currentSaved, stale } = partitionByDecisionCurrency(saved, currentWithChangedFp);
    // Same question ID, different fingerprint → stale (existing behaviour).
    expect(currentSaved).toEqual([]);
    expect(stale).toHaveLength(1);
  });

  it('seating remains suppressed when the same question fires with the same fingerprint', () => {
    const version = versionWith({
      seating_positions: dixonSeats(),
      subwooferInstances: [
        { id: 'sub-front-1', enabled: true, position: { x: 2.128, y: 0.1375 } },
        { id: 'sub-front-2', enabled: true, position: { x: 3.472, y: 0.1375 } },
        { id: 'sub-rear-1', enabled: true, position: { x: 1.4, y: 6.5525 } },
        { id: 'sub-rear-2', enabled: true, position: { x: 5.165, y: 6.5525 } },
      ],
      screen_mount_mode: 'baffle',
      acoustic_treatment_enabled: false,
    });
    const current = discoverDeterministicQuestions(version, dixonProject());
    const seatQ = current.find((q) => q.question_id === 'seating_forward_of_rear_wall');

    // Saved with the same fingerprint as the current question.
    const saved = [{
      ...dixonSavedSeatingItem(),
      decision_fingerprint: seatQ.decision_fingerprint,
    }];

    const toAsk = questionsToAsk(saved, current);
    expect(toAsk.map((q) => q.question_id)).not.toContain('seating_forward_of_rear_wall');
  });
});

/* ── Canonical fingerprint unit tests ─────────────────────────────────────── */

describe('Canonical subwoofer fingerprint', () => {
  it('builds and parses canonical fingerprints', () => {
    const fp = canonicalSubwooferFingerprint({ type: 'front_rear', count: 4, front: 2, rear: 2 });
    expect(fp).toBe('subarr:front_rear:4:2:2');
    expect(parseSubwooferSignature(fp)).toEqual({ type: 'front_rear', count: 4, front: 2, rear: 2 });
  });

  it('returns null for non-canonical fingerprints', () => {
    expect(parseSubwooferSignature('dc1-fda338c0-40')).toBeNull();
    expect(parseSubwooferSignature(null)).toBeNull();
    expect(parseSubwooferSignature('')).toBeNull();
  });

  it('extracts the subwoofer count from question text', () => {
    expect(extractSubwooferCountFromQuestionText('installing 4 subwoofers in a 5-seat layout')).toBe(4);
    expect(extractSubwooferCountFromQuestionText('2 subwoofers near the front wall')).toBe(2);
    expect(extractSubwooferCountFromQuestionText('Why this arrangement?')).toBeNull();
    expect(extractSubwooferCountFromQuestionText(null)).toBeNull();
  });

  it('compares canonical signatures across question IDs', () => {
    expect(compareSubwooferArrangementAcrossIds(
      { decision_fingerprint: 'subarr:front_rear:4:2:2' },
      'subarr:front_rear:4:2:2',
    )).toBe('current');

    expect(compareSubwooferArrangementAcrossIds(
      { decision_fingerprint: 'subarr:front_rear:4:2:2' },
      'subarr:single_wall:2:2:0',
    )).toBe('stale');
  });

  it('uses legacy compatibility rule for dc1- fingerprints', () => {
    // Legacy saved item with count in question text matching current count.
    expect(compareSubwooferArrangementAcrossIds(
      { decision_fingerprint: 'dc1-fda338c0-40', question: 'installing 4 subwoofers' },
      'subarr:front_rear:4:2:2',
    )).toBe('current');

    // Legacy saved item with count in question text NOT matching current count.
    expect(compareSubwooferArrangementAcrossIds(
      { decision_fingerprint: 'dc1-fda338c0-40', question: 'installing 4 subwoofers' },
      'subarr:single_wall:2:2:0',
    )).toBe('stale');

    // Legacy saved item without count in question text → unknown.
    expect(compareSubwooferArrangementAcrossIds(
      { decision_fingerprint: 'dc1-fda338c0-40', question: 'Why this arrangement?' },
      'subarr:front_rear:4:2:2',
    )).toBe('unknown');
  });
});