/**
 * Acceptance: the high-channel-density upgrade rule.
 * ------------------------------------------------
 * A 9.1.6 (15 discrete channel) design already has high speaker density, so
 * "add speakers" and "improve P5 / horizontal spacing" are not real upgrade
 * paths: any further improvement depends on the room architecture, the practical
 * speaker positions, the seating geometry, the processor, the aesthetics and the
 * installation. No client-facing surface may present it as a simple future
 * improvement. Below that density the rule is absent, so a supported upgrade
 * suggestion may still appear.
 *
 * The request's acceptance cases, as deterministic checks:
 *   1, 2, 3, 4  a 9.1.6 report's contract carries the hard rule, no added-speaker
 *               or P5 upgrade can be written, and the forbidden sentence is banned
 *   5           P5 is described only as a room and layout constraint
 *   6, 7        a 5.1 / 5.1.2 design keeps its supported upgrade guidance
 */
import { describe, it, expect } from 'vitest';

import {
  HIGH_CHANNEL_FORBIDDEN_SENTENCE,
  HIGH_CHANNEL_PREFERRED_SENTENCE,
  HIGH_CHANNEL_UPGRADE_RULE,
  HIGH_CHANNEL_CLEANUP_NOTE,
  HIGH_DENSITY_MIN_DISCRETE_CHANNELS,
  containsForbiddenHighChannelSentence,
  isHighChannelDensityLayout,
  mentionsHighChannelSpacingUpgrade,
  parseDiscreteChannelCount,
  resolveReportLayout,
} from '../base44/shared/highChannelDensityRule.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import { getSystemSummarySectionPrompt } from '../base44/shared/systemDesignSummarySections.js';
import { UPGRADE_PATH_RULE } from '../base44/shared/proposalStageBoundary.js';
import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import { validateNarrativeChip } from '../base44/shared/adiNarrativeAuthority.js';

/** A Marquee-class version at the given channel layout. */
function versionSnapshot(configuration, totalDiscrete) {
  return {
    available: true,
    project: { project_name: 'Marquee' },
    room: {
      dimensions_text: '6.4m × 4.5m × 2.4m (L × W × H)',
      volume_m3: 69.1,
      seating: { total_seats: 4, row_count: 2, row_spacing_m: 1.8 },
      screen: {
        size_inches: 170,
        viewable_width_inches: 170,
        aspect_ratio: '2.35:1',
        manual_dimensions: false,
      },
    },
    system: {
      configuration: {
        dolby_config: configuration,
        text: `${configuration} Dolby Atmos configuration`,
      },
      channel_layout: { total_discrete: totalDiscrete, subwoofer_count: 2 },
      subwoofer_strategy: { count: 2 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 5, title: 'Horizontal spacing', achieved_level: 'L2', formatted_value: '38 degrees' },
        { parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L3', formatted_value: '24 dB' },
      ],
    },
    bass: {
      p18: { achieved_level: 'L4', formatted_value: '16 Hz' },
      p19: { rsp: { level: 'L2', display_value: '4.2 dB' }, per_seat: [] },
      p20: { project_floor: 'L3', formatted_value: '3 dB', per_seat: [{ status: 'current' }] },
    },
    viewing: {
      available: true,
      primary_floor: 'L3',
      project_floor: 'L3',
      per_seat: [{ seat_id: 's1', horizontal_angle_deg: 23.6, rp23_level: 'L3', priority: 'primary' }],
    },
    seats: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
  };
}

const marqueeLayout = resolveReportLayout(versionSnapshot('9.1.6', 15));
const lowLayout = resolveReportLayout(versionSnapshot('5.1.2', 7));
const marqueeContract = buildWritingStyleContract(marqueeLayout);
const lowContract = buildWritingStyleContract(lowLayout);
const marqueeFacts = buildNarrativeFacts(versionSnapshot('9.1.6', 15));
const lowFacts = buildNarrativeFacts(versionSnapshot('5.1.2', 7));

describe('A. what counts as a high-channel-count design', () => {
  it('treats 9.1.6 and 15 or more discrete channels as high density', () => {
    expect(parseDiscreteChannelCount('9.1.6')).toBe(15);
    expect(marqueeLayout.highDensity).toBe(true);
    expect(isHighChannelDensityLayout({ channelCount: 15 })).toBe(true);
    expect(isHighChannelDensityLayout({ channelCount: 16 })).toBe(true);
    expect(isHighChannelDensityLayout({ configuration: '9.1.6' })).toBe(true);
    expect(HIGH_DENSITY_MIN_DISCRETE_CHANNELS).toBe(15);
  });

  it('leaves lower-channel designs outside the rule', () => {
    expect(lowLayout.highDensity).toBe(false);
    expect(isHighChannelDensityLayout({ channelCount: 7, configuration: '5.1.2' })).toBe(false);
    expect(isHighChannelDensityLayout({ configuration: '5.1' })).toBe(false);
    expect(isHighChannelDensityLayout({ configuration: '7.1.4' })).toBe(false);
  });
});

describe('B. the contract carries the hard rule for a 9.1.6 design', () => {
  it('includes the rule, stated for this design', () => {
    expect(marqueeContract).toContain(HIGH_CHANNEL_UPGRADE_RULE);
    expect(marqueeContract).toContain('HIGH-CHANNEL-DENSITY UPGRADE RULE');
    expect(marqueeContract).toContain('9.1.6 layout, 15 discrete channels');
  });

  it('forbids adding speakers, improving P5, an easy fix and the future framing', () => {
    expect(marqueeContract).toContain('Never suggest adding speakers, more channels, more overhead positions, front wides or additional surround positions as a future upgrade.');
    expect(marqueeContract).toContain('Never suggest improving horizontal spacing (P5)');
    expect(marqueeContract).toContain('Never imply that there is an easy fix');
    expect(marqueeContract).toMatch(/never write "if greater precision is required later"/i);
  });

  it('keeps upgrades rare and designer-supplied, never invented from a parameter', () => {
    expect(marqueeContract).toContain('Include one only when the designer has supplied it explicitly');
    expect(marqueeContract).toContain('Never invent an upgrade path from an RP22 parameter');
  });
});

describe('C. the forbidden sentence', () => {
  it('is listed as forbidden wording and detected, in its own words or the same meaning', () => {
    expect(marqueeContract).toContain(HIGH_CHANNEL_FORBIDDEN_SENTENCE);
    expect(marqueeContract).toContain('NEVER WRITE THIS');
    expect(containsForbiddenHighChannelSentence(HIGH_CHANNEL_FORBIDDEN_SENTENCE)).toBe(true);
    expect(containsForbiddenHighChannelSentence(
      'If greater precision in the side-to-side soundstage becomes necessary later, adding surround speakers would reduce the gaps between them.',
    )).toBe(true);
    expect(mentionsHighChannelSpacingUpgrade(HIGH_CHANNEL_FORBIDDEN_SENTENCE)).toBe(true);
  });

  it('is never the approved wording', () => {
    expect(HIGH_CHANNEL_FORBIDDEN_SENTENCE).not.toBe(HIGH_CHANNEL_PREFERRED_SENTENCE);
    expect(containsForbiddenHighChannelSentence(HIGH_CHANNEL_PREFERRED_SENTENCE)).toBe(false);
  });
});

describe('D. P5 is a room and layout constraint, not an upgrade path', () => {
  it('prescribes the approved wording', () => {
    expect(marqueeContract).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
    expect(marqueeContract).toContain('state it as a room and layout constraint');
  });

  it('does not flag the approved wording as an upgrade suggestion', () => {
    expect(mentionsHighChannelSpacingUpgrade(HIGH_CHANNEL_PREFERRED_SENTENCE)).toBe(false);
    // The constraint framing with the spacing named explicitly.
    expect(mentionsHighChannelSpacingUpgrade(
      'The horizontal spacing between the surround channels is limited by the room width and the practical positions available, so it is a layout constraint rather than a design choice.',
    )).toBe(false);
  });

  it('does flag an added-speaker or spacing upgrade', () => {
    expect(mentionsHighChannelSpacingUpgrade('More surround speakers could be added later to close the gaps between channels.')).toBe(true);
    expect(mentionsHighChannelSpacingUpgrade('Improving the horizontal spacing is the main opportunity left in this design.')).toBe(true);
  });
});

describe('E. the sections that discuss spacing carry the rule', () => {
  const highSection = getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', marqueeLayout);
  const highOverall = getSystemSummarySectionPrompt('overall_design', 'Overall Design', marqueeLayout);
  const highHighlights = getSystemSummarySectionPrompt('key_performance_highlights', 'Key Performance Highlights', marqueeLayout);

  it('suspends the upgrade-path line in the high-density sections', () => {
    for (const prompt of [highSection, highOverall, highHighlights]) {
      expect(prompt).toContain('HIGH-CHANNEL-DENSITY UPGRADE RULE');
      expect(prompt).toContain('does not apply to the speaker layout');
      expect(prompt).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
    }
  });
});

describe('F. a lower-channel design keeps its supported upgrade guidance', () => {
  it('carries no high-density rule anywhere', () => {
    expect(lowContract).not.toContain('HIGH-CHANNEL-DENSITY UPGRADE RULE');
    expect(lowContract).not.toContain(HIGH_CHANNEL_FORBIDDEN_SENTENCE);
    expect(isHighChannelDensityLayout(lowLayout)).toBe(false);
  });

  it('keeps the normal upgrade-path rule and the sensible upgrade line', () => {
    expect(lowContract).toContain(UPGRADE_PATH_RULE);
    const lowSection = getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', lowLayout);
    expect(lowSection).not.toContain('HIGH-CHANNEL-DENSITY UPGRADE RULE');
    expect(lowSection).toContain('note a sensible upgrade path');
  });

  it('does not flag a legitimate upgrade sentence in a lower-channel report', () => {
    // The approved 5.1 example from the proposal-stage boundary itself.
    expect(mentionsHighChannelSpacingUpgrade(
      'This 5.1 design gives a clean and credible surround experience. A future height layer would add Atmos movement, but it is not required for the current brief.',
    )).toBe(false);
  });

  it('still applies the rule with no layout supplied by default', () => {
    expect(buildWritingStyleContract()).not.toContain('HIGH-CHANNEL-DENSITY UPGRADE RULE');
  });
});

describe('G. an older section is cleaned up when it is regenerated', () => {
  it('carries the cleanup note only for a 9.1.6 design whose copy offers an upgrade', () => {
    const storedBody = `The system uses 9.1.6. ${HIGH_CHANNEL_FORBIDDEN_SENTENCE}`;
    const noteRequired = marqueeLayout.highDensity && mentionsHighChannelSpacingUpgrade(storedBody);
    expect(noteRequired).toBe(true);
    expect(HIGH_CHANNEL_CLEANUP_NOTE).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
    expect(HIGH_CHANNEL_CLEANUP_NOTE).toContain('do not imply there is an easy fix');
    expect(lowLayout.highDensity && mentionsHighChannelSpacingUpgrade(storedBody)).toBe(false);
  });
});

describe('H. ADI narrative examples cannot offer the upgrade', () => {
  it('rejects an added-speaker or spacing upgrade chip for a 9.1.6 design', () => {
    for (const label of [
      'Suggest adding more overhead channels',
      'Suggest improving the horizontal spacing later',
      'Suggest more surround speakers to close the gaps',
    ]) {
      const check = validateNarrativeChip(label, marqueeFacts);
      expect(check.status).toBe('rejected');
      expect(check.violations.map((violation) => violation.rule)).toContain('high_channel_upgrade');
    }
  });

  it('accepts the constraint framing, and the same upgrade chip on a 5.1.2 design', () => {
    const constraint = validateNarrativeChip('Explain the horizontal spacing result as a room layout constraint', marqueeFacts);
    expect(constraint.status).toBe('passed');

    const lowChip = validateNarrativeChip('Suggest adding more overhead channels', lowFacts);
    expect(lowChip.status).toBe('passed');
  });
});