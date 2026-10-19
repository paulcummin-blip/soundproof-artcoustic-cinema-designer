/**
 * adiDesignKnowledgeModel.js (shared)
 * -----------------------------------
 * WHAT ADI MAY LEARN FROM A DESIGNER'S ANSWER, AND WHAT IT MAY NEVER LEARN.
 *
 * WHY IT EXISTS. ADI asks a designer why a decision was made — six overheads, a
 * four-subwoofer arrangement, a seating priority, acoustic treatment. The answer
 * explains THIS design. The same reason recurs across designs: a two-row cinema
 * with a .6 overhead layout is regularly arranged so the front and rear pairs sit
 * outside the audience and the middle pair closes the gap between them. That is
 * reusable DESIGN INTENT, and asking the same question on every future project
 * wastes the designer's time and loses what the answer taught.
 *
 * WHAT THIS MODULE DECIDES, ON ITS OWN:
 *
 *   - the TOPIC an answer teaches, from the clarification it answered;
 *   - the DESIGN CONDITION the answer was given under — the state of the design
 *     that the reason belongs to. The condition matters as much as the answer:
 *     "six overheads are better" is never learned, "for a two-row cinema using a
 *     .6 overhead layout the recurring rationale is ..." is;
 *   - whether the answer may be learned AT ALL. A passed question, a blank
 *     answer, a project result (this room achieved 22 Hz, this design reached
 *     P19 L4), a project-specific constraint (the room is 3.2 m wide), a budget,
 *     a price, an address or any personal or commercial detail is NEVER learned
 *     and never becomes a general rule. It stays the project's own answer;
 *   - the CANONICAL, context-first wording of a rationale, built from the design
 *     condition and the meaning the designer expressed — never from one answer's
 *     phrasing, so the designer is never required to word anything identically.
 *
 * THE AUTHORITY ORDER IS FIXED, AND THIS MODULE NEVER MOVES IT:
 *   1. current project evidence   2. current project clarifications
 *   3. learned ADI design knowledge   4. ask the designer
 * Learned knowledge is a design assistant. It never overrides evidence, results,
 * an explicit answer, the client brief or the room's actual geometry.
 *
 * Pure: no React, no SDK, no writes, no network.
 */

const NUMBER_WORDS = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);

/** The topics ADI may learn. Each is a WHY question about a design decision. */
export const KNOWLEDGE_TOPIC = Object.freeze({
  OVERHEAD_COUNT: 'overhead_count_rationale',
  SUBWOOFER_ARRANGEMENT: 'subwoofer_arrangement_rationale',
  SEATING_PRIORITY: 'seating_priority_rationale',
  ACOUSTIC_TREATMENT: 'acoustic_treatment_rationale',
});

/** ADI's own clarification question → the topic its answer teaches. */
export const QUESTION_TOPIC = Object.freeze({
  overhead_speaker_reason: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
  subwoofer_arrangement_reason: KNOWLEDGE_TOPIC.SUBWOOFER_ARRANGEMENT,
  seating_priority_reason: KNOWLEDGE_TOPIC.SEATING_PRIORITY,
  acoustic_treatment_reason: KNOWLEDGE_TOPIC.ACOUSTIC_TREATMENT,
});

/** A clarification's area → the topic it teaches, when no question id is carried. */
export const AREA_TOPIC = Object.freeze({
  overheads: KNOWLEDGE_TOPIC.OVERHEAD_COUNT,
  subwoofers: KNOWLEDGE_TOPIC.SUBWOOFER_ARRANGEMENT,
  seating: KNOWLEDGE_TOPIC.SEATING_PRIORITY,
  acoustic_treatment: KNOWLEDGE_TOPIC.ACOUSTIC_TREATMENT,
});

/** Where a knowledge record stands. `disabled` is an admin decision, final until reversed. */
export const KNOWLEDGE_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  STRENGTHENED: 'strengthened',
  LEARNED: 'learned',
  DISABLED: 'disabled',
});

export const CONFIDENCE_BAND = Object.freeze({
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
});

/**
 * THE PROMOTION RULE. One answer is never global knowledge.
 *   1 matching project   → candidate
 *   2 matching projects  → strengthened candidate
 *   3 matching projects  → learned ADI rationale
 * Projects, not answers: the same designer answering twice on one project teaches nothing new.
 */
export const PROMOTION_RULE = Object.freeze({
  STRENGTHEN_PROJECTS: 2,
  LEARN_PROJECTS: 3,
  HIGH_CONFIDENCE_AT: 3,
  MODERATE_CONFIDENCE_AT: 2,
});

/** What ADI should do about a question, in the fixed authority order. */
export const KNOWLEDGE_USE = Object.freeze({
  PROJECT_ANSWER: 'project_answer',
  LEARNED: 'learned',
  CONFIRM: 'confirm',
  ASK: 'ask',
});

/** Why an answer could not be learned. Every refusal is a stated reason. */
export const UNLEARNABLE_REASON = Object.freeze({
  NO_ANSWER: 'no_answer_or_passed',
  PROJECT_RESULT: 'project_result_not_design_intent',
  PROJECT_CONSTRAINT: 'project_specific_constraint',
  PERSONAL_OR_COMMERCIAL: 'personal_or_commercial_detail',
});

const PASS_ANSWER = /^(?:pass|passed|skip|skipped|n\/?a|none|no comment|unknown|-|—|\.)$/i;

/** A measured or graded outcome: evidence about THIS room, never a design rule. */
const PROJECT_RESULT = [
  /\b\d+(?:[.,]\d+)?\s*(?:hz|khz|db|dba|dbc|dbspl)\b/i,
  /\bp(?:1[2-9]|2[0-3])\b[^.]{0,12}\bl[1-4]\b/i,
  /\bl[1-4]\b[^.]{0,12}\bp(?:1[2-9]|2[0-3])\b/i,
  /\b(?:achieved|achieves|measured|calculated|result(?:ed)?|reaches|delivers)\b[^.]{0,40}\b\d/i,
];

/** The room's own geometry and construction: this project's constraint, not a rule. */
const PROJECT_CONSTRAINT = [
  /\b\d+(?:[.,]\d+)?\s*(?:m|mm|cm|metres?|meters?|ft|feet|inch(?:es)?|"|')\b/i,
  /\b(?:because|due to|owing to|as)\s+(?:the\s+)?(?:room|ceiling|wall|floor|structure|joist|beam|bulkhead|slope|alcove|window|door)\b/i,
];

/** Budgets, prices, addresses and personal details are never knowledge. */
const PERSONAL_OR_COMMERCIAL = [
  /\b(?:budget|cost|price|pricing|quote|invoice|paid|spend|spent)\b/i,
  /[£$€]\s?\d/,
  /\b\d+\s?(?:k|thousand)\b\s*(?:budget|pounds|dollars|euros)?/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\b(?:tel|phone|mobile|call)\b[^.]{0,12}\d{4,}/i,
  // A telephone number written on its own, with no key word in front of it.
  /\b\d[\d\s()+/-]{6,}\d\b/,
  /\b(?:mr|mrs|ms|miss|dr|sir|lady|prof)\b\.?\s+[A-Z][a-z]+/,
  /\b(?:client|customer|owner|homeowner)\b[^.]{0,20}\b[A-Z][a-z]{2,}\b/,
  /\b(?:postcode|zip|address|street|road|avenue|lane|drive|house number)\b/i,
  /\b(?:his|her|their)\s+(?:wife|husband|partner|children|kids|family)\b/i,
];

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `6` reads as 'six'. Beyond the word list the digits are kept. */
export function countWord(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return asText(String(value ?? ''));
  const whole = Math.round(count);
  return whole >= 0 && whole < NUMBER_WORDS.length ? NUMBER_WORDS[whole] : String(whole);
}

/**
 * `2` reads as 'two'; a count read back from text ('two') reads as 2. A count the design
 * does NOT state is null — never zero: a condition built from an unstated value would
 * describe a design that does not exist, and a rationale learned for a two-row cinema
 * would then read as though it belonged to a one-row room.
 */
export function countValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return Math.round(direct);
  const text = String(value).trim().toLowerCase();
  const index = NUMBER_WORDS.indexOf(text);
  return index >= 0 ? index : null;
}

/** The topic a clarification teaches, or null when it teaches nothing learnable. */
export function topicForQuestion(questionId, area = null) {
  const id = asText(String(questionId || ''));
  if (id && QUESTION_TOPIC[id]) return QUESTION_TOPIC[id];
  const key = asText(String(area || ''));
  return key && AREA_TOPIC[key] ? AREA_TOPIC[key] : null;
}

/** The confidence band that governs what ADI does with a record. */
export function confidenceBand(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return CONFIDENCE_BAND.LOW;
  if (value >= 0.8) return CONFIDENCE_BAND.HIGH;
  if (value >= 0.5) return CONFIDENCE_BAND.MODERATE;
  return CONFIDENCE_BAND.LOW;
}

/**
 * The confidence a record has earned from the projects that agree with it. An
 * admin approval sets the floor at high; a contested record is held at low.
 */
export function confidenceForProjects(projects, { approved = false, contested = false } = {}) {
  const count = Number(projects);
  const seen = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (contested) return 0.3;
  let score = 0.25;
  if (seen >= PROMOTION_RULE.HIGH_CONFIDENCE_AT) score = 0.8 + Math.min(0.15, (seen - PROMOTION_RULE.LEARN_PROJECTS) * 0.05);
  else if (seen >= PROMOTION_RULE.MODERATE_CONFIDENCE_AT) score = 0.55;
  return approved ? Math.max(score, 0.85) : score;
}

/** The status a record has earned from agreeing projects, before any admin decision. */
export function statusForProjects(projects) {
  const seen = Number(projects);
  if (!Number.isFinite(seen) || seen < PROMOTION_RULE.STRENGTHEN_PROJECTS) return KNOWLEDGE_STATUS.CANDIDATE;
  return seen >= PROMOTION_RULE.LEARN_PROJECTS ? KNOWLEDGE_STATUS.LEARNED : KNOWLEDGE_STATUS.STRENGTHENED;
}

/** The overhead positions a count implies: the layout the reason is about. */
export function overheadPositions(count) {
  const value = countValue(count);
  if (value === null || value < 2) return 'a single pair';
  if (value >= 6) return 'front, middle and rear';
  if (value >= 4) return 'front and rear';
  return 'a single pair';
}

/**
 * THE DESIGN CONDITION: the state of the design the reason belongs to. Read from
 * the frozen design where the caller has it, and otherwise from ADI's own
 * question, which is built from the frozen evidence and names the design's own
 * counts. Nothing here is invented: a value the evidence does not state is absent.
 */
export function buildDesignCondition({
  question = null,
  area = null,
  rows = null,
  overheads = null,
  subwoofers = null,
  treatmentPanels = null,
  treatmentProduct = null,
} = {}) {
  const text = asText(String(question?.question || question || '')) || '';
  const read = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = countValue(match[1]);
        if (value !== null) return value;
      }
    }
    return null;
  };

  const rowCount = countValue(rows) ?? read([
    /\b(\d+|one|two|three|four|five|six)[- ]row\b/i,
    /\b(\d+|one|two|three|four|five|six)\s+rows?\b/i,
  ]);
  const overheadCount = countValue(overheads) ?? read([
    /\b(\d+|one|two|three|four|five|six)\s+overhead\s+(?:loud)?speakers?\b/i,
    /\b(\d+|one|two|three|four|five|six)\s+overheads?\b/i,
  ]);
  const subwooferTotal = countValue(subwoofers) ?? read([
    /\b(\d+|one|two|three|four|five|six)[- ]subwoofer\b/i,
    /\b(\d+|one|two|three|four|five|six)\s+subwoofers?\b/i,
  ]);
  const panels = countValue(treatmentPanels) ?? read([
    /\b(\d+|one|two|three|four|five|six)\s+[a-z]+\s+panels?\b/i,
    /\b(\d+|one|two|three|four|five|six)\s+panels?\b/i,
  ]);
  const product = asText(String(treatmentProduct || ''))
    || (() => {
      const match = text.match(/\b(?:the\s+)?(\d+|one|two|three|four|five|six)\s+([A-Za-z][A-Za-z0-9' -]*?)\s+panels?\b/i);
      return match ? asText(match[2]) : null;
    })();

  const condition = {
    rows: rowCount,
    overheads: overheadCount,
    overhead_layout: overheadCount === null ? null : `.${overheadCount}`,
    overhead_positions: overheadCount === null ? null : overheadPositions(overheadCount),
    subwoofers: subwooferTotal,
    treatment_panels: panels,
    treatment_product: panels === null ? null : product,
  };
  for (const key of Object.keys(condition)) {
    if (condition[key] === null || condition[key] === undefined) delete condition[key];
  }
  return condition;
}

/** The condition stated as the designer would read it: 'two seating rows', 'six overhead speakers'. */
export function conditionStatements(condition = {}) {
  const out = [];
  if (condition.rows) out.push(`${countWord(condition.rows)} seating row${Number(condition.rows) === 1 ? '' : 's'}`);
  if (condition.overheads) {
    out.push(`${countWord(condition.overheads)} overhead speaker${Number(condition.overheads) === 1 ? '' : 's'}`);
    if (condition.overhead_positions) out.push(`${condition.overhead_positions} overhead layout`);
  }
  if (condition.subwoofers) out.push(`${countWord(condition.subwoofers)} subwoofers`);
  if (condition.treatment_panels) {
    out.push(`${countWord(condition.treatment_panels)} ${condition.treatment_product || 'acoustic treatment'} panels`);
  }
  return out;
}

/**
 * A stable key for one design condition. Two answers are only ever compared
 * inside the same condition, so a reason given for a two-row .6 layout is never
 * learned as a reason for a four-row .4 layout.
 */
export function conditionKey(condition = {}) {
  return [
    `rows=${condition.rows ?? '-'}`,
    `oh=${condition.overheads ?? '-'}`,
    `subs=${condition.subwoofers ?? '-'}`,
    `panels=${condition.treatment_panels ?? '-'}`,
  ].join('|');
}

/** The condition as it reads inside a canonical rationale. */
export function conditionPhrase(condition = {}, topic = null) {
  const rows = condition.rows ? `${countWord(condition.rows)}-row` : null;
  const cinema = rows ? `a ${rows} cinema` : 'a cinema';
  switch (topic) {
    case KNOWLEDGE_TOPIC.OVERHEAD_COUNT:
      return condition.overhead_layout
        ? `${cinema} using a ${condition.overhead_layout} overhead layout`
        : cinema;
    case KNOWLEDGE_TOPIC.SUBWOOFER_ARRANGEMENT:
      return condition.subwoofers
        ? `${cinema} with ${countWord(condition.subwoofers)} subwoofers`
        : cinema;
    case KNOWLEDGE_TOPIC.ACOUSTIC_TREATMENT:
      return condition.treatment_panels
        ? `${cinema} with ${countWord(condition.treatment_panels)} acoustic panels`
        : cinema;
    default:
      return cinema;
  }
}

/** The identity of one learned matter: the topic read under one condition. */
export function knowledgeKey(topic, condition = {}) {
  return `${topic}::${conditionKey(condition)}`;
}

/**
 * MAY THIS ANSWER BE LEARNED? A design rationale may; a project result, a
 * project-specific constraint, a budget, an address or a personal detail may NOT.
 * The caller keeps those answers with the project they were given for — the answer
 * is never thrown away, it is simply never generalised.
 */
export function learnabilityOfAnswer(answer) {
  const text = asText(typeof answer === 'string' ? answer : answer?.answer);
  if (!text) return { learnable: false, reason: UNLEARNABLE_REASON.NO_ANSWER };
  if (PASS_ANSWER.test(text)) return { learnable: false, reason: UNLEARNABLE_REASON.NO_ANSWER };
  if (PROJECT_RESULT.some((pattern) => pattern.test(text))) {
    return { learnable: false, reason: UNLEARNABLE_REASON.PROJECT_RESULT };
  }
  if (PERSONAL_OR_COMMERCIAL.some((pattern) => pattern.test(text))) {
    return { learnable: false, reason: UNLEARNABLE_REASON.PERSONAL_OR_COMMERCIAL };
  }
  if (PROJECT_CONSTRAINT.some((pattern) => pattern.test(text))) {
    return { learnable: false, reason: UNLEARNABLE_REASON.PROJECT_CONSTRAINT };
  }
  return { learnable: true, reason: null };
}

/**
 * THE CANONICAL RATIONALE: the meaning stated once, in context, without the
 * wording of any single answer. Built from the design condition and the concepts
 * the designers' answers shared, so no designer has to phrase anything the same
 * way twice and no one answer becomes the record.
 */
const CONCEPT_CLAUSE = Object.freeze({
  [KNOWLEDGE_TOPIC.OVERHEAD_COUNT]: Object.freeze({
    front_rear_envelope: 'keep the front and rear overheads respectively ahead of and behind the audience',
    middle_fills_gap: 'let the middle pair fill the gap between them',
    continuity: 'keep the height layer continuous across the seats',
    separation_control: 'avoid too much separation between the front and rear height channels',
    coverage: 'hold height coverage over every listening position',
    processor_capability: 'work within the processor\'s own channel capability',
  }),
  [KNOWLEDGE_TOPIC.SUBWOOFER_ARRANGEMENT]: Object.freeze({
    front_rear_symmetry: 'place the sources front and rear so the room is driven more evenly',
    seat_to_seat_consistency: 'even out the seat-to-seat bass rather than favour one row',
    room_mode_control: 'spread the sources so fewer room modes dominate one position',
    acoustic_load: 'share the output across cabinets so each works comfortably',
  }),
  [KNOWLEDGE_TOPIC.SEATING_PRIORITY]: Object.freeze({
    sightline: 'hold a clear sightline to the screen from the priority row',
    viewing_angle: 'keep the priority row inside the intended viewing angle',
    comfort: 'give the priority row the most comfortable viewing distance',
    immersion: 'put the priority row where the surround field is strongest',
    access: 'keep the priority row practical to reach in the room',
  }),
  [KNOWLEDGE_TOPIC.ACOUSTIC_TREATMENT]: Object.freeze({
    early_reflections: 'control the first reflections at the front of the room',
    reverberation_control: 'bring the room\'s reverberation into the intended range',
    clarity: 'keep dialogue and detail legible at the seat',
    diffusion: 'disperse energy rather than absorb it where the room needs life',
  }),
});

/** The clause one concept contributes, or null when it contributes nothing. */
export function clauseForConcept(topic, concept) {
  const clauses = CONCEPT_CLAUSE[topic];
  return clauses && clauses[concept] ? clauses[concept] : null;
}

/**
 * Compose the canonical rationale. The condition leads, the shared meaning follows,
 * and no answer's phrasing is reproduced: `For a two-row cinema using a .6 overhead
 * layout, a common rationale is to keep the front and rear overheads respectively
 * ahead of and behind the audience, let the middle pair fill the gap between them
 * and keep the height layer continuous across the seats.`
 */
export function canonicalRationale({ topic = null, condition = {}, concepts = [], fallback = null } = {}) {
  const clauses = (Array.isArray(concepts) ? concepts : [])
    .map((concept) => clauseForConcept(topic, concept))
    .filter(Boolean);
  const phrase = conditionPhrase(condition, topic);
  if (clauses.length === 0) {
    const text = asText(fallback);
    if (!text) return null;
    const first = text.split(/(?<=[.!?])\s+/)[0].replace(/\s+/g, ' ').trim();
    const sentence = /[.!?]$/.test(first) ? first : `${first}.`;
    return `For ${phrase}, a designer's stated rationale is that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  }
  const lead = clauses.slice(0, -1).join(', ');
  const tail = clauses[clauses.length - 1];
  const joined = clauses.length === 1 ? tail : `${lead} and ${tail}`;
  return `For ${phrase}, a common rationale is to ${joined}.`;
}

export default {
  KNOWLEDGE_TOPIC,
  KNOWLEDGE_STATUS,
  CONFIDENCE_BAND,
  PROMOTION_RULE,
  buildDesignCondition,
  conditionKey,
  conditionPhrase,
  conditionStatements,
  knowledgeKey,
  topicForQuestion,
  learnabilityOfAnswer,
  canonicalRationale,
};