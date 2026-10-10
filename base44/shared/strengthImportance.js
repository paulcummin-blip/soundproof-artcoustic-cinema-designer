/**
 * strengthImportance.js (base44/shared — CANONICAL)
 * -------------------------------------------------
 * THE authority that turns published engineering evidence into the importance
 * weighting a strength is ranked by — for the Project Report's ADI Design
 * Highlights page AND for the proposal writer's strength selection. One
 * implementation, two surfaces, so they can never disagree about which results
 * matter.
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
 * Two readers of the same authority are provided, and they produce the identical
 * evidence shape:
 *   · collectEligibleEvidence(summary)            — the live publication object
 *     the report page reads;
 *   · collectEligibleEvidence(summaryFromReportEvidence(reportEvidence)) — the
 *     frozen report evidence a proposal is written from.
 *
 * INTERNAL ONLY. None of this is ever printed: no weight, no score, no tier and
 * no ASDR language reaches a client-facing page or a proposal.
 *
 * Pure: no React, no DOM, no side effects, no runtime-specific APIs. This file IS
 * the canonical implementation; `shared/strengthImportance.js` and
 * `src/shared/strengthImportance.js` are thin re-exports of it.
 */

import { PARAM_WEIGHTS, ASSUMED_PARAMETER_KEYS, SEAT_SCOPED_PARAMETER_KEYS } from './canonicalParameterWeights.js';
import { isTerminalAssessment } from './assessmentTerminal.js';

/**
 * The canonical weight table itself, re-exported for the selector's own
 * consumers (audit panels and tests) so they read the SAME table this module
 * ranks by. It is never copied, and it is never a second table.
 */
export { PARAM_WEIGHTS };

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
export const isAssumedParameterKey = (key) => ASSUMED_PARAMETER_KEYS.includes(String(key));

/** Whether a parameter is assessed per seat rather than once for the room. */
export const isSeatScopedParameterKey = (key) => SEAT_SCOPED_PARAMETER_KEYS.includes(String(key));

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
function isEligibleParameter(key, authority) {
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
  if (!isEligibleParameter(key, authority)) {
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
 * sits at each level. INTERNAL ONLY: it decides the adaptive strength floor and
 * is never printed.
 *
 *   higher  ≥50% of eligible weight at L4        AND ≥75% at L3 or better
 *   mid     ≥50% at L3 or better                 AND ≥75% at L2 or better
 *   lower   otherwise
 */
export function classifySpecTier(distribution) {
  if (!distribution || !(distribution.totalWeight > 0)) return null;
  const { shareL4, shareL3Plus, shareL2Plus } = distribution;
  if (shareL4 >= 0.5 && shareL3Plus >= 0.75) return 'higher';
  if (shareL3Plus >= 0.5 && shareL2Plus >= 0.75) return 'mid';
  return 'lower';
}

/** The adaptive floor: the weakest level that may still be a positive strength. */
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

/* ── The frozen report-evidence reader ─────────────────────────────────────
   A proposal is written from the frozen evidence a saved report states, in a
   different serialisation from the live publication object the report page
   holds. `summaryFromReportEvidence` converts that frozen evidence into the
   SAME canonical summary shape, so the identical selection code runs over it:
   the proposal therefore consumes the same ranked strengths the report does,
   from the same engineering authority, and never from the live project. */

/** A row's stated level. */
const rowLevel = (row) => levelLabel(row?.level ?? row?.achieved_level);

/**
 * A row's terminal state. It is read from the row's OWN frozen `state` — the
 * parameter's canonical design-rating state, frozen beside its result by the
 * capture. Neither the presence of a level nor the completion status of the
 * underlying result row is a substitute for it: a provisional parameter carries
 * both a level and a complete result row, and promoting one to a scored result on
 * either signal is exactly the error this rule exists to prevent. A seat row that
 * states no state of its own falls back to its parent parameter's frozen state; a
 * row that states nothing at all is non-terminal, so it can never be selected as
 * a strength. Only an explicit scored/complete/ok state counts as scored.
 */
function rowState(row, parentState = null) {
  const state = String(row?.state ?? row?.status ?? '').trim().toLowerCase()
    || String(parentState ?? '').trim().toLowerCase();
  if (state === 'na' || state === 'not_applicable') return 'na';
  if (state === 'scored' || state === 'complete' || state === 'ok') return 'scored';
  if (state) return state;
  return 'unavailable';
}

/** The value text a row states. */
const rowValue = (row) => {
  const value = row?.value ?? row?.valueFormatted ?? row?.formatted ?? null;
  return value == null || value === '—' ? null : value;
};

/**
 * The canonical summary shape, rebuilt from one saved report's own evidence.
 *
 * @param {Object} reportEvidence — the frozen `reportEvidence` of a Project Report
 * @returns {Object} a summary the canonical strength authority can read unchanged
 */
export function summaryFromReportEvidence(reportEvidence) {
  const evidence = reportEvidence && typeof reportEvidence === 'object' ? reportEvidence : {};
  const rows = Array.isArray(evidence.parameters) ? evidence.parameters : [];
  const seatScopesAll = evidence.seat_scopes?.all?.parameters || {};
  const parameterAuthority = {};
  const roomResultsByParameter = {};
  const parameterIndex = {};
  const seatResultsByParameter = {};

  for (const row of rows) {
    const id = Number(row?.parameter_id);
    if (!Number.isFinite(id)) continue;
    const key = `p${id}`;
    const level = rowLevel(row);
    // The parameter's own frozen terminal state, read once so every seat row of
    // this parameter falls back to the same authority.
    const parameterState = rowState(row);
    const scope = String(row?.scope || '').toLowerCase();
    // The canonical scope classification: the frozen evidence's own per-parameter
    // scope where it states one, else the canonical seat-scoped set.
    const seatScoped = seatScopesAll?.[key]?.parameter_scope === 'seat'
      || (scope === 'rsp')
      || (scope !== 'room' && isSeatScopedParameterKey(key));
    const seats = {};
    for (const seatRow of (Array.isArray(row?.supporting_per_seat) ? row.supporting_per_seat : [])) {
      const seatId = String(seatRow?.seat_id ?? seatRow?.seatId ?? '');
      if (!seatId) continue;
      const seatLevel = rowLevel(seatRow) || level;
      seats[seatId] = {
        state: rowState(seatRow, parameterState),
        level: seatLevel,
        valueFormatted: rowValue(seatRow),
        isPrimary: seatRow?.priority === 'primary' || seatRow?.isPrimary === true,
        row: seatRow?.row ?? null,
        priority: seatRow?.priority ?? null,
        seatId,
      };
    }
    parameterAuthority[key] = {
      key,
      weight: PARAM_WEIGHTS[key] ?? 0,
      effectiveWeight: PARAM_WEIGHTS[key] ?? 0,
      scope: seatScoped ? 'seat' : 'room',
      state: parameterState,
      level,
      seats: seatScoped ? seats : null,
    };
    // P19 is RSP-only: its published result is the whole of it.
    if (!seatScoped || id === 19) {
      roomResultsByParameter[id] = { level, formatted: rowValue(row), value: rowValue(row) };
    }
    if (seatScoped && Object.keys(seats).length > 0) {
      seatResultsByParameter[key] = Object.values(seats).map((seat) => ({
        seatId: seat.seatId,
        row: seat.row,
        level: seat.level,
        status: seat.state,
        isPrimary: seat.isPrimary === true,
        priority: seat.priority,
        valueFormatted: seat.valueFormatted,
      }));
    }
    // The report's own parameter row, in the shape the published-parameter reader
    // reads it by (key, scope, value, level, per-seat rows).
    parameterIndex[`P${id}`] = {
      ...row,
      scope: seatScoped ? 'project' : 'room',
      supporting_per_seat: Array.isArray(row?.supporting_per_seat) ? row.supporting_per_seat : [],
    };
  }

  // RP23 viewing: the seating the report itself states, one entry per seat.
  const perSeat = (Array.isArray(evidence.seating?.per_seat) ? evidence.seating.per_seat : [])
    .map((seat) => ({
      seat_id: seat?.seat_id ?? seat?.seatId ?? null,
      rp23_level: seat?.rp23_level ?? null,
      horizontal_angle_deg: seat?.horizontal_angle_deg ?? null,
      row: seat?.row ?? null,
    }))
    .filter((seat) => seat.seat_id != null);
  const viewingLevels = perSeat.map((seat) => levelLabel(seat.rp23_level)).filter(Boolean);
  parameterAuthority.screen = {
    key: 'screen',
    weight: PARAM_WEIGHTS.screen ?? 0,
    effectiveWeight: PARAM_WEIGHTS.screen ?? 0,
    scope: 'seat',
    state: viewingLevels.length > 0 ? 'scored' : 'unavailable',
    level: null,
    seats: perSeat.reduce((map, seat) => {
      const level = levelLabel(seat.rp23_level);
      if (level == null) return map;
      map[String(seat.seat_id)] = { state: 'scored', level, valueFormatted: null, row: seat.row };
      return map;
    }, {}),
  };

  return {
    parameterAuthority,
    roomResultsByParameter,
    parameter_index: parameterIndex,
    project: { reportCounts: { seatResultsByParameter } },
    viewing: { available: perSeat.length > 0, per_seat: perSeat },
  };
}

/** The eligible evidence of a frozen report evidence block, read as one summary. */
export function evidenceFromReportEvidence(reportEvidence) {
  return collectEligibleEvidence(summaryFromReportEvidence(reportEvidence));
}

/**
 * One published parameter result, by its RP22 number, in the report's own shape.
 * The frozen evidence's parameter row is the authority; the live summary's room
 * result is the fallback. Nothing is recalculated.
 */
export function readPublishedParameter(summary, id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  const saved = summary?.parameter_index?.[`P${numeric}`];
  const room = summary?.roomResultsByParameter?.[numeric] || summary?.roomResultsByParameter?.[String(numeric)];
  const row = (numeric === 18 && room) ? room : (saved || room);
  const level = levelLabel(row?.level ?? row?.achieved_level);
  if (level == null) return null;
  const value = row?.value ?? row?.valueFormatted ?? row?.formatted ?? null;
  return {
    key: `P${numeric}`,
    id: numeric,
    level,
    value: value == null || value === '—' ? null : value,
    detail: null,
    scope: row?.scope || 'room',
  };
}

export default collectEligibleEvidence;