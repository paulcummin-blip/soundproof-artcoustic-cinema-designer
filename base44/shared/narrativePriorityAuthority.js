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

/** The five narrative classes. Nothing else is introduced. */
export const NARRATIVE_PRIORITY = Object.freeze({
  LEAD_STORY: 'lead_story',
  WORTH_MENTIONING: 'worth_mentioning',
  SUPPORTING_EVIDENCE: 'supporting_evidence',
  TECHNICAL_ONLY: 'technical_only',
  DO_NOT_DISCUSS: 'do_not_discuss',
});

/** Where each class sits, strongest first. */
export const PRIORITY_RANK = Object.freeze({
  [NARRATIVE_PRIORITY.DO_NOT_DISCUSS]: 0,
  [NARRATIVE_PRIORITY.TECHNICAL_ONLY]: 1,
  [NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE]: 2,
  [NARRATIVE_PRIORITY.WORTH_MENTIONING]: 3,
  [NARRATIVE_PRIORITY.LEAD_STORY]: 4,
});

/** What each class is called on the designer-facing Expert View. */
export const PRIORITY_LABEL = Object.freeze({
  [NARRATIVE_PRIORITY.LEAD_STORY]: 'Lead story',
  [NARRATIVE_PRIORITY.WORTH_MENTIONING]: 'Worth mentioning',
  [NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE]: 'Supporting evidence',
  [NARRATIVE_PRIORITY.TECHNICAL_ONLY]: 'Technical only',
  [NARRATIVE_PRIORITY.DO_NOT_DISCUSS]: 'Do not discuss',
});

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

/** Whether a class belongs in a client-facing narrative at all. */
export const isNarrativeCandidate = (priority) => (PRIORITY_RANK[priority] ?? 0) >= PRIORITY_RANK[NARRATIVE_PRIORITY.WORTH_MENTIONING];

/** Whether a class may carry flagship language. Only a lead story may. */
export const mayUseFlagshipLanguage = (priority) => priority === NARRATIVE_PRIORITY.LEAD_STORY;

/** Whether a class may appear in the narrative at all. */
export const mayAppearInNarrative = (priority) => (PRIORITY_RANK[priority] ?? 0) > PRIORITY_RANK[NARRATIVE_PRIORITY.TECHNICAL_ONLY];

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
 * @returns {{priority: string, reason: string, tier: string}}
 */
export function parameterNarrativePriority({ key, weight, level, relevance = BRIEF_RELEVANCE.STANDARD, excluded = false } = {}) {
  const tier = weightTier(weight);
  if (excluded) {
    return { priority: NARRATIVE_PRIORITY.DO_NOT_DISCUSS, tier, reason: 'the designer marked this subject do not discuss, which overrides every other consideration' };
  }
  if (isAssumedParameterKey(key)) {
    return { priority: NARRATIVE_PRIORITY.TECHNICAL_ONLY, tier, reason: 'a permanent design assumption is technical evidence, never a client-facing result' };
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
 * @param {string} input.priority — the narrative class of the topic
 * @returns {string|null} the approved sentence, or null
 */
export function phraseAfterRelevance({ key, level, priority } = {}) {
  if (!mayAppearInNarrative(priority)) return null;
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
 * @returns {{rows: Array<Object>, byKey: Object, brief: Object}}
 */
export function buildNarrativePriorityRows({
  summary = null,
  intent = null,
  subjects = [],
  briefText = '',
  design = {},
  excludedKeys = [],
} = {}) {
  const evidence = collectEligibleEvidence(summary);
  const brief = readBriefRelevance({ intent, subjects, briefText, design });
  const excluded = new Set((excludedKeys || []).map((key) => String(key)));
  const rows = [];
  const byKey = {};

  for (const key of PARAMETER_KEYS) {
    const entry = evidence.byKey[key];
    if (!entry) continue;
    const weight = parameterWeight(key, summary?.parameterAuthority);
    const area = PARAMETER_NARRATIVE_AREA[key] || null;
    const relevance = area ? (brief.byArea[area] || BRIEF_RELEVANCE.STANDARD) : BRIEF_RELEVANCE.STANDARD;
    const level = entry.eligible ? entry.level : null;
    const classified = parameterNarrativePriority({ key, weight, level, relevance, excluded: excluded.has(key) });
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
      multiplier: score.multiplier,
      contribution: score.contribution,
      maximum: score.maximum,
      contribution_share: score.share,
      brief_relevance: relevance,
      priority: classified.priority,
      priority_label: PRIORITY_LABEL[classified.priority],
      reason: classified.reason,
    };
    rows.push(row);
    byKey[key] = row;
  }

  return { rows, byKey, brief };
}

/** The rows a client-facing narrative may draw on, strongest class first. */
export function narrativeCandidateRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.eligible && isNarrativeCandidate(row.priority))
    .sort((a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) || (b.weight - a.weight));
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