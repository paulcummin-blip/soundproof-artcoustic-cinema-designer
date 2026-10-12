/**
 * ADI suggestion reasoning alignment — acceptance tests.
 *
 * ADI may suggest explaining a design DECISION only where the reasoning behind it is
 * recorded. Where only the calculated result exists, the example asks for the result
 * and what it means for the room, and never implies Sound Proof knows why a speaker,
 * seat, subwoofer position or spacing was chosen.
 *
 * Fixtures only: no proposal is generated, no model is called, nothing is written.
 */
import { describe, it, expect } from 'vitest';

import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import {
  buildAuthorityChips,
  resolveNarrativeChips,
  validateNarrativeChip,
} from '../base44/shared/adiNarrativeAuthority.js';
import {
  OVERHEAD_ARRANGEMENT_CHIP,
  buildClarifications,
  reasoningIsDocumented,
  resolveReasoningSuggestion,
} from '../base44/shared/adiSuggestionReasoning.js';
import { asksForReasoning } from '../base44/shared/proposalWriter/writerBriefReasoning.js';
import { buildClientBriefCoverage } from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';

/** Genesis: a 15-channel 9.1.6 design, four subwoofers, P9 overhead spacing L2 66.5°. */
function genesisSnapshot(overrides = {}) {
  return {
    available: true,
    project: { project_name: 'Genesis AV' },
    version: { name: 'Current Design', number: 1 },
    room: {
      dimensions_text: '7.2m × 5.1m × 2.7m (L × W × H)',
      volume_m3: 99.1,
      seating: { total_seats: 8, row_count: 2, row_spacing_m: 1.8 },
      screen: {
        size_inches: 170,
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
      channel_layout: { total_discrete: 15, subwoofer_count: 4 },
      subwoofer_strategy: { count: 4 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 9, title: 'Overhead spacing', achieved_level: 'L2', formatted_value: '66.5°' },
        { parameter_id: 12, title: 'Screen Dynamic Range', achieved_level: 'L2', formatted_value: '5 dB' },
        { parameter_id: 18, title: 'Bass extension', achieved_level: 'L3', formatted_value: '20 Hz' },
        { parameter_id: 20, title: 'Bass consistency', achieved_level: 'L3', formatted_value: '3 dB' },
      ],
    },
    bass: {
      p18: { achieved_level: 'L3', formatted_value: '20 Hz' },
      p19: { rsp: { level: 'L2', display_value: '4.2 dB' }, per_seat: [] },
      p20: {
        project_floor: 'L3',
        formatted_value: '3 dB',
        per_seat: [{ status: 'current' }, { status: 'current' }],
      },
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

const facts = buildNarrativeFacts(genesisSnapshot());

/** The decisions Genesis's saved interpretation records: speakers and subs, not spacing. */
const GENESIS_MATERIAL = [
  '{"important_design_decisions":["Architect / Spitfire Cloud selected for dedicated overhead coverage",',
  '"Four subs chosen for seat-to-seat consistency",',
  '"Acoustically transparent screen selected so the LCR can sit behind it"]}',
].join('\n');

/** The same decision with its reasoning actually recorded, across two related sentences. */
const SPACING_DOCUMENTED = 'The overhead loudspeakers sit above every seat. The spacing between them was set to keep that coverage even across both rows.';

/** Marquee's recorded doorway constraint: the designer states it in their own brief. */
const MARQUEE_MATERIAL = 'Mention the level 3 viewing geometry assessment. mention the front wides are outside their ideal location due to the door position';

/** The frozen evidence the Client Brief audit reads a documented rationale from. */
const PACK = {
  mode: 'single',
  options: [{
    identity: { version_name: 'Current Design' },
    facts: {
      system: {
        configuration: '9.1.6 Dolby Atmos configuration (9 bed channels, 1 subwoofer, 6 overhead channels)',
        discrete_channels: 15,
        subwoofer_count: 4,
      },
      parameters: [
        { parameter_id: 9, structure: 'spatial resolution', label: 'overhead spacing', level: 'L2', value: '66.5°' },
        { parameter_id: 18, structure: 'dynamic range', label: 'bass extension', level: 'L3', value: '20 Hz' },
        { parameter_id: 20, structure: 'dynamic range', label: 'bass consistency', level: 'L3', value: '3 dB' },
      ],
    },
  }],
};

describe('A. Genesis — suggestions reflect what the report establishes', () => {
  it('the fixture states the overhead spacing result', () => {
    expect(facts.available).toBe(true);
    expect(facts.parameters.p9).toBeTruthy();
  });

  it('rewrites an undocumented overhead reasoning suggestion to the result and its significance', () => {
    const verdict = resolveReasoningSuggestion({
      label: 'Explain why the overhead spacing was chosen',
      material: GENESIS_MATERIAL,
      facts,
    });

    expect(verdict.status).toBe('rewritten');
    expect(verdict.label).toBe(OVERHEAD_ARRANGEMENT_CHIP);
    expect(verdict.label).not.toMatch(/\bwhy\b|chosen/i);
  });

  it('never offers the reasoning suggestion unchanged', () => {
    const { suggestions, diagnostics } = resolveNarrativeChips({
      aiChips: [{ label: 'Explain why the overhead spacing was chosen', reason: 'spacing' }],
      facts,
      material: GENESIS_MATERIAL,
    });
    const labels = suggestions.map((chip) => chip.label);

    expect(labels).toContain(OVERHEAD_ARRANGEMENT_CHIP);
    expect(labels.join(' | ')).not.toMatch(/why the overhead|spacing was chosen/i);

    const entry = diagnostics.find((row) => row.text === 'Explain why the overhead spacing was chosen');
    expect(entry.status).toBe('rewritten');
    expect(entry.rewrittenTo).toBe(OVERHEAD_ARRANGEMENT_CHIP);
    expect(entry.violations.map((violation) => violation.rule)).toContain('reasoning_not_recorded');
  });

  it('a recorded decision about the overhead SPEAKERS does not document the SPACING', () => {
    expect(reasoningIsDocumented({
      label: 'Explain why the overhead spacing was chosen',
      material: GENESIS_MATERIAL,
    })).toBe(false);
  });

  it('offers the overhead arrangement example itself — no number, no reason, no invented intent', () => {
    const chips = buildAuthorityChips(facts);
    const labels = chips.map((chip) => chip.label);

    expect(labels).toContain(OVERHEAD_ARRANGEMENT_CHIP);
    expect(OVERHEAD_ARRANGEMENT_CHIP).not.toMatch(/\d/);
    expect(OVERHEAD_ARRANGEMENT_CHIP).not.toMatch(/\bwhy\b|chosen|because|intended to/i);
    expect(validateNarrativeChip(OVERHEAD_ARRANGEMENT_CHIP, facts).status).toBe('passed');
    expect(validateNarrativeChip(OVERHEAD_ARRANGEMENT_CHIP, facts, null).status).toBe('passed');

    // The examples the designer already had are not displaced by it.
    expect(labels).toContain('Emphasise the 170 inch 2.35:1 screen');
    expect(labels).toContain('Explain the 9.1.6 system layout');
    expect(labels.some((label) => /^Explain the 4 subwoofer/.test(label))).toBe(true);
  });

  it('no suggestion asks for a reason Sound Proof does not hold', () => {
    const { suggestions } = resolveNarrativeChips({
      aiChips: [
        { label: 'Explain why the overhead spacing was chosen' },
        { label: 'Explain why the front wides sit where they do' },
        { label: 'Explain why the height speakers were positioned as they are' },
      ],
      facts,
      material: GENESIS_MATERIAL,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach((chip) => {
      const allowed = !asksForReasoning(chip.label)
        || reasoningIsDocumented({ label: chip.label, material: GENESIS_MATERIAL });
      expect(allowed).toBe(true);
    });
  });
});

describe('B. recorded reasoning is still suggested', () => {
  it('a recorded spacing rationale licenses the reasoning example', () => {
    expect(reasoningIsDocumented({
      label: 'Explain why the overhead spacing was chosen',
      material: SPACING_DOCUMENTED,
    })).toBe(true);

    const { suggestions } = resolveNarrativeChips({
      aiChips: [{ label: 'Explain why the overhead spacing was chosen' }],
      facts,
      material: SPACING_DOCUMENTED,
    });
    expect(suggestions.map((chip) => chip.label)).toContain('Explain why the overhead spacing was chosen');
  });

  it('Marquee — the documented doorway compromise can be suggested', () => {
    const label = 'Explain the front wides are outside their ideal location due to the doorway';

    expect(asksForReasoning(label)).toBe(true);
    expect(resolveReasoningSuggestion({ label, material: MARQUEE_MATERIAL, facts }).status).toBe('passed');
  });

  it('Marquee — with nothing recording that compromise, the chip is not suggested at all', () => {
    const label = 'Explain the front wides are outside their ideal location due to the doorway';
    expect(resolveReasoningSuggestion({ label, material: GENESIS_MATERIAL, facts }).status).toBe('rejected');
  });

  it('a decision whose speaker choice is recorded may be explained', () => {
    const label = 'Explain why the Spitfire Cloud was chosen for the overhead positions';

    expect(reasoningIsDocumented({ label, material: GENESIS_MATERIAL })).toBe(true);
    expect(resolveReasoningSuggestion({ label, material: GENESIS_MATERIAL, facts }).status).toBe('passed');
  });
});

describe('C. optional designer clarification', () => {
  it('offers a question where the decision has no recorded reasoning', () => {
    const questions = buildClarifications({ facts, material: GENESIS_MATERIAL });
    const areas = questions.map((entry) => entry.area);

    expect(areas).toContain('overheads');
    expect(questions.find((entry) => entry.area === 'overheads').question)
      .toMatch(/influenced by the seating positions, ceiling layout or aesthetics/i);
    // The subwoofer decision IS recorded, so ADI asks nothing about it.
    expect(areas).not.toContain('subwoofers');
  });

  it('asks nothing when the reasoning is recorded', () => {
    expect(buildClarifications({ facts, material: SPACING_DOCUMENTED }).map((entry) => entry.area))
      .not.toContain('overheads');
  });

  it('asks nothing when the design states no result for the area', () => {
    const withoutResults = buildNarrativeFacts(genesisSnapshot({ rp22: { parameter_headlines: [] } }));
    // No calculated spacing, so there is nothing to explain and nothing to ask about.
    expect(buildClarifications({ facts: withoutResults, material: '' }).map((entry) => entry.area))
      .not.toContain('overheads');
  });
});

describe('D. an explanation across two related sentences', () => {
  it('is read as the explanation it is', () => {
    expect(reasoningIsDocumented({
      label: 'Explain why the overhead spacing was chosen',
      material: SPACING_DOCUMENTED,
    })).toBe(true);
  });

  it('is rejected when the reason sits in another paragraph', () => {
    const separateParagraphs = 'The overhead loudspeakers sit above every seat.\n\nThe spacing between them was set to keep that coverage even across both rows.';
    expect(reasoningIsDocumented({
      label: 'Explain why the overhead spacing was chosen',
      material: separateParagraphs,
    })).toBe(false);
  });

  it('and the Client Brief audit reads the copy the same way', () => {
    const twoSentences = buildClientBriefCoverage({
      brief: { client_brief: 'Explain the overhead speaker spacing logic' },
      pack: PACK,
      sections: [{
        section: 'spatial_resolution',
        text: 'The overhead loudspeakers sit above every seat. The spacing between them was set to keep that coverage even across both rows.',
      }],
    });
    expect(twoSentences.items[0].status).toBe('addressed');
    expect(twoSentences.complete).toBe(true);

    // The same copy, split into two paragraphs, is not an explanation of the spacing.
    const splitAcrossParagraphs = buildClientBriefCoverage({
      brief: { client_brief: 'Explain the overhead speaker spacing logic' },
      pack: PACK,
      sections: [{
        section: 'spatial_resolution',
        text: 'The overhead loudspeakers sit above every seat.\n\nThe spacing between them was set to keep that coverage even across both rows.',
      }],
    });
    expect(splitAcrossParagraphs.items[0].status).toBe('unaddressed');
    expect(splitAcrossParagraphs.complete).toBe(false);
  });
});