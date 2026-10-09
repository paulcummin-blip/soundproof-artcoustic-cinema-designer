/**
 * adiHighlightImportance.js
 * -------------------------
 * THE authority that turns the published engineering evidence into the
 * importance weighting the ADI Design Highlights selector ranks by.
 *
 * It reuses the ONE existing canonical importance source — the Artcoustic System
 * Design Rating's own parameter weights (`PARAM_WEIGHTS`, and the published
 * `effectiveWeight` where the publication carries one) — and it creates NO second
 * importance table. Everything derived here is derived from that table:
 *
 *   · a parameter's weight is its published `effectiveWeight`, else its
 *     canonical `PARAM_WEIGHTS` entry;
 *   · a story's importance is the sum of its members' weights (aggregation is
 *     only ever done over evidence that is legitimately grouped);
 *   · a story is MATERIALLY IMPORTANT when that sum clears 60% of the canonical
 *     table's own maximum AND every member is itself an important parameter —
 *     so grouping low-importance results can never inflate a story's rank;
 *   · an evidence item is ELIGIBLE only when it is terminal, authoritative,
 *     non-assumed and non-provisional.
 *
 * INTERNAL ONLY. None of this is ever printed: no weight, no score, no tier and
 * no ASDR language reaches a client-facing page.
 *
 * Pure: no React, no DOM, no side effects.
 */

import { PARAM_WEIGHTS } from '@/components/report/technical/artcousticSystemDesignRating';
import { isTerminalAssessment } from '../../../../shared/assessmentTerminal.js';
import { ASSUMED_FLOOR_EXCLUDED_KEYS } from '@/components/report/technical/designRatingPresentation';

/** The level floor a client-facing strength must reach (L3 or better). */
export const MIN_STRENGTH_LEVEL = 3;

const LEVEL_RANK = Object.freeze({ L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 });

/** The heaviest canonical parameter weight — the anchor for "materially important". */
export const CANONICAL_WEIGHT_MAX = Math.max(...Object.values(PARAM_WEIGHTS));

/** A story is materially important at 60% of the canonical table's own maximum. */
export const MATERIAL_IMPORTANCE = Math.round(CANONICAL_WEIGHT_MAX * 0.6 * 10) / 10;

/** A member of a grouped story must itself be an important parameter. */
export const IMPORTANT_MEMBER_WEIGHT = 5;

/** The adaptive positive-highlight floor for each internal spec tier. */
export const TIER_FLOOR = Object.freeze({ higher: 4, mid: 3, lower: 2 });

/** A tier at or above this floor means the design already has genuine strengths. */
export const MIN_STRONG_STORIES = 4;

/** The page's own target: a full page of genuine strengths. */
export const MIN_HIGHLIGHTS = 5;
export const MAX_HIGHLIGHTS = 7;

/** Every canonical parameter key, in catalogue order. */
export const PARAMETER_KEYS = Object.freeze([...Object.keys(PARAM_WEIGHTS)]);

/** A published level as L1–L4 / FAIL, or null when it is not an assessed level. */
export function levelLabel(level) {
  if (level === 0 || String(level).trim().toUpperCase() === 'FAIL') return 'FAIL';
  const match = /^L?([1-4])$/i.exec(String(level ?? '').trim());
  return match ? `L${match[1]}` : null;
}

/** Where a level sits: L4 strongest, FAIL lowest, unknown −1. */
export function levelRank(level) {
  const label = levelLabel(level);
  return label == null ? -1 : (LEVEL_RANK[label] ?? -1);
}

/** Whether a level reaches the client-facing strength floor. */
export const isStrength = (level) => levelRank(level) >= MIN_STRENGTH_LEVEL;

/** Whether a parameter is a permanent design assumption rather than a result. */
export const isAssumedParameterKey = (key) => ASSUMED_FLOOR_EXCLUDED_KEYS.includes(String(key));

/** The canonical weight of a parameter: published effectiveWeight, else the table. */
export function parameterWeight(key, authority = null) {
  const entry = authority?.[key];
  const published = Number(entry?.effectiveWeight);
  if (Number.isFinite(published) && published > 0) return published;
  const base = Number(entry?.weight);
  if (Number.isFinite(base) && base > 0) return base;
  return Number(PARAM_WEIGHTS[key]) || 0;
}

/** A parameter's importance: is the result terminal, authoritative and measured? */
function isEligibleParameter(key, authority, summary) {
  if (isAssumedParameterKey(key)) return false;
  const entry = authority?.[key];
  if (!entry) return false;
  if (String(entry.state) !== 'scored') return false; // provisional / na never counts
  return isTerminalAssessment(entry, { requireLevel: false });
}

/** One seat-scope parameter's governed result: the weakest assessed seat. */
function seatGovernedLevel(entry) {
  const seats = entry?.seats || {};
  let floor = null;
  let assessed = 0;
  let value = null;
  for (const seatId of Object.keys(seats)) {
    const seat = seats[seatId];
    if (seat?.state !== 'scored') continue;
    const level = levelLabel(seat.level);
    if (level == null) continue;
    assessed += 1;
    if (floor == null || levelRank(level) < levelRank(floor)) {
      floor = level;
      value = seat.valueFormatted ?? seat.formatted ?? null;
    }
  }
  return { level: floor, assessed, value, scope: 'seat' };
}

/** The published value text for a parameter's own result row. */
function publishedValue(summary, id) {
  const row = readRoomResult(summary, id);
  const value = row?.formatted ?? row?.valueFormatted ?? row?.value ?? null;
  return value == null || value === '—' ? null : value;
}

/** The summary's own published room/authority result for a parameter. */
function readRoomResult(summary, id) {
  return summary?.roomResultsByParameter?.[id]
    || summary?.roomResultsByParameter?.[String(id)]
    || null;
}

/**
 * One parameter's governed evidence: its level, its scope, its weight and where
 * it sits. Room-scope parameters use their room result; seat-scope parameters use
 * the weakest assessed seat, so a strength claimed from them holds at every seat
 * that was assessed. P19 is RSP-scoped and is stated as such.
 */
function evidenceFor(summary, key) {
  const authority = summary?.parameterAuthority || {};
  const entry = authority[key];
  if (!entry) return null;
  const id = key === 'screen' ? 'screen' : Number(String(key).replace('p', ''));
  const weight = parameterWeight(key, authority);
  if (!isEligibleParameter(key, authority, summary)) {
    return { key, id, eligible: false, weight, state: entry.state, level: null, scope: entry.scope, assessed: 0, value: null };
  }
  if (entry.scope === 'seat') {
    if (key === 'p19') {
      // P19 is never a seat aggregate: its authority must genuinely state one
      // finished RSP result, and the summary must agree with it.
      const published = levelLabel(readRoomResult(summary, 19)?.level);
      const authorityLevel = levelLabel(entry.level);
      const level = authorityLevel || published;
      return {
        key, id, eligible: level != null, weight, state: entry.state,
        level, scope: 'rsp', assessed: 1, value: publishedValue(summary, 19),
      };
    }
    const governed = seatGovernedLevel(entry);
    return {
      key, id, weight, state: entry.state,
      eligible: governed.level != null,
      level: governed.level,
      scope: 'seat',
      assessed: governed.assessed,
      value: governed.value ?? publishedValue(summary, id),
    };
  }
  const level = levelLabel(entry.level) || levelLabel(readRoomResult(summary, id)?.level);
  return {
    key, id, eligible: level != null, weight, state: entry.state,
    level, scope: 'room', assessed: 0, value: publishedValue(summary, id),
  };
}

/**
 * Every eligible parameter of this publication, with its weight and its governed
 * level, plus the weighted distribution the internal spec tier is read from.
 * Ineligible evidence (provisional, assumed, non-terminal) is excluded from the
 * distribution entirely, so it can neither flatter nor drag the classification.
 */
export function collectEligibleEvidence(summary) {
  const byKey = {};
  const eligible = [];
  const distribution = { totalWeight: 0, byLevel: { L4: 0, L3: 0, L2: 0, L1: 0, FAIL: 0 } };
  for (const key of PARAMETER_KEYS) {
    const evidence = evidenceFor(summary, key);
    if (!evidence) continue;
    byKey[key] = evidence;
    if (!evidence.eligible || evidence.level == null) continue;
    eligible.push(evidence);
    distribution.totalWeight += evidence.weight;
    distribution.byLevel[evidence.level] = (distribution.byLevel[evidence.level] || 0) + evidence.weight;
  }
  const share = (level) => (distribution.totalWeight > 0
    ? (distribution.byLevel[level] || 0) / distribution.totalWeight
    : 0);
  const shareAtOrAbove = (rank) => (distribution.totalWeight > 0
    ? Object.entries(distribution.byLevel)
      .filter(([level]) => levelRank(level) >= rank)
      .reduce((sum, [, weight]) => sum + weight, 0) / distribution.totalWeight
    : 0);
  return {
    byKey,
    eligible,
    distribution: {
      ...distribution,
      shareL4: share('L4'),
      shareL3Plus: shareAtOrAbove(3),
      shareL2Plus: shareAtOrAbove(2),
    },
  };
}

/**
 * The design's internal spec tier — how much of the eligible, weighted evidence
 * sits at each level. INTERNAL ONLY: it decides the adaptive highlight floor and
 * is never printed.
 *
 *   higher  ≥50% of eligible weight at L4        AND ≥75% at L3 or better
 *   mid     ≥50% at L3 or better                 AND ≥75% at L2 or better
 *   lower   otherwise, with the majority of eligible weight at L2 or better
 */
export function classifySpecTier(distribution) {
  if (!distribution || !(distribution.totalWeight > 0)) return null;
  const { shareL4, shareL3Plus, shareL2Plus } = distribution;
  if (shareL4 >= 0.5 && shareL3Plus >= 0.75) return 'higher';
  if (shareL3Plus >= 0.5 && shareL2Plus >= 0.75) return 'mid';
  return shareL2Plus > 0.5 ? 'lower' : 'lower';
}

/** The adaptive floor: the weakest level that may still be a positive highlight. */
export const tierFloor = (tier) => TIER_FLOOR[tier] ?? MIN_STRENGTH_LEVEL;

/** How broad a result is: the widest, most defensible scope ranks highest. */
export function scopeRank(scope) {
  if (scope === 'room') return 4;
  if (scope === 'all-seats') return 3;
  if (scope === 'seat') return 2;
  if (scope === 'row') return 1;
  if (scope === 'rsp') return 1;
  return 0;
}

/** A story's importance: the sum of its members' canonical weights. */
export const storyImportance = (members) => (Array.isArray(members) ? members : [])
  .reduce((sum, member) => sum + (Number(member?.weight) || 0), 0);

/**
 * Whether a story counts as materially important.
 * Its aggregate must clear the material threshold AND every member must itself be
 * an important parameter — grouping low-importance results never inflates a rank.
 */
export function isMaterialStory(members) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  if (list.length === 0) return false;
  if (list.some((member) => (Number(member.weight) || 0) < IMPORTANT_MEMBER_WEIGHT)) return false;
  return storyImportance(list) >= MATERIAL_IMPORTANCE;
}

export default collectEligibleEvidence;