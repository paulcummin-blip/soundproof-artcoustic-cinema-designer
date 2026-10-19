/**
 * adiDesignKnowledgeMatching.js (shared)
 * --------------------------------------
 * READING TWO ANSWERS AS THE SAME RATIONALE WITHOUT THEM BEING WORDED THE SAME WAY.
 *
 * WHY IT EXISTS. A designer will never phrase a reason twice identically. These
 * three answers all say one thing:
 *
 *   "middle overheads fill the gap"
 *   "the middle pair closes the gap between front and rear heights"
 *   "with two rows the middle pair prevents too much separation between the front
 *    and rear overheads"
 *
 * Matching on wording would treat them as three unrelated answers and the rationale
 * would never be learned. Matching on MEANING clusters them.
 *
 * HOW IT READS MEANING. Every topic has its own families of meaning — a front/rear
 * envelope, a middle pair closing a gap, continuity through the height layer, a
 * processor's channel limit, a room's own length. An answer is read into the
 * families it expresses, and two answers are the same rationale when their families
 * substantially overlap (Jaccard). Where a topic has no family for what was said at
 * all, the content words are compared instead, so an unfamiliar but repeated idea
 * still clusters rather than being lost.
 *
 * WHAT IT NEVER DOES. It never rewrites, scores, approves or stores an answer, and
 * it never invents a reason: a cluster is only ever built from answers a designer
 * actually gave. It does not decide promotion — that is the learning authority's
 * job — and it holds no threshold that could turn one answer into a rule.
 *
 * Pure: no React, no SDK, no writes.
 */

import { KNOWLEDGE_TOPIC, conditionKey } from './adiDesignKnowledgeModel.js';

/**
 * The families of meaning per topic. Each family is a set of words and phrases that
 * express it; an answer expresses the family when any of them is present.
 */
const CONCEPT_KEYWORDS = Object.freeze({
  [KNOWLEDGE_TOPIC.OVERHEAD_COUNT]: Object.freeze({
    front_rear_envelope: [
      'front', 'forward', 'ahead of', 'in front of the audience', 'outside the audience',
      'behind', 'rear', 'back of the audience', 'beyond the audience', 'whole audience',
    ],
    middle_fills_gap: [
      'middle', 'centre pair', 'center pair', 'mid pair', 'gap', 'fills', 'fill the',
      'closes', 'close the', 'bridge', 'between them', 'between the front', 'in between',
    ],
    continuity: [
      'continuity', 'continuous', 'seamless', 'smooth', 'even', 'transition', 'no hole',
      'across the room', 'through the layer', 'height layer',
    ],
    separation_control: ['separation', 'too much separation', 'distance between', 'far apart', 'too far', 'spacing'],
    coverage: ['coverage', 'every seat', 'all seats', 'across the seats', 'each row', 'both rows'],
    processor_capability: ['processor', 'decoder', 'channel count', 'capability', 'hardware', 'avr', 'codec'],
  }),
  [KNOWLEDGE_TOPIC.SUBWOOFER_ARRANGEMENT]: Object.freeze({
    front_rear_symmetry: ['front and rear', 'front/rear', 'symmetry', 'symmetrical', 'opposing', 'both ends', 'front and back'],
    seat_to_seat_consistency: ['consistency', 'consistent', 'even across', 'seat to seat', 'every seat', 'uniform', 'smooth bass'],
    room_mode_control: ['mode', 'modal', 'nodes', 'nulls', 'cancellation', 'peaks', 'room response', 'standing wave'],
    acoustic_load: ['headroom', 'load', 'share the', 'output', 'capability', 'strain', 'distortion'],
  }),
  [KNOWLEDGE_TOPIC.SEATING_PRIORITY]: Object.freeze({
    sightline: ['sightline', 'sight line', 'view to the screen', 'unobstructed', 'clear view', 'line of sight'],
    viewing_angle: ['angle', 'field of view', 'fov', 'viewing distance', 'sweet spot', 'geometry'],
    comfort: ['comfort', 'comfortable', 'relaxed', 'recline', 'legroom', 'easiest'],
    immersion: ['immersion', 'immersive', 'surround', 'envelop', 'effect', 'impact'],
    access: ['access', 'walkway', 'aisle', 'entry', 'door', 'step', 'practical'],
  }),
  [KNOWLEDGE_TOPIC.ACOUSTIC_TREATMENT]: Object.freeze({
    early_reflections: ['first reflection', 'early reflection', 'front wall', 'side wall', 'specular', 'mirror point'],
    reverberation_control: ['reverberation', 'rt60', 'rt 60', 'decay', 'echo', 'live room', 'lively'],
    clarity: ['clarity', 'intelligibility', 'dialogue', 'speech', 'detail', 'muddy', 'boxy'],
    diffusion: ['diffusion', 'diffuse', 'disperse', 'scatter', 'abfuser', 'keep the room alive'],
  }),
});

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'that', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'so', 'as', 'at', 'by', 'from', 'it', 'its', 'they',
  'them', 'their', 'we', 'our', 'you', 'your', 'i', 'would', 'will', 'can', 'could', 'should', 'because',
  'which', 'when', 'where', 'while', 'than', 'then', 'there', 'here', 'have', 'has', 'had', 'do', 'does',
  'did', 'not', 'no', 'yes', 'but', 'if', 'also', 'more', 'most', 'much', 'very', 'just', 'only', 'into',
  'over', 'under', 'about', 'between', 'across', 'through', 'allow', 'allows', 'allowed', 'make', 'makes',
  'made', 'get', 'gets', 'give', 'gives', 'need', 'needs', 'want', 'wants', 'use', 'using', 'used',
]);

/** The two similarity floors. Substantial overlap in meaning, or in the words themselves. */
export const SIMILARITY = Object.freeze({
  CONCEPT: 0.5,
  TOKENS: 0.45,
});

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The meaning families one answer expresses, as sorted concept keys. */
export function conceptsOf(answer, topic = null) {
  const text = normalise(answer);
  if (!text) return [];
  const families = CONCEPT_KEYWORDS[topic] || {};
  const found = [];
  for (const [concept, keywords] of Object.entries(families)) {
    if (keywords.some((keyword) => text.includes(normalise(keyword)))) found.push(concept);
  }
  return found.sort();
}

/** The content words of an answer: what is left once the grammar is taken out. */
export function contentTokens(answer) {
  return Array.from(new Set(normalise(answer)
    .split(/[^a-z0-9./-]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))));
}

/** Jaccard overlap of two lists read as sets. */
export function overlap(a = [], b = []) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * How alike two answers are: their shared meaning first, their shared words second.
 * A concept match is the stronger reading — it is the same rationale said differently.
 */
export function answersAlike(left = {}, right = {}) {
  const conceptScore = overlap(left.concepts || [], right.concepts || []);
  const tokenScore = overlap(left.tokens || [], right.tokens || []);
  return {
    conceptScore,
    tokenScore,
    alike: conceptScore >= SIMILARITY.CONCEPT || tokenScore >= SIMILARITY.TOKENS,
  };
}

/** One answer read for clustering: its meaning, its words, and the project it came from. */
export function readAnswer({ answer = null, topic = null, projectId = null, userId = null, at = null } = {}) {
  return {
    answer: String(answer || '').trim(),
    topic,
    projectId: projectId || null,
    userId: userId || null,
    at: at || null,
    concepts: conceptsOf(answer, topic),
    tokens: contentTokens(answer),
  };
}

/**
 * THE MEANING A GROUP OF ANSWERS SHARES: the concepts most of them expressed.
 * These are what the canonical rationale is composed from, so it states what the
 * designers actually meant rather than what any one of them wrote.
 */
export function sharedConcepts(answers = [], topic = null) {
  const list = Array.isArray(answers) ? answers : [];
  if (list.length === 0) return [];
  const counts = new Map();
  for (const entry of list) {
    const concepts = (entry.concepts || conceptsOf(entry.answer, topic));
    for (const concept of concepts) counts.set(concept, (counts.get(concept) || 0) + 1);
  }
  const threshold = Math.max(1, Math.ceil(list.length / 2));
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([concept]) => concept);
}

/**
 * CLUSTER ANSWERS BY MEANING. Answers are only ever clustered inside one topic and
 * one design condition, so a reason given for a two-row .6 layout is never merged
 * with a reason given for a four-row .4 layout.
 *
 * @returns {Array<{knowledge_key, topic, condition_key, concepts, answers, projects}>}
 */
export function clusterAnswers(entries = [], topic = null) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => (entry?.concepts ? entry : readAnswer({ ...entry, topic: entry?.topic || topic })))
    .filter((entry) => entry.answer && entry.topic);
  const byCondition = new Map();
  for (const entry of list) {
    const key = `${entry.topic}::${conditionKey(entry.condition || {})}`;
    if (!byCondition.has(key)) byCondition.set(key, []);
    byCondition.get(key).push(entry);
  }

  const clusters = [];
  for (const [key, group] of byCondition.entries()) {
    const buckets = [];
    for (const entry of group) {
      const bucket = buckets.find((candidate) => candidate.answers
        .some((existing) => answersAlike(existing, entry).alike));
      if (bucket) bucket.answers.push(entry);
      else buckets.push({ key, topic: entry.topic, condition: entry.condition || {}, answers: [entry] });
    }
    for (const bucket of buckets) {
      clusters.push({
        knowledge_key: key,
        topic: bucket.topic,
        condition: bucket.condition,
        condition_key: conditionKey(bucket.condition),
        answers: bucket.answers,
        concepts: sharedConcepts(bucket.answers, bucket.topic),
        projects: Array.from(new Set(bucket.answers.map((entry) => entry.projectId).filter(Boolean))),
      });
    }
  }
  return clusters;
}

export default {
  SIMILARITY,
  conceptsOf,
  contentTokens,
  overlap,
  answersAlike,
  readAnswer,
  sharedConcepts,
  clusterAnswers,
};