/**
 * writerEditorialRules.js (shared)
 * --------------------------------
 * THE editorial rules of the proposal voice: the wording a proposal never
 * carries, and the display language it must speak.
 *
 * The validator's grounding rules are untouched by this module. These rules are
 * about HOW a supported fact is written, never about whether it is supported:
 *
 *   REPORT_VOICE        the software-report register a proposal never uses
 *                       ("assessed for", "this parameter", "performance result").
 *   COMPARATIVE         comparative capability language, refused in a
 *                       single-option proposal because there is no baseline or
 *                       other option to compare against. A comparison proposal
 *                       legitimately compares, so the rule is scoped to
 *                       single-option packs by the caller.
 *   INSTALLATION        an installation-state claim. The proposal is written
 *                       before installation, so the default is specified,
 *                       selected, designed, modelled or proposed.
 *   DISPLAY             the display terminology. A TV is never described with
 *                       projector words, an aspect ratio, a viewable width or a
 *                       screen size, though the speaker-role words that carry
 *                       "screen" (the screen stage, the screen channels) are
 *                       engineering vocabulary and are left alone.
 *
 * Every rule reports a rule id, never the phrase itself, so a rejection is
 * machine-readable and the audit never quotes client copy.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The proposal modes a frozen pack may carry. */
export const PROPOSAL_MODE_SINGLE = 'single';
export const PROPOSAL_MODE_COMPARISON = 'comparison';

/** True only for a pack the builder marked as a single-option proposal. */
export function isSingleOptionProposal(mode) {
  return mode === PROPOSAL_MODE_SINGLE;
}

/**
 * The software-report register. Each entry is a pattern a proposal never uses.
 * Deliberately narrow: the engineering vocabulary a proposal legitimately
 * carries ("the assessed seating positions", "the assessment shows") is not
 * touched, only the report's own field-reporting voice.
 */
export const REPORT_VOICE_RULES = Object.freeze([
  { rule: 'assessed_for', pattern: /\bassessed\s+for\b/i },
  { rule: 'according_to_the_report', pattern: /\baccording\s+to\s+the\s+(?:report|reports|assessment|analysis|review)\b/i },
  { rule: 'this_parameter', pattern: /\bthis\s+parameter\b/i },
  { rule: 'performance_result', pattern: /\bperformance\s+results?\b/i },
  { rule: 'established_configuration', pattern: /\bestablished\s+configuration\b/i },
  { rule: 'calculated_design_result', pattern: /\bcalculated\s+design\s+result\b/i },
  { rule: 'this_proposal_details', pattern: /\bthis\s+proposal\s+details\b/i },
  { rule: 'design_remains_consistent', pattern: /\b(?:the\s+)?design\s+remains?\s+consistent\b/i },
  { rule: 'nothing_to_report', pattern: /\bthere\s+are\s+no\s+changes\s+to\s+report\b|\bno\s+changes\s+to\s+report\b/i },
]);

/**
 * Comparative capability language. Refused in a SINGLE-OPTION proposal: with no
 * baseline and no second option, "increase", "greater", "improved" and
 * "additional headroom" compare the design to nothing.
 */
export const COMPARATIVE_RULES = Object.freeze([
  { rule: 'increase', pattern: /\bincreas(?:e|es|ed|ing)\b/i },
  { rule: 'improved', pattern: /\b(?:improve|improves|improved|improving|improvement|improvements)\b/i },
  { rule: 'greater', pattern: /\bgreater\b/i },
  { rule: 'more_capable', pattern: /\bmore\s+capable\b/i },
  { rule: 'additional_headroom', pattern: /\b(?:additional|extra|more|further)\s+headroom\b/i },
  { rule: 'higher_performance', pattern: /\bhigher\s+(?:output|capability|performance|headroom|specification)\b/i },
  { rule: 'upgrade', pattern: /\bupgrade\b/i },
  { rule: 'compared_with', pattern: /\bcompared\s+(?:to|with)\b/i },
]);

/**
 * The installation-state claim. Written before installation, a proposal
 * describes what is specified and designed, not what has been fitted.
 */
export const INSTALLATION_RULES = Object.freeze([
  { rule: 'installed', pattern: /\binstall(?:ed|ation|ations|s|ing)\b/i },
]);

/**
 * The display language a TV never uses. The engineering vocabulary that carries
 * "screen" as a speaker role — the screen stage, the screen channels, the
 * screen-wall speakers — is deliberately absent from this list.
 */
export const TV_DISPLAY_RULES = Object.freeze([
  { rule: 'projector_terminology', pattern: /\bprojector\b|\bprojection\s+screen\b/i },
  { rule: 'aspect_ratio', pattern: /\baspect\s+ratio\b|\b16\s*:\s*9\b|\b2\.35\s*:\s*1\b/i },
  { rule: 'viewable_width', pattern: /\bviewable\s+width\b|\bimage\s+width\b|\bscreen\s+width\b/i },
  { rule: 'screen_size', pattern: /\bscreen\s+size\b|\bscreen\s+diagonal\b|\bdiagonal\b/i },
  { rule: 'screen_for_the_display', pattern: /\b\d+(?:\.\d+)?"\s+screen\b|\bscreen\s+at\s+\d/i },
]);

/** The display types a frozen evidence pack states. */
export function isTvDisplay(displayType) {
  return String(displayType || '').toLowerCase() === 'tv';
}

/** The first matching editorial rule, or null. */
function firstRule(text, rules) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  for (const entry of rules) {
    const match = entry.pattern.exec(sentence);
    if (match) return { rule: entry.rule, at: match.index };
  }
  return null;
}

/** The software-report register a sentence carries, or null. */
export function reportVoicePhrase(text) {
  return firstRule(text, REPORT_VOICE_RULES);
}

/**
 * The comparative language a single-option proposal must not carry, or null.
 * The caller scopes this to single-option packs: a comparison legitimately
 * compares.
 */
export function unsupportedComparative(text) {
  return firstRule(text, COMPARATIVE_RULES);
}

/** The installation-state claim a sentence carries, or null. */
export function installationStateClaim(text) {
  return firstRule(text, INSTALLATION_RULES);
}

/**
 * The display terminology a sentence misuses, or null. Only a TV display is
 * held to this: a projection screen keeps its own language.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string} args.displayType — 'tv' | 'projector_screen' | null
 */
export function displayTerminologyIssue({ text, displayType } = {}) {
  if (!isTvDisplay(displayType)) return null;
  return firstRule(text, TV_DISPLAY_RULES);
}

/**
 * The display type the frozen pack states, for the display rule. Read
 * location-tolerantly from the pack the writer was given: the frozen screen
 * identity where it is carried, else the display context of the ranked stories,
 * which is the same frozen identity.
 *
 * @param {Object} pack
 * @returns {string|null}
 */
export function displayTypeOfPack(pack) {
  if (!pack || typeof pack !== 'object') return null;
  const carried = [
    pack?.facts?.room?.screen?.display_type,
    pack?.room?.screen?.display_type,
    pack?.screen?.display_type,
    pack?.display?.display_type,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (carried) return carried;

  const stories = (Array.isArray(pack.options) ? pack.options : [])
    .flatMap((option) => (Array.isArray(option?.strength_stories) ? option.strength_stories : []));
  const fromStory = stories
    .map((story) => story?.display_context?.display_type)
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  return fromStory || null;
}

export default reportVoicePhrase;