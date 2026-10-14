/**
 * narrativePriorityAuthority.js (base44/shared — CANONICAL)
 * ---------------------------------------------------------
 * WHICH RESULTS THE PROPOSAL SHOULD ACTUALLY TALK ABOUT.
 *
 * WHY IT EXISTS. Achieved RP22 level alone was being used to decide what the
 * proposal discusses, which is incomplete: not every parameter carries equal
 * importance, and the same result means something different in a straightforward
 * media lounge and in a reference-grade dedicated cinema. This authority classifies
 * every parameter ONCE, from three inputs, and every narrative surface reads the
 * result:
 *
 *   1. ASDR importance — the existing canonical weight table, read through
 *      strengthImportance.parameterWeight (the published effectiveWeight where the
 *      publication carries one). NO weight is created here and none is changed;
 *   2. the achieved result — the eligible, terminal level of the published
 *      evidence, read through the existing strength evidence reader;
 *   3. brief relevance — from briefRelevance.js, three plain states.
 *
 * THE ORDER IS THE WHOLE POINT, and it is enforced here rather than left to each
 * caller: a topic must first be important, then relevant to this brief, then worth
 * discussing — and only then does the achieved level decide how strong the language
 * may be (performancePhrase is reached only through phraseAfterRelevance, which
 * refuses a topic that has not earned narrative relevance). An L4 never creates a
 * headline by itself.
 *
 * INTERNAL ONLY. No weight, no contribution, no tier and no priority is ever
 * printed in a client-facing document: the classes are for ADI's own selection and
 * for the designer-facing Expert View.
 *
 * Pure: no React, no SDK, no storage, no side effects, no recalculation.
 */

import { LEVEL_MULTIPLIERS } from './canonicalParameterWeights.js';
import {
  IMPORTANT_MEMBER_WEIGHT,
  MATERIAL_IMPORTANCE,
  PARAMETER_KEYS,
  collectEligibleEvidence,
  isAssumedParameterKey,
  levelLabel,
  levelRank,
  parameterWeight,
} from './strengthImportance.js';
import { BRIEF_RELEVANCE, readBriefRelevance } from './briefRelevance.js';
import { PERFORMANCE_AREAS, performancePhrase } from './performanceLanguageAuthority.js';
// The role vocabulary is shared (narrativeRoles.js) and so are the rules for the
// two parameters a level cannot describe on its own (seatScopeNarrativeAuthority.js).
import {
  NARRATIVE_PRIORITY,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  isNarrativeCandidate,
  mayAppearInNarrative,
  mayUseFlagshipLanguage,
} from './narrativeRoles.js';
import {
  SEAT_SCOPE,
  p1NarrativePriority,
  p1RationalePhrase,
  p20ConsistencyPhrase,
  p20NarrativePriority,
  readScopedSeatLevels,
  readSeatScope,
} from './seatScopeNarrativeAuthority.js';

export {
  NARRATIVE_PRIORITY,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  isNarrativeCandidate,
  mayAppearInNarrative,
  mayUseFlagshipLanguage,
};
export {
  P1_RATIONALE_BANNED_TERMS,
  P1_RATIONALE_LANGUAGE,
  P20_CONSISTENCY_LANGUAGE,
  SEATING_SUBJECT_TOPIC_KEYS,
  SEAT_SCOPE,
  p1NarrativePriority,
  p1RationaleIsClientSafe,
  p1RationalePhrase,
  p20ConsistencyPhrase,
  p20NarrativePriority,
  p20SeatScopeLabel,
  p20WordingIsScopeSafe,
  readSeatScope,
  seatingNarrativeSuppressed,
} from './seatScopeNarrativeAuthority.js';

/* The six narrative roles — lead story, worth mentioning, design rationale,
   supporting evidence, technical only, do not discuss — and where each sits are
   defined ONCE in narrativeRoles.js and re-exported above. */

/** The importance tiers, read from the existing authority's own thresholds. */
export const WEIGHT_TIER = Object.freeze({ HIGH: 'high', MID: 'mid', LOW: 'low' });

/**
 * A parameter's importance tier, derived from the canonical table's own two
 * thresholds: HIGH is the design's material threshold, MID the weight a grouped
 * story requires of each member, LOW everything beneath it.
 */
export function weightTier(weight) {
  const value = Number(weight) || 0;
  if (value >= MATERIAL_IMPORTANCE) return WEIGHT_TIER.HIGH;
  if (value >= IMPORTANT_MEMBER_WEIGHT) return WEIGHT_TIER.MID;
  return WEIGHT_TIER.LOW;
}

/**
 * The narrative class of one parameter.
 *
 * Do not discuss overrides everything. A design assumption is never a story. A
 * subject the design does not contain, or a result that is not terminal, is
 * technical evidence only. Then importance and brief relevance decide whether the
 * result is worth discussing, and only the class decides how strong the language
 * may be.
 *
 * @param {Object} input
 * @param {string} input.key — the parameter key (p1..p21, screen)
 * @param {number} input.weight — the canonical ASDR weight
 * @param {string|null} input.level — the achieved, terminal level
 * @param {string} [input.relevance] — brief relevance of the parameter's area
 * @param {boolean} [input.excluded] — the designer marked this subject do not discuss
 * @param {boolean} [input.designRationale] — this design states a deliberate
 *   seating clearance (P1): a physical decision to explain, not a score to celebrate
 * @param {Object} [input.seats] — the seat readings of a seat-scoped parameter:
 *   { all, primary, secondary, split, scopeAllowed } (see readSeatScope)
 * @param {boolean} [input.comparison] — the client is explicitly choosing between
 *   options, so a weak consistency result may be stated as a trade-off
 * @returns {{priority: string, reason: string, tier: string}}
 */
export function parameterNarrativePriority({
  key,
  weight,
  level,
  relevance = BRIEF_RELEVANCE.STANDARD,
  excluded = false,
  designRationale = false,
  seats = null,
  comparison = false,
} = {}) {
  const tier = weightTier(weight);
  if (excluded) {
    return { priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS, tier, reason: 'the designer marked this subject do not discuss, which overrides every other consideration' };
  }
  if (isAssumedParameterKey(key)) {
    return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: 'a permanent design assumption is technical evidence, never a client-facing result' };
  }
  // P1 and P20 carry their own rules, because their meaning is not read from a
  // level alone: P1 is the seating decision the client asks about, and P20 is the
  // one bass result whose meaning depends on WHICH seats it holds for.
  if (String(key) === 'p1') {
    return { ...p1NarrativePriority({ level, relevance, deliberate: designRationale }), tier };
  }
  if (String(key) === 'p20') {
    return {
      ...p20NarrativePriority({
        allLevel: seats?.all ?? level,
        primaryLevel: seats?.primary ?? null,
        split: seats?.split !== false,
        seatScopeAllowed: seats?.scopeAllowed !== false,
        relevance,
        comparison,
      }),
      tier,
    };
  }
  const label = levelLabel(level);
  if (label == null) {
    return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: 'no terminal result is published for this parameter' };
  }
  if (relevance === BRIEF_RELEVANCE.NONE) {
    return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: 'this project contains no evidence for this subject' };
  }
  const strong = levelRank(label) >= 3;
  const onBrief = relevance === BRIEF_RELEVANCE.HIGH;

  if (tier === WEIGHT_TIER.HIGH) {
    if (onBrief) {
      return { priority: NARRATIVE_PRIORITY.LEAD_STORY, tier, reason: `a heavily weighted result (${label}) in a subject this brief is built around` };
    }
    return strong
      ? { priority: NARRATIVE_PRIORITY.LEAD_STORY, tier, reason: `a heavily weighted parameter at ${label}` }
      : { priority: NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE, tier, reason: `a heavily weighted parameter at ${label}, off the centre of this brief: evidence, not a headline` };
  }

  if (tier === WEIGHT_TIER.MID) {
    if (strong && onBrief) {
      return { priority: NARRATIVE_PRIORITY.LEAD_STORY, tier, reason: `a ${label} result in a subject this brief is built around` };
    }
    if (strong) {
      return { priority: NARRATIVE_PRIORITY.WORTH_MENTIONING, tier, reason: `a ${label} result of moderate importance` };
    }
    if (onBrief) {
      return { priority: NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE, tier, reason: `a ${label} result on an important subject: stated positively, never as a headline` };
    }
    return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: `a ${label} result of moderate importance, off the centre of this brief` };
  }

  if (strong && onBrief) {
    return { priority: NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE, tier, reason: `a ${label} result on a lightly weighted parameter: available as evidence, never promoted` };
  }
  return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: `a ${label} result on a lightly weighted parameter is not a client-facing story` };
}

/* ── P20 · BASS SEAT-TO-SEAT CONSISTENCY, AND P1 · THE SEATING DECISION ─────
   Both carry rules of their own, because neither is read from a level alone: P20
   depends on WHICH SEATS its result holds for, and P1 is the seating decision the
   client asks about rather than a score. They are defined in
   seatScopeNarrativeAuthority.js (re-exported above) so this authority stays one
   reading of importance + result + brief, and so the writer and the
   designer-facing view read the identical rules. */

/* ── The narrative area each parameter belongs to ─────────────────────────── */

/** The narrative area a parameter speaks to (the area the brief is read against). */
export const PARAMETER_NARRATIVE_AREA = Object.freeze({
  p1: 'client_experience',
  p2: 'loudspeaker_configuration',
  p3: 'spatial_resolution',
  p4: 'spatial_resolution',
  p5: 'spatial_resolution',
  p6: 'spatial_resolution',
  p7: 'spatial_resolution',
  p8: 'spatial_resolution',
  p9: 'spatial_resolution',
  p10: 'spatial_resolution',
  p11: 'spatial_resolution',
  p12: 'dynamic_capability',
  p13: 'dynamic_capability',
  p14: 'dynamic_capability',
  p15: 'dynamic_capability',
  p16: 'timbre_matching',
  p17: 'timbre_matching',
  p18: 'bass_capability',
  p19: 'bass_capability',
  p20: 'bass_capability',
  p21: 'dynamic_capability',
  screen: 'display_viewing',
});

/** The performance area label a parameter belongs to, matching the report's own. */
export const PARAMETER_PERFORMANCE_AREA = Object.freeze({
  p1: 'Seating position',
  p2: 'System architecture',
  p3: 'Spatial resolution',
  p4: 'Spatial resolution',
  p5: 'Spatial resolution',
  p6: 'Spatial resolution',
  p7: 'Spatial resolution',
  p8: 'Spatial resolution',
  p9: 'Spatial resolution',
  p10: 'Spatial resolution',
  p11: 'Spatial resolution',
  p12: 'Dynamic range',
  p13: 'Dynamic range',
  p14: 'Dynamic range',
  p15: 'Dynamic range',
  p16: 'Timbre matching',
  p17: 'Timbre matching',
  p18: 'Bass performance',
  p19: 'Bass performance',
  p20: 'Bass performance',
  p21: 'Dynamic range',
  screen: 'Viewing experience',
});

/** The performance-language area a parameter's own sentence is read from. */
export const PARAMETER_PHRASE_AREA = Object.freeze({
  p2: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p3: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p4: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p5: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p6: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p7: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p9: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p10: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p11: PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
  p12: PERFORMANCE_AREAS.DYNAMIC_RANGE,
  p13: PERFORMANCE_AREAS.DYNAMIC_RANGE,
  p14: PERFORMANCE_AREAS.BASS_OUTPUT,
  p16: PERFORMANCE_AREAS.TIMBRE,
  p17: PERFORMANCE_AREAS.TIMBRE,
  p18: PERFORMANCE_AREAS.BASS_EXTENSION,
});

/* ── The language, applied AFTER relevance ────────────────────────────────── */

/**
 * The sentence a result has earned — or nothing, because the topic never earned
 * narrative relevance. This is the ONE door to the performance language, and the
 * order it enforces is the order the brief requires: importance, then relevance,
 * then worth discussing, and only then the strength of the words.
 *
 * @param {Object} input
 * @param {string} input.key — the parameter key
 * @param {string|null} input.level — the achieved level
 * @param {string} input.priority — the narrative role of the topic
 * @param {string} [input.seatScope] — the seats a P20 consistency claim is made
 *   for. A consistency sentence is stated only for the seats its own result
 *   supports, so an unscoped consistency claim is refused rather than widened.
 * @returns {string|null} the approved sentence, or null
 */
export function phraseAfterRelevance({ key, level, priority, seatScope = SEAT_SCOPE.NONE } = {}) {
  if (!mayAppearInNarrative(priority)) return null;
  // The seating decision is explained as rationale and the consistency result is
  // stated at its own seat scope: neither is read from the performance register.
  if (String(key) === 'p1') return p1RationalePhrase(priority);
  if (String(key) === 'p20') return p20ConsistencyPhrase({ level, scope: seatScope });
  const area = PARAMETER_PHRASE_AREA[key];
  if (!area) return null;
  const label = levelLabel(level);
  if (label == null) return null;
  return performancePhrase(area, label) || null;
}

/* ── One row per parameter: the designer-facing table and the writer alike ── */

/** The published contribution of one parameter, read from its own authority. */
function contributionOf(entry, level, weight) {
  const publishedMultiplier = Number(entry?.multiplier);
  const multiplier = Number.isFinite(publishedMultiplier)
    ? publishedMultiplier
    : (LEVEL_MULTIPLIERS[levelLabel(level)] ?? 0);
  const contribution = multiplier * weight;
  const maximum = LEVEL_MULTIPLIERS.L4 * weight;
  return {
    multiplier,
    contribution,
    maximum,
    share: maximum > 0 ? Math.max(0, contribution) / maximum : 0,
  };
}

/** The published title of a parameter, where the summary states one. */
function titleOf(summary, id) {
  const row = summary?.roomResultsByParameter?.[id] ?? summary?.roomResultsByParameter?.[String(id)] ?? null;
  return row?.title ? String(row.title) : null;
}

/**
 * Every parameter of one published summary as a narrative row: its ASDR weight, its
 * achieved result, its ASDR contribution, the brief relevance of its subject and the
 * narrative class it earned. One call, one reading, for the writer, the highlights
 * and the Expert View.
 *
 * @param {Object} input
 * @param {Object} input.summary — a published engineering summary, or one rebuilt
 *   from frozen report evidence (summaryFromReportEvidence)
 * @param {string} [input.intent] — the design's declared project intent
 * @param {Array<string>} [input.subjects] — areas the designer named
 * @param {string} [input.briefText] — the designer's own brief
 * @param {Object} [input.design] — what the design contains
 * @param {Array<string>} [input.excludedKeys] — parameters the designer excluded
 * @param {Array<string>} [input.excludedTopics] — the steering topics the designer
 *   marked do-not-discuss; a seating topic silences the whole seating narrative
 * @param {Array<string>} [input.suppressedAreas] — areas the steering silences
 * @returns {{rows: Array<Object>, byKey: Object, brief: Object, suppressedAreas: Array<string>}}
 */
export function buildNarrativePriorityRows({
  summary = null,
  intent = null,
  subjects = [],
  briefText = '',
  design = {},
  excludedKeys = [],
  excludedTopics = [],
  suppressedAreas = [],
  seatScopes = null,
} = {}) {
  const evidence = collectEligibleEvidence(summary);
  const brief = readBriefRelevance({ intent, subjects, briefText, design });
  const excluded = new Set((excludedKeys || []).map((key) => String(key)));
  // What the designer's own steering has silenced. A seating topic silences the
  // client-experience area, which suppresses the seating decision, its rationale,
  // the clearance explanation and every seat-scope claim together.
  const silenced = new Set([
    ...(Array.isArray(suppressedAreas) ? suppressedAreas : []),
    ...suppressedAreasFromTopics(excludedTopics),
  ].map((area) => String(area)));
  const seatingSuppressed = silenced.has('client_experience');
  // The frozen scoped summary, read once: where it states a parameter's own result
  // for the primary, secondary or assessed seats, that reading governs the seat
  // scope of its narrative class.
  const scopedSeatLevels = readScopedSeatLevels(seatScopes);
  const rows = [];
  const byKey = {};

  for (const key of PARAMETER_KEYS) {
    const entry = evidence.byKey[key];
    if (!entry) continue;
    const weight = parameterWeight(key, summary?.parameterAuthority);
    const area = PARAMETER_NARRATIVE_AREA[key] || null;
    const relevance = area ? (brief.byArea[area] || BRIEF_RELEVANCE.STANDARD) : BRIEF_RELEVANCE.STANDARD;
    const level = entry.eligible ? entry.level : null;
    // The seat results are read for every seat-scoped parameter, so the designer's
    // view can state the primary and secondary results beside the governed one.
    // WHERE THE SAVED REPORTS STATE A RESULT FOR EACH SCOPE, THAT READING IS THE
    // AUTHORITY: the per-seat rows can be silent about which seats the client
    // actually uses, and a scope level the reports state is never re-derived from a
    // weaker row. The per-seat reading is the fallback, not the other way round.
    const seats = readSeatScope(summary, key);
    const scoped = scopedSeatLevels[key] || null;
    const reading = scoped
      ? {
        all: scoped.all ?? level,
        primary: scoped.primary,
        secondary: scoped.secondary,
        // A scope that states its OWN result is stated for that scope. The primary
        // seats reaching a positive result is what allows a primary-seat claim: it is
        // never conditional on the secondary seats reaching one as well, because the
        // client sits in the primary seats whether or not the occasional ones match.
        split: scoped.primary != null,
        assessed: scoped.seat_count?.all ?? seats.assessed,
      }
      : {
        all: seats.all ?? level,
        primary: seats.primary,
        secondary: seats.secondary,
        split: seats.split,
        assessed: seats.assessed,
      };
    // A seating topic silences the seat-consistency narrative with the rest of the
    // seating subject: P20 speaks about which seats the bass carries across.
    const areaSilenced = (area ? silenced.has(area) : false)
      || (seatingSuppressed && String(key) === 'p20');
    const classified = parameterNarrativePriority({
      key,
      weight,
      level,
      relevance,
      excluded: excluded.has(key) || areaSilenced,
      // P1 is the deliberate seating decision: it is explained as rationale, from
      // the decision itself and not from the level it reached.
      designRationale: key === 'p1',
      seats: {
        all: reading.all,
        primary: reading.primary,
        split: reading.split,
        scopeAllowed: !seatingSuppressed,
      },
    });
    const score = contributionOf(summary?.parameterAuthority?.[key], level, weight);
    const id = key === 'screen' ? 'screen' : Number(String(key).replace('p', ''));
    const row = {
      key,
      parameter: id,
      parameter_label: titleOf(summary, id) || (key === 'screen' ? 'RP23 viewing geometry' : String(key).toUpperCase()),
      performance_area: PARAMETER_PERFORMANCE_AREA[key] || 'General',
      narrative_area: area,
      weight,
      tier: classified.tier,
      level,
      state: entry.state,
      scope: entry.scope,
      value: entry.value ?? null,
      eligible: entry.eligible,
      primary_seat_result: reading.primary,
      secondary_seat_result: reading.secondary,
      seat_results_assessed: reading.assessed,
      // The scoped summary the reports themselves state, where they state one. It
      // travels so a reader never has to re-derive a scope from a weaker row.
      scoped_seat_results: scoped ? { ...scoped } : null,
      seat_scope: classified.seat_scope ?? SEAT_SCOPE.NONE,
      multiplier: score.multiplier,
      contribution: score.contribution,
      maximum: score.maximum,
      contribution_share: score.share,
      brief_relevance: relevance,
      priority: classified.priority,
      priority_label: PRIORITY_LABEL[classified.priority],
      narrative_role: PRIORITY_LABEL[classified.priority],
      silenced: areaSilenced,
      reason: classified.reason,
    };
    rows.push(row);
    byKey[key] = row;
  }

  return { rows, byKey, brief, suppressedAreas: [...silenced] };
}

/** The rows a client-facing narrative may draw on, strongest class first. */
export function narrativeCandidateRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.eligible && isNarrativeCandidate(row.priority))
    .sort((a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) || (b.weight - a.weight));
}

/**
 * The design-rationale subjects: the deliberate physical decisions the narrative
 * explains. They are available to the proposal story whether or not they reached a
 * performance level, and they are never a performance headline — which is exactly
 * what their rank enforces: they read in the narrative and never among the
 * candidates a highlights selection draws from.
 */
export function designRationaleRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.priority === NARRATIVE_PRIORITY.DESIGN_RATIONALE)
    .sort((a, b) => b.weight - a.weight);
}

/* ── The narrative steer's topics, classified the same way ────────────────── */

/** The parameter family each steer topic speaks about, and its narrative area. */
export const TOPIC_NARRATIVE_SUBJECT = Object.freeze({
  display: { area: 'display_viewing', keys: ['screen'] },
  system_approach: { area: 'loudspeaker_configuration', keys: ['p2'] },
  screen_tonal: { area: 'timbre_matching', keys: ['p16'] },
  surround_tonal: { area: 'timbre_matching', keys: ['p17'] },
  bass_extension: { area: 'bass_capability', keys: ['p18'] },
  bass_response: { area: 'bass_capability', keys: ['p19'] },
  bass_consistency: { area: 'bass_capability', keys: ['p20'] },
  rear_subwoofer: { area: 'bass_capability', keys: ['p18', 'p20'] },
  speaker_positioning: { area: 'spatial_resolution', keys: ['p5', 'p6', 'p4'] },
  overhead_arrangement: { area: 'spatial_resolution', keys: ['p9', 'p10'] },
  viewing_experience: { area: 'client_experience', keys: [] },
  seating_arrangement: { area: 'client_experience', keys: [] },
  seating_geometry: { area: 'client_experience', keys: [] },
  screen_dynamic: { area: 'dynamic_capability', keys: ['p12', 'p13'] },
  channel_count: { area: 'loudspeaker_configuration', keys: [] },
  documented_constraint: { area: 'documented_constraint', keys: [] },
});

/**
 * The narrative areas a set of steering topics silences. A seating topic silences
 * the client-experience area, which is what suppresses the P1 seating narrative,
 * the seating-position rationale, the clearance explanation, the primary/secondary
 * seat discussion and the seating geometry together — the case the steer exists
 * for, where the Sound Proof seat model does not describe the client's seating.
 */
export function suppressedAreasFromTopics(topicKeys = []) {
  const areas = new Set();
  for (const topicKey of (Array.isArray(topicKeys) ? topicKeys : [])) {
    const subject = TOPIC_NARRATIVE_SUBJECT[String(topicKey)] || null;
    if (subject?.area) areas.add(subject.area);
  }
  return [...areas];
}

/**
 * The narrative class of a steer topic, from the evidence behind it and this
 * project's brief. A topic with no parameter of its own (a seating subject, a
 * channel count) is never promoted, and neither is a lightly weighted result that
 * merely reached a high level.
 *
 * @param {string} topicKey — a topic from the steer's own library
 * @param {Object} input
 * @param {string|null} [input.level] — the level the topic's own evidence states
 * @param {number} [input.weight] — the canonical weight of the topic's parameter
 *   family. Where it is not supplied the heaviest member of the family is used.
 * @param {string} [input.relevance] — the brief relevance of the topic's area
 * @param {boolean} [input.excluded]
 * @returns {{priority: string, reason: string, tier: string, area: string|null}}
 */
export function topicNarrativePriority(topicKey, { level = null, weight = null, relevance = BRIEF_RELEVANCE.STANDARD, excluded = false } = {}) {
  const subject = TOPIC_NARRATIVE_SUBJECT[String(topicKey || '')] || null;
  if (!subject || subject.keys.length === 0) {
    const classified = parameterNarrativePriority({ key: null, weight: 0, level: null, relevance, excluded });
    return { ...classified, area: subject?.area || null };
  }
  // A supplied weight is honoured only when it is a real, positive one: an absent
  // weight (null/undefined) must fall through to the topic's own family weight in
  // the canonical table, never read as zero.
  const supplied = Number(weight);
  const resolvedWeight = Number.isFinite(supplied) && supplied > 0
    ? supplied
    : Math.max(...subject.keys.map((key) => parameterWeight(key)));
  const classified = parameterNarrativePriority({
    key: subject.keys[0],
    weight: resolvedWeight,
    level,
    relevance,
    excluded,
  });
  return { ...classified, area: subject.area };
}

export default parameterNarrativePriority;