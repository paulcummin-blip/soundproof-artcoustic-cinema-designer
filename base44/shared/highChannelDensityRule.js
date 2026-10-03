/**
 * highChannelDensityRule.js (shared)
 * ----------------------------------
 * THE HIGH-CHANNEL-DENSITY UPGRADE RULE.
 *
 * A hard rule for the client-facing System Design reports (System Design Summary,
 * System Design Comparison, Spatial Resolution, Overall Design, the Key
 * Performance Highlights introduction and the ADI narrative examples).
 *
 * When a design already uses a high channel count, 9.1.6 or any layout with 15
 * or more discrete channels, "add more speakers" and "improve the horizontal
 * spacing" are NOT upgrade paths. At that density the design is not short of
 * speakers, and any further improvement depends on the room architecture, the
 * practical speaker positions available, the seating geometry, the processor,
 * the aesthetics and the installation. Presenting that as a simple future
 * upgrade misrepresents the engineering reality, so this module forbids it and
 * gives the approved alternative wording.
 *
 * Below the threshold the rule does not apply at all: a lower-channel design
 * (5.1, 5.1.2, 7.1.4) may still carry a supported upgrade suggestion under the
 * existing proposal-stage boundary (proposalStageBoundary.js).
 *
 * Pure: no React, no side effects, no runtime-specific APIs. Safe to import from
 * any backend function.
 */

/** The channel count at which the rule applies. 9.1.6 is 9 bed + 6 overhead = 15. */
export const HIGH_DENSITY_MIN_DISCRETE_CHANNELS = 15;

/** The layout the rule was written for, named in the rule text. */
export const NAMED_HIGH_DENSITY_LAYOUT = '9.1.6';

/** The exact sentence the rule forbids, kept verbatim so it can be tested for. */
export const HIGH_CHANNEL_FORBIDDEN_SENTENCE = 'If greater precision in the side-to-side soundstage is required in the future, the primary potential for improvement lies in the physical placement of these units to further close the gaps between the surround channels.';

/** The approved wording for a limited horizontal spacing result in this design. */
export const HIGH_CHANNEL_PREFERRED_SENTENCE = 'The horizontal spacing result is mainly a consequence of the room layout and the practical speaker positions available. The design already uses a high channel count, so this should be understood as a room geometry constraint rather than a simple upgrade path.';

/**
 * Discrete channels stated by a channel layout such as '9.1.6'.
 *
 * In this app's convention the middle figure is the subwoofer count, so the
 * discrete channels are the bed channels plus the overhead channels:
 * 9.1.6 -> 15, 9.1.2 -> 11, 5.1.2 -> 7, 7.1.4 -> 11.
 */
export function parseDiscreteChannelCount(configuration) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(configuration || '').trim());
  if (!match) return null;
  const bed = Number(match[1]);
  const overhead = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isFinite(bed)) return null;
  return bed + overhead;
}

/**
 * True when this layout is a high-channel-count design.
 * A stated channel count wins; the configuration string is the fallback.
 */
export function isHighChannelDensityLayout({ channelCount, configuration } = {}) {
  const stated = Number(channelCount);
  if (Number.isFinite(stated) && stated > 0) return stated >= HIGH_DENSITY_MIN_DISCRETE_CHANNELS;
  const parsed = parseDiscreteChannelCount(configuration);
  return parsed !== null && parsed >= HIGH_DENSITY_MIN_DISCRETE_CHANNELS;
}

/**
 * Read the layout from the frozen Engineering Snapshot the report is built from.
 * Nothing is calculated here: the snapshot's own channel figures are used.
 *
 * @returns {{ channelCount: number|null, configuration: string|null, highDensity: boolean, stated: string }}
 */
export function resolveReportLayout(snapshot) {
  const system = snapshot?.system || {};
  const layout = system.channel_layout || {};
  const configuration = layout.configuration_text || system.configuration?.dolby_config || null;
  const raw = layout.total_discrete ?? system.configuration?.total_discrete_channels ?? null;
  const channelCount = Number.isFinite(Number(raw)) && raw !== null && raw !== '' ? Number(raw) : null;
  const highDensity = isHighChannelDensityLayout({ channelCount, configuration });
  const stated = [
    configuration ? `${configuration} layout` : null,
    channelCount ? `${channelCount} discrete channels` : null,
  ].filter(Boolean).join(', ') || 'high channel count';
  return { channelCount, configuration, highDensity, stated };
}

/**
 * Does this copy offer adding speakers, or improving the spacing between them,
 * as a future upgrade? Used when a high-density design is regenerated from copy
 * written before this rule existed, and by the ADI narrative chip gate.
 */
const ADDED_SPEAKER_RE = /\b(?:add|adding|added|additional|more|extra|increase|expanding|greater number of)\b[^.]{0,45}\b(?:speakers?|loudspeakers?|channels?|overheads?|height channels?|surrounds?|surround positions?|front wides?|positions?)\b/i;
const SPACING_SUBJECT_RE = /\b(?:horizontal spacing|side-to-side|spacing between|surround channels|adjacent speakers|p5\b|gaps? between)\b/i;
const FUTURE_INTENT_RE = /\b(?:in the future|future|upgrade\w*|upgraded|later|if (?:greater|more|further)|should .{0,30}be required|improv\w*|closer|closing the gaps|close the gaps|reduce the gaps|greater precision|more precise|tighten|tighter)\b/i;

export function mentionsHighChannelSpacingUpgrade(text) {
  const source = String(text || '');
  if (!source.trim()) return false;
  if (containsForbiddenHighChannelSentence(source)) return true;
  if (ADDED_SPEAKER_RE.test(source)) return true;
  // A constraint stated as "rather than a simple upgrade path" is the approved
  // wording, not an upgrade suggestion, so the negation is removed before the
  // intent test: otherwise the rule would flag the very sentence it prescribes.
  const withoutNegatedUpgrade = source.replace(/\b(?:rather than|not|never|no)\b[^.]{0,40}?\bupgrade\w*/gi, ' ');
  return SPACING_SUBJECT_RE.test(withoutNegatedUpgrade) && FUTURE_INTENT_RE.test(withoutNegatedUpgrade);
}

/** The forbidden sentence, or anything close enough to be the same sentence. */
export function containsForbiddenHighChannelSentence(text) {
  const normalise = (value) => String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const source = normalise(text);
  const forbidden = normalise(HIGH_CHANNEL_FORBIDDEN_SENTENCE);
  if (!source || !forbidden) return false;
  if (source.includes(forbidden)) return true;
  // The same meaning without the identical wording: the soundstage opening, the
  // "further close the gaps" mechanism, and the future framing together.
  return /side to side soundstage/.test(source)
    && /greater precision|more precision|greater accuracy/.test(source)
    && /close|closing|reduce|reducing|tighten/.test(source)
    && /gaps?/.test(source);
}

/** The hard rule as contract prose. Injected only for a high-density design. */
export const HIGH_CHANNEL_UPGRADE_RULE = [
  '=== HIGH-CHANNEL-DENSITY UPGRADE RULE (hard rule for this design) ===',
  `This design is already a high-channel-count layout: ${NAMED_HIGH_DENSITY_LAYOUT}, or any layout with ${HIGH_DENSITY_MIN_DISCRETE_CHANNELS} or more discrete channels.`,
  'At this speaker density the design is not short of speakers or channels, and more speakers are not a realistic upgrade path. Any further improvement would depend on the room architecture, the practical speaker positions available, the seating geometry, the processor, the aesthetics and the installation. It must never be presented as a simple upgrade.',
  '- Never suggest adding speakers, more channels, more overhead positions, front wides or additional surround positions as a future upgrade.',
  '- Never suggest improving horizontal spacing (P5), closing the gaps between the surround channels, or tightening the spacing between adjacent speakers as a future upgrade.',
  '- Never imply that there is an easy fix for the spacing or the channel density.',
  '- Never write "if greater precision is required later", and never frame the spacing or the channel density as a straightforward future improvement.',
  '- Future upgrade suggestions should be rare in this report. Include one only when the designer has supplied it explicitly in the emphasis notes or the design brief. Never invent an upgrade path from an RP22 parameter.',
  'If horizontal spacing or the spacing between channels is limited in this design, state it as a room and layout constraint: what the room, the seating geometry and the practical speaker positions allow, and what that means in the room. Do not present it as a limitation that a simple change would remove.',
  'NEVER WRITE THIS (forbidden, and anything with the same meaning):',
  `- "${HIGH_CHANNEL_FORBIDDEN_SENTENCE}"`,
  '- "If greater precision in the side-to-side soundstage is required later, adding surround speakers would close the gaps between them."',
  '- "If greater overhead movement becomes a priority later, the natural upgrade would be a middle overhead pair."',
  '- "Adding a middle pair of height speakers would be a natural upgrade."',
  '- "More overhead positions would expand the height layer in the future."',
  'WRITE THIS INSTEAD (approved wording):',
  `- "${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
].join('\n');

/**
 * The contract block for a high-density design, or '' when the rule does not
 * apply. Appended to the writing style contract by buildWritingStyleContract().
 */
function normaliseLayout(layout) {
  if (!layout) return { highDensity: false };
  if (typeof layout === 'string') return resolveReportLayout({ system: { configuration: { dolby_config: layout } } });
  if (typeof layout.highDensity === 'boolean') return layout;
  const channelCount = Number.isFinite(Number(layout.channelCount)) && layout.channelCount !== null && layout.channelCount !== ''
    ? Number(layout.channelCount)
    : null;
  return {
    ...layout,
    channelCount,
    highDensity: isHighChannelDensityLayout({ channelCount, configuration: layout.configuration }),
    stated: [
      layout.configuration ? `${layout.configuration} layout` : null,
      channelCount ? `${channelCount} discrete channels` : null,
    ].filter(Boolean).join(', ') || 'high channel count',
  };
}

export function buildHighChannelContractBlock(layout) {
  const resolved = normaliseLayout(layout);
  if (!resolved.highDensity) return '';
  return [
    HIGH_CHANNEL_UPGRADE_RULE,
    '',
    `This design's layout: ${resolved.stated}.`,
    'Run this check before returning: does any sentence offer added speakers, more channels, or improved spacing between channels as a future improvement? If it does, rewrite it as a room and layout constraint, or remove it.',
  ].join('\n');
}

/**
 * The same rule for one section's instruction. The per-section instructions ask
 * for a "sensible upgrade path" where the data supports one; for a
 * high-density design that line is suspended here, so the section instruction
 * and the contract can never contradict each other.
 */
export function buildHighChannelSectionRule(layout) {
  if (!normaliseLayout(layout).highDensity) return '';
  return [
    '=== HIGH-CHANNEL-DENSITY UPGRADE RULE (applies to this section) ===',
    `This design already uses a high channel count (${NAMED_HIGH_DENSITY_LAYOUT}, ${HIGH_DENSITY_MIN_DISCRETE_CHANNELS} or more discrete channels), so any instruction above to note a sensible upgrade path does not apply to the speaker layout or the spacing between channels.`,
    'Do not suggest adding speakers, more channels or more overhead positions, do not suggest improving horizontal spacing (P5) as a future upgrade, and never write "if greater precision is required later".',
    'Where horizontal spacing or the spacing between channels is limited, state it as a room and layout constraint and say what causes it, as approved:',
    `"${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
  ].join('\n');
}

/**
 * The note added to the regeneration prompt when a high-density design's stored
 * copy still carries a spacing or added-speaker upgrade. Refining the section
 * must remove it rather than preserve it.
 */
export const HIGH_CHANNEL_CLEANUP_NOTE = [
  'The current section content offers added speakers or improved spacing between channels as a future upgrade, which is not permitted for this design: it already uses a high channel count.',
  'Rewrite that passage as a room and layout constraint, as approved:',
  `"${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
  'Do not offer adding speakers, more channels or more overhead positions, do not offer an improved horizontal spacing result in the future, and do not imply there is an easy fix.',
].join('\n');

export default HIGH_CHANNEL_UPGRADE_RULE;