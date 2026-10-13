/**
 * strengthStoryShape.js (base44/shared — CANONICAL)
 * ------------------------------------------------
 * THE SHAPE OF ONE ENGINEERING STRENGTH STORY.
 *
 * `story()` assembles a candidate from the evidence it rests on — its members, its
 * evidence lines and its own client-facing sentence — and derives its importance,
 * its materiality, its scope, its level and its presentation emphasis from those
 * members and nothing else.
 *
 * `emphasise()` keeps a story's importance and its presentation apart: the ranking
 * uses the canonical weight sum, while the card's own emphasis only ever follows
 * how material the story is and what level it reaches. No weight, score, tier or
 * rating is ever displayed anywhere.
 *
 * Split out of strengthStories.js so every story the catalogue and the seating
 * highlight state is built through ONE shape helper instead of two. This file holds
 * no catalogue, no ranking and no copy of its own.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs.
 */

import {
  MIN_STRENGTH_LEVEL,
  levelRank,
  storyImportance,
  isMaterialStory,
} from './strengthImportance.js';

import { sentence } from './strengthStoryEvidence.js';

/**
 * A story's own presentation emphasis, read from how material it is and the level
 * it reaches. Display only: it decides the card's prominence and nothing else.
 */
function emphasise(candidate) {
  if (candidate.material && levelRank(candidate.level) >= 4) return 3;
  if (candidate.material || levelRank(candidate.level) >= MIN_STRENGTH_LEVEL) return 2;
  return 1;
}

/**
 * One candidate story, built from the evidence it rests on.
 *
 * @param {Object} input
 * @param {string} input.id — the story's own canonical id
 * @param {number} input.order — its place in the catalogue
 * @param {string} input.title — the client-facing heading
 * @param {string} input.category — the area it sits in
 * @param {Array<Object>} input.members — the eligible evidence it rests on
 * @param {Array<Object>} input.evidence — its evidence lines
 * @param {string} input.explanation — its own sentence
 * @param {Array<string>} [input.sources] — the parameter ids it states
 * @param {string} [input.scope] — the scope it is stated for
 * @param {string} [input.level] — its own level, where the members do not state one
 * @returns {Object} the candidate story
 */
export function story({ id, order, title, category, members, evidence: lines, explanation, sources, scope, level }) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  const candidate = {
    id,
    order,
    title,
    category,
    members: list,
    importance: storyImportance(list),
    material: isMaterialStory(list),
    evidence: (Array.isArray(lines) ? lines : []).filter(Boolean),
    explanation: sentence(explanation),
    sources: sources || list.map((member) => String(member.key).toUpperCase()),
    scope: scope || list[0]?.scope || 'room',
    level: level || list.reduce(
      (acc, member) => (acc == null || levelRank(member.level) < levelRank(acc) ? member.level : acc),
      null,
    ),
  };
  candidate.weight = emphasise(candidate);
  return candidate;
}

export default story;