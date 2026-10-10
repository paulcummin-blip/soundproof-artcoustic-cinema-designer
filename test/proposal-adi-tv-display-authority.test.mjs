/**
 * ADI proposal example chips — television display authority acceptance tests.
 *
 * The Client Brief examples must describe the display the project actually has.
 * A television is stated by its authoritative diagonal and the noun TV, taken
 * from the same frozen display identity the Project Report's reportEvidence
 * states (room.screen.display_type, room.screen.diagonal_inches). It is never
 * reconstructed from a viewable width, a preset width, an aspect ratio or a
 * historical screen size.
 *
 * Acceptance cases:
 *   A. Genesis — a 115" television: 115" TV, never "100 inch", "screen", "16:9".
 *   B. Manual TV, C. dropdown-selected TV: the same canonical TV behaviour.
 *   D. Projector screen: the existing screen and aspect-ratio wording remains.
 *   E. Comparison mode: TV versions are compared as the viewing experience.
 *   F. Refresh: repeating resolution never reintroduces screen wording for a TV.
 */
import { describe, it, expect } from 'vitest';

import {
  buildNarrativeFacts,
  buildNarrativeFactsBlock,
  buildDisplayLanguageRule,
} from '../base44/shared/adiNarrativeFacts.js';
import {
  SCREEN_GENERIC_CHIP,
  TV_GENERIC_CHIP,
  buildAuthorityChips,
  resolveNarrativeChips,
  validateNarrativeChip,
} from '../base44/shared/adiNarrativeAuthority.js';
import {
  buildComparisonAuthorityChips,
  resolveComparisonNarrativeChips,
} from '../base44/shared/adiComparisonNarrativeChips.js';

/** Genesis: a 115" television with manual dimensions. */
function genesisScreen(overrides = {}) {
  return {
    // The frozen display authority: a television, by its diagonal.
    display_type: 'tv',
    diagonal_inches: 115,
    // The viewable width the snapshot states for a screen; never the TV phrase.
    size_inches: 100.23118676932316,
    viewable_width_inches: 100.23118676932316,
    aspect_ratio: '16:9',
    // A manual television carries no legacy preset flag at all.
    television: false,
    manual_dimensions: true,
    manual_width_m: 2.5458721439408083,
    manual_height_m: 1.4320530809667047,
    interpretation: '100" 16:9 TV on front wall, floating mount construction.',
    ...overrides,
  };
}

function snapshotWith(screen, overrides = {}) {
  return {
    available: true,
    project: { project_name: 'Genesis AV' },
    version: { name: 'Current Design', number: 1 },
    room: {
      dimensions_text: '6.0m × 4.5m × 2.4m (L × W × H)',
      volume_m3: 64.8,
      seating: { total_seats: 4, row_count: 2, row_spacing_m: 1.8 },
      screen,
    },
    system: {
      configuration: { dolby_config: '9.1.6', text: '9.1.6 Dolby Atmos configuration' },
      channel_layout: { total_discrete: 15, subwoofer_count: 2 },
      subwoofer_strategy: { count: 2 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L4', formatted_value: '24 dB' },
        { parameter_id: 13, title: 'Non-screen Dynamic Range', achieved_level: 'L3', formatted_value: '21 dB' },
        { parameter_id: 18, title: 'Bass extension', achieved_level: 'L4', formatted_value: '16 Hz' },
      ],
    },
    viewing: {
      available: true,
      summary: 'Seating sits inside a 24° horizontal viewing angle at the reference seat.',
      primary_floor: 'L3',
      project_floor: 'L3',
      per_seat: [{ seat_id: 's1', horizontal_angle_deg: 23.6, rp23_level: 'L3', priority: 'primary' }],
    },
    seats: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
    ...overrides,
  };
}

const genesisFacts = buildNarrativeFacts(snapshotWith(genesisScreen()));
const genesisChips = buildAuthorityChips(genesisFacts).map((chip) => chip.label);

describe('A. Genesis television', () => {
  it('states the display by its diagonal and the noun TV', () => {
    expect(genesisChips[0]).toBe('Emphasise the 115" TV');
    expect(genesisChips.join(' ')).toContain('115" TV');
  });

  it('never states the viewable width, an aspect ratio or the noun screen', () => {
    // The display example itself carries none of the forbidden terms. (The RP22
    // results keep their own canonical names, e.g. P12 'screen Dynamic Range'.)
    const displayChip = genesisChips[0].toLowerCase();
    ['100', '16:9', '1.78:1', '1.76:1', 'screen', 'projector'].forEach((term) => {
      expect(displayChip).not.toContain(term);
    });

    const all = genesisChips.join(' ').toLowerCase();
    expect(all).not.toContain('100 inch');
    expect(all).not.toContain('16:9');
    expect(all).not.toContain('" screen');
    expect(all).not.toContain('projector');
  });

  it('validates the canonical TV chip, and refuses screen wording for a TV', () => {
    expect(validateNarrativeChip('Emphasise the 115" TV', genesisFacts).status).toBe('passed');
    expect(validateNarrativeChip('Highlight the immersive viewing experience from the 115" TV', genesisFacts).status).toBe('passed');

    const wrongSize = validateNarrativeChip('Emphasise the 100 inch 16:9 screen', genesisFacts);
    expect(wrongSize.status).toBe('rejected');
    expect(wrongSize.violations.map((violation) => violation.rule)).toContain('screen_size');

    const wrongNoun = validateNarrativeChip('Emphasise the 115 inch screen', genesisFacts);
    expect(wrongNoun.status).toBe('rejected');
    expect(wrongNoun.violations.map((violation) => violation.rule)).toContain('display_noun');

    const aspect = validateNarrativeChip('Emphasise the 115" TV at 16:9', genesisFacts);
    expect(aspect.status).toBe('rejected');
    expect(aspect.violations.map((violation) => violation.rule)).toContain('aspect_ratio');
  });

  it('rewrites the AI suggestion "100 inch 16:9 screen" into the canonical TV chip', () => {
    const { suggestions, diagnostics } = resolveNarrativeChips({
      aiChips: [
        { label: 'Emphasise the 100 inch 16:9 screen', reason: 'screen scale' },
        { label: 'Highlight the screen scale and viewing geometry', reason: 'screen' },
      ],
      facts: genesisFacts,
    });

    const labels = suggestions.map((chip) => chip.label).join(' ');
    expect(labels).not.toContain('100');
    expect(labels).not.toContain('16:9');
    expect(labels).not.toContain('projector');
    expect(suggestions.some((chip) => chip.label === 'Emphasise the 115" TV')).toBe(true);

    const rewritten = diagnostics.find((entry) => entry.text.includes('100 inch'));
    expect(rewritten).toBeTruthy();
    expect(rewritten.rewrittenTo).toBe('Emphasise the 115" TV');
  });

  it('hands the writer the television, never the viewable width or an aspect ratio', () => {
    const block = buildNarrativeFactsBlock(genesisFacts);
    expect(block).toContain('115" TV');
    expect(block).toContain('TELEVISION');
    expect(block).not.toContain('16:9');
    expect(block).not.toContain('100');

    const rule = buildDisplayLanguageRule(genesisFacts);
    expect(rule).toContain('TELEVISION');
    expect(rule).toContain('115" TV');
  });
});

describe('B. Dropdown-selected TV, and a TV the legacy flag also marks', () => {
  it('states a preset television by its diagonal, exactly like a manual one', () => {
    // An 83" preset television: the diagonal is frozen alongside the type.
    const facts = buildNarrativeFacts(snapshotWith(genesisScreen({
      display_type: 'tv',
      diagonal_inches: 83,
      size_inches: 72.4,
      viewable_width_inches: 72.4,
      television: true,
      manual_dimensions: false,
      manual_width_m: null,
      manual_height_m: null,
    })));
    const chips = buildAuthorityChips(facts).map((chip) => chip.label);

    expect(chips[0]).toBe('Emphasise the 83" TV');
    expect(chips[0].toLowerCase()).not.toContain('screen');
    expect(chips.join(' ')).not.toContain('72');
    expect(validateNarrativeChip('Emphasise the 72 inch 16:9 screen', facts).status).toBe('rejected');
  });

  it('carries no number when a television states no diagonal', () => {
    const facts = buildNarrativeFacts(snapshotWith(genesisScreen({
      diagonal_inches: null,
      size_inches: null,
      viewable_width_inches: null,
      manual_dimensions: true,
    })));
    const chips = buildAuthorityChips(facts).map((chip) => chip.label);

    expect(chips[0]).toBe(TV_GENERIC_CHIP);
    expect(chips[0].toLowerCase()).not.toContain('screen');
    expect(chips[0]).not.toMatch(/\d+\s*"/);
  });
});

describe('C. Projector screen keeps the existing wording', () => {
  const projectorFacts = buildNarrativeFacts(snapshotWith({
    display_type: 'projector_screen',
    diagonal_inches: 185,
    size_inches: 170,
    viewable_width_inches: 170,
    aspect_ratio: '2.35:1',
    manual_dimensions: false,
  }));
  const projectorChips = buildAuthorityChips(projectorFacts).map((chip) => chip.label);

  it('still states the screen size and aspect ratio', () => {
    expect(projectorChips).toContain('Emphasise the 170 inch 2.35:1 screen');
    expect(validateNarrativeChip('Emphasise the 170 inch 2.35:1 screen', projectorFacts).status).toBe('passed');
    expect(validateNarrativeChip('Emphasise the 185 inch screen', projectorFacts).status).toBe('rejected');
  });

  it('keeps the generic screen example when no screen size is stated', () => {
    const facts = buildNarrativeFacts(snapshotWith({
      display_type: 'projector_screen',
      size_inches: null,
      viewable_width_inches: null,
      aspect_ratio: '2.35:1',
      manual_dimensions: false,
    }));
    expect(buildAuthorityChips(facts)[0].label).toBe(SCREEN_GENERIC_CHIP);
  });

  it('keeps the projector display rule and facts block wording', () => {
    expect(buildDisplayLanguageRule(projectorFacts)).toContain('projection screen');
    expect(buildNarrativeFactsBlock(projectorFacts)).toContain('Screen: 170" 2.35:1');
  });
});

describe('D. Comparison mode', () => {
  const tvVersion = {
    version_id: 'v1',
    version_name: 'Current Design',
    facts: genesisFacts,
  };
  const tvVersionTwo = {
    version_id: 'v2',
    version_name: 'Option B',
    facts: buildNarrativeFacts(snapshotWith(genesisScreen({ diagonal_inches: 100 }))),
  };

  it('compares an all-television pair as the viewing experience', () => {
    const chips = buildComparisonAuthorityChips([tvVersion, tvVersionTwo]).map((chip) => chip.label);
    expect(chips).toContain('Compare the viewing experience and seating');
    expect(chips.join(' ').toLowerCase()).not.toContain('screen and seating');

    const { suggestions } = resolveComparisonNarrativeChips({
      versions: [tvVersion, tvVersionTwo],
      aiChips: [{ label: 'Emphasise the 100 inch 16:9 screen', reason: 'screen' }],
    });
    const labels = suggestions.map((chip) => chip.label).join(' ');
    expect(labels).not.toContain('100 inch');
    expect(labels).not.toContain('16:9');
  });

  it('keeps the screen wording for a projection-screen comparison', () => {
    const projectorVersion = {
      version_id: 'v3',
      version_name: 'Option C',
      facts: buildNarrativeFacts(snapshotWith({
        display_type: 'projector_screen',
        diagonal_inches: 185,
        size_inches: 170,
        viewable_width_inches: 170,
        aspect_ratio: '2.35:1',
        manual_dimensions: false,
      })),
    };
    const chips = buildComparisonAuthorityChips([projectorVersion, { ...projectorVersion, version_id: 'v4', version_name: 'Option D' }])
      .map((chip) => chip.label);
    expect(chips).toContain('Compare the screen and seating experience');
  });
});

describe('E. Refresh stability', () => {
  it('resolves the television identically every time the examples are refreshed', () => {
    const runs = [1, 2, 3].map(() => resolveNarrativeChips({
      aiChips: [
        { label: 'Emphasise the 100 inch 16:9 screen', reason: 'screen scale' },
        { label: 'Highlight the projector screen impact', reason: 'screen' },
      ],
      facts: buildNarrativeFacts(snapshotWith(genesisScreen())),
    }));

    for (const run of runs) {
      const labels = run.suggestions.map((chip) => chip.label);
      expect(labels[0]).toBe('Emphasise the 115" TV');
      expect(labels.join(' ')).not.toContain('100');
      expect(labels.join(' ')).not.toContain('16:9');
      expect(labels.join(' ')).not.toContain('projector');
    }

    const first = runs[0].suggestions.map((chip) => chip.label).join('|');
    expect(runs[1].suggestions.map((chip) => chip.label).join('|')).toBe(first);
    expect(runs[2].suggestions.map((chip) => chip.label).join('|')).toBe(first);
  });
});