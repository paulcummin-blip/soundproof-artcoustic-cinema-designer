/**
 * narrativeDynamicRangeOpening.js (base44/shared — CANONICAL)
 * -----------------------------------------------------------
 * HOW DYNAMIC RANGE OPENS: THE CLIENT EXPERIENCE FIRST, THE EVIDENCE SECOND.
 *
 * The pillar opens with ONE whole-system statement of what the system does as the
 * soundtrack moves from quiet detail to a major peak, and only then is that statement
 * supported by the system's own evidence.
 *
 * THE CLAIM IS READ ACROSS THE LAYERS THAT CARRY DYNAMIC HEADROOM — the screen channels,
 * the surrounds and the low-frequency output — at the WEAKEST of them, so a whole-system
 * statement is never stronger than the least capable layer that carries it. The bass
 * depth and the bass control are SUPPORTING LAYERS: how low the system reaches is a
 * different dimension from how much headroom it has, and the control reading qualifies
 * how the response behaves, so each is told and emphasised at the level its own result
 * earned and neither holds the headroom claim down. EMPHASIS is read at the STRONGEST
 * carrying result of the whole story, including a strong bass depth, so the layer that
 * earned the most is the one given it inside the story.
 *
 * THE LEVELS DECIDE HOW STRONG THE CLAIM MAY BE AND WHICH LAYER IS EMPHASISED. They
 * never decide the sentence order: the highest-level result is never the opening
 * sentence by right, the bass never opens the pillar by default, and neither does the
 * front stage. Where one layer carries the strongest result it is given the greatest
 * emphasis INSIDE the story.
 *
 * This module states the opening language and the rule; the evidence itself is read by
 * narrativePillarGrouping.js from the pillar's own members. No figure, level or scope
 * is changed, averaged or invented here.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { levelRank } from './strengthImportance.js';

/** The opening generation, so a draft is traceable to the opening rule it was written under. */
export const DYNAMIC_RANGE_OPENING_VERSION = 1;

/**
 * The three openings, by the strength the system's carrying results have earned.
 * A modest system is opened positively for the room it is in, never as an apology.
 */
export const DYNAMIC_RANGE_OPENING_TIERS = Object.freeze({
  // The everyday system: clear and relaxed, with real energy when the soundtrack opens up.
  standard: Object.freeze({
    tier: 'standard',
    levels: Object.freeze(['L1', 'L2']),
    claim: 'The system keeps dialogue and everyday viewing clear and relaxed, while still giving films and music real energy when the soundtrack opens up.',
  }),
  // A strong system, told across the whole system rather than across one layer.
  strong: Object.freeze({
    tier: 'strong',
    levels: Object.freeze(['L3']),
    claim: 'The system has strong dynamic range across the front stage, the surrounds and the bass system: quiet dialogue and fine detail stay clear, while the biggest musical and effects peaks arrive with real scale and authority.',
  }),
  // The strongest system: exceptional headroom, told across the whole system.
  exceptional: Object.freeze({
    tier: 'exceptional',
    levels: Object.freeze(['L4']),
    claim: 'This system has exceptional dynamic headroom across the front stage, surrounds and bass system. Quiet dialogue and fine detail can remain composed, while the biggest musical and effects peaks arrive with substantial scale, immediacy and physical impact.',
  }),
});

export const DYNAMIC_RANGE_OPENING_ORDER = Object.freeze(['standard', 'strong', 'exceptional']);

/** The system evidence the opening claim is then supported by, in reading order. */
export const DYNAMIC_RANGE_EVIDENCE_ORDER = Object.freeze([
  'the screen-channel capability',
  'the surround capability',
  'the low-frequency output',
  'the bass depth',
  'the bass control',
]);

export const DYNAMIC_RANGE_OPENING_RULE = `DYNAMIC RANGE OPENS ON THE CLIENT EXPERIENCE, NEVER ON A RESULT. The pillar opens with ONE whole-system statement of what the system does as the soundtrack moves from quiet detail to a major peak — the consequence the client hears — and only then is that statement supported by the system's own evidence: the screen-channel capability, the surround capability, the low-frequency output, the bass depth and the bass control, woven into the story as they naturally arise rather than listed one after another. The opening is read from Dynamic Range's own opening claim, at the strength the system's carrying results have earned. THE RESULT LEVELS DECIDE HOW STRONG THAT CLAIM MAY BE AND WHICH LAYER IS EMPHASISED; THEY NEVER DECIDE THE SENTENCE ORDER. The whole-system claim is a claim about the system's dynamic headroom, so it is read at the WEAKEST of the layers that carry that headroom — the screen channels, the surrounds and the low-frequency output: a whole-system claim is only as strong as the least capable part of the system that carries it, and no single strong layer escalates it. The bass depth and the bass control are TOLD AND EMPHASISED AT THE LEVEL THEIR OWN RESULTS EARNED, and they never hold the headroom claim down. The highest-level result never automatically becomes the opening sentence, the bass never opens the pillar by default, and the front stage never opens it by default: where one layer carries the strongest result, it is given the greatest EMPHASIS inside the story rather than the first sentence by right. Where the system is modest for its brief, the opening says so positively, in the language that brief supports.`;

/**
 * THE SUPPORTING EVIDENCE IS WOVEN IN, NEVER LISTED MECHANICALLY. The system parts and
 * the bass parts the pillar already carries are the evidence for the opening claim;
 * this states how they are read into the prose.
 */
export const DYNAMIC_RANGE_EVIDENCE_WEAVE_RULE = `THE EVIDENCE SUPPORTS THE OPENING, IT DOES NOT REPLACE IT. The screen-channel capability, the surround capability, the low-frequency output, the bass depth and the bass control are woven into the opening statement as they naturally arise — the front stage and the surrounds as the soundtrack becomes demanding, the bass underneath those moments — and never listed one after another as separate talking points. The opening sentence states what the client hears; the evidence behind it is what makes that statement true.`;

/** The tier one strength opens the pillar at, or null where no carrying result exists. */
export function dynamicRangeOpeningTier(level) {
  const rank = levelRank(level);
  // NO CARRYING RESULT: an absent, unassessed or failed level is not a weak result, it is
  // no result at all, so no whole-system claim is opened — the pillar is opened from the
  // evidence it genuinely holds. This is the guard the module's own contract states.
  if (rank < (levelRank('L1') ?? 1)) return null;
  if (rank >= (levelRank('L4') ?? 4)) return DYNAMIC_RANGE_OPENING_TIERS.exceptional;
  if (rank >= (levelRank('L3') ?? 3)) return DYNAMIC_RANGE_OPENING_TIERS.strong;
  return DYNAMIC_RANGE_OPENING_TIERS.standard;
}

/**
 * HOW ONE DYNAMIC RANGE STORY OPENS, from the system's own carrying results.
 *
 * @param {Object} input
 * @param {Array<{part: string, label?: string, level: string|null, caps_claim?: boolean}>} [input.carryingParts]
 *   the readings that give the story its strength: the screen channels, the surrounds,
 *   the low-frequency output and the bass depth. A part given `caps_claim: false` is told
 *   and emphasised at its own earned level but never holds the whole-system headroom
 *   claim down — the bass depth, whose result is extension rather than headroom. A
 *   qualifier (the bass control) carries no claim of its own and is never read here.
 * @returns {{tier: string|null, claim: string|null, strength_level: string|null,
 *   strongest_level: string|null, read_from: string, emphasis: Object, evidence_order: Array<string>,
 *   rule: string, weave_rule: string}}
 */
export function dynamicRangeOpening({ carryingParts = [] } = {}) {
  const list = (Array.isArray(carryingParts) ? carryingParts : [])
    .filter((part) => part && part.level != null)
    .map((part) => ({
      part: part.part,
      label: part.label || part.part,
      level: String(part.level).toUpperCase(),
      // THE CLAIM-CARRYING LAYERS. The whole-system claim is a claim about DYNAMIC
      // HEADROOM, and only the layers that produce that headroom hold it down: the
      // screen channels, the surrounds and the low-frequency output. The bass depth is
      // the system's EXTENSION and the bass control qualifies how the response behaves,
      // so each is told and emphasised at its own earned level and neither caps the
      // headroom claim: an L4 headroom system with an L3 depth result still opens
      // exceptionally, and a deep bass behind a modest front stage never escalates it.
      caps_claim: part.caps_claim !== false,
    }));
  const strongest = list.reduce((acc, part) => (
    acc == null || (levelRank(part.level) ?? 0) > (levelRank(acc.level) ?? 0) ? part : acc
  ), null);
  // HOW STRONG THE CLAIM MAY BE. A whole-system statement is only as strong as the
  // least capable part of the system that carries it, so the opening is read at the
  // WEAKEST CLAIM-CARRYING layer — never at the best one. Where none of those layers is
  // published there is no whole-system headroom claim to make at all: the pillar is then
  // opened from the evidence it genuinely holds rather than from the bass depth alone.
  const capping = list.filter((part) => part.caps_claim);
  const weakest = capping.reduce((acc, part) => (
    acc == null || (levelRank(part.level) ?? 99) < (levelRank(acc.level) ?? 99) ? part : acc
  ), null);
  const level = strongest?.level ?? null;
  const strengthLevel = weakest?.level ?? null;
  const tier = dynamicRangeOpeningTier(strengthLevel);
  const carriers = level == null ? [] : list.filter((part) => levelRank(part.level) === levelRank(level));
  const shared = level != null && list.length > 1 && carriers.length === list.length;
  const labels = carriers.map((part) => part.label);
  return {
    version: DYNAMIC_RANGE_OPENING_VERSION,
    tier: tier?.tier ?? null,
    claim: tier?.claim ?? null,
    // The strength the claim is read at, and the strongest carrying result beneath it.
    strength_level: strengthLevel,
    strongest_level: level,
    read_from: 'the WEAKEST claim-carrying layer across the screen channels, the surrounds and the low-frequency output — the layers that carry the system\'s dynamic headroom — with the strongest carrying result of the whole story emphasised',
    // WHICH LAYER IS EMPHASISED, never which sentence comes first. Every carrying part
    // is read here, so a strong bass depth is emphasised inside the story even though
    // it never caps the claim.
    emphasis: {
      level,
      parts: labels,
      keys: carriers.map((part) => part.part),
      wording: tier == null
        ? 'No whole-system carrying result is published: open on what the evidence genuinely supports, briefly and honestly.'
        : shared
          ? 'The strongest carrying result is shared across every part of the system that carries one, so no single layer dominates the telling: the opening claim is the whole system\'s.'
          : `Give ${labels.join(' and ')} the strongest emphasis inside the story, because ${labels.length > 1 ? 'they carry' : 'it carries'} the system's strongest carrying result — as emphasis, never as the opening sentence.`,
    },
    evidence_order: [...DYNAMIC_RANGE_EVIDENCE_ORDER],
    rule: DYNAMIC_RANGE_OPENING_RULE,
    weave_rule: DYNAMIC_RANGE_EVIDENCE_WEAVE_RULE,
  };
}

export default dynamicRangeOpening;