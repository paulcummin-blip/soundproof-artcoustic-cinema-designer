//
// The design context the approved writer is given: the ADI project
// interpretation Stage 1 already produced for a proposal, and the designer's
// own brief.
//
// These tests are the reason the pass exists. The writer used to be handed the
// frozen evidence pack alone, so its copy reported the evidence instead of
// describing the cinema, and the Design Summary was fixed at 2-3 sentences led by
// the top-ranked result. What is proved here:
//
//   - the saved interpretation reaches the writer, verified against the evidence;
//   - an interpretation that cannot be proved to belong here is refused, with the
//     reason carried into the input rather than silently dropped;
//   - the designer's brief is carried as instructions and never as copy;
//   - the Design Summary introduces the cinema, with no sentence-count rule and
//     no compulsory lead on the highest-ranked strength;
//   - the ranking still decides emphasis, and every ranked story keeps its claim;
//   - nothing about grounding, scope, levels, products or the bass contract moved.
//
// No GPT call is made here: the input is a pure function of the pack and the
// context.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { buildWriterPrompt, assertWriterInputCarriesNoLiveState } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import {
  WRITER_SECTIONS,
  WRITER_PROMPT_VERSION,
  WRITER_WRITING_RULES,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import {
  DESIGN_CONTEXT_REFUSAL,
  buildWriterDesignContext,
  buildEditorialBrief,
  resolveDesignInterpretation,
} from '../base44/shared/proposalWriter/writerDesignContext.js';
import { EVIDENCE_AT, option, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';

const PROJECT_ID = 'project';

const packFor = (versions, generatedAt = EVIDENCE_AT) => buildProposalEvidence({ versions, generatedAt });
const inputFor = (versions, context) => buildWriterInput({
  pack: packFor(versions),
  ...(context ? { designContext: context } : {}),
});

/** The interpretation Stage 1 saves with a proposal: the real object's shape. */
function savedInterpretation({ projectId = PROJECT_ID, versionId = 'a', versions = ['a', 'b'], reportType = 'comparison' } = {}) {
  return {
    stage: 'adi_project_interpretation',
    version: '1.0',
    generated_at: '2026-10-06T09:00:00.000Z',
    report_type: reportType,
    report_label: 'Version 1 - Level 1',
    identity: {
      project_id: projectId,
      version_id: versionId,
      versions: versions.map((id) => ({ id, label: `Version ${id}` })),
    },
    room_type: 'Multi-row cinema',
    presentation: 'Projection',
    primary_design_intent: 'Reference-style dedicated cinema',
    defining_feature: 'Multi-row layout',
    primary_seating_story: 'Central seats are strongest',
    strongest_areas: [{ area: 'Dynamic Range', evidence: 'project floor L4' }],
    main_constraints: ['Rear row geometry', 'Two-sub bass compromise'],
    important_design_decisions: ['9.1.6 chosen for front wides and stronger movement'],
    reliable_evidence: {
      by_structure: {
        'Spatial Resolution': [{ parameter_id: 5, label: 'Speaker spacing', level: 'L3', text: 'L3 · good' }],
        'Dynamic Range': [{ parameter_id: 12, label: 'Screen channel output', level: 'L4', text: 'L4 · 114 dBC' }],
        'Timbre Matching': [{ parameter_id: 18, label: 'Low frequency extension', level: 'L4', text: 'L4 · 20 Hz' }],
      },
      bass: [
        { parameter_id: 14, label: 'Bass output capability', level: 'L4', text: 'L4 · 118 dB' },
        { parameter_id: 20, label: 'Bass consistency across seats', level: 'L1', text: 'L1 · +/-5 dB' },
      ],
      viewing: { summary: 'Primary L4, Secondary L2', primary_floor: 'L4', secondary_floor: 'L2' },
      screen: { size_inches: 120, width_m: 2.66, aspect_ratio: '16:9', mount_mode: 'baffle' },
      system: { configuration: '9.1.6 Dolby Atmos', discrete_channels: 15, subwoofer_count: 2, families: 'Artcoustic Spitfire' },
      // Internal only: must never reach the writer.
      design_index: { designation: 'Internal Diagnostic', internal_only: true, client_facing: false },
    },
    excluded_or_unreliable_evidence: [{ parameter_id: 15, label: 'Background noise floor', reason: 'Excluded by report design.' }],
    designer_emphasis: null,
    one_line_story: 'Multi-row cinema, 9.1.6 system, Dynamic Range is the strength',
  };
}

/**
 * A saved proposal whose recorded report-evidence fingerprints are the ones the
 * pack froze, so freshness can be proved rather than assumed.
 */
function savedProposal(pack, overrides = {}) {
  const recorded = (pack?.evidence_basis?.fingerprints || [])
    .map((row) => ({ version_id: row.version_id, evidence_fingerprint: row.technical_evidence }));
  return {
    id: 'proposal_1',
    project_id: PROJECT_ID,
    proposal_type: pack?.mode === 'comparison' ? 'comparison' : 'single',
    client_brief: 'The client wants the family to feel the scale of the picture.',
    metadata: {
      report_evidence: recorded,
      project_interpretation: savedInterpretation({ reportType: pack?.mode }),
    },
    ...overrides,
  };
}

/* ── 1. The saved interpretation reaches the writer ────────────────────────── */

test('the saved interpretation is supplied to the writer, verified against the evidence', () => {
  const versions = twoOptions();
  const pack = packFor(versions);
  const proposal = savedProposal(pack);

  const context = buildWriterDesignContext({
    proposal,
    projectId: PROJECT_ID,
    versionIds: ['a', 'b'],
    pack,
  });

  assert.equal(context.design_interpretation.available, true);
  assert.equal(context.design_interpretation.refusal, null);
  assert.equal(context.design_interpretation.source, 'saved-adi-project-interpretation');
  assert.equal(context.design_interpretation.provenance.report_type, 'comparison');
  assert.deepEqual(context.design_interpretation.provenance.version_ids, ['a', 'b']);
  assert.match(context.design_interpretation.provenance.confirmed_by.frozen_report_evidence, /matched for 2 version/);

  // Everything the writing pass asked the interpretation to describe.
  const view = context.design_interpretation.view;
  assert.equal(view.room_type, 'Multi-row cinema');
  assert.equal(view.intended_use, 'Reference-style dedicated cinema');
  assert.equal(view.presentation, 'Projection');
  assert.equal(view.seating_story, 'Central seats are strongest');
  assert.deepEqual(view.design_decisions, ['9.1.6 chosen for front wides and stronger movement']);
  assert.deepEqual(view.constraints, ['Rear row geometry', 'Two-sub bass compromise']);
  assert.equal(view.supporting_evidence.display.size_inches, 120);
  assert.equal(view.supporting_evidence.system.format, '9.1.6 Dolby Atmos');
  assert.deepEqual(view.supporting_evidence.bass_output_depth_and_response.map((row) => row.parameter_id), [14]);
  assert.deepEqual(view.supporting_evidence.bass_consistency_across_seats.map((row) => row.parameter_id), [20]);
  assert.deepEqual(view.unknown_or_unsupported, [{ label: 'Background noise floor', reason: 'Excluded by report design.' }]);
  assert.equal(view.supporting_evidence.design_index, undefined, 'the internal design index never reaches the writer');
  assert.equal(JSON.stringify(view).includes('Internal Diagnostic'), false);
  assert.match(view.rule, /never a source of figures/);
  assert.match(view.not_stated_rule, /never write about them/);
});

test('the interpretation is carried into the writer input and provably carries no live design state', () => {
  const pack = packFor(twoOptions());
  const input = inputFor(twoOptions(), buildWriterDesignContext({
    proposal: savedProposal(pack), projectId: PROJECT_ID, versionIds: ['a', 'b'], pack,
  }));

  assert.equal(input.design_interpretation.available, true);
  assert.equal(input.design_interpretation.view.room_type, 'Multi-row cinema');
  assert.equal(input.prompt_version, WRITER_PROMPT_VERSION);
  assert.doesNotThrow(() => assertWriterInputCarriesNoLiveState(input));

  // The context is part of what the writer is given, so it is part of the input's
  // own identity: the same evidence with and without it are different inputs.
  assert.notEqual(input.input_fingerprint, inputFor(twoOptions()).input_fingerprint);
  assert.equal(
    input.input_fingerprint,
    inputFor(twoOptions(), buildWriterDesignContext({
      proposal: savedProposal(pack), projectId: PROJECT_ID, versionIds: ['a', 'b'], pack,
    })).input_fingerprint,
    'the same context and evidence always build the same input',
  );
});

/* ── 2. An interpretation that cannot be proved is refused ─────────────────── */

test('a missing interpretation is stated as missing, never invented', () => {
  const pack = packFor(twoOptions());
  const block = resolveDesignInterpretation({ proposal: { project_id: PROJECT_ID, metadata: {} }, projectId: PROJECT_ID, versionIds: ['a', 'b'], pack });

  assert.equal(block.available, false);
  assert.equal(block.refusal, DESIGN_CONTEXT_REFUSAL.NOT_SUPPLIED);
  assert.equal(block.view, null);
  // And the input still says so rather than leaving the writer to guess.
  const input = inputFor(twoOptions(), { design_interpretation: block, editorial_brief: buildEditorialBrief({}) });
  assert.equal(input.design_interpretation.available, false);
  assert.equal(input.design_interpretation.refusal, 'no_saved_design_interpretation');
  assert.doesNotThrow(() => assertWriterInputCarriesNoLiveState(input));
});

test('an interpretation for another project, version, version set or proposal type is refused', () => {
  const pack = packFor(twoOptions());
  const proposal = savedProposal(pack);
  const resolve = (interpretation, versionIds = ['a', 'b']) => resolveDesignInterpretation({
    proposal: { ...proposal, metadata: { ...proposal.metadata, project_interpretation: interpretation } },
    projectId: PROJECT_ID,
    versionIds,
    pack,
  });

  assert.equal(resolve(savedInterpretation({ projectId: 'another-project' })).refusal, DESIGN_CONTEXT_REFUSAL.FOREIGN_PROJECT);
  assert.equal(resolve(savedInterpretation({ versionId: 'zzz' })).refusal, DESIGN_CONTEXT_REFUSAL.FOREIGN_VERSION);
  assert.equal(resolve(savedInterpretation({ versions: ['a'] })).refusal, DESIGN_CONTEXT_REFUSAL.VERSION_SET_MISMATCH);
  assert.equal(resolve(savedInterpretation({ reportType: 'single' })).refusal, DESIGN_CONTEXT_REFUSAL.REPORT_TYPE_MISMATCH);
  assert.equal(resolve({ ...savedInterpretation(), stage: 'something_else' }).refusal, DESIGN_CONTEXT_REFUSAL.NOT_THE_INTERPRETATION);
  assert.equal(resolve({}).refusal, DESIGN_CONTEXT_REFUSAL.NOT_THE_INTERPRETATION);

  // The version the interpretation was written for must be one this proposal covers.
  assert.equal(resolve(savedInterpretation(), ['b']).refusal, DESIGN_CONTEXT_REFUSAL.FOREIGN_VERSION);
});

test('an interpretation older than the saved report evidence is refused as stale', () => {
  const pack = packFor(twoOptions());
  const proposal = savedProposal(pack);
  // The version's report evidence was regenerated after the interpretation was
  // written: the proposal's own recorded fingerprint no longer matches the pack's.
  const stale = {
    ...proposal,
    metadata: {
      ...proposal.metadata,
      report_evidence: proposal.metadata.report_evidence.map((row) => (row.version_id === 'b'
        ? { ...row, evidence_fingerprint: 're-b-technical-regenerated' }
        : row)),
    },
  };

  const block = resolveDesignInterpretation({ proposal: stale, projectId: PROJECT_ID, versionIds: ['a', 'b'], pack });
  assert.equal(block.available, false);
  assert.equal(block.refusal, DESIGN_CONTEXT_REFUSAL.STALE_EVIDENCE);
  // The evidence the pack froze is untouched by the refusal: the draft is still
  // written from the pack, it is only the interpretation that is left out.
  const input = inputFor(twoOptions(), { design_interpretation: block, editorial_brief: buildEditorialBrief({ proposal: stale }) });
  assert.equal(input.evidence_pack.pack_fingerprint, pack.pack_fingerprint);
  assert.equal(input.editorial_brief.supplied, true);
});

/* ── 3. The designer's brief is instructions, never copy ───────────────────── */

test('the client brief and the approved designer notes are carried as instructions', () => {
  const brief = buildEditorialBrief({
    proposal: { client_brief: 'Emphasise the family experience.', narrative_brief: 'Second row matters.' },
    dealerNotes: 'Explain why the larger subwoofers were specified.',
  });

  assert.equal(brief.supplied, true);
  assert.equal(brief.client_brief, 'Emphasise the family experience.');
  assert.equal(brief.narrative_brief, 'Second row matters.');
  assert.equal(brief.designer_notes, 'Explain why the larger subwoofers were specified.');
  assert.match(brief.rule, /never copy/);
  assert.match(brief.rule, /never change a figure, a level, a product or a claim/);
  assert.match(brief.priority, /the evidence governs/);

  const none = buildEditorialBrief({ proposal: { metadata: {} } });
  assert.equal(none.supplied, false);
  assert.equal(none.client_brief, null);
});

test('the brief reaches the prompt as an instruction and is never reproduced verbatim by rule', () => {
  const pack = packFor(twoOptions());
  const context = buildWriterDesignContext({
    proposal: savedProposal(pack), projectId: PROJECT_ID, versionIds: ['a', 'b'], pack,
    dealerNotes: 'The client asked for the recliners in the second row.',
  });
  const prompt = buildWriterPrompt({ input: inputFor(twoOptions(), context) });

  assert.equal(context.editorial_brief.designer_notes, 'The client asked for the recliners in the second row.');
  assert.ok(prompt.includes('EDITORIAL BRIEF'));
  assert.match(prompt, /never copied: no note, instruction, filename or caption from them appears in the draft/);
  assert.ok(WRITER_WRITING_RULES.some((rule) => /editorial_brief/.test(rule) && /never copied/.test(rule)));
});

/* ── 4. The Design Summary introduces the cinema ───────────────────────────── */

const singleSummaryRequirement = () => WRITER_SECTIONS.find((entry) => entry.section === 'decision_summary');

test('the Design Summary is no longer a 2-3 sentence fragment led by the top-ranked strength', () => {
  const summary = singleSummaryRequirement();
  const requirement = summary.requirement_single;

  assert.doesNotMatch(requirement, /2–3|2-3|two or three sentence/i);
  assert.doesNotMatch(requirement, /strongest ranked benefit first|highest-ranked|rank 1 first/i);
  assert.match(requirement, /developed natural paragraphs/);
  for (const subject of ['room', 'intended use', 'display', 'seating', 'architecture', 'considerations', 'experience']) {
    assert.match(requirement, new RegExp(subject), subject);
  }
  assert.match(requirement, /Do not list equipment/);
  assert.ok(summary.word_limit >= 200, 'the section has room to develop the design');

  // The prompt agrees with the contract, and no longer fixes the summary either.
  const prompt = buildWriterPrompt({ input: inputFor([option('a')]) });
  assert.doesNotMatch(prompt, /2–3 confident experience-first sentences/);
  assert.doesNotMatch(prompt, /2–3 sentences, strongest ranked benefit first/);
  assert.match(prompt, /For a single-option Design Summary, write developed natural paragraphs/);
  assert.match(prompt, /it introduces the cinema/);
});

test('every section has a distinct job with room to explain its own subject', () => {
  const limits = Object.fromEntries(WRITER_SECTIONS.map((entry) => [entry.section, entry.word_limit]));

  assert.equal(WRITER_SECTIONS.length, 10);
  assert.ok(limits.decision_summary >= 200);
  assert.ok(limits.what_stays_same >= 180);
  assert.ok(limits.what_changes >= 220);
  assert.ok(limits.overall_design >= 200);
  // The dynamic-range requirement the earlier pass fixed is untouched.
  assert.match(WRITER_SECTIONS.find((entry) => entry.section === 'dynamic_range').requirement, /frozen dynamic-range evidence/);
  // Spatial Resolution now states its own single-option job: the layout and the immersion.
  assert.match(WRITER_SECTIONS.find((entry) => entry.section === 'spatial_resolution').requirement_single, /how the layout contributes to the immersion/);
  assert.ok(WRITER_WRITING_RULES.some((rule) => /Design Summary introduces the cinema/.test(rule)));
});

test('the prompt no longer counts the sections wrongly or claims proven performance', () => {
  const prompt = buildWriterPrompt({ input: inputFor(twoOptions()) });

  assert.equal(/nine sections/.test(prompt), false);
  assert.equal(/already done and proven/.test(prompt), false);
  assert.match(prompt, /not a design whose performance has already been demonstrated in the room/);
  for (const entry of WRITER_SECTIONS) assert.ok(prompt.includes(entry.section), entry.section);
});

/* ── 5. The ranking decides emphasis; the claims are untouched ─────────────── */

test('the ranking is carried through untouched, still decides emphasis, and keeps every claim', () => {
  const pack = packFor(twoOptions());
  const input = buildWriterInput({ pack });

  // The ranked stories the authority froze reach the writer exactly as the pack
  // holds them: ranking, order, scope, evidence and claim ID. The fixture evidence
  // states no story of its own, so this proves the carry-through rather than the
  // content; the live review proves the content against real frozen evidence.
  pack.options.forEach((optionEntry, index) => {
    const given = input.evidence.options[index];
    assert.deepEqual(given.strength_stories, optionEntry.strength_stories);
    assert.deepEqual(given.omitted_stories, optionEntry.omitted_stories);
    const ranks = given.strength_stories.map((story) => story.rank);
    assert.deepEqual(ranks, ranks.map((_, position) => position + 1));
    for (const story of given.strength_stories) {
      assert.equal(story.allowed_claim_ids.length, 1);
      assert.ok(input.allowed_claims.some((claim) => claim.claim_id === story.allowed_claim_ids[0]),
        `${story.story_id} keeps the claim that states it`);
    }
  });

  // The instruction: emphasis from the ranking, order from the design.
  assert.match(input.story_grounding.rule, /deserve emphasis/);
  assert.match(input.story_grounding.rule, /not a compulsory order for the document/);
  const prompt = buildWriterPrompt({ input });
  assert.match(prompt, /The ranking decides what is emphasised, never the order of the document/);
  assert.equal(WRITER_WRITING_RULES.some((rule) => /Write the ranked strength stories you are given, in rank order\./.test(rule)), false);
});

/* ── 6. Validation is unchanged ────────────────────────────────────────────── */

test('grounding, scope, products, levels and the bass contract are untouched by the design context', () => {
  const withoutContext = inputFor(twoOptions());
  const withContext = inputFor(twoOptions(), buildWriterDesignContext({
    proposal: savedProposal(withoutContext),
    projectId: PROJECT_ID,
    versionIds: ['a', 'b'],
    pack: withoutContext.evidence_pack,
  }));

  for (const key of ['contract_version', 'allowed_claims', 'blocked_claims', 'bass', 'claim_grounding', 'word_limits', 'section_requirements', 'multi_cabinet_channels', 'assumed_parameter_policy']) {
    assert.deepEqual(withContext[key], withoutContext[key], `${key} is unchanged by the design context`);
  }
  assert.equal(withContext.evidence_pack.pack_fingerprint, withoutContext.evidence_pack.pack_fingerprint);
});