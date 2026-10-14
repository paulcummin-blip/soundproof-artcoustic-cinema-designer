/**
 * p1-p20-narrative-rules.test.mjs
 * -------------------------------
 * THE TWO PARAMETERS A LEVEL CANNOT DESCRIBE ON ITS OWN.
 *
 * P20 is a heavily weighted bass result whose meaning depends on WHICH SEATS it
 * holds for; P1 is a deliberate physical design decision the client and the
 * installer ask about. These rules are the reason the proposal does not sell a
 * room-wide consistency claim it cannot support, and does not reduce the seating
 * decision to a score.
 *
 *   P20 · a weak result is never promoted, a primary-seat result may be told
 *         positively for the primary seats ONLY, an all-seat result is a strong
 *         candidate, and the wording scales with the level;
 *   P1  · available to the narrative as DESIGN RATIONALE at any level, explained in
 *         plain client language, never as a headline result;
 *   the seating steer · one do-not-discuss silences the whole seating narrative —
 *         decision, rationale, clearance, seat scopes and geometry — and leaves the
 *         technical evidence exactly as it was.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NARRATIVE_PRIORITY,
  PRIORITY_LABEL,
  SEAT_SCOPE,
  buildNarrativePriorityRows,
  designRationaleRows,
  narrativeCandidateRows,
  p1RationaleIsClientSafe,
  p1RationalePhrase,
  p20ConsistencyPhrase,
  p20NarrativePriority,
  p20WordingIsScopeSafe,
  phraseAfterRelevance,
  readSeatScope,
  seatingNarrativeSuppressed,
  suppressedAreasFromTopics,
} from '../base44/shared/narrativePriorityAuthority.js';
import { PARAM_WEIGHTS } from '../base44/shared/canonicalParameterWeights.js';
import { summaryFromReportEvidence } from '../base44/shared/strengthImportance.js';
import { BRIEF_INTENT } from '../base44/shared/briefRelevance.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The design every case is read against: a dedicated cinema with bass and seats. */
const CINEMA = Object.freeze({
  intent: BRIEF_INTENT.DEDICATED_CINEMA,
  design: { display: true, speakers: true, seats: 6, bass: true, spatial: true, timbre: true, screenChannels: true },
});

/** One frozen evidence parameter row, with its own per-seat results. */
const row = (parameter_id, level, { scope = 'room', seats = [], value = null, state = 'scored' } = {}) => ({
  parameter_id,
  level,
  scope,
  state,
  value,
  supporting_per_seat: seats.map(([seat_id, seatLevel, priority]) => ({ seat_id, level: seatLevel, priority })),
});

const summaryOf = (rows) => summaryFromReportEvidence({ parameters: rows });

/** One P20 summary, from its primary and secondary seat results. */
const p20Summary = (primaryLevels, secondaryLevels) => summaryOf([row(20, null, {
  scope: 'seat',
  seats: [
    ...primaryLevels.map((level, index) => [`r1c${index + 1}`, level, 'primary']),
    ...secondaryLevels.map((level, index) => [`r2c${index + 1}`, level, 'secondary']),
  ],
})]);

const rowsFor = (summary, extra = {}) => buildNarrativePriorityRows({ summary, ...CINEMA, ...extra });

/* ── 1 · P20 all seats L1 is never promoted ───────────────────────────────── */

test('P20 all seats L1: technical evidence only, and no consistency language at all', () => {
  const summary = p20Summary(['L1', 'L1'], ['L1', 'L1']);
  const seats = readSeatScope(summary, 'p20');
  assert.equal(seats.all, 'L1');
  assert.equal(seats.primary, 'L1');
  assert.equal(seats.secondary, 'L1');
  assert.equal(seats.split, true);

  const { rows } = rowsFor(summary);
  const p20 = rows.find((entry) => entry.key === 'p20');
  assert.equal(p20.priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
  assert.equal(p20.seat_scope, SEAT_SCOPE.NONE);
  assert.equal(p20.narrative_role, 'Technical only');
  assert.match(p20.reason, /technical evidence/);

  // Not a candidate anywhere, and no sentence is manufactured for it.
  assert.ok(!narrativeCandidateRows(rows).some((entry) => entry.key === 'p20'));
  assert.equal(phraseAfterRelevance({ key: 'p20', level: 'L1', priority: p20.priority, seatScope: p20.seat_scope }), null);
  assert.equal(p20ConsistencyPhrase({ level: 'L1', scope: SEAT_SCOPE.PRIMARY }), null);
  assert.equal(p20ConsistencyPhrase({ level: 'L1', scope: SEAT_SCOPE.ALL }), null);

  // The result itself is untouched: it stays in the evidence with its own weight.
  assert.equal(p20.level, 'L1');
  assert.equal(p20.weight, PARAM_WEIGHTS.p20);
  assert.equal(p20.eligible, true);
});

/* ── 2 · a good PRIMARY-seat result may be promoted, for the primary seats ── */

test('P20 primary L3 with weaker secondary seats: promoted for the PRIMARY seating area only', () => {
  const summary = p20Summary(['L3', 'L3'], ['L1']);
  const { rows } = rowsFor(summary);
  const p20 = rows.find((entry) => entry.key === 'p20');

  assert.equal(p20.seat_scope, SEAT_SCOPE.PRIMARY);
  assert.equal(p20.priority, NARRATIVE_PRIORITY.LEAD_STORY);
  assert.equal(p20.primary_seat_result, 'L3');
  assert.equal(p20.secondary_seat_result, 'L1');
  assert.match(p20.reason, /primary seating area only/);

  const sentence = phraseAfterRelevance({
    key: 'p20', level: 'L3', priority: p20.priority, seatScope: p20.seat_scope,
  });
  assert.match(sentence, /^The primary seats achieve very strong bass consistency/);
  assert.match(sentence, /main listening positions/);
  assert.equal(p20WordingIsScopeSafe(sentence, SEAT_SCOPE.PRIMARY), true);
  // The room-wide sentence is a DIFFERENT claim, and it is not the one stated.
  assert.notEqual(sentence, p20ConsistencyPhrase({ level: 'L3', scope: SEAT_SCOPE.ALL }));
  assert.ok(!/across the room|across the seating|throughout the room/.test(sentence));
  // A room-wide sentence would be refused at this scope.
  assert.equal(
    p20WordingIsScopeSafe(p20ConsistencyPhrase({ level: 'L3', scope: SEAT_SCOPE.ALL }), SEAT_SCOPE.PRIMARY),
    false,
  );

  // The same result at L2 is a positive mention rather than the headline.
  const l2 = p20NarrativePriority({ allLevel: 'L1', primaryLevel: 'L2', split: true });
  assert.equal(l2.priority, NARRATIVE_PRIORITY.WORTH_MENTIONING);
  assert.equal(l2.seat_scope, SEAT_SCOPE.PRIMARY);
  assert.equal(
    p20ConsistencyPhrase({ level: 'L2', scope: SEAT_SCOPE.PRIMARY }),
    'The primary seats achieve good bass consistency, helping the low-frequency balance remain much more even across the main listening positions.',
  );
});

/* ── 3 · a strong all-seat result is a strong candidate ───────────────────── */

test('P20 all assessed seats at L2 or better: a strong candidate, worded at its own level', () => {
  const cases = [
    ['L2', 'good bass consistency across the seating', NARRATIVE_PRIORITY.WORTH_MENTIONING],
    ['L3', 'very strong bass consistency, with noticeably more even low-frequency performance across the seats', NARRATIVE_PRIORITY.LEAD_STORY],
    ['L4', 'exceptional seat-to-seat bass consistency, allowing the low-frequency balance to remain remarkably even across the listening area', NARRATIVE_PRIORITY.LEAD_STORY],
  ];
  for (const [level, sentence, priority] of cases) {
    const summary = p20Summary([level], [level]);
    const { rows } = rowsFor(summary);
    const p20 = rows.find((entry) => entry.key === 'p20');
    assert.equal(p20.seat_scope, SEAT_SCOPE.ALL, level);
    assert.equal(p20.priority, priority, level);
    assert.equal(p20.level, level, level);
    assert.equal(phraseAfterRelevance({ key: 'p20', level, priority, seatScope: p20.seat_scope }), sentence, level);
    assert.equal(p20WordingIsScopeSafe(sentence, SEAT_SCOPE.ALL), true, level);
  }
  // L3 and above read as a lead; the whole seating is stated, not a single seat.
  assert.ok(narrativeCandidateRows(rowsFor(p20Summary(['L3'], ['L3'])).rows).some((entry) => entry.key === 'p20'));
});

/* ── 4 & 5 · P1 is a design rationale, at any level ───────────────────────── */

test('P1 in a dedicated cinema: available as DESIGN RATIONALE, in plain client language', () => {
  const summary = summaryOf([row(1, 'L3', { value: '1.4 m' })]);
  const { rows } = rowsFor(summary);
  const p1 = rows.find((entry) => entry.key === 'p1');

  assert.equal(p1.priority, NARRATIVE_PRIORITY.DESIGN_RATIONALE);
  assert.equal(p1.narrative_role, PRIORITY_LABEL[NARRATIVE_PRIORITY.DESIGN_RATIONALE]);
  assert.match(p1.reason, /deliberate physical design decision/);

  // It is explained, not celebrated — and it is not a performance headline.
  const sentence = phraseAfterRelevance({ key: 'p1', level: p1.level, priority: p1.priority });
  assert.match(sentence, /seating has deliberately been kept away from the rear wall/);
  assert.equal(p1RationaleIsClientSafe(sentence), true);
  assert.ok(!/p1|rp22|parameter 1|boundary interference|equation|mode|guarantee/i.test(sentence));
  assert.ok(!narrativeCandidateRows(rows).some((entry) => entry.key === 'p1'));
  assert.deepEqual(designRationaleRows(rows).map((entry) => entry.key), ['p1']);

  // Its own published result is still stated beside the explanation.
  assert.equal(p1.level, 'L3');
  assert.equal(p1.value, '1.4 m');
});

test('P1 relevance comes from the design decision, not from its level', () => {
  for (const level of ['L1', 'L2', 'L3', 'L4']) {
    const { rows } = rowsFor(summaryOf([row(1, level)]));
    const p1 = rows.find((entry) => entry.key === 'p1');
    assert.equal(p1.priority, NARRATIVE_PRIORITY.DESIGN_RATIONALE, level);
    assert.equal(phraseAfterRelevance({ key: 'p1', level, priority: p1.priority }), p1RationalePhrase(p1.priority), level);
    // No level-specific celebration creeps in: the same rationale at every level.
    assert.ok(!/exceptional|flagship|outstanding/i.test(phraseAfterRelevance({ key: 'p1', level, priority: p1.priority })), level);
  }
  // A design that states no seating arrangement has nothing to explain.
  const { rows } = rowsFor(summaryOf([row(1, 'L3')]), { design: { ...CINEMA.design, seats: 0 } });
  assert.equal(rows.find((entry) => entry.key === 'p1').priority, NARRATIVE_PRIORITY.TECHNICAL_ONLY);
});

/* ── 6 · the seating steer silences the whole seating narrative ───────────── */

test('seating do-not-discuss suppresses P1, the rationale and the seat-scope discussion', () => {
  assert.deepEqual(suppressedAreasFromTopics(['seating_arrangement']), ['client_experience']);
  assert.equal(seatingNarrativeSuppressed(['client_experience']), true);

  const summary = summaryOf([
    row(1, 'L4', { value: '1.4 m' }),
    row(20, null, { scope: 'seat', seats: [['r1c1', 'L3', 'primary'], ['r2c1', 'L1', 'secondary']] }),
  ]);
  const { rows, suppressedAreas } = rowsFor(summary, { excludedTopics: ['seating_arrangement'] });
  assert.deepEqual(suppressedAreas, ['client_experience']);

  const p1 = rows.find((entry) => entry.key === 'p1');
  assert.equal(p1.priority, NARRATIVE_PRIORITY.DO_NOT_DISCUSS);
  assert.equal(p1.silenced, true);
  assert.equal(phraseAfterRelevance({ key: 'p1', level: p1.level, priority: p1.priority }), null);
  assert.ok(!designRationaleRows(rows).some((entry) => entry.key === 'p1'));

  // No primary/secondary seat discussion survives: the consistency narrative is
  // silenced with the seating subject it belongs to, and only the whole seating
  // scoped statement could have been made — which this design does not support.
  const p20 = rows.find((entry) => entry.key === 'p20');
  assert.equal(p20.seat_scope, SEAT_SCOPE.NONE);
  assert.equal(p20.priority, NARRATIVE_PRIORITY.DO_NOT_DISCUSS);
  assert.equal(p20.primary_seat_result, 'L3', 'the seat results are still read as evidence');
  assert.ok(!narrativeCandidateRows(rows).some((entry) => entry.key === 'p20'));

  // The technical evidence is untouched: every published result is still stated.
  assert.equal(p1.level, 'L4');
  assert.equal(p20.level, 'L1');
  assert.equal(p20.weight, PARAM_WEIGHTS.p20);
});

/* ── 7 · technical evidence is untouched, always ─────────────────────────── */

test('no rule above changes a published result, a weight or a contribution', () => {
  const summary = summaryOf([
    row(1, 'L2', { value: '1.2 m' }),
    row(14, 'L3', { value: '118 dBC' }),
    row(18, 'L3', { value: '30 Hz' }),
    row(19, 'L4', { value: '±1 dB' }),
    row(20, null, { scope: 'seat', seats: [['r1c1', 'L2', 'primary'], ['r2c1', 'L1', 'secondary']] }),
  ]);
  const before = JSON.stringify(summary);
  const { rows } = rowsFor(summary);

  for (const [parameter_id, level] of [[1, 'L2'], [14, 'L3'], [18, 'L3'], [19, 'L4']]) {
    const entry = rows.find((item) => item.key === `p${parameter_id}`);
    assert.equal(entry.level, level, `P${parameter_id}`);
    assert.equal(entry.weight, PARAM_WEIGHTS[`p${parameter_id}`], `P${parameter_id}`);
    assert.ok(entry.contribution > 0, `P${parameter_id}`);
  }

  // P20's governed result is the weakest assessed seat, and both seat results are
  // still reported beside it: the primary seats are the only place it may be claimed.
  const p20 = rows.find((item) => item.key === 'p20');
  assert.equal(p20.level, 'L1');
  assert.equal(p20.primary_seat_result, 'L2');
  assert.equal(p20.secondary_seat_result, 'L1');
  assert.equal(p20.seat_scope, SEAT_SCOPE.PRIMARY);
  assert.equal(JSON.stringify(summary), before, 'the classification must not touch the evidence');
});

/* ── The designer-facing view states the role and the seat results ────────── */

test('Expert View states the narrative role, the seat results and the seat scope', () => {
  const component = source('src/components/roomdesigner/ExpertViewDesignWeighting.jsx');
  for (const heading of [
    'Parameter', 'Area', 'ASDR weight', 'Result', 'Primary-seat result', 'Secondary-seat result',
    'ASDR contribution', 'Brief relevance', 'Narrative role',
  ]) {
    assert.match(component, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(component, /row\.primary_seat_result/);
  assert.match(component, /row\.secondary_seat_result/);
  assert.match(component, /row\.narrative_role/);
  assert.match(component, /SEAT_SCOPE_LABEL\[row\.seat_scope\]/);
  assert.match(component, /stated for/);
  assert.match(component, /label: 'Design rationale'/);
  assert.match(component, /excludedTopics/);
  // The roles are the shared vocabulary, not a second list.
  assert.deepEqual(
    Object.values(PRIORITY_LABEL),
    ['Lead story', 'Worth mentioning', 'Design rationale', 'Supporting evidence', 'Technical only', 'Do not discuss'],
  );
});