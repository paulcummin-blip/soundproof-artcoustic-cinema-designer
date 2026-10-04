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
 * speakers, and any further improvement depends on the practical speaker
 * positions available, the seating geometry, the room architecture, the
 * aesthetics and the installation. Presenting that as a simple future upgrade
 * misrepresents the engineering reality, so this module forbids it and gives the
 * approved alternative wording.
 *
 * PARAMETER 2 AND THE SPACING PARAMETERS ARE SEPARATE RESULTS.
 * Parameter 2 is decoder/renderer capability and the number of discretely
 * rendered speakers, excluding subwoofers. A 9.x.6 layout is already at the top
 * RP22 level for P2, so P2 is stated as achieved and the report moves on. P5,
 * P7, P9 and P10 are speaker-position and seat-geometry results: where one of
 * those is limited, it is explained by the practical speaker positions and the
 * seat geometry, never by the channel count and never as a room-geometry
 * limitation of the system.
 *
 * NEVER RAISE THE PROCESSOR. Why a design generally stops at 9.x.6 belongs to
 * processor / AV amplifier channel capability and what more channels would cost.
 * That is never a client-facing engineering point, and this module forbids it.
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

/**
 * The approved wording when a spacing result (P5, P7, P9, P10) is limited.
 * It states the mechanism — the practical speaker positions and the seat
 * geometry — and says plainly that the channel count is not the cause. It never
 * calls the system constrained and never implies a channel upgrade.
 */
export const HIGH_CHANNEL_PREFERRED_SENTENCE = 'The spacing between the channels is set by the practical speaker positions and the seat geometry rather than by the channel count.';

/**
 * The paragraph this module used to prescribe, kept verbatim so it can be
 * recognised and removed: it presented a limited spacing result as a room
 * geometry constraint and pointed at an upgrade path, which is not the right
 * interpretation for a 9.x.6 system.
 */
export const HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE = 'The horizontal spacing result is mainly a consequence of the room layout and the practical speaker positions available. The design already uses a high channel count, so this should be understood as a room geometry constraint rather than a simple upgrade path.';

/**
 * The layout facts of a live system object, as opposed to a frozen snapshot.
 * Used where a surface holds the system rather than the report's snapshot.
 */
export function systemLayout(system) {
  const source = system || {};
  const layout = source.channel_layout || source.channelLayout || {};
  const configuration = layout.configuration_text || layout.configurationText
    || source.configuration?.dolby_config || source.dolbyLayout || null;
  const raw = layout.total_discrete ?? layout.totalDiscrete
    ?? source.configuration?.total_discrete_channels ?? null;
  const channelCount = raw === null || raw === undefined || raw === ''
    ? null
    : (Number.isFinite(Number(raw)) ? Number(raw) : null);
  return {
    channelCount,
    configuration,
    highDensity: isHighChannelDensityLayout({ channelCount, configuration }),
  };
}

/**
 * Parameter 2 stated cleanly for a high-channel-count design: the level it
 * already achieves, in the words the client story uses. Accepts a frozen
 * snapshot, a resolved layout or a configuration string.
 */
export function highChannelP2Sentence(layout) {
  const facts = typeof layout === 'string'
    ? resolveReportLayout({ system: { configuration: { dolby_config: layout } } })
    : (layout && layout.system ? resolveReportLayout(layout) : normaliseLayout(layout));
  const configuration = facts.configuration || NAMED_HIGH_DENSITY_LAYOUT;
  const channelCount = Number(facts.channelCount);
  const subject = Number.isFinite(channelCount) && channelCount > 0
    ? `The ${configuration} layout provides ${channelCount} discrete main channels`
    : `The ${configuration} layout provides a high-density immersive speaker configuration`;
  return `${subject} and achieves the top RP22 level for discrete channel capability.`;
}

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

/** Plain text of a piece of copy: tags removed, whitespace collapsed. */
function plainCopy(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROOM_SUBJECT_RE = /\b(?:room geometry|room layout|the room|geometry|layout)\b/i;
const CONSTRAINT_WORD_RE = /\b(?:constraint|constraints|constrained|limitation|limitations|limited|limits?|restrict\w*|caps?\b|ceiling)\b/i;
const SPACING_OR_CHANNEL_RE = /\b(?:spacing|side[-\s]to[-\s]side|discrete (?:channels?|speakers?|outputs?)|channel count|channels?|surround channels?|overhead (?:channels?|positions?)|speaker positions?)\b/i;
const PROCESSOR_SUBJECT_RE = /\b(?:av\s+processor|a\/v\s+processor|processor|pre[-\s]?amp\w*|receiver|amplifier|amplifiers|amp)\b/i;
const PROCESSOR_CLAIM_RE = /\b(?:limit\w*|constrain\w*|restrict\w*|capabilit\w*|channel count|cost\w*|expens\w*|afford\w*|budget)\b/i;

/**
 * Copy that presents the layout, the spacing or the channel count as a
 * room-geometry limitation. That framing is not the right interpretation for a
 * 9.x.6 system: a limited spacing result is set by the practical speaker
 * positions and the seat geometry, and Parameter 2 is already achieved.
 */
export function mentionsRoomGeometryConstraintClaim(text) {
  const source = plainCopy(text);
  if (!source) return false;
  if (source.toLowerCase().includes(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE.toLowerCase())) return true;
  return ROOM_SUBJECT_RE.test(source)
    && CONSTRAINT_WORD_RE.test(source)
    && SPACING_OR_CHANNEL_RE.test(source);
}

/**
 * Copy that raises AV processor or amplifier channel capability, or its cost, as
 * the reason a design stops where it does. Never a client-facing point.
 */
export function mentionsProcessorCostClaim(text) {
  const source = plainCopy(text);
  if (!source) return false;
  return PROCESSOR_SUBJECT_RE.test(source) && PROCESSOR_CLAIM_RE.test(source);
}

/** Any high-channel copy defect this design must not carry. */
export function mentionsHighChannelCopyDefect(text) {
  return mentionsHighChannelSpacingUpgrade(text)
    || mentionsRoomGeometryConstraintClaim(text)
    || mentionsProcessorCostClaim(text);
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
  'At this speaker density the design is not short of speakers or channels, and more speakers are not a realistic upgrade path. Any further improvement would depend on the practical speaker positions available, the seating geometry, the room architecture, the aesthetics and the installation. It must never be presented as a simple upgrade.',
  'PARAMETER 2 IS SEPARATE FROM THE SPACING PARAMETERS, AND ALREADY ACHIEVED. Parameter 2 is decoder/renderer capability and the number of discretely rendered speakers, excluding subwoofers. At this layout the design reaches the top RP22 level for P2: state that once, plainly, as achieved, and move on. Never present P2 as limited, and never offer more channels as the way to improve any spatial result.',
  'THE SPACING PARAMETERS ARE POSITION AND SEAT RESULTS. P5, P7, P9 and P10 are set by where the speakers can physically go and where the seats are. Where one of those is limited, explain it as the practical speaker positions and the seat geometry — never as a limitation of the channel count, never as a room-geometry constraint on the system, and never as something an added channel would fix.',
  'NEVER MENTION THE PROCESSOR OR THE AMPLIFIER. Why a design generally stops at this layout belongs to processor and AV amplifier channel capability and what more channels would cost. That is never a client-facing engineering point: do not raise it, and do not imply it.',
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
  `- "${HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE}"`,
  '- "The design is constrained by the room geometry, so the channel count is as good as it can be."',
  '- "Processor limitations are why this layout stops here." / "A more capable amplifier would cost too much."',
  'WRITE THIS INSTEAD (approved wording):',
  `- "${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
  `- "${highChannelP2Sentence({ configuration: NAMED_HIGH_DENSITY_LAYOUT, channelCount: HIGH_DENSITY_MIN_DISCRETE_CHANNELS })}"`,
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
    `This design's Parameter 2 position: ${highChannelP2Sentence(resolved)}`,
    'Run this check before returning: does any sentence offer added speakers, more channels, or improved spacing between channels as a future improvement, call the design constrained by the room or by its channel count, or mention processor or amplifier capability or cost? If it does, rewrite it as the practical speaker positions and the seat geometry setting the result, state Parameter 2 as achieved, or remove it.',
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
    `Parameter 2 is already achieved at this layout: ${highChannelP2Sentence(normaliseLayout(layout))} State it plainly once and do not present it as limited.`,
    'Where horizontal spacing or the spacing between channels is limited, state that the practical speaker positions and the seat geometry set the result rather than the channel count, as approved:',
    `"${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
    'Never call the design constrained by the room or by its channel count, and never raise processor or AV amplifier channel capability or cost.',
  ].join('\n');
}

/**
 * The note added to the regeneration prompt when a high-density design's stored
 * copy still carries a spacing or added-speaker upgrade. Refining the section
 * must remove it rather than preserve it.
 */
export const HIGH_CHANNEL_CLEANUP_NOTE = [
  'The current section content offers added speakers or improved spacing between channels as a future upgrade, presents a spatial result as a room-geometry constraint, or raises processor or amplifier capability or cost. None of that is permitted for this design: it already uses a high channel count, and Parameter 2 is already achieved at this layout.',
  'Rewrite that passage as the practical speaker positions and the seat geometry setting the result, as approved:',
  `"${HIGH_CHANNEL_PREFERRED_SENTENCE}"`,
  'State Parameter 2 as achieved, do not offer adding speakers, more channels or more overhead positions, do not offer an improved horizontal spacing result in the future, do not imply there is an easy fix, and do not mention processor or amplifier capability or cost.',
].join('\n');

export default HIGH_CHANNEL_UPGRADE_RULE;