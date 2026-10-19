/**
 * adi-design-knowledge.test.mjs
 * -----------------------------
 * ADI LEARNING FROM REPEATED DESIGN CLARIFICATIONS.
 *
 * What it checks, and nothing else:
 *
 *   1  a designer's clarification answer becomes a structured learning candidate —
 *      topic, design condition, the exact answer, the canonical meaning, internal
 *      source references, the date and an initial confidence;
 *   2  answers worded differently but meaning the same thing cluster together;
 *   3  one answer is never knowledge: two matching projects strengthen a candidate and
 *      three separate projects promote it to learned knowledge;
 *   4  a project's own reason overrides learned knowledge completely;
 *   5  a high-confidence learned rationale stops the question being asked again;
 *   6  uncertain knowledge asks, or asks for a lightweight confirmation;
 *   7  a contradicting answer lowers confidence and returns the matter to asking;
 *   8  a project result is never learned as a general rule;
 *   9  no client, personal or commercial detail reaches learned knowledge;
 *   10 a master admin can approve, edit, disable, merge and reset a record;
 *   11 the learning machinery is not exposed in a dealer's or client's workflow.
 *
 * Plain node assertions and no runner: the authorities are pure and the one source
 * check reads files. No live record, page or PDF is written.
 *
 * Run: node test/adi-design-knowledge.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KNOWLEDGE_STATUS,
  KNOWLEDGE_TOPIC,
  KNOWLEDGE_USE,
  buildDesignCondition,
  canonicalRationale,
  conditionStatements,
} from '../base44/shared/adiDesignKnowledge/adiDesignKnowledgeModel.js';
import { clusterAnswers, conceptsOf } from '../base44/shared/adiDesignKnowledge/adiDesignKnowledgeMatching.js';
import {
  LEARNING_OUTCOME,
  learningCandidateFromAnswer,
  reconcileKnowledge,
} from '../base44/shared/adiDesignKnowledge/adiDesignKnowledgeLearning.js';
import {
  applyKnowledgeToQuestions,
  conditionCovers,
  confirmationFor,
  designIntentFor,
  resolveKnowledgeUse,
} from '../base44/shared/adiDesignKnowledge/adiDesignKnowledgeGating.js';
import {
  CURATION_ACTION,
  CURATION_REFUSAL,
  applyAdminAction,
} from '../base44/shared/adiDesignKnowledge/adiDesignKnowledgeCuration.js';

/* ── The example this work was built from ─────────────────────────────────── */

const QUESTION = {
  question_id: 'overhead_speaker_reason',
  area: 'overheads',
  belongs_to: 'what_stays_same',
  question: 'What was the main reason for selecting six overhead loudspeakers for this two-row cinema?',
};

const ANSWER = '6 overheads allows the front and rear speakers to be in front of, and behind the whole audience. '
  + 'The middle overheads fill the gap that would otherwise be created with such a distance between those overhead speakers.';

const SIMILAR = [
  'middle overheads fill the gap',
  'the middle pair closes the gap between front and rear heights',
  'with two rows the middle pair prevents too much separation between the front and rear overheads',
];

const NOW = '2026-10-19T08:00:00.000Z';

/** One answer captured and reconciled, as the wizard and the backend do it. */
function learnedRecord({ answer = ANSWER, projectId = 'project-1', userId = 'designer-1', items = [], question = QUESTION, now = NOW }) {
  const built = learningCandidateFromAnswer({
    question,
    answer,
    identity: { projectId, userId },
    now,
  });
  assert.equal(built.learnable, true, `expected a learnable answer, got ${built.reason}`);
  return reconcileKnowledge({ items, candidate: built.candidate, now });
}

/** A learned record for the example matter, promoted by three separate projects. */
function promotedRecord() {
  let items = [];
  let record = null;
  for (const projectId of ['project-1', 'project-2', 'project-3']) {
    const result = learnedRecord({ projectId, userId: `designer-${projectId}`, items });
    items = result.items;
    record = result.record;
  }
  return { items, record };
}

/* ── 1. An answer becomes a structured learning candidate ─────────────────── */

test('a clarification answer creates a learning candidate with its condition and meaning', () => {
  const built = learningCandidateFromAnswer({
    question: QUESTION,
    answer: ANSWER,
    identity: { projectId: 'project-1', userId: 'designer-1' },
    now: NOW,
  });

  assert.equal(built.learnable, true);
  const candidate = built.candidate;
  assert.equal(candidate.topic, KNOWLEDGE_TOPIC.OVERHEAD_COUNT);
  // DESIGN CONDITION, read from the design's own statement of itself.
  assert.deepEqual(candidate.condition, {
    rows: 2,
    overheads: 6,
    overhead_layout: '.6',
    overhead_positions: 'front, middle and rear',
  });
  assert.deepEqual(candidate.condition_text, [
    'two seating rows',
    'six overhead speakers',
    'front, middle and rear overhead layout',
  ]);
  // THE DESIGNER'S EXACT WORDS and the canonical meaning are both kept.
  assert.equal(candidate.raw_answers[0].answer, ANSWER);
  assert.equal(candidate.source_refs[0].project_id, 'project-1');
  assert.equal(candidate.source_refs[0].user_id, 'designer-1');
  assert.match(candidate.canonical_meaning, /^For a two-row cinema using a \.6 overhead layout, a common rationale is to/);
  assert.match(candidate.canonical_meaning, /middle pair fill the gap/);

  // ONE ANSWER IS NOT KNOWLEDGE. It is a candidate, at the bottom of the scale.
  const reconciled = reconcileKnowledge({ items: [], candidate, now: NOW });
  assert.equal(reconciled.outcome, LEARNING_OUTCOME.CANDIDATE_CREATED);
  assert.equal(reconciled.record.status, KNOWLEDGE_STATUS.CANDIDATE);
  assert.equal(reconciled.record.confidence_band, 'low');
  assert.equal(reconciled.record.seen_projects, 1);
});

/* ── 2. Similar answers cluster by meaning, not by wording ────────────────── */

test('the same rationale worded three different ways is one cluster', () => {
  const clusters = clusterAnswers(SIMILAR.map((answer, index) => ({
    answer,
    topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
    condition: buildDesignCondition({ question: QUESTION }),
    projectId: `project-${index + 1}`,
  })), KNOWLEDGE_TOPIC.OVERHEAD_COUNT);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].answers.length, 3);
  assert.deepEqual(clusters[0].concepts, ['front_rear_envelope', 'middle_fills_gap']);
  assert.equal(clusters[0].projects.length, 3);

  // And the canonical form states that shared meaning in context, in none of their words.
  const canonical = canonicalRationale({
    topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
    condition: buildDesignCondition({ question: QUESTION }),
    concepts: clusters[0].concepts,
  });
  assert.match(canonical, /keep the front and rear overheads respectively ahead of and behind the audience/);
  assert.match(canonical, /let the middle pair fill the gap between them/);
  for (const phrasing of SIMILAR) {
    assert.ok(!canonical.includes(phrasing), 'the canonical form never reproduces one answer');
  }
});

test('a different reason for the same matter is a different cluster', () => {
  const condition = buildDesignCondition({ question: QUESTION });
  const clusters = clusterAnswers([
    { answer: 'the middle pair closes the gap between the front and rear heights', topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT, condition, projectId: 'project-1' },
    { answer: 'the processor only supports that channel count', topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT, condition, projectId: 'project-2' },
  ], KNOWLEDGE_TOPIC.OVERHEAD_COUNT);

  assert.equal(clusters.length, 2);
  assert.deepEqual(conceptsOf('the processor only supports that channel count', KNOWLEDGE_TOPIC.OVERHEAD_COUNT), ['processor_capability']);
});

/* ── 3. The promotion rule ────────────────────────────────────────────────── */

test('one answer is a candidate, two strengthen it, and three separate projects promote it', () => {
  const first = learnedRecord({ projectId: 'project-1' });
  assert.equal(first.outcome, LEARNING_OUTCOME.CANDIDATE_CREATED);
  assert.equal(first.record.status, KNOWLEDGE_STATUS.CANDIDATE);
  assert.equal(first.record.confidence_band, 'low');

  const second = learnedRecord({ projectId: 'project-2', items: first.items });
  assert.equal(second.outcome, LEARNING_OUTCOME.CANDIDATE_STRENGTHENED);
  assert.equal(second.record.status, KNOWLEDGE_STATUS.STRENGTHENED);
  assert.equal(second.record.confidence_band, 'moderate');
  assert.equal(second.record.seen_projects, 2);

  const third = learnedRecord({ projectId: 'project-3', items: second.items });
  assert.equal(third.outcome, LEARNING_OUTCOME.KNOWLEDGE_LEARNED);
  assert.equal(third.record.status, KNOWLEDGE_STATUS.LEARNED);
  assert.equal(third.record.confidence_band, 'high');
  assert.equal(third.record.seen_projects, 3);
  // A learned record keeps the meaning and the internal references, and no raw wording.
  assert.deepEqual(third.record.raw_answers, []);
  assert.equal(third.record.source_refs.length, 3);
});

test('the same project answering twice never promotes anything', () => {
  const first = learnedRecord({ projectId: 'project-1' });
  const again = learnedRecord({
    projectId: 'project-1',
    answer: 'the middle pair closes the gap between front and rear heights',
    items: first.items,
  });

  assert.equal(again.outcome, LEARNING_OUTCOME.RECORD_UPDATED);
  assert.equal(again.record.status, KNOWLEDGE_STATUS.CANDIDATE);
  assert.equal(again.record.seen_projects, 1);
  assert.equal(again.record.confidence_band, 'low');
});

/* ── 4. A project's own reason overrides learned knowledge ────────────────── */

test("this project's own reason always wins over learned knowledge", () => {
  const { items, record } = promotedRecord();
  const condition = buildDesignCondition({ question: QUESTION });
  assert.equal(record.status, KNOWLEDGE_STATUS.LEARNED);

  const ownAnswer = 'Six overheads were selected here because the room is long and the ceiling steps down at the rear.';
  const resolved = resolveKnowledgeUse({
    items,
    questionId: QUESTION.question_id,
    condition,
    projectAnswer: ownAnswer,
  });

  assert.equal(resolved.use, KNOWLEDGE_USE.PROJECT_ANSWER);
  assert.equal(resolved.rationale, ownAnswer);
  assert.equal(resolved.item, null);

  // A reason already on record for this design governs just as firmly.
  const fromEvidence = resolveKnowledgeUse({
    items,
    questionId: QUESTION.question_id,
    condition,
    projectEvidence: 'The height layer was extended to keep the rear row inside the overhead coverage.',
  });
  assert.equal(fromEvidence.use, KNOWLEDGE_USE.PROJECT_ANSWER);
  assert.match(fromEvidence.rationale, /height layer was extended/);
});

/* ── 5. A learned rationale stops the question being asked again ──────────── */

test('a high-confidence learned rationale is not asked about again', () => {
  const { items } = promotedRecord();
  const gated = applyKnowledgeToQuestions({
    questions: [QUESTION, { question_id: 'subwoofer_arrangement_reason', area: 'subwoofers', question: 'What was the main reason for the four-subwoofer arrangement in this room?' }],
    items,
  });

  // The overhead question is gone; the subwoofer question is untouched.
  assert.deepEqual(gated.questions.map((question) => question.question_id), ['subwoofer_arrangement_reason']);
  assert.equal(gated.learned.length, 1);
  assert.equal(gated.learned[0].question_id, 'overhead_speaker_reason');
  assert.match(gated.learned[0].rationale, /middle pair fill the gap/);

  // The understanding carried into the document is design intent, and says nothing about
  // how it was arrived at: no learning, no confidence, no previous projects, no records.
  const intent = designIntentFor({
    topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
    condition: gated.learned[0].condition,
    rationale: gated.learned[0].rationale,
  });
  assert.match(intent, /^the six-overhead layout is intended to/);
  for (const forbidden of ['learn', 'confidence', 'previous project', 'record', 'training', 'ADI']) {
    assert.ok(!intent.toLowerCase().includes(forbidden.toLowerCase()), `the intent never says "${forbidden}"`);
  }
});

test('a rationale learned for one design condition is not applied to another', () => {
  const { items } = promotedRecord();

  const fourRow = resolveKnowledgeUse({
    items,
    questionId: QUESTION.question_id,
    condition: { rows: 4, overheads: 6, overhead_layout: '.6' },
  });
  assert.equal(fourRow.use, KNOWLEDGE_USE.ASK);

  const fourOverhead = resolveKnowledgeUse({
    items,
    questionId: QUESTION.question_id,
    condition: { rows: 2, overheads: 4, overhead_layout: '.4' },
  });
  assert.equal(fourOverhead.use, KNOWLEDGE_USE.ASK);

  // And where this design does not state the condition at all, nothing is assumed.
  assert.equal(conditionCovers({ rows: 2, overheads: 6 }, {}), false);
  const unstated = resolveKnowledgeUse({ items, questionId: QUESTION.question_id, condition: {} });
  assert.equal(unstated.use, KNOWLEDGE_USE.ASK);
});

/* ── 6. Uncertain knowledge asks, or confirms ─────────────────────────────── */

test('a moderately-confident rationale is offered as a light confirmation', () => {
  const first = learnedRecord({ projectId: 'project-1' });
  const second = learnedRecord({ projectId: 'project-2', items: first.items });
  assert.equal(second.record.confidence_band, 'moderate');

  const gated = applyKnowledgeToQuestions({ questions: [QUESTION], items: second.items });
  assert.deepEqual(gated.questions, []);
  assert.equal(gated.learned.length, 0);
  assert.equal(gated.confirmations.length, 1);

  const confirmation = gated.confirmations[0];
  assert.match(confirmation.confirmation, /^ADI understands the six-overhead layout is intended to/);
  assert.ok(confirmation.intent && confirmation.confirmation.includes(confirmation.intent.replace(/\.$/, '')));
  // The designer can still answer it in their own words: the question is carried with it.
  assert.equal(confirmation.question.question_id, QUESTION.question_id);

  // A single answer is not enough to offer anything: ADI asks.
  const single = applyKnowledgeToQuestions({ questions: [QUESTION], items: first.items });
  assert.deepEqual(single.questions.map((question) => question.question_id), [QUESTION.question_id]);
  assert.deepEqual(single.confirmations, []);
});

test('the confirmation wording is built from the meaning, not from one answer', () => {
  const condition = buildDesignCondition({ question: QUESTION });
  const confirmation = confirmationFor({
    topic: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
    condition,
    rationale: 'For a two-row cinema using a .6 overhead layout, a common rationale is to keep the front and rear overheads respectively ahead of and behind the audience.',
  });
  assert.match(confirmation, /^ADI understands the six-overhead layout is intended to keep the front and rear overheads/);
  assert.ok(!confirmation.includes('common rationale'));
});

/* ── 7. Contradiction lowers confidence and returns to asking ─────────────── */

test('a contradicting answer reduces confidence and ADI asks again', () => {
  const { items } = promotedRecord();
  const disputed = learnedRecord({
    projectId: 'project-4',
    answer: 'Six overheads were selected because the processor supports that channel count and the client asked for it.',
    items,
  });

  assert.equal(disputed.outcome, LEARNING_OUTCOME.CONTESTED);
  assert.equal(disputed.record.contested, true);
  assert.equal(disputed.record.status, KNOWLEDGE_STATUS.CANDIDATE);
  assert.equal(disputed.record.confidence_band, 'low');
  assert.match(disputed.record.contested_answer, /processor supports that channel count/);
  // The designers' disagreement is kept, not resolved by ADI.
  assert.match(disputed.record.canonical_meaning, /middle pair fill the gap/);

  const gated = applyKnowledgeToQuestions({ questions: [QUESTION], items: disputed.items });
  assert.deepEqual(gated.questions.map((question) => question.question_id), [QUESTION.question_id]);
  assert.deepEqual(gated.learned, []);
  assert.deepEqual(gated.confirmations, []);
});

/* ── 8. Project results are not learned ───────────────────────────────────── */

test('project results and constraints are never learned as general rules', () => {
  const cases = [
    ['this room achieved 22 Hz in the front row', /project_result/],
    ['the design reached P19 L4 at the reference seat', /project_result/],
    ['measured 110 dB at the middle row', /project_result/],
  ];
  for (const [answer, reason] of cases) {
    const built = learningCandidateFromAnswer({ question: QUESTION, answer, identity: { projectId: 'project-1' }, now: NOW });
    assert.equal(built.learnable, false, `"${answer}" must not be learned`);
    assert.match(built.reason, reason);
  }

  // A project-specific constraint stays the project's own reason: it is not learned, and
  // it is not thrown away either — it is simply never generalised.
  const constrained = learningCandidateFromAnswer({
    question: QUESTION,
    answer: 'The room is 3.2 m wide, so six overheads were the practical maximum across the front.',
    identity: { projectId: 'project-1' },
    now: NOW,
  });
  assert.equal(constrained.learnable, false);
  assert.match(constrained.reason, /project_specific_constraint/);
});

/* ── 9. No client, personal or commercial detail is learned ───────────────── */

test('budgets, addresses, personal and client detail are never learned', () => {
  const cases = [
    'Six overheads were chosen because the budget was 40 thousand pounds.',
    'The client Mr Harrison wanted six overheads above the seats.',
    'Six overheads were specified for the house at 12 Elm Street.',
    'Six overheads because the owner asked for them: 07700 900123.',
    'Six overheads were chosen as the client confirmed by email at paul@example.com.',
  ];
  for (const answer of cases) {
    const built = learningCandidateFromAnswer({ question: QUESTION, answer, identity: { projectId: 'project-1' }, now: NOW });
    assert.equal(built.learnable, false, `"${answer}" must not be learned`);
    assert.match(built.reason, /personal_or_commercial/);
  }
});

test('a learned record carries no raw wording, and its meaning carries no personal detail', () => {
  const { record } = promotedRecord();
  const serialised = JSON.stringify(record);
  assert.deepEqual(record.raw_answers, []);
  assert.equal(record.contested_answer, null);
  for (const forbidden of ['£', '$', '@', 'Mr ', 'budget', 'Elm Street']) {
    assert.ok(!serialised.includes(forbidden), `learned knowledge never contains "${forbidden}"`);
  }
  // Internal reference only: the projects and designers that taught it, never a name.
  assert.deepEqual([...new Set(record.source_refs.map((ref) => ref.project_id))].sort(), ['project-1', 'project-2', 'project-3']);
  assert.ok(record.source_refs.every((ref) => typeof ref.project_id === 'string' && typeof ref.user_id === 'string'));
});

/* ── 10. A master admin can curate what was learned ───────────────────────── */

test('a master admin can approve, edit, disable, merge and reset a record', () => {
  const { items } = promotedRecord();
  const approvedTarget = items[0];
  const admin = { name: 'Paul' };

  const edited = applyAdminAction({ items, id: approvedTarget.id, action: CURATION_ACTION.EDIT, value: 'Reworded rationale.', admin, now: NOW });
  assert.equal(edited.record.canonical_meaning, 'Reworded rationale.');
  assert.equal(edited.record.admin_edited, true);
  assert.equal(edited.record.admin_edited_by, 'Paul');

  const approved = applyAdminAction({ items: edited.items, id: approvedTarget.id, action: CURATION_ACTION.APPROVE, admin, now: NOW });
  assert.equal(approved.record.status, KNOWLEDGE_STATUS.LEARNED);
  assert.equal(approved.record.confidence_band, 'high');
  assert.equal(approved.record.approved_by, 'Paul');
  assert.deepEqual(approved.record.raw_answers, []);

  const disabled = applyAdminAction({ items: approved.items, id: approvedTarget.id, action: CURATION_ACTION.DISABLE, admin, now: NOW });
  assert.equal(disabled.record.status, KNOWLEDGE_STATUS.DISABLED);
  assert.equal(disabled.record.disabled_by, 'Paul');
  // A disabled matter is not offered, and cannot be re-learned by a later answer.
  const afterDisable = applyKnowledgeToQuestions({ questions: [QUESTION], items: disabled.items });
  assert.deepEqual(afterDisable.learned, []);
  assert.deepEqual(afterDisable.confirmations, []);
  const relearn = learnedRecord({ projectId: 'project-9', items: disabled.items });
  assert.equal(relearn.outcome, LEARNING_OUTCOME.DISABLED);

  const enabled = applyAdminAction({ items: disabled.items, id: approvedTarget.id, action: CURATION_ACTION.ENABLE, admin, now: NOW });
  assert.equal(enabled.record.status, KNOWLEDGE_STATUS.LEARNED);

  const reset = applyAdminAction({ items: enabled.items, id: approvedTarget.id, action: CURATION_ACTION.RESET_CONFIDENCE, admin, now: NOW });
  assert.equal(reset.record.seen_projects, 3);
  assert.equal(reset.record.contested, false);
  assert.equal(reset.record.confidence_band, 'high');
});

test('merging duplicates counts the separate projects of both', () => {
  // Two two-project candidates for the same matter, kept apart by a different condition.
  const left = learnedRecord({ projectId: 'project-1' });
  const leftTwo = learnedRecord({ projectId: 'project-2', items: left.items });
  const right = learnedRecord({ projectId: 'project-3', items: [] });
  const rightTwo = learnedRecord({ projectId: 'project-4', items: right.items });
  const items = [...leftTwo.items, ...rightTwo.items].map((item, index) => ({ ...item, id: `item-${index + 1}` }));
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.status === KNOWLEDGE_STATUS.STRENGTHENED));

  const merged = applyAdminAction({
    items,
    id: items[1].id,
    intoId: items[0].id,
    action: CURATION_ACTION.MERGE,
    admin: { name: 'Paul' },
    now: NOW,
  });

  assert.equal(merged.items.length, 1, 'the duplicate is removed');
  assert.equal(merged.removedId, items[1].id);
  assert.equal(merged.record.seen_projects, 4);
  assert.equal(merged.record.status, KNOWLEDGE_STATUS.LEARNED);
  assert.equal(merged.record.confidence_band, 'high');
  assert.deepEqual(merged.record.merged_from, [items[1].knowledge_key]);
});

test('a curation action on an unknown record is refused with a reason', () => {
  const refused = applyAdminAction({ items: [], id: 'missing', action: CURATION_ACTION.APPROVE });
  assert.equal(refused.outcome, 'refused');
  assert.equal(refused.reason, CURATION_REFUSAL.RECORD_NOT_FOUND);
  const unknown = applyAdminAction({ items: [], id: 'anything', action: 'delete_everything' });
  assert.equal(unknown.reason, CURATION_REFUSAL.UNKNOWN_ACTION);
});

/* ── 11. The learning machinery stays out of a dealer's workflow ──────────── */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the learning machinery is not exposed to a dealer or a client', () => {
  // The curation page is master-admin only, and it is the only place knowledge is shown.
  const app = read('src/App.jsx');
  assert.match(app, /path="\/admin\/adi-design-knowledge" element=\{<AccessGate masterAdmin><AdminAdiDesignKnowledge \/><\/AccessGate>\}/);

  // A dealer's browser never reads the knowledge table and never sees a confidence score:
  // the wizard asks the backend what it understands and is told what to ask.
  const wizardFiles = [
    'src/components/proposal/wizard/useAdiKnowledgeGate.js',
    'src/components/proposal/wizard/adiKnowledgeCapture.js',
    'src/components/proposal/wizard/ClarificationStep.jsx',
    'src/components/proposal/wizard/AdiKnowledgeConfirmation.jsx',
  ];
  for (const file of wizardFiles) {
    const source = read(file);
    assert.ok(!source.includes('AdiDesignKnowledge'), `${file} must not read the knowledge table directly`);
    for (const forbidden of ['confidence', 'confidence_band', 'seen_projects', 'raw_answers', 'source_refs']) {
      assert.ok(!source.includes(forbidden), `${file} must never surface "${forbidden}"`);
    }
  }

  // The admin panel is nowhere near the proposal or report workflow.
  const step = read('src/components/proposal/wizard/ClarificationStep.jsx');
  assert.ok(!step.includes('AdiKnowledgeRow') && !step.includes('useAdiKnowledgeRecords'));
});