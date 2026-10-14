/**
 * narrativePillarGrouping.js (base44/shared — CANONICAL)
 * ----------------------------------------------------
 * ONE STORY PER PILLAR, FROM THE EVIDENCE BENEATH IT.
 *
 * The three pillars are the organising principle of the client story and the RP22
 * parameters are the evidence underneath it, so this is the layer that turns a
 * version's classified results into stories: every result is placed under the
 * pillar it strengthens, the related results are read together, and the pillar is
 * handed to the writer as ONE story with the parts that make it up, the clause each
 * result has already earned, the claims to cite and the seats each claim holds for.
 *
 * The bass is the clearest case: output, depth, control and consistency arrive as
 * one Dynamic Range story in four parts, each part stated at its own published
 * result — never at an average and never at the strongest member. P19 and P20
 * support that same story, so they never become two more.
 *
 * WHAT IT NEVER DOES. No figure, level, scope or claim is changed, averaged,
 * widened or inferred. The ranking still decides emphasis: the pillar carries the
 * best rank of the stories it rests on, and the writer is told the story, not a
 * parameter list. Rules and vocabulary live in narrativePillars.js.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { levelRank } from './strengthImportance.js';
import { performancePhrase } from './performanceLanguageAuthority.js';
import { PRIORITY_LABEL, PRIORITY_RANK, mayAppearInNarrative } from './narrativeRoles.js';
import { SEAT_SCOPE, p20ConsistencyPhrase } from './seatScopeNarrativeAuthority.js';
import {
  BASS_PARTS,
  BASS_PART_ORDER,
  BASS_STORY_RULE,
  BRIEF_CONTEXT_RULE,
  CORE_STORY_RULE,
  EVIDENCE_NOT_HEADLINE_RULE,
  INFRASONIC_EXAMPLE,
  INFRASONIC_EXTENSION_HZ,
  INFRASONIC_RULE,
  NARRATIVE_METHOD_RULE,
  NARRATIVE_PILLAR_VERSION,
  PILLAR,
  PILLAR_EVIDENCE,
  PILLAR_ORDER,
  PILLAR_STRUCTURE_RULE,
  PILLARS,
  PRIMARY_SEAT_SCOPE_RULE,
  SEATING_RATIONALE_NOTE,
  SEAT_SCOPE_WORDING,
  STORY_HIERARCHY_RULE,
  WIDENED_SCOPE_WORDING,
  infrasonicAllowance,
  pillarMemberKeys,
  pillarOf,
  pillarReferenceLines,
} from './narrativePillars.js';

/** One member as the grouping reads it: the evidence, plus the role and weight the
 *  classification already decided (used to choose a pillar's role, never emitted). */
function memberOf(row) {
  return {
    key: String(row.key),
    parameter: row.parameter ?? null,
    level: row.level ?? null,
    value: row.value ?? null,
    priority: row.priority,
    weight: row.weight ?? null,
    seat_scope: row.seat_scope ?? SEAT_SCOPE.NONE,
    primary_seat_result: row.primary_seat_result ?? null,
    secondary_seat_result: row.secondary_seat_result ?? null,
  };
}

/**
 * The member as the writer reads it: THE EVIDENCE ONLY. No weight, no tier and no
 * score travels to the writer — the ranking has already been applied — and the
 * internal role vocabulary stays internal.
 */
function evidenceMember(member) {
  return {
    key: member.key,
    parameter: member.parameter,
    level: member.level,
    value: member.value,
    seat_scope: member.seat_scope,
    primary_seat_result: member.primary_seat_result,
    secondary_seat_result: member.secondary_seat_result,
  };
}

/**
 * The result a part states for one member. A consistency result scoped to the
 * primary seats states the PRIMARY seats' own result, never the weakest seat in
 * the room: the scope of the claim decides which result is read.
 */
function partLevel(row) {
  if (row.seat_scope === SEAT_SCOPE.PRIMARY && row.primary_seat_result) return row.primary_seat_result;
  return row.level;
}

/** The stories that rest on any of one pillar's parameters. */
function storiesOf(pillarKey, stories) {
  const keys = new Set(pillarMemberKeys(pillarKey).map((key) => key.toUpperCase()));
  return (Array.isArray(stories) ? stories : []).filter((story) => (
    (Array.isArray(story?.evidence_parameter_ids) ? story.evidence_parameter_ids : [])
      .some((id) => keys.has(String(id).toUpperCase()))
  ));
}

/** One part of the bass story, read at its own member's published result. */
function partOf(part, members) {
  const rows = members.filter((member) => part.keys.includes(String(member.key)));
  const spoken = rows.filter((member) => mayAppearInNarrative(member.priority) && !member.silenced);
  const level = spoken.reduce(
    (acc, member) => (acc == null || levelRank(partLevel(member)) < levelRank(acc) ? partLevel(member) : acc),
    null,
  );
  const source = spoken.length > 0 ? spoken : rows;
  return {
    part: part.part,
    question: part.question,
    parameter_ids: part.keys.map((key) => key.toUpperCase()),
    vocabulary: [...part.vocabulary],
    notices: part.notices,
    supporting: Boolean(part.supporting),
    level,
    values: source.map((member) => member.value).filter((value) => value != null),
    // The clause this part's own result has already earned, from the register: the
    // same language the client documents use, and never a phrase invented here.
    clause: part.area && level ? (performancePhrase(part.area, level) || null) : null,
    available: spoken.length > 0 && level != null,
  };
}

/** The seat scope and the wording one pillar's consistency claim allows. */
function seatScopeOf(members) {
  const row = members.find((member) => String(member.key) === 'p20') || null;
  const scope = row?.seat_scope && row.seat_scope !== SEAT_SCOPE.NONE ? row.seat_scope : null;
  if (!scope) return { seat_scope: null, scope_wording: null, banned_scope_wording: [] };
  return {
    seat_scope: scope,
    scope_wording: SEAT_SCOPE_WORDING[scope] || null,
    banned_scope_wording: scope === SEAT_SCOPE.PRIMARY ? [...WIDENED_SCOPE_WORDING] : [],
  };
}

/** The clause a consistency result has earned, at the seats it holds for. */
function consistencyClause(members) {
  const row = members.find((member) => String(member.key) === 'p20') || null;
  if (!row || row.silenced || !mayAppearInNarrative(row.priority)) return null;
  if (row.seat_scope === SEAT_SCOPE.PRIMARY) {
    return p20ConsistencyPhrase({ level: row.primary_seat_result || row.level, scope: row.seat_scope });
  }
  if (row.seat_scope === SEAT_SCOPE.ALL) {
    return p20ConsistencyPhrase({ level: row.level, scope: row.seat_scope });
  }
  return null;
}

/** The technical line the evidence table states: parameter, level and value. */
function evidenceTextOf(label, members) {
  const stated = members
    .filter((member) => member.level || member.value)
    .map((member) => [
      String(member.key).toUpperCase(),
      member.level || null,
      member.value != null ? String(member.value) : null,
    ].filter(Boolean).join(' '));
  return stated.length > 0 ? `${label}: ${stated.join(' · ')}` : `${label}: no published result`;
}

/**
 * The pillar stories one classified evidence set supports, ONE ENTRY PER PILLAR.
 *
 * @param {Object} input
 * @param {Array<Object>} input.rows — narrative rows (buildNarrativePriorityRows)
 * @param {Array<Object>} [input.stories] — the ranked strength stories of the same
 *   version, read ONLY for the claim IDs a pillar may cite and for their rank
 * @returns {{pillars: Array<Object>, byPillar: Object, silenced: Array<Object>, non_pillar: Array<string>}}
 */
export function buildClientStoryPillars({ rows = [], stories = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const pillars = [];
  const silenced = [];

  for (const pillarKey of PILLAR_ORDER) {
    const definition = PILLARS[pillarKey];
    const keys = pillarMemberKeys(pillarKey);
    const members = list.filter((row) => row && keys.includes(String(row.key))).map(memberOf);
    if (members.length === 0) continue;

    const spoken = members.filter((member) => mayAppearInNarrative(member.priority));
    if (spoken.length === 0) {
      silenced.push({
        pillar: pillarKey,
        label: definition.label,
        parameter_ids: members.map((member) => String(member.key).toUpperCase()),
        reason: 'no result beneath this pillar may appear in the client-facing narrative',
      });
      continue;
    }

    const role = spoken.reduce(
      (acc, member) => (PRIORITY_RANK[member.priority] > PRIORITY_RANK[acc] ? member.priority : acc),
      spoken[0].priority,
    );
    const related = storiesOf(pillarKey, stories);
    const ranks = related.map((story) => Number(story?.rank)).filter((rank) => Number.isFinite(rank));
    const claimIds = [...new Set(related.flatMap((story) => (
      Array.isArray(story?.allowed_claim_ids) ? story.allowed_claim_ids : []
    )))];
    const scope = seatScopeOf(members);
    // The bass is read as parts of the one Dynamic Range story; the other pillars
    // are one story each, with no part list of their own.
    const parts = pillarKey === PILLAR.DYNAMIC_RANGE ? BASS_PARTS.map((part) => partOf(part, members)) : [];
    const clauses = [
      ...parts.map((part) => part.clause).filter(Boolean),
      consistencyClauseFor(pillarKey, members),
    ].filter(Boolean);

    pillars.push({
      pillar: pillarKey,
      label: definition.label,
      question: definition.question,
      why_care: definition.why_care,
      translation: [...definition.translation],
      vocabulary: [...definition.vocabulary],
      register_examples: [...definition.register_examples],
      success_note: definition.success_note,
      rule: definition.rule,
      role,
      role_label: PRIORITY_LABEL[role] || null,
      rank: ranks.length > 0 ? Math.min(...ranks) : null,
      parameter_ids: members.map((member) => String(member.key).toUpperCase()),
      members: members.map(evidenceMember),
      // The parts of the one story (the bass, inside Dynamic Range).
      parts,
      part_order: parts.length > 0 ? [...BASS_PART_ORDER] : [],
      seat_scope: scope.seat_scope,
      scope_wording: scope.scope_wording,
      banned_scope_wording: scope.banned_scope_wording,
      infrasonic: parts.length > 0
        ? infrasonicAllowance({
          depthLevel: parts.find((part) => part.part === 'depth')?.level ?? null,
          depthValue: parts.find((part) => part.part === 'depth')?.values?.[0] ?? null,
        })
        : null,
      client_clauses: clauses,
      claim_ids: claimIds,
      // The technical line: this is where parameter numbers belong.
      evidence_text: evidenceTextOf(definition.label, members),
      prose_scope: 'technical_evidence_table_only',
    });
  }

  const ordered = [...pillars].sort((a, b) => {
    const left = (a.rank ?? 99) - (b.rank ?? 99);
    if (left !== 0) return left;
    const right = PRIORITY_RANK[b.role] - PRIORITY_RANK[a.role];
    if (right !== 0) return right;
    return PILLAR_ORDER.indexOf(a.pillar) - PILLAR_ORDER.indexOf(b.pillar);
  });

  return {
    pillars: ordered,
    byPillar: Object.fromEntries(ordered.map((pillar) => [pillar.pillar, pillar])),
    silenced,
    // Evidence that strengthens no pillar: it is carried by its own section — the
    // layout, the viewing geometry, the seating rationale — and is never told as a
    // pillar story.
    non_pillar: [...new Set(list.map((row) => String(row.key)).filter((key) => !pillarOf(key)))].map((key) => key.toUpperCase()),
  };
}

/** The consistency clause belongs to the bass story inside Dynamic Range alone. */
function consistencyClauseFor(pillarKey, members) {
  return pillarKey === PILLAR.DYNAMIC_RANGE ? consistencyClause(members) : null;
}

/**
 * The rules the writer is held to, without any evidence: the pillar block's own
 * head. It states no figure of its own — every figure still comes from the frozen
 * evidence and its own claims.
 */
export function clientStoryPillarRules() {
  return {
    version: NARRATIVE_PILLAR_VERSION,
    core_rule: CORE_STORY_RULE,
    hierarchy_rule: STORY_HIERARCHY_RULE,
    method_rule: NARRATIVE_METHOD_RULE,
    structure_rule: PILLAR_STRUCTURE_RULE,
    evidence_rule: EVIDENCE_NOT_HEADLINE_RULE,
    bass_rule: BASS_STORY_RULE,
    brief_rule: BRIEF_CONTEXT_RULE,
    seat_scope_rule: PRIMARY_SEAT_SCOPE_RULE,
    infrasonic_rule: INFRASONIC_RULE,
    infrasonic_boundary_hz: INFRASONIC_EXTENSION_HZ,
    infrasonic_example: INFRASONIC_EXAMPLE,
    seating_note: SEATING_RATIONALE_NOTE,
    pillars: PILLAR_ORDER.map((pillarKey) => ({
      pillar: pillarKey,
      label: PILLARS[pillarKey].label,
      question: PILLARS[pillarKey].question,
      why_care: PILLARS[pillarKey].why_care,
      translation: [...PILLARS[pillarKey].translation],
      evidence_primary: PILLAR_EVIDENCE[pillarKey].primary.map((key) => key.toUpperCase()),
      evidence_supporting: PILLAR_EVIDENCE[pillarKey].supporting.map((key) => key.toUpperCase()),
    })),
    bass_parts: BASS_PARTS.map((part) => ({
      part: part.part,
      question: part.question,
      parameter_ids: part.keys.map((key) => key.toUpperCase()),
      notices: part.notices,
      supporting: Boolean(part.supporting),
    })),
    // Where the option's own pillar stories are carried, so the rules and the
    // evidence they govern are always read together.
    field: 'evidence.options[].client_story_pillars',
    source: 'the canonical pillar grouping, over the same classified evidence as strength_stories',
  };
}

/**
 * The block the writer input carries: the rules the copy is held to and one
 * evidence set's pillar stories.
 */
export function buildClientStoryPillarBlock({ rows = [], stories = [] } = {}) {
  const { pillars, silenced, non_pillar } = buildClientStoryPillars({ rows, stories });
  return {
    ...clientStoryPillarRules(),
    pillars: pillars.map((pillar) => ({ ...pillar })),
    silenced,
    non_pillar,
  };
}

/** The block as prompt lines, so the rules reach the writer as it reads its contract. */
export function clientStoryPillarLines() {
  return [
    '=== THE THREE PILLARS ORGANISE THE CLIENT STORY ===',
    CORE_STORY_RULE,
    STORY_HIERARCHY_RULE,
    NARRATIVE_METHOD_RULE,
    PILLAR_STRUCTURE_RULE,
    EVIDENCE_NOT_HEADLINE_RULE,
    BASS_STORY_RULE,
    ...pillarReferenceLines(),
    INFRASONIC_RULE,
    PRIMARY_SEAT_SCOPE_RULE,
    BRIEF_CONTEXT_RULE,
    SEATING_RATIONALE_NOTE,
    'The pillar stories for each option are carried in evidence.options[].client_story_pillars, with the parts of the bass story, the clause each result has earned, the claims to cite and the seats each claim holds for.',
    '',
  ];
}

export default buildClientStoryPillars;