/**
 * Acceptance: Parameter 2, 9.x.6 and the client-facing copy.
 * ---------------------------------------------------------
 * A 9.x.6 system is already at the top RP22 level for Parameter 2 (decoder /
 * renderer capability and discrete speaker configuration, excluding subwoofers).
 * The reason a design generally stops there is processor / AV amplifier channel
 * capability and what more channels would cost, which is never client-facing.
 *
 * What no surface may therefore say about a 9.x.6 design:
 *   - that it is limited by the room geometry, or constrained by its layout
 *   - that more channels would improve Parameter 2
 *   - that processor or amplifier capability, or its cost, is the constraint
 * And what it must say: Parameter 2 is achieved at the top RP22 level, while
 * P5, P7, P9 and P10 are speaker-position and seat-geometry results.
 *
 * Below the threshold nothing changes: a lower-channel design keeps its
 * supported "additional channels would improve P2" guidance.
 * ---------------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE,
  HIGH_CHANNEL_PREFERRED_SENTENCE,
  highChannelP2Sentence,
  mentionsHighChannelCopyDefect,
  mentionsProcessorCostClaim,
  mentionsRoomGeometryConstraintClaim,
  resolveReportLayout,
} from '../base44/shared/highChannelDensityRule.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import { SYSTEM_OPTIONS_SUMMARY_PROMPT, getSystemSummarySectionPrompt } from '../base44/shared/systemDesignSummarySections.js';
import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import { validateNarrativeChip } from '../base44/shared/adiNarrativeAuthority.js';
import { buildComparisonAuthorityChips } from '../base44/shared/adiComparisonNarrativeChips.js';
import { buildHighChannelSummaryRule } from '../base44/shared/aiSummaryPromptBuilder.js';
import { buildHighlightDisplayRows } from '../src/components/proposal/keyPerformanceHighlightsAuthority.js';
import { stripHighChannelUpgradeCopy } from '../src/components/proposal/highChannelLayoutAuthority.js';
import { buildAdiGuidanceCopy } from '../src/components/adi/designGuidance/adiGuidanceCopy.js';
import { ADI_FACTOR_KIND } from '../src/components/adi/designGuidance/adiLimitingFactorRules.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** A Marquee-class version at the given channel layout. */
function versionSnapshot(configuration, totalDiscrete) {
  return {
    available: true,
    project: { project_name: 'Marquee Home' },
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
        { parameter_id: 2, title: 'Discrete channel capability', achieved_level: 'L4', formatted_value: '15 channels' },
        { parameter_id: 5, title: 'Horizontal spacing', achieved_level: 'L1', formatted_value: '48 degrees' },
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

const marqueeSnapshot = versionSnapshot('9.1.6', 15);
const lowSnapshot = versionSnapshot('5.1.2', 7);

const marqueeLayout = resolveReportLayout(marqueeSnapshot);
const lowLayout = resolveReportLayout(lowSnapshot);
const marqueeFacts = buildNarrativeFacts(marqueeSnapshot);
const lowFacts = buildNarrativeFacts(lowSnapshot);
const marqueeContract = buildWritingStyleContract(marqueeLayout);
const lowContract = buildWritingStyleContract(lowLayout);

/** The acceptance pair: both Marquee versions are 9.1.6. */
const marqueeVersions = [
  { version_name: 'Level 1 version', facts: marqueeFacts },
  { version_name: 'Level 4 version', facts: marqueeFacts },
];

const guidanceText = (block) => Object.values(block || {}).join(' ');

/** The ADI P2 guidance for a system with the given layout. */
function p2Guidance(configuration) {
  return guidanceText(buildAdiGuidanceCopy({
    kind: ADI_FACTOR_KIND.CAPABILITY,
    key: 'p2',
    candidate: {
      key: 'p2',
      number: 2,
      area: 'Discrete channel capability',
      level: 'L1',
      parameter: { value: 15 },
    },
    evidence: { system: { configuration: { dolby_config: configuration } } },
  }));
}

describe('1. 9.x.6 is Parameter 2 at the top RP22 level', () => {
  it('states the layout, its discrete channels and the level it achieves', () => {
    const sentence = highChannelP2Sentence(marqueeLayout);
    expect(sentence).toBe('The 9.1.6 layout provides 15 discrete main channels and achieves the top RP22 level for discrete channel capability.');
    expect(marqueeContract).toContain(sentence);
    expect(getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', marqueeLayout)).toContain(sentence);
    expect(getSystemSummarySectionPrompt('overall_design', 'Overall Design', marqueeLayout)).toContain(sentence);
  });

  it('states it in the AI client summary rule too', () => {
    const rule = buildHighChannelSummaryRule([{ system: { dolbyLayout: '9.1.6' } }]);
    expect(rule).toContain('already at the top RP22 level for this layout');
    expect(rule).toContain('state it as achieved and move on');
  });

  it('never prints a low P2 level for this layout', () => {
    const guidance = p2Guidance('9.1.6');
    expect(guidance).toMatch(/top RP22 level for discrete channel capability/i);
    expect(guidance).not.toMatch(/\bL1\b|\bL2\b|\bFAIL\b/);
  });
});

describe('2. no channel-upgrade suggestion for 9.x.6', () => {
  it('rejects an added-channel chip and strips an added-channel sentence', () => {
    for (const label of [
      'Suggest adding more overhead channels',
      'Suggest more surround speakers to close the gaps',
    ]) {
      const check = validateNarrativeChip(label, marqueeFacts);
      expect(check.status).toBe('rejected');
      expect(check.violations.map((violation) => violation.rule)).toContain('high_channel_upgrade');
    }

    const cleaned = stripHighChannelUpgradeCopy('<p>Improving the horizontal spacing would need more speakers.</p>');
    expect(cleaned).not.toMatch(/more speakers/i);
    expect(cleaned).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
  });

  it('never offers added channels from the ADI P2 guidance', () => {
    const guidance = p2Guidance('9.1.6');
    expect(guidance).not.toMatch(/add the missing speaker positions/i);
    expect(guidance).toMatch(/none of them needs another channel/i);
  });
});

describe('3. no room-geometry limitation claim for Parameter 2', () => {
  it('detects the constraint framing, including the paragraph it used to prescribe', () => {
    expect(mentionsRoomGeometryConstraintClaim(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE)).toBe(true);
    expect(mentionsRoomGeometryConstraintClaim('The layout is constrained by the room geometry, so the channel count is as good as it can be.')).toBe(true);
    expect(mentionsRoomGeometryConstraintClaim(HIGH_CHANNEL_PREFERRED_SENTENCE)).toBe(false);
    expect(mentionsHighChannelCopyDefect(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE)).toBe(true);
  });

  it('replaces the stored paragraph rather than printing it', () => {
    const cleaned = stripHighChannelUpgradeCopy(`<p>${HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE}</p>`);
    expect(cleaned).not.toMatch(/room geometry constraint/i);
    expect(cleaned).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
  });

  it('rejects a constraint chip and accepts the position framing', () => {
    const rejected = validateNarrativeChip('Explain the horizontal spacing result as a room layout constraint', marqueeFacts);
    expect(rejected.status).toBe('rejected');
    expect(rejected.violations.map((violation) => violation.rule)).toContain('high_channel_geometry_constraint');

    const accepted = validateNarrativeChip('Explain the horizontal spacing result from the speaker positions', marqueeFacts);
    expect(accepted.status).toBe('passed');
  });

  it('carries no constraint framing on any generation surface', () => {
    expect(marqueeContract).not.toContain('state it as a room and layout constraint');
    expect(marqueeContract).toContain('room-geometry constraint on the system');
    expect(getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', marqueeLayout)).not.toContain('room and layout constraint');
    expect(p2Guidance('9.1.6')).not.toMatch(/room geometry constraint|constrained by the room/i);
  });
});

describe('4. no AV processor or amplifier cost copy', () => {
  it('detects a processor or amplifier capability or cost claim', () => {
    expect(mentionsProcessorCostClaim('Processor limitations are why this layout stops here.')).toBe(true);
    expect(mentionsProcessorCostClaim('A more capable AV amplifier would cost too much.')).toBe(true);
    expect(mentionsProcessorCostClaim('The processor channel count caps this layout.')).toBe(true);
    // The approved way to mention the processor at all: what the channels give it.
    expect(mentionsProcessorCostClaim('Fifteen discrete channels give the processor real loudspeaker positions around and above the audience.')).toBe(false);
  });

  it('forbids it in the rule, the chips and the design copy', () => {
    expect(marqueeContract).toContain('NEVER MENTION THE PROCESSOR OR THE AMPLIFIER');
    const rejected = validateNarrativeChip('Explain the processor channel limit', marqueeFacts);
    expect(rejected.status).toBe('rejected');
    expect(rejected.violations.map((violation) => violation.rule)).toContain('high_channel_processor_cost');
    expect(p2Guidance('9.1.6')).not.toMatch(/processor|amplifier/i);
  });

  it('removes a stored processor claim from a proposal body', () => {
    const cleaned = stripHighChannelUpgradeCopy('<p>Processor limitations are why this layout stops here. The room is designed around a 9.1.6 layout.</p>');
    expect(cleaned).not.toMatch(/processor/i);
    expect(cleaned).toContain('9.1.6');
  });
});

describe('5. P2 is kept distinct from P5, P7, P9 and P10', () => {
  it('names the spacing parameters as position and seat results', () => {
    expect(marqueeContract).toContain('THE SPACING PARAMETERS ARE POSITION AND SEAT RESULTS');
    expect(marqueeContract).toContain('P5, P7, P9 and P10 are set by where the speakers can physically go and where the seats are');
    expect(marqueeContract).toContain('never as a limitation of the channel count');
  });

  it('describes a limited P5 result by its positions, not by the channel count', () => {
    const rows = buildHighlightDisplayRows([{ key: 'p5', area: 'Horizontal spacing', result: 'L1 · 48°' }]);
    expect(rows[0].gain).toMatch(/practical speaker positions and the seat geometry/i);
    expect(rows[0].gain).not.toMatch(/room geometry constraint|channel count|upgrade|processor|amplifier/i);
  });

  it('explains the AI summary on the same terms', () => {
    const rule = buildHighChannelSummaryRule([{ system: { dolbyLayout: '9.1.6' } }]);
    expect(rule).toContain('P5, P7, P9 and P10 are speaker-position and seat-geometry results');
    expect(rule).toContain('Never attribute it to the channel count');
  });
});

describe('6. the comparison treats a shared 9.x.6 layout as a strength', () => {
  it('offers the shared layout and drops the upgrade chip when every version is 9.x.6', () => {
    const labels = buildComparisonAuthorityChips(marqueeVersions).map((entry) => entry.label);
    expect(labels.some((label) => /shared 9\.1\.6 layout/i.test(label))).toBe(true);
    expect(labels.some((label) => /upgrade/i.test(label))).toBe(false);
    expect(labels.some((label) => /speaker layouts/i.test(label))).toBe(true);
  });

  it('keeps the upgrade chip for a comparison that is not high density', () => {
    const versions = [
      { version_name: 'A', facts: lowFacts },
      { version_name: 'B', facts: lowFacts },
    ];
    const labels = buildComparisonAuthorityChips(versions).map((entry) => entry.label);
    expect(labels.some((label) => /upgrade/i.test(label))).toBe(true);
    expect(labels.some((label) => /shared 9\.1\.6/i.test(label))).toBe(false);
  });

  it('asks the comparison opening to state the shared layout as a strength', () => {
    expect(SYSTEM_OPTIONS_SUMMARY_PROMPT).toContain('states that shared layout as a strength the options have in common');
    expect(buildHighChannelSummaryRule([
      { system: { dolbyLayout: '9.1.6' } },
      { system: { dolbyLayout: '9.1.6' } },
    ])).toContain('already at the top RP22 level for this layout');
  });
});

describe('7. the single-version copy on every generation surface', () => {
  it('carries the new wording into the proposal, section and summary prompts', () => {
    expect(marqueeContract).toContain(HIGH_CHANNEL_PREFERRED_SENTENCE);
    expect(getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', marqueeLayout))
      .toContain('the practical speaker positions and the seat geometry set the result');
    expect(buildHighChannelSummaryRule([{ system: { dolbyLayout: '9.1.6' } }]).length).toBeGreaterThan(0);
  });

  it('leaves no old boilerplate in the sources that generate the copy', () => {
    expect(read('base44/shared/highChannelDensityRule.js')).not.toContain('state it as a room and layout constraint');
    expect(read('src/components/proposal/keyPerformanceHighlightsAuthority.js')).not.toContain('room geometry constraint');
    expect(read('base44/functions/generateAdiNarrativeSuggestions/entry.ts')).not.toContain('room and layout constraint');
    expect(read('src/components/adi/designGuidance/adiGuidanceCopy.js')).not.toContain('room geometry constraint');
  });
});

describe('8. a lower channel count keeps its advice', () => {
  it('carries no P2 or spacing rule below the threshold', () => {
    expect(lowLayout.highDensity).toBe(false);
    expect(lowContract).not.toContain('PARAMETER 2 IS SEPARATE FROM THE SPACING PARAMETERS');
    expect(getSystemSummarySectionPrompt('spatial_resolution', 'Spatial Resolution', lowLayout)).toContain('note a sensible upgrade path');
    expect(buildHighChannelSummaryRule([{ system: { dolbyLayout: '5.1.2' } }])).toBe('');
  });

  it('still says that additional channels could improve Parameter 2', () => {
    expect(p2Guidance('5.1.2')).toMatch(/Add the missing speaker positions/i);
    const chip = validateNarrativeChip('Suggest adding more overhead channels', lowFacts);
    expect(chip.status).toBe('passed');
  });
});

describe('9. nothing changes in the calculated result', () => {
  it('passes the calculated Result through the copy layer verbatim', () => {
    const rows = buildHighlightDisplayRows([
      { key: 'p2', area: 'Discrete channel capability', result: 'L4 · 15 channels' },
      { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 48°' },
    ]);
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(byKey.p2.result).toBe('L4 · 15 channels');
    expect(byKey.p5.result).toBe('L1 · 48°');
  });

  it('adds no grade or threshold arithmetic to the rule', () => {
    const rule = read('base44/shared/highChannelDensityRule.js');
    expect(rule).not.toContain('achieved_level');
    expect(rule).toContain('export function parseDiscreteChannelCount');
  });
});