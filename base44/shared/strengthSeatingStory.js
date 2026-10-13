/**
 * strengthSeatingStory.js (base44/shared — CANONICAL)
 * --------------------------------------------------
 * RP22 PARAMETER 1 AS A HIGHLIGHT: the seating distance to the room's nearest
 * boundary, and the design reason behind it.
 *
 * WHY IT IS ITS OWN MODULE. It is the one story that is stated on EVERY design
 * whose evidence carries a P1 result, so it cannot live inside the catalogue of
 * ranked strengths without the ranking deciding whether it appears. The mandate,
 * the seating story itself and the ranking order the mandate is applied through
 * are therefore kept together here, beside the catalogue rather than inside it.
 *
 * WHAT IT IS. The measured P1 result is stated as its own published result
 * wherever it is a genuine strength; where it is not, the card explains the design
 * decision behind the seating with no level beside it and claims no positive
 * result at all, and it carries the supporting emphasis it then deserves. The
 * seating decision is the one a client always asks about — whether the seats can
 * be pushed against a wall to keep the floor space — which is why it is never left
 * to the ranking to decide whether it is mentioned.
 *
 * WHERE THE WORDS COME FROM. The approved seating-boundary authority
 * (seatingBoundaryPrinciple), read from this design's OWN seating and room
 * geometry. The explanation is therefore specific to this room, and it states no
 * distance and no level of its own: the card can never contradict the published
 * result beside it, the distance to the nearest boundary is never confused with the
 * distance to the wall behind the seating, and no bass result or measured outcome
 * is ever promised.
 *
 * INTERNAL ONLY. No weight, score, tier or rating reaches a client-facing page.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs.
 */

import { isStrength, levelRank, scopeRank } from './strengthImportance.js';
import { evidence } from './strengthStoryEvidence.js';
import { story } from './strengthStoryShape.js';
import {
  readSeatBoundaryGeometry,
  seatingBoundaryHighlightCopy,
} from './seatingBoundaryPrinciple.js';

/**
 * The highlights a page states on EVERY design that carries the evidence for them,
 * whatever the ranking decides.
 */
export const MANDATORY_STORY_IDS = Object.freeze(['seating-clearance']);

/**
 * The seating clearance highlight — RP22 Parameter 1, the seating distance to the
 * room's nearest boundary.
 *
 * @param {Object} sources — the story-builder sources (seatingPositions/roomDims,
 *   or a prebuilt seatBoundaryGeometry)
 * @param {Object} params
 * @param {Object} params.byKey — the eligible evidence map
 * @returns {Object|null} the story, or null where the design carries no P1 result
 */
export function buildSeatingClearanceStory(sources = {}, { byKey = {} } = {}) {
  const p1 = byKey?.p1;
  if (!p1) return null;

  const geometry = sources.seatBoundaryGeometry
    || readSeatBoundaryGeometry({ seats: sources.seatingPositions, roomDims: sources.roomDims });
  const explanation = seatingBoundaryHighlightCopy(geometry);
  if (!explanation) return null;

  const positive = isStrength(p1.level);
  return story({
    id: 'seating-clearance',
    order: 9,
    title: 'Seating placed clear of the room\'s boundaries',
    category: 'Seating Position',
    members: positive ? [p1] : [],
    level: p1.level ?? null,
    scope: 'seat',
    evidence: [
      evidence(
        'P1',
        positive ? p1.level : null,
        positive && p1.value ? `Nearest room boundary · ${p1.value}` : 'Nearest room boundary',
      ),
    ],
    explanation,
    sources: positive ? ['P1'] : [],
  });
}

/** The canonical ranking order: material, then level, importance, scope, order. */
export const rankComparator = (a, b) => (
  Number(b.material) - Number(a.material)
  || levelRank(b.level) - levelRank(a.level)
  || b.importance - a.importance
  || scopeRank(b.scope) - scopeRank(a.scope)
  || a.order - b.order
);

/**
 * The stories a page states, with the mandatory explanations kept in place: where
 * the ranking or the page's own cap would leave one out, the weakest story that is
 * not mandatory gives up its place instead, and the page still reads strongest
 * first. Nothing is added to the page by this: the mandatory stories answer a
 * question every client asks, and each states its own published result or explains
 * a design decision without claiming one.
 *
 * @param {Object} input
 * @param {Array<Object>} input.ranked — the stories the ranking admitted
 * @param {Array<Object>} input.candidates — every story the evidence offered
 * @param {number} [input.maxStories] — the page's own cap
 * @returns {Array<Object>} the settled stories, in canonical rank order
 */
export function withMandatoryStories({ ranked = [], candidates = [], maxStories = null } = {}) {
  const cap = Number.isFinite(Number(maxStories)) ? Number(maxStories) : null;
  const settled = [...ranked].sort(rankComparator);

  for (const id of MANDATORY_STORY_IDS) {
    if (!settled.some((entry) => entry.id === id)) {
      const mandatory = (Array.isArray(candidates) ? candidates : []).find((entry) => entry.id === id);
      if (!mandatory) continue;
      settled.push(mandatory);
    }
    if (!cap || settled.length <= cap) continue;
    for (let index = settled.length - 1; index >= 0 && settled.length > cap; index -= 1) {
      if (MANDATORY_STORY_IDS.includes(settled[index].id)) continue;
      settled.splice(index, 1);
    }
  }

  return settled.sort(rankComparator);
}

export default buildSeatingClearanceStory;