/**
 * narrativePillarGrouping.js (base44/shared — CANONICAL)
 * -----------------------------------------------------
 * ONE STORY PER PILLAR, FROM THE EVIDENCE BENEATH IT.
 *
 * The three pillars are the organising principle of the client story and the RP22
 * parameters are the evidence underneath it, so this is the layer that turns a
 * version's classified results into stories: every result is placed under the
 * pillar it strengthens, the related results are read together, and the pillar is
 * handed to the writer as ONE story with the parts that make it up, the clause each
 * result has already earned, the claims to cite and the seats each claim holds for.
 *
 * A PILLAR IS AN INTERPRETIVE FRAME, NOT A NARRATIVE CANDIDATE. Dynamic Range,
 * Spatial Resolution and Timbre Matching are the three ways Sound Proof explains
 * performance, so all three always reach the writer. ASDR importance decides how
 * much of the EVIDENCE beneath a pillar is discussed — which result leads, which
 * supports it and which stays in the engineering evidence — and it never removes
 * the pillar itself. Only the designer's own steer (a subject marked do-not-discuss)
 * silences anything here.
 *
 * WHAT IT READS. Two sources, each the authority for its own half of the story:
 * the classified narrative rows decide emphasis, relevance and role; the DIRECT
 * parameter evidence decides whether a result exists and what it states, so the bass
 * parts are read from P14, P18, P19 and P20 themselves rather than from the reading
 * of them. A priority can therefore say "say little about this"; it can never say
 * "this result does not exist".
 *
 * The bass is the clearest case: output, depth, control and consistency arrive as
 * one Dynamic Range story in four parts, each part stated at its own published
 * result — never at an average and never at the strongest member. P19 and P20
 * support that same story, so they never become two more. The seating rationale
 * (P1) is not a pillar at all: it is explained as a design decision of its own.
 *
 * TWO LEVELS OF IMPORTANCE. The pillar's ROLE (and its emphasis_note) is the GLOBAL
 * narrative priority: how much space the pillar gets in the proposal overall. Its
 * LEAD EVIDENCE (and its lead_note) is the PILLAR evidence priority: the strongest
 * result beneath that pillar, with the language its own achieved result has earned —
 * read by narrativePillarLeadAuthority.js. A pillar therefore keeps a strong, well
 * written lead without becoming the dominant story of the proposal.
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
// TWO LEVELS OF IMPORTANCE: the pillar's own lead evidence is read by its own
// authority (what leads this pillar), while the pillar's role stays the global
// narrative priority (how much space it gets).
import { leadNoteOf, partLevel, pillarLeadEvidence, withoutSeatNarration } from './narrativePillarLeadAuthority.js';
import {
  NARRATIVE_PRIORITY,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  mayAppearInNarrative,
} from './narrativeRoles.js';
import {
  P1_RATIONALE_LANGUAGE,
  SEAT_SCOPE,
  p20ConsistencyPhrase,
} from './seatScopeNarrativeAuthority.js';
import {
  BASS_PARTS,
  BASS_PART_ORDER,
  BASS_STORY_RULE,
  BRIEF_CONTEXT_RULE,
  CORE_STORY_RULE,
  EVIDENCE_EMPHASIS,
  EVIDENCE_EMPHASIS_RULE,
  EVIDENCE_NOT_HEADLINE_RULE,
  INFRASONIC_EXAMPLE,
  INFRASONIC_EXTENSION_HZ,
  INFRASONIC_RULE,
  NARRATIVE_METHOD_RULE,
  NARRATIVE_PILLAR_VERSION,
  PILLAR,
  PILLAR_ALWAYS_AVAILABLE_RULE,
  PILLAR_EVIDENCE,
  PILLAR_LEAD_RULE,
  PILLAR_ORDER,
  PILLAR_STRUCTURE_RULE,
  PILLARS,
  PRIMARY_SEAT_SCOPE_RULE,
  SEAT_FREE_PILLAR_EVIDENCE_RULE,
  SEATING_RATIONALE_NOTE,
  SEATING_RATIONALE_RULE,
  SEAT_SCOPE_WORDING,
  STORY_HIERARCHY_RULE,
  WIDENED_SCOPE_WORDING,
  infrasonicAllowance,
  pillarMemberKeys,
  pillarOf,
  pillarReferenceLines,
} from './narrativePillars.js';

/** Where each emphasis sits, strongest first. The order is the writing order. */
export const EMPHASIS_RANK = Object.freeze({
  [EVIDENCE_EMPHASIS.LEAD]: 4,
  [EVIDENCE_EMPHASIS.SUPPORTING]: 3,
  [EVIDENCE_EMPHASIS.CONTRIBUTING]: 2,
  [EVIDENCE_EMPHASIS.CONTEXT]: 1,
  [EVIDENCE_EMPHASIS.EXCLUDED]: 0,
});

/**
 * How much of one result's evidence is discussed. Read from the narrative class the
 * classification already decided — never from the level alone, and never from this
 * module's own opinion.
 */
export function pillarEvidenceEmphasis(priority) {
  switch (priority) {
    case NARRATIVE_PRIORITY.LEAD_STORY:
      return EVIDENCE_EMPHASIS.LEAD;
    case NARRATIVE_PRIORITY.WORTH_MENTIONING:
    case NARRATIVE_PRIORITY.DESIGN_RATIONALE:
      return EVIDENCE_EMPHASIS.SUPPORTING;
    case NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE:
      return EVIDENCE_EMPHASIS.CONTRIBUTING;
    case NARRATIVE_PRIORITY.DO_NOT_DISCUSS:
      return EVIDENCE_EMPHASIS.EXCLUDED;
    default:
      return EVIDENCE_EMPHASIS.CONTEXT;
  }
}

/**
 * One member as the grouping reads it: the narrative classification (role and
 * emphasis, which decide how much is told) merged with the DIRECT parameter
 * evidence (which decides whether a result exists and what it states).
 *
 * The direct reading is the authority for level, value and seat results wherever it
 * is supplied: a result the saved reports publish is never absent merely because the
 * reading of it was classified technical-only.
 */
function memberOf(row, parameterEvidence = null) {
  const key = String(row.key);
  const direct = parameterEvidence?.[key] || parameterEvidence?.[key.toUpperCase()] || null;
  const excluded = Boolean(row.silenced) || row.priority === NARRATIVE_PRIORITY.DO_NOT_DISCUSS;
  return {
    key,
    parameter: row.parameter ?? null,
    level: direct?.level ?? row.level ?? null,
    value: direct?.value ?? row.value ?? null,
    priority: row.priority,
    emphasis: excluded ? EVIDENCE_EMPHASIS.EXCLUDED : pillarEvidenceEmphasis(row.priority),
    weight: row.weight ?? null,
    brief_relevance: row.brief_relevance ?? null,
    seat_scope: row.seat_scope ?? direct?.seat_scope ?? SEAT_SCOPE.NONE,
    primary_seat_result: row.primary_seat_result ?? direct?.primary_seat_result ?? null,
    secondary_seat_result: row.secondary_seat_result ?? direct?.secondary_seat_result ?? null,
    silenced: excluded,
  };
}

/**
 * The member as the writer reads it: THE EVIDENCE, PLUS HOW MUCH OF IT TO TELL. No
 * weight, no score and no internal role vocabulary travels to the writer — the
 * emphasis is what the ranking decided, stated as an instruction about length and
 * prominence.
 */
function evidenceMember(member, leadKeys = null) {
  return {
    key: member.key,
    parameter: member.parameter,
    level: member.level,
    value: member.value,
    emphasis: member.emphasis,
    // THIS PILLAR'S LEAD, not the proposal's: the strongest result beneath the pillar
    // that may be told at all. The global rank travels separately, as the pillar's role.
    pillar_lead: Boolean(leadKeys?.has(String(member.key).toUpperCase())),
    seat_scope: member.seat_scope,
    primary_seat_result: member.primary_seat_result,
    secondary_seat_result: member.secondary_seat_result,
  };
}

/** The stories that rest on any of one pillar's parameters. */
function storiesOf(pillarKey, stories) {
  const keys = new Set(pillarMemberKeys(pillarKey).map((key) => key.toUpperCase()));
  return (Array.isArray(stories) ? stories : []).filter((story) => (
    (Array.isArray(story?.evidence_parameter_ids) ? story.evidence_parameter_ids : [])
      .some((id) => keys.has(String(id).toUpperCase()))
  ));
}

/** One member's order inside its pillar: emphasis, then canonical weight, then level. */
function memberOrder(member) {
  return [
    EMPHASIS_RANK[member.emphasis] ?? 0,
    Number(member.weight) || 0,
    levelRank(member.level) || 0,
  ];
}

/**
 * One part of the bass story, read at its own member's published result. The part is
 * AVAILABLE whenever the evidence beneath it exists; the emphasis says how much of it
 * the story tells. Priority never decides that a published result is missing.
 */
function partOf(part, members) {
  const rows = members.filter((member) => part.keys.includes(String(member.key)));
  const present = rows.filter((member) => member.level != null || member.value != null);
  const level = present.reduce(
    (acc, member) => (acc == null || (levelRank(partLevel(member)) ?? 99) < (levelRank(acc) ?? 99) ? partLevel(member) : acc),
    null,
  );
  const emphasis = rows.reduce(
    (acc, member) => ((EMPHASIS_RANK[member.emphasis] ?? 0) > (EMPHASIS_RANK[acc] ?? 0) ? member.emphasis : acc),
    EVIDENCE_EMPHASIS.CONTEXT,
  );
  const excluded = rows.length > 0 && rows.every((member) => member.emphasis === EVIDENCE_EMPHASIS.EXCLUDED);
  return {
    part: part.part,
    question: part.question,
    parameter_ids: part.keys.map((key) => key.toUpperCase()),
    vocabulary: [...part.vocabulary],
    notices: part.notices,
    supporting: Boolean(part.supporting),
    level,
    emphasis: excluded ? EVIDENCE_EMPHASIS.EXCLUDED : emphasis,
    values: present.map((member) => member.value).filter((value) => value != null),
    // The clause this part's own result has already earned, from the register: the
    // same language the client documents use, and never a phrase invented here.
    clause: part.area && level ? (performancePhrase(part.area, level) || null) : null,
    // Whether the result exists at all — the one question ASDR does not answer.
    available: present.length > 0 && level != null,
    // A QUALIFYING PART IS TOLD WITH THE STORY IT QUALIFIES. The response at the
    // reference position (P19) competes with nothing for rank: it states how the bass
    // the story already tells behaves, so it is told whenever its own result exists
    // and the designer has not silenced the subject.
    told: !excluded && present.length > 0
      && (part.always_told === true || emphasis !== EVIDENCE_EMPHASIS.CONTEXT),
  };
}

/** The seat scope and the wording one pillar's consistency claim allows. */
function seatScopeOf(members) {
  const row = members.find((member) => String(member.key) === 'p20') || null;
  const scope = row?.seat_scope && row.seat_scope !== SEAT_SCOPE.NONE ? row.seat_scope : null;
  if (!scope) {
    return {
      seat_scope: null,
      scope_wording: null,
      // With no seat scope earned, no positive consistency claim exists: the
      // room-wide wordings are refused rather than left unstated.
      banned_scope_wording: [...WIDENED_SCOPE_WORDING],
    };
  }
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

/** What the pillar's own evidence says to do about length, from its emphasis. */
function emphasisNoteOf(pillarKey, ordered) {
  const lead = ordered.filter((member) => member.emphasis === EVIDENCE_EMPHASIS.LEAD);
  const told = ordered.filter((member) => member.emphasis === EVIDENCE_EMPHASIS.SUPPORTING
    || member.emphasis === EVIDENCE_EMPHASIS.CONTRIBUTING);
  if (lead.length > 0) {
    return `This pillar carries a lead result (${lead.map((member) => String(member.key).toUpperCase()).join(', ')}): tell it as the story's main point, with anything supporting it woven around it.`;
  }
  if (told.length > 0) {
    return `This pillar is not the design's overall headline, so keep it brief and proportionate to its place in the story — the results ${told.map((member) => String(member.key).toUpperCase()).join(', ')} are still written in the strongest language their own achieved results have earned, never flattened because another pillar carries more of the proposal.`;
  }
  return `Nothing beneath this pillar is worth more than a brief, honest sentence: say what the evidence supports, keep it short, and do not pad it or promote it.`;
}

/**
 * The pillar stories one classified evidence set supports, ONE ENTRY PER PILLAR
 * THAT HOLDS ANY EVIDENCE.
 *
 * @param {Object} input
 * @param {Array<Object>} input.rows — narrative rows (buildNarrativePriorityRows)
 * @param {Array<Object>} [input.stories] — the ranked strength stories of the same
 *   version, read ONLY for the claim IDs a pillar may cite and for their rank
 * @param {Object|null} [input.parameterEvidence] — the DIRECT published result of
 *   each parameter, keyed by parameter key ('p14' → { level, value, seat_scope,
 *   primary_seat_result, secondary_seat_result }). It decides whether a result
 *   exists; the rows decide how much of it is told.
 * @param {Object|null} [input.context] — the project's own context: { intent,
 *   room_type, intended_use, brief (readBriefRelevance output), suppressedAreas }
 * @returns {{pillars: Array<Object>, byPillar: Object, silenced: Array<Object>, non_pillar: Array<string>}}
 */
export function buildClientStoryPillars({
  rows = [],
  stories = [],
  parameterEvidence = null,
  context = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const pillars = [];
  const silenced = [];
  const suppressedAreas = Array.isArray(context?.suppressedAreas) ? context.suppressedAreas : [];
  const seatingSuppressed = suppressedAreas.includes('client_experience');

  for (const pillarKey of PILLAR_ORDER) {
    const definition = PILLARS[pillarKey];
    const keys = pillarMemberKeys(pillarKey);
    const members = list
      .filter((row) => row && keys.includes(String(row.key)))
      .map((row) => memberOf(row, parameterEvidence));
    if (members.length === 0) continue;

    const evidence = members.filter((member) => member.level != null || member.value != null);
    // THE ONLY SILENCING HERE IS THE DESIGNER'S OWN STEER. A pillar whose results
    // were all classified technical-only still reaches the writer: ASDR decides how
    // much of its evidence is told, never whether the pillar exists.
    if (evidence.length > 0 && evidence.every((member) => member.emphasis === EVIDENCE_EMPHASIS.EXCLUDED)) {
      silenced.push({
        pillar: pillarKey,
        label: definition.label,
        parameter_ids: members.map((member) => String(member.key).toUpperCase()),
        reason: 'the designer marked this subject do not discuss, so no result beneath this pillar may appear in the client-facing narrative',
      });
      continue;
    }

    const ordered = [...evidence].sort((a, b) => {
      const left = memberOrder(a);
      const right = memberOrder(b);
      return (right[0] - left[0]) || (right[1] - left[1]) || (right[2] - left[2]) || a.key.localeCompare(b.key);
    });
    const selected = ordered.filter((member) => member.emphasis !== EVIDENCE_EMPHASIS.CONTEXT
      && member.emphasis !== EVIDENCE_EMPHASIS.EXCLUDED);
    const role = members
      .filter((member) => !member.silenced && mayAppearInNarrative(member.priority))
      .reduce((acc, member) => ((acc == null || PRIORITY_RANK[member.priority] > PRIORITY_RANK[acc]) ? member.priority : acc), null)
      || NARRATIVE_PRIORITY.TECHNICAL_ONLY;
    const related = storiesOf(pillarKey, stories);
    const ranks = related.map((story) => Number(story?.rank)).filter((rank) => Number.isFinite(rank));
    const claimIds = [...new Set(related.flatMap((story) => (
      Array.isArray(story?.allowed_claim_ids) ? story.allowed_claim_ids : []
    )))];
    const scope = seatScopeOf(members);
    // THE PILLAR'S OWN LEAD: the strongest result that may be told beneath this
    // pillar, with the language its own achieved result has earned. Read separately
    // from the global rank, so a pillar's evidence can shine without taking over the story.
    const leads = pillarLeadEvidence(ordered);
    const leadKeys = new Set(leads.ids);
    // The bass is read as parts of the one Dynamic Range story; the other pillars
    // are one story each, with no part list of their own.
    const parts = pillarKey === PILLAR.DYNAMIC_RANGE ? BASS_PARTS.map((part) => partOf(part, members)) : [];
    const clauses = [...new Set([
      ...parts.map((part) => part.clause).filter(Boolean),
      consistencyClauseFor(pillarKey, members),
      // The language each of this pillar's own lead results has earned.
      ...leads.clauses,
    ].filter(Boolean))];

    pillars.push({
      pillar: pillarKey,
      label: definition.label,
      question: definition.question,
      why_care: definition.why_care,
      translation: seatingSuppressed ? withoutSeatNarration(definition.translation) : [...definition.translation],
      vocabulary: [...definition.vocabulary],
      register_examples: [...definition.register_examples],
      success_note: definition.success_note,
      rule: definition.rule,
      // How much of this pillar the evidence supports telling, and in what order.
      emphasis_note: emphasisNoteOf(pillarKey, ordered),
      emphasis_order: ordered.map((member) => String(member.key).toUpperCase()),
      selected_ids: selected.map((member) => String(member.key).toUpperCase()),
      // THE GLOBAL NARRATIVE PRIORITY: how much space this pillar gets in the proposal.
      role,
      role_label: PRIORITY_LABEL[role] || null,
      // THE PILLAR EVIDENCE PRIORITY: which result leads this pillar, and the language
      // that result has earned. The two are decided separately and never override
      // one another — the space follows the role, the language follows the lead.
      lead_evidence: {
        ids: leads.ids,
        level: leads.level,
        clauses: leads.clauses,
        // The register's sentence form, which names the seating: handed over only
        // where the seating may be named at all.
        vocabulary: seatingSuppressed ? [] : leads.sentences,
        rule: leads.rule,
      },
      lead_note: leadNoteOf(leads, PRIORITY_LABEL[role] || null),
      seat_narration: seatingSuppressed ? 'banned' : 'allowed',
      seat_narration_rule: seatingSuppressed ? SEAT_FREE_PILLAR_EVIDENCE_RULE : null,
      rank: ranks.length > 0 ? Math.min(...ranks) : null,
      brief_relevance: ordered[0]?.brief_relevance ?? null,
      context: context ? {
        intent: context.intent ?? null,
        room_type: context.room_type ?? null,
        intended_use: context.intended_use ?? null,
      } : null,
      parameter_ids: members.map((member) => String(member.key).toUpperCase()),
      members: ordered.map((member) => evidenceMember(member, leadKeys)),
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
    design_rationale: buildSeatingRationaleStory({
      rows: list,
      parameterEvidence,
      context: { ...(context || {}), seatingSuppressed },
    }),
  };
}

/** The consistency clause belongs to the bass story inside Dynamic Range alone. */
function consistencyClauseFor(pillarKey, members) {
  return pillarKey === PILLAR.DYNAMIC_RANGE ? consistencyClause(members) : null;
}

/**
 * THE SEATING RATIONALE (RP22 P1), as the writer receives it.
 *
 * The client and the installer ask why the seats are not against the back wall. The
 * evidence records the clearance as a design decision, so the answer is a REASON,
 * never a result: the approved rationale language is handed over as wording to
 * express in the writer's own words, the distance stays evidence (it is never
 * quoted as the benefit), and no promise is made about a measured outcome.
 *
 * It is NOT a pillar and never a performance headline, its availability does not
 * depend on the level it reached, and the designer's own seating steer suppresses it
 * entirely.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.rows] — the narrative rows (its P1 row decides the role)
 * @param {Object|null} [input.parameterEvidence]
 * @param {Object|null} [input.seating] — the frozen seating facts (row and seat counts)
 * @param {Object|null} [input.context] — { seatingSuppressed, claim_ids, room_type }
 * @returns {Object} the seating design rationale, or an unavailable one with its reason
 */
export function buildSeatingRationaleStory({
  rows = [],
  parameterEvidence = null,
  seating = null,
  context = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((entry) => String(entry?.key) === 'p1') || null;
  const direct = parameterEvidence?.p1 || parameterEvidence?.P1 || null;
  const clearance = direct?.value ?? row?.value ?? null;
  const seatsStated = Number(seating?.seat_count) || 0;
  const suppressed = Boolean(row?.silenced)
    || context?.seatingSuppressed === true
    || (Array.isArray(context?.suppressedAreas) && context.suppressedAreas.includes('client_experience'));
  const role = row?.priority ?? null;
  const available = !suppressed && (row != null || direct != null);

  return {
    subject: 'seating_position',
    kind: 'design_rationale',
    available,
    suppressed,
    suppressed_reason: suppressed
      ? 'the designer marked the seating subject do not discuss: the seating decision and its rationale are not written'
      : null,
    priority: role,
    // The approved rationale, to express in the writer's own words. It states no
    // parameter, no level, no equation and no promise.
    wording: available ? { ...P1_RATIONALE_LANGUAGE } : null,
    statements: available
      ? [P1_RATIONALE_LANGUAGE.principle, P1_RATIONALE_LANGUAGE.decision]
      : [],
    framing: available ? P1_RATIONALE_LANGUAGE.question : null,
    // The clearance itself: evidence for the technical table. It is never quoted as
    // the benefit, and the distance to the nearest boundary stays a separate
    // measurement from the distance to the wall behind the seating.
    clearance_evidence: {
      stated: clearance != null,
      value: clearance,
      quote_the_distance_in_prose: false,
      seats_recorded: seatsStated > 0,
      seat_count: seatsStated || null,
      row_count: Number(seating?.row_count) || null,
    },
    seat_scope: SEAT_SCOPE.NONE,
    claim_ids: Array.isArray(context?.claim_ids) ? [...context.claim_ids] : [],
    rule: SEATING_RATIONALE_RULE,
    note: SEATING_RATIONALE_NOTE,
    source: 'RP22 P1 seating clearance, read from the saved evidence',
  };
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
    seating_rationale_rule: SEATING_RATIONALE_RULE,
    always_available_rule: PILLAR_ALWAYS_AVAILABLE_RULE,
    emphasis_rule: EVIDENCE_EMPHASIS_RULE,
    lead_rule: PILLAR_LEAD_RULE,
    seat_narration_rule: SEAT_FREE_PILLAR_EVIDENCE_RULE,
    seat_narration_applies_when: 'a pillar carries seat_narration: "banned" — the designer has ruled the seating out of the narrative',
    emphasis_values: Object.values(EVIDENCE_EMPHASIS).filter((value) => value !== EVIDENCE_EMPHASIS.EXCLUDED),
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
    seating_field: 'evidence.options[].design_rationale',
    source: 'the canonical pillar grouping, over the same classified evidence as strength_stories',
  };
}

/**
 * The block the writer input carries: the rules the copy is held to and one
 * evidence set's pillar stories.
 */
export function buildClientStoryPillarBlock({ rows = [], stories = [], parameterEvidence = null, context = null } = {}) {
  const { pillars, silenced, non_pillar, design_rationale } = buildClientStoryPillars({
    rows, stories, parameterEvidence, context,
  });
  return {
    ...clientStoryPillarRules(),
    pillars: pillars.map((pillar) => ({ ...pillar })),
    silenced,
    non_pillar,
    design_rationale,
  };
}

/** The block as prompt lines, so the rules reach the writer as it reads its contract. */
export function clientStoryPillarLines() {
  return [
    '=== THE THREE PILLARS ORGANISE THE CLIENT STORY ===',
    CORE_STORY_RULE,
    PILLAR_ALWAYS_AVAILABLE_RULE,
    STORY_HIERARCHY_RULE,
    NARRATIVE_METHOD_RULE,
    EVIDENCE_EMPHASIS_RULE,
    PILLAR_LEAD_RULE,
    SEAT_FREE_PILLAR_EVIDENCE_RULE,
    PILLAR_STRUCTURE_RULE,
    EVIDENCE_NOT_HEADLINE_RULE,
    BASS_STORY_RULE,
    ...pillarReferenceLines(),
    INFRASONIC_RULE,
    PRIMARY_SEAT_SCOPE_RULE,
    BRIEF_CONTEXT_RULE,
    SEATING_RATIONALE_NOTE,
    SEATING_RATIONALE_RULE,
    'The pillar stories for each option are carried in evidence.options[].client_story_pillars, with each result\'s emphasis, the parts of the bass story, the clause each result has earned, the claims to cite and the seats each claim holds for: write all three pillars, and let each one\'s emphasis decide how much of its evidence the story tells.',
    'The seating rationale for each option is carried in evidence.options[].design_rationale: where it is available, explain why the seating sits where it does, in the section that already explains the seating, and never as a performance claim.',
    '',
  ];
}

export default buildClientStoryPillars;