/**
 * writerNarrativeSteerRules.js (shared)
 * -------------------------------------
 * HOW THE DESIGNER'S NARRATIVE PREFERENCES REACH THE WRITER — as ingredients,
 * never as a section plan.
 *
 * The wizard's narrative steer gives every topic one of three states (neutral,
 * prefer, do not discuss). They arrive here as two lists of SUBJECTS and are
 * carried to the writer in exactly that form:
 *
 *   preferred_topics  subjects to give more weight to IF they fit the story;
 *   excluded_topics   subjects kept out of the client-facing narrative.
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a requirement, not a checklist and not
 * a section order. A preferred topic never becomes a paragraph of its own, never
 * becomes a heading, never forces a parameter or a figure into the copy, and is
 * never restated in every section it could touch. The copy stays ONE coherent
 * project story: the writer decides where, whether and how a preference belongs,
 * and it may appear briefly, in passing, combined with another point, or not at
 * all where forcing it would damage the writing.
 *
 * WHO OUTRANKS WHOM. The designer's own written brief remains the stronger
 * authority. Where the brief itself asks about a subject, the brief wins and the
 * preference changes nothing about that answer.
 *
 * A preferred topic adds no claim and no evidence. It weighs the evidence the
 * pack already allows; it never widens a scope, promotes a weak result, or
 * converts a supporting result into a strength.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { EXCLUDED_TOPIC_RULE } from '../proposalNarrativeExclusions.js';

/** The steer contract's own generation, so a refinement is traceable. */
export const NARRATIVE_STEER_VERSION = 1;

/**
 * The rule that governs the preferred topics. Stated as the writer reads it, so
 * the preference and its own prohibition travel together.
 */
export const PREFERRED_TOPIC_RULE = 'NARRATIVE PREFERENCES ARE INGREDIENTS, NOT A SECTION PLAN: the preferred topics below are subjects the designer wants weighed more heavily IF they help tell this project\'s story naturally. They are never requirements. Never write one paragraph per preferred topic, never work through them in order, never give one a heading, and never force a figure, a parameter or a claim into the copy because its subject was preferred. A preferred topic may appear briefly, in passing, combined with another point, or not at all where forcing it would damage the writing. The document is ONE coherent story about this cinema: where a preference fits it, give it more weight than a less relevant part of the evidence; where it does not fit, write the better account without it. A preference never adds a claim, widens a scope, promotes a weak or unremarkable result, or turns a result the client asked for into a headline. Where the designer\'s own brief addresses a subject, the brief is the stronger authority and these preferences change nothing about that answer.';

/** The one-line meaning of the neutral state, for the record the writer carries. */
export const NEUTRAL_TOPIC_NOTE = 'topics with no state recorded are neither preferred nor excluded: decide from the design story whether they are worth raising';

/**
 * Normalise a steer into the two lists the writer input carries. Labels are read
 * as subjects; blanks, duplicates and anything that is not text are dropped, and
 * the empty case is returned explicitly rather than omitted.
 */
export function normaliseNarrativeSteer(steer = null) {
  const list = (value) => {
    const seen = new Set();
    const out = [];
    for (const entry of Array.isArray(value) ? value : []) {
      const topic = String(entry ?? '').trim().replace(/\s+/g, ' ');
      if (!topic) continue;
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(topic);
    }
    return out;
  };
  const preferred = list(steer?.preferred_topics);
  const excluded = list(steer?.excluded_topics);
  const keys = list(steer?.excluded_topic_keys);
  // A topic cannot be preferred and excluded at once: the exclusion wins, because
  // it is the instruction the designer made explicitly about the copy.
  const excludedKeys = new Set(keys.map((entry) => entry.toLowerCase()));
  const excludedNames = new Set(excluded.map((entry) => entry.toLowerCase()));
  return {
    preferred_topics: preferred.filter((topic) => (
      !excludedNames.has(topic.toLowerCase()) && !excludedKeys.has(topic.toLowerCase())
    )),
    excluded_topics: excluded,
    excluded_topic_keys: keys,
  };
}

/**
 * The block the writer input carries. It never states a figure, a claim or a
 * product, and it never restates the brief: it names the subjects to weigh and
 * the subjects to leave out, with the rules that govern both.
 */
export function buildNarrativeSteerBlock(steer = null) {
  const normalised = normaliseNarrativeSteer(steer);
  const steered = normalised.preferred_topics.length > 0 || normalised.excluded_topics.length > 0;
  return {
    rule: PREFERRED_TOPIC_RULE,
    exclude_rule: EXCLUDED_TOPIC_RULE,
    neutral_note: NEUTRAL_TOPIC_NOTE,
    source: 'the designer\'s narrative steer: soft preferences about what this proposal emphasises, never required sections',
    supplied: steered,
    version: NARRATIVE_STEER_VERSION,
    preferred_topics: normalised.preferred_topics,
    excluded_topics: normalised.excluded_topics,
    excluded_topic_keys: normalised.excluded_topic_keys,
  };
}

/** Whether the designer steered anything at all. */
export function narrativeSteerSupplied(steer = null) {
  const normalised = normaliseNarrativeSteer(steer);
  return normalised.preferred_topics.length > 0 || normalised.excluded_topics.length > 0;
}

export default buildNarrativeSteerBlock;