/**
 * ADI narrative example chips — authority and validation acceptance tests.
 *
 * The chips in the Client Brief step are examples only. These tests hold the
 * rule that matters: a chip can state a value only when that value exists in the
 * project version it was built from. The acceptance cases are the ones the
 * designer specified: a 170" 2.35:1 screen is used, a 185" screen is rejected,
 * and no screen size, level, channel count, subwoofer count, dB, Hz or angle can
 * be invented.
 */
import { describe, it, expect } from 'vitest';

import {
  buildNarrativeFacts,
  buildNarrativeFactsBlock,
} from '../base44/shared/adiNarrativeFacts.js';
import {
  SCREEN_GENERIC_CHIP,
  buildAuthorityChips,
  resolveNarrativeChips,
  validateNarrativeChip,
} from '../base44/shared/adiNarrativeAuthority.js';
import { selectHighlightRows } from '../base44/shared/engineeringSnapshotEvidence.js';
import { buildHighlightDisplayRows } from '../src/components/proposal/keyPerformanceHighlightsAuthority.js';
import { buildAtAGlanceCards } from '../src/components/proposal/print/proposalPackAuthority.js';
import { resolveStatedScreenSize } from '../src/components/models/screen/canonicalScreenSize.js';

/** A Marquee-class version: a 170" wide 2.35:1 screen (185" diagonal). */
function marqueeSnapshot(overrides = {}) {
  return {
    available: true,
    project: { project_name: 'Marquee' },
    version: { name: 'Current Design', number: 1 },
    room: {
      dimensions_text: '6.4m × 4.5m × 2.4m (L × W × H)',
      volume_m3: 69.1,
      seating: { total_seats: 4, row_count: 2, row_spacing_m: 1.8 },
      screen: {
        // The stated screen size: the design's screen, exactly as the designer
        // set it. The diagonal is reference data and is never stated.
        size_inches: 170,
        diagonal_inches: 185,
        viewable_width_inches: 170,
        aspect_ratio: '2.35:1',
        manual_dimensions: false,
      },
    },
    system: {
      configuration: {
        dolby_config: '9.1.6',
        text: '9.1.6 Dolby Atmos configuration (9 bed channels, 1 subwoofer, 6 overhead channels)',
      },
      channel_layout: { total_discrete: 15, subwoofer_count: 2 },
      subwoofer_strategy: { count: 2 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L3', formatted_value: '24 dB' },
        { parameter_id: 13, title: 'Non-screen Dynamic Range', achieved_level: 'L3', formatted_value: '21 dB' },
        { parameter_id: 14, title: 'LFE and subwoofer Dynamic Range', achieved_level: 'L4', formatted_value: '27 dB' },
        { parameter_id: 16, title: 'Screen timbre', achieved_level: 'L4', formatted_value: '1.5 dB' },
        { parameter_id: 17, title: 'Surround timbre', achieved_level: 'L3', formatted_value: '2.1 dB' },
      ],
    },
    bass: {
      p14: { achieved_level: 'L4', formatted_value: '27 dB' },
      p18: { achieved_level: 'L4', formatted_value: '16 Hz' },
      p19: { rsp: { level: 'L2', display_value: '4.2 dB' }, per_seat: [] },
      p20: { project_floor: 'L3', formatted_value: '3 dB', per_seat: [{ status: 'current' }, { status: 'current' }] },
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

const marqueeFacts = buildNarrativeFacts(marqueeSnapshot());
const marqueeChips = buildAuthorityChips(marqueeFacts);
const marqueeChipTexts = marqueeChips.map((chip) => chip.label);

describe('A. Marquee screen size', () => {
  it('states the screen size the design states, not a derived one', () => {
    expect(marqueeChipTexts).toContain('Emphasise the 170 inch 2.35:1 screen');
    expect(marqueeChipTexts.join(' ')).not.toContain('185');
  });

  it('allows 170 and rejects 185', () => {
    expect(validateNarrativeChip('Emphasise the 170 inch 2.35:1 screen', marqueeFacts).status).toBe('passed');

    const bad = validateNarrativeChip('Emphasise the 185 inch screen visual experience', marqueeFacts);
    expect(bad.status).toBe('rejected');
    expect(bad.violations.map((violation) => violation.rule)).toContain('screen_size');
    expect(bad.violations[0].allowed).toEqual(['170']);
  });

  it('never returns a 185 chip, and records what it did with it', () => {
    const { suggestions, diagnostics } = resolveNarrativeChips({
      aiChips: [
        { label: 'Emphasise the 185 inch screen visual experience', reason: 'screen' },
        { label: 'Explain the bass extension result', reason: 'bass' },
      ],
      facts: marqueeFacts,
    });

    expect(suggestions.map((chip) => chip.label).join(' ')).not.toContain('185');
    expect(suggestions.some((chip) => chip.label === 'Emphasise the 170 inch 2.35:1 screen')).toBe(true);

    const rejected = diagnostics.find((entry) => entry.text.includes('185'));
    expect(rejected).toBeTruthy();
    expect(rejected.violations.map((violation) => violation.rule)).toContain('screen_size');
    // A screen-only failure is rewritten from the stated screen size, never shown
    // with the wrong number.
    expect(['rewritten', 'rejected']).toContain(rejected.status);
  });

  it('builds every chip it assembles from a named source field', () => {
    expect(marqueeChips.length).toBeGreaterThan(0);
    marqueeChips.forEach((chip) => {
      expect(chip.sourceFields.length).toBeGreaterThan(0);
      expect(validateNarrativeChip(chip.label, marqueeFacts).status).toBe('passed');
    });
  });
});

describe('B. changed screen size', () => {
  const changed = buildNarrativeFacts(marqueeSnapshot({
    room: {
      ...marqueeSnapshot().room,
      screen: { size_inches: 200, viewable_width_inches: 200, aspect_ratio: '2.35:1', manual_dimensions: false },
    },
  }));
  const texts = buildAuthorityChips(changed).map((chip) => chip.label);

  it('updates the chips to the new screen size', () => {
    expect(texts).toContain('Emphasise the 200 inch 2.35:1 screen');
    expect(texts.join(' ')).not.toContain('170 inch');
  });

  it('drops a suggestion still carrying the old screen size', () => {
    const { suggestions } = resolveNarrativeChips({
      aiChips: [{ label: 'Emphasise the 170 inch screen', reason: 'screen' }],
      facts: changed,
    });
    expect(suggestions.map((chip) => chip.label).join(' ')).not.toContain('170');
    expect(suggestions.some((chip) => chip.label === 'Emphasise the 200 inch 2.35:1 screen')).toBe(true);
  });
});

describe('C. unknown screen size', () => {
  const facts = buildNarrativeFacts(marqueeSnapshot({
    room: {
      ...marqueeSnapshot().room,
      screen: { size_inches: null, viewable_width_inches: null, aspect_ratio: '2.35:1', manual_dimensions: false },
    },
  }));
  const chips = buildAuthorityChips(facts);

  it('falls back to the generic screen example with no number', () => {
    expect(chips[0].label).toBe(SCREEN_GENERIC_CHIP);
    expect(chips.map((chip) => chip.label).join(' ')).not.toMatch(/\d+\s*inch/i);
  });

  it('rejects any screen size when none is stated', () => {
    const check = validateNarrativeChip('Emphasise the 170 inch screen', facts);
    expect(check.status).toBe('rejected');
    expect(check.violations.map((violation) => violation.rule)).toContain('screen_size');
  });
});

describe('D. other numeric checks', () => {
  const check = (label) => validateNarrativeChip(label, marqueeFacts);

  it('allows the stated channel and subwoofer counts and rejects others', () => {
    expect(check('Highlight the 15 discrete channels').status).toBe('passed');
    expect(check('Highlight the 12 discrete channels').status).toBe('rejected');
    expect(check('Explain the 2 subwoofer configuration').status).toBe('passed');
    expect(check('Explain the 4 subwoofer configuration').status).toBe('rejected');
  });

  it('allows the stated layout and rejects a different one', () => {
    expect(check('Explain the 9.1.6 system layout').status).toBe('passed');
    expect(check('Explain the 7.1.4 system layout').status).toBe('rejected');
    expect(check('Explain the 9.1 bed layer').status).toBe('passed');
  });

  it('allows the achieved level of the result named, and nothing else', () => {
    expect(check('Show the L3 screen Dynamic Range result').status).toBe('passed');
    expect(check('Show the L4 screen Dynamic Range result').status).toBe('rejected');
    expect(check('Explain the L4 screen timbre result').status).toBe('passed');
    expect(check('Explain the L2 bass extension result').status).toBe('rejected');
  });

  it('refuses a result this version has no result for', () => {
    const withoutTimbre = buildNarrativeFacts(marqueeSnapshot({
      rp22: { parameter_headlines: [{ parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L3', formatted_value: '24 dB' }] },
    }));
    const verdict = validateNarrativeChip('Explain the L4 screen timbre result', withoutTimbre);
    expect(verdict.status).toBe('rejected');
    expect(verdict.violations.map((violation) => violation.rule)).toContain('unknown_result');
  });

  it('allows only dB, Hz and angle figures this version states', () => {
    expect(check('Explain the bass extension to 16 Hz').status).toBe('passed');
    expect(check('Explain the bass extension to 12 Hz').status).toBe('rejected');
    expect(check('Mention the 27 dB subwoofer result').status).toBe('passed');
    expect(check('Mention the 22 dBC noise floor').status).toBe('rejected');
    expect(check('Explain the 24 degree viewing angle').status).toBe('passed');
    expect(check('Explain the 40 degree viewing angle').status).toBe('rejected');
  });

  it('rejects a different aspect ratio, seat count or room size', () => {
    expect(check('Emphasise the 170 inch 16:9 screen').status).toBe('rejected');
    expect(check('Explain the 4 seats in 2 rows').status).toBe('passed');
    expect(check('Explain the 6 seats in 2 rows').status).toBe('rejected');
    expect(check('Explain the 8.4m room length').status).toBe('rejected');
  });

  it('always allows wording that carries no number', () => {
    expect(check('Explain the screen scale and viewing geometry').status).toBe('passed');
    expect(check('Explain front-row and rear-row viewing differences').status).toBe('passed');
    expect(check('Highlight the bass extension result').status).toBe('passed');
  });

  it('rejects every chip when there is no calculated authority at all', () => {
    const none = buildNarrativeFacts({ available: false });
    expect(validateNarrativeChip('Explain the screen scale and viewing geometry', none).status).toBe('rejected');
    expect(buildAuthorityChips(none)).toEqual([]);
  });
});

describe('E. generated report consistency', () => {
  it('gives the report and the chips the same screen size', () => {
    const chipText = buildAuthorityChips(marqueeFacts).find((chip) => /screen/.test(chip.label)).label;
    const cards = buildAtAGlanceCards({ snapshot: marqueeSnapshot(), projectName: 'Marquee' });
    const packScreen = cards.find((card) => card.label === 'Screen').value;
    const highlightScreen = buildHighlightDisplayRows(selectHighlightRows(marqueeSnapshot()))
      .find((row) => row.key === 'screen_size').result;

    [chipText, packScreen, highlightScreen].forEach((text) => {
      expect(text).toMatch(/\b170\b/);
      expect(text).not.toContain('185');
    });
  });

  it('states the designer’s screen size in every case: television by nominal size, projection screen by width', () => {
    expect(resolveStatedScreenSize({ screen_size: 170, aspect_ratio: '2.35:1' })).toBe(170);
    expect(resolveStatedScreenSize({ tv_preset_key: 'tv83', aspect_ratio: '16:9' })).toBe(83);
    expect(resolveStatedScreenSize({ manual_dimensions: true, manual_width_m: 4.32, manual_height_m: 1.84, aspect_ratio: '2.35:1' })).toBe(170);
    expect(resolveStatedScreenSize({})).toBe(null);
  });

  it('never offers the derived diagonal to the writer', () => {
    const block = buildNarrativeFactsBlock(marqueeFacts);
    expect(block).toContain('170');
    expect(block).not.toContain('185');
  });
});

describe('F. per-chip diagnostics', () => {
  const { suggestions, diagnostics } = resolveNarrativeChips({
    aiChips: [
      { label: 'Explain the 40 degree viewing angle', reason: 'viewing' },
      { label: 'Explain the screen scale and viewing geometry', reason: 'screen' },
    ],
    facts: marqueeFacts,
  });

  it('records the text, source fields, source value and outcome of every chip', () => {
    expect(suggestions.length).toBeGreaterThan(0);
    diagnostics.forEach((entry) => {
      expect(typeof entry.text).toBe('string');
      expect(entry.text.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.sourceFields)).toBe(true);
      expect(Array.isArray(entry.sourceValues)).toBe(true);
      expect(['passed', 'rewritten', 'rejected']).toContain(entry.status);
    });
    // The authority chips carry the fields they were built from.
    const screenEntry = diagnostics.find((entry) => entry.text.includes('170 inch'));
    expect(screenEntry.sourceFields).toContain('snapshot.room.screen.size_inches');
    expect(screenEntry.sourceValues).toContain('170');
    expect(screenEntry.status).toBe('passed');
  });

  it('rejects rather than displays a chip whose number does not match', () => {
    const bad = diagnostics.find((entry) => entry.text.includes('40 degree'));
    expect(bad.status).toBe('rejected');
    expect(bad.violations.map((violation) => violation.rule)).toContain('angle_value');
    expect(suggestions.some((chip) => chip.label.includes('40 degree'))).toBe(false);
  });

  it('never repeats a chip', () => {
    const labels = suggestions.map((chip) => chip.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});