/**
 * test/narrative-steer-wiring.test.mjs
 * -------------------------------------
 * THE NARRATIVE STEER, AS A REAL WORKFLOW.
 *
 * The designer's three-state preference over ADI's topics has to survive the whole
 * journey — select a topic, step Next and Back, leave the wizard, resume it, read
 * the review, generate — and arrive at the writer as SOFT preferences that change
 * no evidence. This suite walks exactly that journey, module by module, and checks
 * the two things that are easy to get wrong while doing it:
 *
 *   a preference never becomes a required section; and
 *   an excluded topic is kept out of the copy without touching a single figure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STEER_STATE,
  TOPIC_LIBRARY,
  cycleTopicState,
  steerStateOf,
  steerPayload,
  steerPreferences,
  steerFromPayload,
  presentSteerTopics,
  topicIsSuggested,
  topicLabel,
} from '../src/components/proposal/wizard/narrativeSteer.js';
import {
  buildNarrativeSteerBlock,
  normaliseNarrativeSteer,
} from '../base44/shared/proposalWriter/writerNarrativeSteerRules.js';
import {
  suppressExcludedNarrative,
  resolveExcludedTopics,
} from '../base44/shared/proposalNarrativeExclusions.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Marquee Home / Original Design, as the designer steers it. */
const MARQUEE_STEER = (() => {
  let steer = {};
  for (const key of ['display', 'system_approach', 'screen_tonal', 'bass_extension']) {
    steer = cycleTopicState(steer, key);
  }
  for (const key of ['seating_arrangement', 'screen_dynamic', 'channel_count']) {
    steer = cycleTopicState(cycleTopicState(steer, key), key);
  }
  return steer;
})();

test('every topic names a SUBJECT, and none of them carries a judgement', () => {
  for (const [key, topic] of Object.entries(TOPIC_LIBRARY)) {
    assert.match(topic.label, /\S/, key);
    assert.doesNotMatch(
      topic.label,
      /\b(?:useful|excellent|weak|impressive|exceptional|outstanding|poor|strong)\b/i,
      `${key} must state a subject, not a verdict`,
    );
    assert.doesNotMatch(topic.label, /^(?:explain|show|highlight|emphasise|mention)\b/i, key);
  }
  // The bass subject, in particular: the result decides the strength of the
  // language later, so the topic says only what it is about.
  assert.equal(topicLabel('bass_extension'), 'Bass performance');
  assert.equal(topicLabel('screen_tonal'), 'Tonal consistency');
  assert.equal(topicLabel('channel_count'), 'Discrete channel count');
});

test('the evidence refines a subject without turning it into a claim', () => {
  const topics = presentSteerTopics({
    chips: [
      { label: 'Emphasise the 100 inch TV', reason: 'The television this version states.' },
      { label: 'Explain the 5.1 system layout', reason: 'Channel layout calculated for this version.' },
      { label: 'Highlight the bass extension result', reason: 'Bass extension result for this version: L3 · 25 Hz.' },
      { label: 'Explain the L1 screen timbre result', reason: 'Screen timbre result for this version: L1 · 3.5 dB.' },
    ],
  });
  const byKey = Object.fromEntries(topics.map((topic) => [topic.topic_key, topic]));
  assert.equal(byKey.display.label, '100" TV');
  assert.equal(byKey.system_approach.label, '5.1 system approach');
  assert.equal(byKey.screen_tonal.label, 'Tonal consistency');
  assert.equal(byKey.bass_extension.label, 'Bass performance');
  // The example's own wording is kept as evidence, never as the topic's name.
  assert.match(byKey.bass_extension.evidence_label, /bass extension result/i);
});

test('an unremarkable result is offered without being promoted', () => {
  assert.equal(topicIsSuggested('bass_extension', 'Bass extension result L1 · 22 Hz'), false);
  assert.equal(topicIsSuggested('bass_extension', 'Bass extension result L3 · 25 Hz'), true);
  assert.equal(topicIsSuggested('screen_dynamic', 'Show the L1 Screen Dynamic Range result'), false);
  assert.equal(topicIsSuggested('screen_dynamic', 'Show the L3 Screen Dynamic Range result'), true);
  assert.equal(topicIsSuggested('screen_tonal', 'Explain the L2 screen timbre result'), false);
  // A count is not a story, and the seating is never sold: neither is suggested.
  assert.equal(topicIsSuggested('channel_count', 'Highlight the 9 discrete channels'), false);
  assert.equal(topicIsSuggested('seating_arrangement', 'Explain the seating positions'), false);
});

test('a topic moves neutral → prefer → do not discuss → neutral, and stays where it was put', () => {
  let steer = {};
  assert.equal(steerStateOf(steer, 'bass_extension'), STEER_STATE.NEUTRAL);
  steer = cycleTopicState(steer, 'bass_extension');
  assert.equal(steerStateOf(steer, 'bass_extension'), STEER_STATE.PREFER);
  steer = cycleTopicState(steer, 'bass_extension');
  assert.equal(steerStateOf(steer, 'bass_extension'), STEER_STATE.EXCLUDE);
  // A later click on another topic cannot disturb this one: Next, Back and a
  // resume all rebuild the screen from this map, never from the click order.
  steer = cycleTopicState(steer, 'seating_arrangement');
  assert.equal(steerStateOf(steer, 'bass_extension'), STEER_STATE.EXCLUDE);
  assert.equal(steerStateOf(steer, 'seating_arrangement'), STEER_STATE.PREFER);
  steer = cycleTopicState(steer, 'bass_extension');
  assert.equal(steerStateOf(steer, 'bass_extension'), STEER_STATE.NEUTRAL);
});

test('the steer reaches the generate request, and the review, in subject names', () => {
  const payload = steerPreferences(MARQUEE_STEER);
  assert.deepEqual(payload.preferred_topics, [
    'Display and screen scale',
    'System approach',
    'Tonal consistency',
    'Bass performance',
  ]);
  assert.deepEqual(payload.excluded_topics, [
    'Seating arrangement',
    'Screen dynamic capability',
    'Discrete channel count',
  ]);
  assert.deepEqual(payload.excluded_topic_keys, [
    'seating_arrangement',
    'screen_dynamic',
    'channel_count',
  ]);
  // Nothing sent is an instruction, a sentence, a figure or a section.
  for (const topic of [...payload.preferred_topics, ...payload.excluded_topics]) {
    assert.doesNotMatch(topic, /\.$/, topic);
    assert.doesNotMatch(topic, /\b(?:L[1-4]|dB|Hz)\b/, topic);
  }
});

test('a saved steer comes back from the proposal it shaped, and from a resumed draft', () => {
  const stored = steerPayload(MARQUEE_STEER);
  const restored = steerFromPayload(stored);
  assert.deepEqual(steerPreferences(restored), steerPreferences(MARQUEE_STEER));
  assert.equal(steerStateOf(restored, 'seating_arrangement'), STEER_STATE.EXCLUDE);
  assert.equal(steerStateOf(restored, 'bass_extension'), STEER_STATE.PREFER);
  assert.equal(steerStateOf(restored, 'speaker_positioning'), STEER_STATE.NEUTRAL);
  // A neutral topic is carried for the record, and prints nothing on the review.
  assert.deepEqual(stored.neutral_topics, []);
});

test('the writer receives preferences, with the softness stated in the same breath', () => {
  const block = buildNarrativeSteerBlock(steerPreferences(MARQUEE_STEER));
  assert.equal(block.supplied, true);
  assert.deepEqual(block.preferred_topics, steerPreferences(MARQUEE_STEER).preferred_topics);
  assert.deepEqual(block.excluded_topics, steerPreferences(MARQUEE_STEER).excluded_topics);
  assert.match(block.rule, /INGREDIENTS, NOT A SECTION PLAN/);
  for (const clause of [
    /never write one paragraph per preferred topic/i,
    /never give one a heading/i,
    /may appear briefly, in passing, combined with another point, or not at all/i,
    /ONE coherent story about this cinema/i,
    /never adds a claim/i,
    /the brief is the stronger authority/i,
  ]) {
    assert.match(block.rule, clause);
  }
  // An excluded topic is a rule about copy, and says so.
  assert.match(block.exclude_rule, /COPY|copy/);
  assert.match(block.exclude_rule, /no evidence, no reported result, no table/i);
  // A steer that is preferred and excluded at once cannot happen: exclusion wins.
  // The wizard sends the excluded topic by name AND by key, which is the shape the
  // generation function merges before it reads them.
  const both = normaliseNarrativeSteer({
    preferred_topics: ['Seating arrangement', 'Bass performance'],
    excluded_topics: ['Seating arrangement'],
    excluded_topic_keys: ['seating_arrangement'],
  });
  assert.deepEqual(both.preferred_topics, ['Bass performance']);
  assert.deepEqual(both.excluded_topics, ['seating_arrangement']);
});

test('seating, excluded, leaves the narrative completely — and no figure with it', () => {
  const excluded = steerPreferences(MARQUEE_STEER).excluded_topic_keys;
  const body = [
    '<p>The front row is the primary seat, so the seating geometry puts the reference seat 4.2 m from the screen. ',
    'The boundary clearance of the outer seats is 0.8 m.</p>',
    '<p>Bass performance reaches 25 Hz at L3 across the room, and the tonal consistency between the screen and surround channels is exceptional.</p>',
  ].join('');
  const cleaned = suppressExcludedNarrative(body, { excluded });
  // Every seating subject is gone: positions, geometry, the primary seat, the
  // reference seat and the boundary clearance.
  assert.doesNotMatch(cleaned, /\bseat/i);
  assert.doesNotMatch(cleaned, /P1\b|boundary clearance/i);
  // The copy that was not about seating survives, figure for figure.
  assert.match(cleaned, /25 Hz at L3/);
  assert.match(cleaned, /tonal consistency/);
  // Technical evidence is untouched by exclusion: the same body with nothing
  // excluded is returned exactly as it was written.
  assert.equal(suppressExcludedNarrative(body, { excluded: [] }), body);
  assert.deepEqual(resolveExcludedTopics(['Seating arrangement']), ['seating_arrangement']);
  assert.deepEqual(resolveExcludedTopics(['seating_geometry']), ['seating_geometry']);
});

test('the wizard keeps the steer, and the review shows the two states only', () => {
  const wizard = source('src/components/proposal/CreateProposalWizard.jsx');
  assert.match(wizard, /const \[steer, setSteer\] = useState/);
  assert.match(wizard, /restoredDraft\?\.narrativeSteer/);
  assert.match(wizard, /steerFromPayload\(carried\)/);
  assert.match(wizard, /steer=\{steer\}\s*\n\s*onSteerChange=\{handleSteerChange\}/);
  assert.match(wizard, /narrative_steer: steerPreferences\(steer\)/);
  assert.match(wizard, /<NarrativeSteerReview steer=\{steer\}/);
  // Nothing about the steer is written into the brief.
  assert.doesNotMatch(wizard, /setClientBrief\([^)]*steer/i);
  const preparation = source('src/components/proposal/wizard/useProposalPreparation.js');
  assert.match(preparation, /narrativeSteer: steer,/);
  const review = source('src/components/proposal/wizard/NarrativeSteerReview.jsx');
  assert.match(review, /preferred_topics/);
  assert.match(review, /excluded_topics/);
  assert.doesNotMatch(review, /neutral_topics/);
});

test('the steer is stored with the proposal and handed to the writer', () => {
  const entry = source('base44/functions/generateProposal/entry.ts');
  assert.match(entry, /narrative_steer: narrativeSteerRecord/);
  assert.match(entry, /suppressExcludedNarrative\(body\.html, \{ excluded: excludedNarrativeTopics \}\)/);
  const builder = source('base44/shared/proposalWriter/writerInputBuilder.js');
  assert.match(builder, /narrative_steer: buildNarrativeSteerBlock\(narrativeSteer\)/);
  const prompt = source('base44/shared/proposalWriter/writerPromptBuilder.js');
  assert.match(prompt, /input\.narrative_steer\.rule/);
  assert.match(prompt, /Preferred subjects for this proposal/);
  assert.match(prompt, /Subjects kept out of the client-facing narrative/);
  const runner = source('base44/shared/proposalGeneration/proposalGenerationRunner.js');
  assert.match(runner, /narrativeSteer: proposal\?\.metadata\?\.narrative_steer \|\| null/);
});