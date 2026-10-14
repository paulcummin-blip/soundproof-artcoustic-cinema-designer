/**
 * seatScopeNarrativeAuthority.js (base44/shared — CANONICAL)
 * ----------------------------------------------------------
 * THE rules for the two parameters whose meaning a level cannot decide on its own.
 *
 * WHY THEY ARE SEPARATE. Every other parameter's narrative role is read from its
 * importance, its result and the brief. These two are different:
 *
 *   P20 — BASS SEAT-TO-SEAT CONSISTENCY. Its meaning depends on WHICH SEATS the
 *   result holds for. The same L3 is a headline where every seat is consistent and
 *   a narrowly-scoped statement where only the primary seats are — so it is read
 *   from the seat results, and every sentence it earns names the seats it is true
 *   of. A weak result is never dressed up, and an all-seat claim is never made from
 *   a primary-seat result.
 *
 *   P1 — SEATING DISTANCE FROM BOUNDARIES. This is a physical DESIGN DECISION, not
 *   a score: clients and installers ask why the seats are not against the back
 *   wall. So it is available to the proposal narrative as DESIGN RATIONALE whether
 *   its RP22 level is high or low, in plain client language, and it is never
 *   presented as a result to celebrate.
 *
 * BOTH ARE SILENCED BY THE DEALER'S OWN STEER. Where the designer marks the seating
 * subject do-not-discuss, the seating decision, its rationale, the clearance
 * explanation, the primary/secondary seat discussion and the seating geometry are
 * all suppressed together — for rooms whose seating the Sound Proof seat model
 * does not describe (an irregular or L-shaped sofa, for example). Technical
 * evidence is untouched in every case.
 *
 * Pure: no React, no SDK, no storage, no side effects, no calculation. The levels
 * it reads are the published ones; it grades nothing.
 */

import { levelLabel, levelRank } from './strengthImportance.js';
import { BRIEF_RELEVANCE } from './briefRelevance.js';
import {
  NARRATIVE_PRIORITY,
  mayAppearInNarrative,
} from './narrativeRoles.js';

/* ── Seat readings ────────────────────────────────────────────────────────── */

/** Which seats a claim is made for. There is no fourth state. */
export const SEAT_SCOPE = Object.freeze({ ALL: 'all', PRIMARY: 'primary', NONE: 'none' });

/** A seat row's own priority, read from its own authority and never guessed. */
function seatIsPrimary(seat) {
  if (seat?.isPrimary === true) return true;
  if (seat?.isPrimary === false) return false;
  const priority = String(seat?.priority ?? '').trim().toLowerCase();
  if (priority === 'primary') return true;
  if (priority === 'secondary') return false;
  return null;
}

/**
 * The assessed results of a seat-scoped parameter: the weakest PRIMARY result, the
 * weakest SECONDARY result and the weakest result across every assessed seat. Read
 * from the seats' own published authority. A seat that states no priority of its own
 * is counted in the all-seat reading only — the primary / secondary split is never
 * invented, and a seat that is not scored has no result to read.
 *
 * @param {Object} summary — a published engineering summary, or one rebuilt from
 *   frozen report evidence (summaryFromReportEvidence)
 * @param {string} key — the parameter key (e.g. 'p20')
 * @returns {{all, primary, secondary, assessed, primaryAssessed, secondaryAssessed, split}}
 */
export function readSeatScope(summary, key) {
  const seats = summary?.parameterAuthority?.[key]?.seats || null;
  if (!seats) {
    return { all: null, primary: null, secondary: null, assessed: 0, primaryAssessed: 0, secondaryAssessed: 0, split: false };
  }
  const weakest = (levels) => levels.reduce(
    (acc, level) => (acc == null || levelRank(level) < levelRank(acc) ? level : acc),
    null,
  );
  const all = [];
  const primary = [];
  const secondary = [];
  for (const seatId of Object.keys(seats)) {
    const seat = seats[seatId];
    if (seat?.state !== 'scored') continue;
    const level = levelLabel(seat.level);
    if (level == null) continue;
    all.push(level);
    const isPrimary = seatIsPrimary(seat);
    if (isPrimary === true) primary.push(level);
    else if (isPrimary === false) secondary.push(level);
  }
  return {
    all: weakest(all),
    primary: weakest(primary),
    secondary: weakest(secondary),
    assessed: all.length,
    primaryAssessed: primary.length,
    secondaryAssessed: secondary.length,
    split: primary.length > 0 && secondary.length > 0,
  };
}

/**
 * The per-parameter scoped levels the FROZEN scoped summary states, keyed by
 * parameter ('p20' → { all, primary, secondary, seat_count }).
 *
 * This is the authoritative seat reading wherever the saved reports state a result
 * for each scope: the per-seat assessment rows can be silent about which seats the
 * client actually uses, and a scope level the reports state is never re-derived
 * from a weaker row. A scope with no stated level is absent rather than guessed, and
 * a scope holding fewer than the minimum seats is left to the claim authority that
 * already guards it.
 *
 * @param {Object|null} scopes — the saved evidence's own `seat_scopes` block
 * @returns {Object} map of parameter key → { all, primary, secondary, seat_count }
 */
export function readScopedSeatLevels(scopes = null) {
  const out = {};
  if (!scopes || typeof scopes !== 'object') return out;
  for (const scope of [SEAT_SCOPE.ALL, SEAT_SCOPE.PRIMARY, SEAT_SCOPE.SECONDARY]) {
    const block = scopes[scope] || null;
    if (block?.available !== true) continue;
    const seatCount = Number(block.seat_count);
    for (const [key, parameter] of Object.entries(block.parameters || {})) {
      const level = /^L[1-4]$/.test(String(parameter?.level ?? '')) ? String(parameter.level) : null;
      if (!level) continue;
      const entry = out[key] || { all: null, primary: null, secondary: null, seat_count: {} };
      entry[scope] = level;
      if (Number.isFinite(seatCount)) entry.seat_count[scope] = seatCount;
      out[key] = entry;
    }
  }
  return out;
}

/* ── P20 · bass seat-to-seat consistency ──────────────────────────────────── */

/**
 * P20's narrative role, read from the seat results and this project's brief.
 *
 * RULES, in this order:
 *   · every assessed seat at L2 or better → a strong candidate for the whole
 *     seating, with the wording scaled by the achieved level;
 *   · the primary seats at L2 or better while other seats do not reach it →
 *     discussable for the PRIMARY seating area only, and the wording must say so;
 *   · the primary seats at L3/L4 → this design may lead with it, for the primary
 *     seating area;
 *   · every assessed seat at L1 → technical evidence only: no positive consistency
 *     language is manufactured, and the result stays in the evidence. It is stated
 *     only where an explicit comparison or trade-off the client is deciding between
 *     requires it.
 *
 * Where the seating is itself steered do-not-discuss, the seat split is not used at
 * all: only an all-seat result may be stated, and no seat-scope discussion is
 * raised.
 */
export function p20NarrativePriority({
  allLevel = null,
  primaryLevel = null,
  relevance = BRIEF_RELEVANCE.STANDARD,
  excluded = false,
  seatScopeAllowed = true,
  split = true,
  comparison = false,
} = {}) {
  if (excluded) {
    return {
      priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS,
      seat_scope: SEAT_SCOPE.NONE,
      reason: 'the designer marked this subject do not discuss, which overrides every other consideration',
    };
  }
  if (relevance === BRIEF_RELEVANCE.NONE) {
    return {
      priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY,
      seat_scope: SEAT_SCOPE.NONE,
      reason: 'this project contains no bass evidence for this subject',
    };
  }

  const all = levelLabel(allLevel);
  const allRank = levelRank(all);
  const primary = seatScopeAllowed && split ? levelLabel(primaryLevel) : null;

  if (all != null && allRank >= 2) {
    return {
      priority: allRank >= 3 ? NARRATIVE_PRIORITY.LEAD_STORY : NARRATIVE_PRIORITY.WORTH_MENTIONING,
      seat_scope: SEAT_SCOPE.ALL,
      reason: allRank >= 3
        ? `every assessed seat reaches ${all} — a bass consistency result this design can lead with`
        : `every assessed seat reaches ${all} — a positive consistency result that is not this design's headline`,
    };
  }

  if (primary != null && levelRank(primary) >= 2) {
    return {
      priority: levelRank(primary) >= 3 ? NARRATIVE_PRIORITY.LEAD_STORY : NARRATIVE_PRIORITY.WORTH_MENTIONING,
      seat_scope: SEAT_SCOPE.PRIMARY,
      reason: `the primary seats reach ${primary} while other seats do not: stated for the primary seating area only, and never as a room-wide claim`,
    };
  }

  if (comparison) {
    return {
      priority: NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE,
      seat_scope: SEAT_SCOPE.NONE,
      reason: 'bass consistency is weak across the assessed seats: stated only where the comparison or trade-off the client is deciding between requires it',
    };
  }

  return {
    priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY,
    seat_scope: SEAT_SCOPE.NONE,
    reason: all != null
      ? `bass consistency is ${all} across the assessed seats: technical evidence, and never claimed as a positive result`
      : 'no bass consistency result is published across the assessed seats',
  };
}

/**
 * The APPROVED consistency language, by scope. The achieved level chooses the
 * strength of the words and the scope chooses the seats they are true of: a claim is
 * never made wider than the result that earned it.
 */
export const P20_CONSISTENCY_LANGUAGE = Object.freeze({
  [SEAT_SCOPE.ALL]: Object.freeze({
    L2: 'good bass consistency across the seating',
    L3: 'very strong bass consistency, with noticeably more even low-frequency performance across the seats',
    L4: 'exceptional seat-to-seat bass consistency, allowing the low-frequency balance to remain remarkably even across the listening area',
  }),
  [SEAT_SCOPE.PRIMARY]: Object.freeze({
    L2: 'The primary seats achieve good bass consistency, helping the low-frequency balance remain much more even across the main listening positions.',
    L3: 'The primary seats achieve very strong bass consistency, with noticeably more even low-frequency performance across the main listening positions.',
    L4: 'The primary seats achieve exceptional seat-to-seat bass consistency, allowing the low-frequency balance to remain remarkably even across the main listening positions.',
  }),
});

/** The approved consistency sentence for a level at its OWN scope, or null. */
export function p20ConsistencyPhrase({ level = null, scope = SEAT_SCOPE.NONE } = {}) {
  const label = levelLabel(level);
  if (label == null) return null;
  return P20_CONSISTENCY_LANGUAGE[scope]?.[label] || null;
}

/** The seats a claim may name, as a plain phrase, or null. */
export const p20SeatScopeLabel = (scope) => (scope === SEAT_SCOPE.PRIMARY
  ? 'primary seats'
  : scope === SEAT_SCOPE.ALL ? 'assessed seating' : null);

/** The seat-scoped phrasing an all-seat claim may use, and what no claim may say. */
const SEAT_WIDE_TERMS = Object.freeze([
  'across the seating', 'across the seats', 'across the listening area', 'seat-to-seat', 'seat to seat',
]);
const ROOM_WIDE_TERMS = Object.freeze([
  'across the room', 'throughout the room', 'across the whole room', 'across every seat', 'across all seats',
]);

/**
 * Whether a consistency sentence is safe to state at the scope it was earned for:
 * a primary-seat claim must name the primary seats and may never claim the room, and
 * an all-seat claim must speak about the seating rather than the room.
 */
export function p20WordingIsScopeSafe(text, scope) {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  const roomWide = ROOM_WIDE_TERMS.some((term) => value.includes(term));
  if (scope === SEAT_SCOPE.PRIMARY) {
    return /primary seat|main listening position/.test(value) && !roomWide;
  }
  if (scope === SEAT_SCOPE.ALL) {
    return SEAT_WIDE_TERMS.some((term) => value.includes(term)) && !roomWide;
  }
  return false;
}

/* ── P1 · the seating decision, stated as design rationale ────────────────── */

/**
 * The approved seating rationale, in plain client language. It explains why the
 * seating sits where it sits: no RP22 parameter number, no boundary-interference
 * mathematics, no distance quoted for its own sake, and no promise about bass.
 */
export const P1_RATIONALE_LANGUAGE = Object.freeze({
  decision: 'The seating has deliberately been kept away from the rear wall. That gives the system more room to work properly around the listeners, and helps avoid placing the audience in one of the most difficult parts of the room for bass.',
  question: 'One of the less obvious design decisions is the space behind the seating. Pushing the sofa against the rear wall may recover floor area, but it usually makes both bass behaviour and the relationship with the surrounding loudspeakers harder to control.',
  principle: 'The clearance behind the seating is a deliberate part of the design rather than leftover floor space.',
});

/** What a seating rationale may never contain. */
export const P1_RATIONALE_BANNED_TERMS = Object.freeze([
  'p1', 'rp22', 'parameter 1', 'parameter-1', 'boundary interference', 'equation', 'formula',
  'mode', 'modal', 'wavelength', 'null', 'db', 'hz', 'guarantee', 'guaranteed', 'ensure good bass',
]);

const escapeTerm = (term) => String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a seating rationale may reach a client: no parameter, no equation, no promise. */
export function p1RationaleIsClientSafe(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return !P1_RATIONALE_BANNED_TERMS.some((term) => new RegExp(`\\b${escapeTerm(term)}\\b`, 'i').test(value));
}

/**
 * P1's narrative role. Its relevance comes from the DESIGN DECISION and not from its
 * RP22 level: a client asks why the seats are not against the wall, so the
 * explanation is available to the proposal narrative whether the result reached L1
 * or L4. It is never a performance headline, and it is silenced entirely when the
 * designer steers the seating subject do-not-discuss.
 */
export function p1NarrativePriority({
  level = null,
  relevance = BRIEF_RELEVANCE.STANDARD,
  excluded = false,
  deliberate = true,
  seatingSuppressed = false,
} = {}) {
  if (excluded || seatingSuppressed) {
    return {
      priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS,
      reason: 'the designer marked the seating subject do not discuss: the seating decision, its rationale, the clearance explanation and every seat-scope claim are suppressed, and the technical evidence is untouched',
    };
  }
  if (relevance === BRIEF_RELEVANCE.NONE) {
    return {
      priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY,
      reason: 'this project states no seating arrangement for the design to explain',
    };
  }
  if (!deliberate && levelLabel(level) == null) {
    return {
      priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY,
      reason: 'nothing in this design states a deliberate seating clearance to explain',
    };
  }
  return {
    priority: NARRATIVE_PRIORITY.DESIGN_RATIONALE,
    reason: 'a deliberate physical design decision the client and the installer ask about: explained as the reason for the arrangement, never celebrated as a result',
  };
}

/** The approved rationale sentence for a role that may appear in the narrative. */
export function p1RationalePhrase(priority, { key = 'decision' } = {}) {
  if (!mayAppearInNarrative(priority)) return null;
  return P1_RATIONALE_LANGUAGE[key] || P1_RATIONALE_LANGUAGE.decision;
}

/** The steering topics whose authority is the seating decision itself. */
export const SEATING_SUBJECT_TOPIC_KEYS = Object.freeze(['seating_arrangement', 'seating_geometry']);

/** Whether the seating narrative is silenced by this project's steering. */
export const seatingNarrativeSuppressed = (suppressedAreas = []) => (Array.isArray(suppressedAreas) ? suppressedAreas : [])
  .includes('client_experience');

export default p20NarrativePriority;