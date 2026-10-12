/**
 * RP22 professional design context — acceptance tests.
 *
 * ADI and the proposal writer are given the established RP22 design principles
 * that apply to a project, so the copy can explain WHY a design decision suits
 * this room in professional terms. What is proved here:
 *
 *   - every principle carries its RP22 v1.2 section reference, its applicability,
 *     what it does NOT establish, the project evidence it reads and its safe use;
 *   - only the principles that apply to the project are handed over;
 *   - the context states no figure, level, product or performance claim, and it
 *     never turns an equipment count into a reason for a decision;
 *   - the acoustics policy keeps design-stage subjects restrained, never presents
 *     an assumed level as measured, and never implies specified treatment has
 *     already achieved a result;
 *   - acoustic treatment is offered as a restrained option and never as a
 *     guaranteed improvement or an improved P19 or P20 result;
 *   - the context reaches both ADI (the Stage 1 interpretation) and the writer;
 *   - engineering validation is untouched: the claims, the sections, the bass
 *     contract and the validator inputs are identical with and without it;
 *   - fewer unnecessary clarification questions are put.
 *
 * Fixtures only: no proposal is generated, no model is called, nothing is written.
 */
import { describe, it, expect } from 'vitest';

import {
  RP22_CONTEXT_VERSION,
  RP22_EVIDENCE_SAFETY_RULES,
  RP22_LOCATOR,
  RP22_PRINCIPLES,
  RP22_SOURCE,
  RP22_TREATMENT_GUIDANCE,
  buildRp22DesignContext,
  declaredReferencePosition,
  readRp22Signals,
  rp22QuestionDecision,
} from '../base44/shared/rp22DesignContext.js';
import { buildNarrativeFacts } from '../base44/shared/adiNarrativeFacts.js';
import {
  buildProjectInterpretation,
  formatInterpretationForPrompt,
} from '../base44/shared/adiProjectInterpretation.js';
import { buildClarificationQuestions } from '../base44/shared/proposalClarification/adiClarificationQuestions.js';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterDesignContext } from '../base44/shared/proposalWriter/writerDesignContext.js';
import {
  assertWriterInputCarriesNoLiveState,
  buildWriterPrompt,
} from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { EVIDENCE_AT, option, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';

/* ── Fixtures ───────────────────────────────────────────────────────────────── */

/** Genesis: a 115" TV design, 9.1.6 with six overheads, four subs, two rows. */
function genesisSnapshot(overrides = {}) {
  return {
    available: true,
    project: { name: 'Genesis AV' },
    version: { id: 'v1', name: 'Original Design', number: 1 },
    identity: { versionId: 'v1' },
    room: {
      dimensions_text: '5.1m × 4.6m × 2.6m (L × W × H)',
      volume_m3: 61.4,
      seating: { total_seats: 8, row_count: 2, row_spacing_m: 1.8, interpretation: '2 rows: 4 seats in row 1, 4 seats in row 2.' },
      screen: {
        display_type: 'tv', television: true, diagonal_inches: 115, size_inches: 100,
        manual_dimensions: true, manual_width_m: 2.545, manual_height_m: 1.432,
        aspect_ratio: '16:9', interpretation: '115" TV on the front wall.',
      },
      acoustic_treatment: { enabled: true, product: 'Artcoustic Abfuser', quantity: 6 },
    },
    system: {
      configuration: { dolby_config: '9.1.6', text: '9.1.6 Dolby Atmos configuration' },
      channel_layout: { bed_channels: 9, overhead_channels: 6, total_discrete: 15, subwoofer_count: 4 },
      subwoofer_strategy: { count: 4 },
    },
    rp22: {
      parameter_headlines: [
        { parameter_id: 9, title: 'Overhead spacing', achieved_level: 'L2', formatted_value: '66.5°' },
        { parameter_id: 18, title: 'Bass extension', achieved_level: 'L2', formatted_value: '24 Hz' },
        { parameter_id: 20, title: 'Bass consistency', achieved_level: 'L1', formatted_value: '±10.8 dB' },
      ],
    },
    viewing: { available: true, summary: 'Viewing angles calculated for 8 seats.', primary_floor: 'L4', project_floor: 'L4' },
    seats: [],
    ...overrides,
  };
}

/** Marquee: the same layout with four overhead speakers and three seating rows. */
function marqueeSnapshot(overrides = {}) {
  const base = genesisSnapshot({ version: { id: 'v2', name: 'Alternative', number: 2 }, identity: { versionId: 'v2' } });
  return {
    ...base,
    room: { ...base.room, seating: { total_seats: 9, row_count: 3, interpretation: '3 rows: 3 seats per row.' } },
    system: {
      ...base.system,
      channel_layout: { bed_channels: 9, overhead_channels: 4, total_discrete: 15, subwoofer_count: 4 },
    },
    ...overrides,
  };
}

const contextFor = (snapshot) => buildRp22DesignContext({ snapshot, facts: buildNarrativeFacts(snapshot) });
const sourcesOf = (snapshot) => [{ version_id: snapshot.identity.versionId, facts: buildNarrativeFacts(snapshot), snapshot }];
const idsOf = (context) => context.principles.map((entry) => entry.principle_id);

describe('A. Every principle carries its reference, its limits and its safe use', () => {
  it('states the eight priority areas', () => {
    expect(RP22_PRINCIPLES.map((entry) => entry.principle_id)).toEqual([
      'holistic_design', 'seating_and_coverage', 'surround_placement', 'front_wides',
      'overhead_layout', 'speaker_selection', 'subwoofer_optimisation', 'physical_before_electronic',
    ]);
  });

  it('gives each one a section, an applicability, a limitation, its evidence and its safe use', () => {
    for (const principle of RP22_PRINCIPLES) {
      expect(principle.section, principle.principle_id).toMatch(/^\d+(\.\d+)*(, .+)*$/);
      expect(Object.values(RP22_LOCATOR), principle.principle_id).toContain(principle.locator);
      for (const field of ['applicability', 'limitations', 'project_evidence', 'safe_use']) {
        expect(typeof principle[field], `${principle.principle_id}.${field}`).toBe('string');
        expect(principle[field].length, `${principle.principle_id}.${field}`).toBeGreaterThan(20);
      }
      expect(['A', 'B', 'C', 'D']).toContain(principle.classification);
    }
  });

  it('states the source it is read from', () => {
    expect(RP22_SOURCE.version).toBe('1.2');
    expect(RP22_SOURCE.document).toMatch(/CEDIA\/CTA-RP22/);
    expect(RP22_SOURCE.url).toMatch(/^https:\/\//);
  });

  it('carries no figure in the reasoning it states', () => {
    // The section reference is where a number belongs. The principle, its
    // applicability, its limits and its safe use never state one: a context block
    // is never a source of a figure.
    for (const principle of RP22_PRINCIPLES) {
      const prose = [principle.principle, principle.applicability, principle.limitations,
        principle.project_evidence, principle.safe_use].join(' ');
      expect(/\d/.test(prose), principle.principle_id).toBe(false);
    }
  });
});

describe('B. Only the principles that apply to the project are handed over', () => {
  it('selects the Genesis principles and leaves the ones that do not apply out', () => {
    const ids = idsOf(contextFor(genesisSnapshot()));
    for (const id of ['holistic_design', 'seating_and_coverage', 'surround_placement',
      'overhead_layout', 'subwoofer_optimisation', 'physical_before_electronic']) {
      expect(ids, id).toContain(id);
    }
    // Genesis records no front-wide result, so the front-wide principle is not
    // offered: an inapplicable principle is never context for this design.
    expect(ids).not.toContain('front_wides');
  });

  it('follows the frozen overhead count rather than a layout label', () => {
    expect(idsOf(contextFor(marqueeSnapshot()))).toContain('overhead_layout');
    const noOverheads = marqueeSnapshot({
      system: { configuration: { dolby_config: '5.1' }, channel_layout: { bed_channels: 5, overhead_channels: 0, subwoofer_count: 1 } },
    });
    expect(idsOf(contextFor(noOverheads))).not.toContain('overhead_layout');
  });

  it('carries nothing at all when there is no evidence to read', () => {
    const context = buildRp22DesignContext({});
    expect(context.available).toBe(false);
    expect(context.principles).toEqual([]);
    expect(context.acoustics_policy.rules.length).toBeGreaterThan(0);
  });
});

describe('C. No decision is inferred from an equipment count', () => {
  it('never states a reason for a configuration anywhere in the context', () => {
    const text = JSON.stringify(contextFor(marqueeSnapshot()));
    // The patterns are the invented reasons themselves: a reason attributed to THIS
    // design's configuration. A blanket ban on the words is not used, because a
    // principle legitimately states that a count is NOT chosen for a format label,
    // and that statement is the opposite of an invented reason.
    for (const forbidden of [/because the design has/i, /the reason for/i,
      /chosen for (?:seat|three|simplicity|convenience|front wides|full surround)/i,
      /(?:selected|chosen) for (?:seat-to-seat|consistency)/i,
      /consistency across the seats is provided/i, /four subwoofers provide/i]) {
      expect(forbidden.test(text), String(forbidden)).toBe(false);
    }
  });

  it('keeps the evidence-safety rules with the context', () => {
    const context = contextFor(genesisSnapshot());
    expect(context.evidence_safety).toEqual([...RP22_EVIDENCE_SAFETY_RULES]);
    expect(context.evidence_safety.join(' ')).toMatch(/never infer a design decision from an equipment count/);
    expect(context.rule).toMatch(/never engineering evidence/);
    expect(context.rule).toMatch(/frozen evidence governs/);
  });
});

describe('D. Acoustics and treatment stay restrained', () => {
  const context = contextFor(genesisSnapshot());

  it('keeps design-stage acoustics out of the way, and assumed levels honestly assumed', () => {
    expect(context.acoustics_policy.stage).toBe('design_stage');
    const rules = context.acoustics_policy.rules.join(' ');
    expect(rules).toMatch(/not prominent subjects in a normal client proposal/);
    expect(rules).toMatch(/never describe an assumed P15 or P21 level as measured/);
    expect(rules).toMatch(/never imply that specified acoustic treatment has already achieved/);
  });

  it('offers treatment as an option, never as an outcome', () => {
    const rules = context.treatment_guidance.rules.join(' ');
    expect(context.treatment_guidance.applies_when).toMatch(/bass assessment identifies a problem/);
    expect(context.treatment_guidance.permitted_subjects.join(' ')).toMatch(/Artcoustic Abfusers/);
    expect(context.treatment_guidance.permitted_subjects.join(' ')).toMatch(/bass traps/);
    expect(rules).toMatch(/never guarantee an improvement/);
    expect(rules).toMatch(/never claim an improved P19 or P20 result/);
    expect(rules).toMatch(/never embellish/);
    // Nothing here promises a result: a promise would be a claim the evidence
    // does not carry.
    expect(/guaranteed improvement|will improve|will deliver an improvement/i.test(rules)).toBe(false);
  });
});

describe('E. The context reaches ADI and the writer', () => {
  it('is recorded with the Stage 1 interpretation and stated in its prompt block', () => {
    const interpretation = buildProjectInterpretation({ snapshot: genesisSnapshot(), reportType: 'single' });
    expect(interpretation.rp22_context.version).toBe(RP22_CONTEXT_VERSION);
    expect(interpretation.rp22_context.available).toBe(true);

    const block = formatInterpretationForPrompt(interpretation);
    expect(block).toMatch(/RP22 professional design context/);
    expect(block).toMatch(/Safe use:/);
    expect(block).toMatch(/Does not establish:/);
    expect(block).toMatch(/never establish why THIS designer chose this configuration/);
    // The prompt the model reads carries no em dash or en dash.
    expect(/[\u2014\u2013]/.test(block)).toBe(false);
  });

  it('is carried in the writer input without disturbing anything else about it', () => {
    const pack = buildProposalEvidence({ versions: twoOptions(), generatedAt: EVIDENCE_AT });
    const bare = buildWriterInput({ pack });
    const input = buildWriterInput({
      pack,
      designContext: buildWriterDesignContext({ projectId: 'project', versionIds: ['a', 'b'], pack }),
    });

    expect(input.rp22_design_context.rule).toMatch(/never engineering evidence/);
    expect(input.rp22_design_context.evidence_safety.join(' ')).toMatch(/never infer a design decision from an equipment count/);
    expect(Array.isArray(input.rp22_design_context.principles)).toBe(true);
    expect(input.rp22_design_context.principles.every((entry) => entry.section && entry.safe_use)).toBe(true);

    // Engineering validation is unchanged: the claims, the blocked claims, the bass
    // contract, the section requirements and the rules are identical.
    expect(input.allowed_claims).toEqual(bare.allowed_claims);
    expect(input.blocked_claims).toEqual(bare.blocked_claims);
    expect(input.bass).toEqual(bare.bass);
    expect(input.section_requirements).toEqual(bare.section_requirements);
    expect(input.writing_rules).toEqual(bare.writing_rules);
    expect(input.output).toEqual(bare.output);

    // The context carries no live design state, so it is safe beside the pack.
    expect(() => assertWriterInputCarriesNoLiveState(input)).not.toThrow();
    const prompt = buildWriterPrompt({ input });
    expect(prompt).toMatch(/RP22 DESIGN CONTEXT/);
    expect(prompt).toMatch(/never present an assumed P15 or P21 level as measured/);
  });

  it('is built deterministically for the same evidence', () => {
    expect(JSON.stringify(contextFor(genesisSnapshot()))).toBe(JSON.stringify(contextFor(genesisSnapshot())));
  });
});

describe('F. Fewer unnecessary clarification questions are put', () => {
  it('never asks about an acoustic-treatment reason at the design stage', () => {
    const decision = rp22QuestionDecision({ question_id: 'acoustic_treatment_reason', snapshot: genesisSnapshot() });
    expect(decision.ask).toBe(false);
    expect(decision.reason).toBe('acoustics_are_not_a_design_stage_client_proposal_subject');

    const list = buildClarificationQuestions({ versions: sourcesOf(genesisSnapshot()), material: '' });
    expect(list.map((entry) => entry.question_id)).not.toContain('acoustic_treatment_reason');
  });

  it('does not ask for a reference position the frozen evidence already declares', () => {
    expect(declaredReferencePosition(genesisSnapshot())).toBe(null);
    const declared = genesisSnapshot({ room: { ...genesisSnapshot().room, rsp: { mode: 'middle_row_center' } } });
    expect(declaredReferencePosition(declared)).toBe('middle_row_center');
    expect(rp22QuestionDecision({ question_id: 'seating_priority_reason', snapshot: declared }).ask).toBe(false);
    expect(rp22QuestionDecision({ question_id: 'seating_priority_reason', snapshot: genesisSnapshot() }).ask).toBe(true);

    // A position derived automatically from the screen declares no row priority,
    // so the question is still put.
    const auto = genesisSnapshot({ room: { ...genesisSnapshot().room, rsp: { mode: 'auto_from_screen' } } });
    expect(rp22QuestionDecision({ question_id: 'seating_priority_reason', snapshot: auto }).ask).toBe(true);
  });

  it('still asks the questions this project genuinely leaves open', () => {
    const list = buildClarificationQuestions({ versions: sourcesOf(genesisSnapshot()), material: '' });
    const ids = list.map((entry) => entry.question_id);
    expect(ids).toContain('overhead_speaker_reason');
    expect(ids).toContain('subwoofer_arrangement_reason');
    expect(list.length).toBeLessThanOrEqual(3);
    // A general principle never suppresses a question about this project's own
    // decision: the overhead reason is genuinely absent, so it is asked.
    expect(buildClarificationQuestions({
      versions: sourcesOf(genesisSnapshot({ room: { ...genesisSnapshot().room, rsp: { mode: 'back_row_center' } } })),
      material: '',
    }).map((entry) => entry.question_id)).toContain('overhead_speaker_reason');
  });
});

describe('G. A comparison is never misdescribed by the context', () => {
  it('covers a principle that applies to any selected version', () => {
    // Genesis has six overheads, Marquee four. Both have overheads, so the
    // principle applies to the comparison; neither count is stated.
    const context = buildRp22DesignContext({
      sources: [{ snapshot: genesisSnapshot(), facts: buildNarrativeFacts(genesisSnapshot()) },
        { snapshot: marqueeSnapshot(), facts: buildNarrativeFacts(marqueeSnapshot()) }],
    });
    expect(idsOf(context)).toContain('overhead_layout');
    const text = JSON.stringify(context);
    expect(/six overhead|four overhead/.test(text)).toBe(false);
    expect(assertWriterInputCarriesNoLiveState({ rp22_design_context: context })).toBeTruthy();
  });
});

describe('H. Applicability reads the geometry, and no design intent is invented', () => {
  it('follows the explicit channel layout even where the label says otherwise', () => {
    // The label claims six overhead channels; the explicit layout states none. The
    // geometry is the authority, so a label can never put an overhead layer into a
    // design that does not have one.
    const labelled = marqueeSnapshot({
      system: {
        configuration: { dolby_config: '9.1.6', text: '9.1.6 Dolby Atmos configuration' },
        channel_layout: { bed_channels: 9, overhead_channels: 0, total_discrete: 9, subwoofer_count: 4 },
      },
    });
    expect(readRp22Signals({ snapshot: labelled }).overhead_channels).toBe(0);
    expect(idsOf(contextFor(labelled))).not.toContain('overhead_layout');

    // And the other way round: an explicit overhead layer is read as it is stated,
    // whatever the label says.
    const fourOverheads = marqueeSnapshot({
      system: {
        configuration: { dolby_config: '5.1', text: '5.1 configuration' },
        channel_layout: { bed_channels: 9, overhead_channels: 4, total_discrete: 13, subwoofer_count: 4 },
      },
    });
    expect(readRp22Signals({ snapshot: fourOverheads }).overhead_channels).toBe(4);
    expect(idsOf(contextFor(fourOverheads))).toContain('overhead_layout');
  });

  it('reads the seating from the frozen seats and rows, not from a row count alone', () => {
    const seatsOnly = genesisSnapshot({
      room: { ...genesisSnapshot().room, seating: { total_seats: 6 } },
    });
    const signals = readRp22Signals({ snapshot: seatsOnly, facts: buildNarrativeFacts(seatsOnly) });
    expect(signals.rows).toBe(null);
    expect(signals.seats).toBe(6);
    expect(idsOf(contextFor(seatsOnly))).toContain('seating_and_coverage');
  });

  it('takes a count from the verified interpretation only where the frozen layout is silent', () => {
    const noLayout = genesisSnapshot({
      system: {
        configuration: { dolby_config: '9.1.6', text: '9.1.6 Dolby Atmos configuration' },
        channel_layout: undefined,
      },
    });
    expect(readRp22Signals({ snapshot: noLayout }).subwoofer_count).toBe(null);
    expect(readRp22Signals({
      snapshot: noLayout,
      interpretation: { supporting_evidence: { system: { subwoofer_count: 4 } } },
    }).subwoofer_count).toBe(4);
  });

  it('states what the design contains and invents nothing from it', () => {
    const built = buildProjectInterpretation({ snapshot: genesisSnapshot(), reportType: 'single' });
    expect(built.design_contents.join(' | ')).toMatch(/Layout: 9\.1\.6/);
    expect(built.design_contents.join(' | ')).toMatch(/Subwoofers: 4/);
    expect(built.design_contents.join(' | ')).not.toMatch(/chosen for|selected for|because|so that/i);
    // No designer explanation is on record, so no confirmed intent exists: a
    // configuration is never turned into a reason because it is present.
    expect(built.important_design_decisions).toEqual([]);
    expect(built.design_contents_rule).toMatch(/never of why it was chosen/);
    expect(built.confirmed_designer_intent_rule).toMatch(/only a recorded designer explanation/);
    expect(built.interpretation_categories).toEqual({
      what_the_design_contains: 'design_contents',
      why_rp22_says_the_approach_may_be_useful: 'rp22_context',
      what_the_engineering_predicts: 'reliable_evidence',
      why_the_designer_actually_chose_it: 'important_design_decisions',
    });
  });

  it('preserves a recorded designer explanation as confirmed intent', () => {
    const recorded = 'Four subwoofers were chosen to even the response across the seats';
    const built = buildProjectInterpretation({
      snapshot: genesisSnapshot(),
      reportType: 'single',
      recordedIntent: [recorded],
    });
    expect(built.important_design_decisions).toEqual([recorded]);
  });
});