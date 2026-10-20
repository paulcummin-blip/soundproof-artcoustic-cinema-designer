// client-narrative-priority.test.mjs
// ----------------------------------
// THE ACCEPTANCE SUITE for the ADI client narrative priority: experience, then
// design, then evidence.
//
// It proves the priority reaches every client-facing writing surface it was asked
// to reach (the Project Report's Design Intent, the Proposal's five narrative
// sections and its highlights wording, and the ADI Improve Wording pass), and it
// proves that nothing it was asked NOT to touch moved: no word limit, no section
// structure, no evidence rule, no grounding rule, no approval logic, no new
// calibration disclaimer.
//
// Text only: no calculation, no project data, no RP22 value, no provider call.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProposalWritingAuthority,
  reportNarrativePriority,
} from '../base44/shared/soundProofWritingAuthority.js';
import { buildWritingStyleContract } from '../base44/shared/reportWritingStyleContract.js';
import { buildWriterPrompt, writerOutputJsonSchema } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { WRITER_SECTIONS, WRITER_SECTION_IDS, WRITER_CONTRACT_VERSION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { ADI_EDITORIAL_STANDARD } from '../base44/shared/adiEditorial/adiEditorialStandard.js';
import { ADI_AUTHORITY_BOUNDARY } from '../base44/shared/adiEditorial/adiEditorialStandard.js';
import { buildSingleSummaryPrompt } from '../base44/shared/aiSummaryPromptBuilder.js';
import {
  CLIENT_NARRATIVE_PRIORITY,
  CLIENT_SECTION_EMPHASIS,
  CLIENT_NARRATIVE_SMELL_TEST,
  ADI_NARRATIVE_EMPHASIS,
} from '../base44/shared/clientNarrativePriority.js';

const proposal = buildProposalWritingAuthority();
const report = buildWritingStyleContract();
const editorial = ADI_EDITORIAL_STANDARD;

const writerPrompt = () => buildWriterPrompt({
  input: {
    contract_version: WRITER_CONTRACT_VERSION,
    evidence_pack: { pack_fingerprint: 'pack-fingerprint-test' },
    section_requirements: WRITER_SECTIONS.map((entry) => ({ section: entry.section })),
    allowed_claims: [],
  },
});

// ---------------------------------------------------------------------------
// 1. EXPERIENCE LEADS CLIENT NARRATIVE
// ---------------------------------------------------------------------------

test('experience leads: the hierarchy is stated, in order, on both surfaces', () => {
  for (const contract of [proposal, report]) {
    assert.ok(contract.includes('CLIENT NARRATIVE PRIORITY'));
    assert.ok(contract.includes('Write from the client experience outward.'));

    const steps = [
      '1. What the room is designed to deliver.',
      '2. How the room, the screen and the seating support that experience.',
      '3. How the loudspeaker and bass arrangement support it.',
      '4. Spatial Resolution.',
      '5. Dynamic Range.',
      '6. Timbre Matching.',
      '7. The strongest engineering evidence.',
      '8. The relevant constraints and trade-offs.',
      '9. Equipment detail, only where it explains a design decision.',
    ];
    let previous = -1;
    for (const step of steps) {
      const at = contract.indexOf(step);
      assert.ok(at > -1, `the hierarchy must state "${step}"`);
      assert.ok(at > previous, `the hierarchy must keep its order at "${step}"`);
      previous = at;
    }
  }
});

test('experience leads: the writer prompt asks for the experience first and the figure last', () => {
  const prompt = writerPrompt();
  assert.ok(prompt.includes('EXPERIENCE LEADS, THE EVIDENCE CONFIRMS'));
  assert.ok(prompt.includes('the experience comes first, the design decision and its recorded reason follow, and the figure closes as the proof'));
});

// ---------------------------------------------------------------------------
// 2. ROOM / SCREEN / SEATING RELATIONSHIP BEFORE EQUIPMENT DETAIL
// ---------------------------------------------------------------------------

test('the room, screen and seating relationship is explained before equipment', () => {
  assert.ok(proposal.includes('ROOM DESIGN IS PART OF THE SYSTEM'));
  assert.ok(proposal.includes('Never write as though the equipment list alone creates the result. Explain the relationship between them.'));
  assert.ok(proposal.includes('The screen size and the seating distances have been considered together to give the room strong cinematic picture scale.'));
  // The equipment rule itself, and its position after the relationship rule.
  assert.ok(proposal.includes('EQUIPMENT SUPPORTS THE STORY'));
  assert.ok(proposal.includes('Never lead general client copy with a model and quantity list.'));
  assert.ok(
    proposal.indexOf('ROOM DESIGN IS PART OF THE SYSTEM') < proposal.indexOf('EQUIPMENT SUPPORTS THE STORY'),
    'the room relationship must be stated before the equipment rule',
  );
});

// ---------------------------------------------------------------------------
// 3. DECISION, REASON, CONSEQUENCE
// ---------------------------------------------------------------------------

test('decision, reason and consequence is the structure, and only with a supported reason', () => {
  for (const contract of [proposal, report]) {
    assert.ok(contract.includes('DECISION, THEN REASON, THEN CLIENT CONSEQUENCE'));
    assert.ok(contract.includes('The rear row is raised to maintain sightlines while keeping the seating and overhead geometry working together.'));
    assert.ok(contract.includes('State a reason ONLY where the current project evidence, a current project clarification or approved learned ADI design knowledge supports it.'));
  }
});

// ---------------------------------------------------------------------------
// 4. THE THREE CLIENT PILLARS REMAIN THE THREE SOUND STORIES
// ---------------------------------------------------------------------------

test('spatial resolution, dynamic range and timbre matching remain the structure', () => {
  assert.ok(proposal.includes('THE THREE CLIENT PILLARS REMAIN THE STRUCTURE'));
  assert.ok(proposal.includes('SPATIAL RESOLUTION: where sound is placed, and how naturally it moves around and above the audience.'));
  assert.ok(proposal.includes('DYNAMIC RANGE: the difference between quiet detail and demanding peaks'));
  assert.ok(proposal.includes('TIMBRE MATCHING: whether voices, instruments and effects keep a familiar tonal character'));
  assert.ok(proposal.includes('They are never replaced by a parameter-by-parameter narrative.'));
});

// ---------------------------------------------------------------------------
// 5. RP22 IS SUPPORTING EVIDENCE, NOT THE NARRATIVE STRUCTURE
// ---------------------------------------------------------------------------

test('RP22 is evidence beneath the story, never the structure of the story', () => {
  for (const contract of [proposal, report]) {
    assert.ok(contract.includes('RP22 and RP23 are the engineering evidence beneath the story. They are not the client story'));
  }
  // The evidence is seventh, after the experience, the room and the arrangement.
  const evidence = CLIENT_NARRATIVE_PRIORITY.indexOf('7. The strongest engineering evidence.');
  const experience = CLIENT_NARRATIVE_PRIORITY.indexOf('1. What the room is designed to deliver.');
  assert.ok(experience > -1 && evidence > experience);
});

// ---------------------------------------------------------------------------
// 6. PRIMARY / SECONDARY SEATS HANDLED HONESTLY
// ---------------------------------------------------------------------------

test('seat variation is stated honestly, never flattened into identical seats', () => {
  assert.ok(proposal.includes('Never imply that every seat performs identically unless the actual evidence supports that statement.'));
  assert.ok(proposal.includes('Performance is strongest across the primary seats, with greater variation towards the outer secondary positions.'));
  // Both failure modes are named as refusals, not offered as wording.
  assert.ok(proposal.includes('NOT: "All seats provide the same experience."'));
  assert.ok(proposal.includes('NOT: "The room fails because one secondary seat is weaker."'));
});

// ---------------------------------------------------------------------------
// 7. TRADE-OFFS ARE DESIGN DECISIONS, NOT APOLOGIES
// ---------------------------------------------------------------------------

test('a real constraint is written as a considered decision', () => {
  assert.ok(proposal.includes('TRADE-OFFS ARE DESIGN DECISIONS, NOT APOLOGIES'));
  assert.ok(proposal.includes('Never write: "Unfortunately", "Sadly" or "The design fails to".'));
  assert.ok(proposal.includes('Make a statement of that kind only where the project evidence supports it.'));
});

// ---------------------------------------------------------------------------
// 8. GENERIC SUPERLATIVES REDUCED
// ---------------------------------------------------------------------------

test('specific evidence replaces generic superlatives', () => {
  assert.ok(proposal.includes('EVIDENCE, NOT SUPERLATIVES'));
  for (const word of ['exceptional', 'remarkable', 'incredible', 'highly immersive', 'perfect', 'premium', 'world-class', 'powerful capability', 'considerable reserve']) {
    assert.ok(proposal.includes(word), `the superlative rule must name "${word}"`);
  }
  assert.ok(proposal.includes('The screen channels provide substantial headroom for dialogue, music and major on-screen effects.'));
  assert.ok(proposal.includes('NOT: "The system delivers exceptional cinema performance."'));
});

// ---------------------------------------------------------------------------
// 9. EQUIPMENT DOES NOT LEAD GENERAL CLIENT COPY
// ---------------------------------------------------------------------------

test('equipment earns a place only where it explains a decision', () => {
  assert.ok(proposal.includes('Use an equipment name only where it explains a specific design decision'));
  assert.ok(proposal.includes('not an equipment shopping list'));
  // The Design Intent emphasis says so in its own section.
  const designIntent = CLIENT_SECTION_EMPHASIS.find((entry) => entry.section === 'design_intent');
  assert.ok(designIntent.limit.includes('equipment supports the story; it never opens it'));
});

// ---------------------------------------------------------------------------
// 10. PREDICTED RESULTS ARE NOT FINISHED MEASUREMENTS
// ---------------------------------------------------------------------------

test('a predicted design result is never written as a measured finished room', () => {
  assert.ok(proposal.includes('DESIGN TARGET AND FINISHED MEASUREMENT'));
  for (const word of ['designed to', 'predicted', 'calculated', 'modelled', 'specified capability']) {
    assert.ok(proposal.includes(word), `the measurement rule must allow "${word}"`);
  }
  assert.ok(proposal.includes('Never turn a predicted design result into a measured claim about a finished room.'));
});

// ---------------------------------------------------------------------------
// 11. NO NEW VERIFICATION / CALIBRATION DISCLAIMERS
// ---------------------------------------------------------------------------

test('no new calibration or verification disclaimer is added to the client narrative', () => {
  assert.ok(proposal.includes('Do not repeat calibration or verification disclaimers through the client narrative'));
  // The existing client-facing calibration language is still the one authority,
  // carried exactly once, and the new block adds no second disclaimer.
  const calibrationAuthority = proposal.split('=== A CALIBRATION').length - 1;
  assert.ok(calibrationAuthority <= 1, 'the calibration language is carried once, never duplicated');
});

// ---------------------------------------------------------------------------
// 12. NO UNSUPPORTED DESIGN REASONS INVENTED
// ---------------------------------------------------------------------------

test('no reason, priority, benefit or compromise may be invented to improve the narrative', () => {
  assert.ok(proposal.includes('=== THE GROUNDING RULE (unchanged and absolute) ==='));
  assert.ok(proposal.includes('Do not invent a client priority, a room-use reason, an equipment-selection rationale, a seating rationale, an acoustic rationale, a benefit or a compromise.'));
  assert.ok(proposal.includes('A plausible-sounding reason is never a substitute for a recorded one.'));
  // The editorial pass is held to the same rule, in its own narrower form.
  assert.ok(editorial.includes('It may not add an experience, a benefit, a reason, a consequence, a priority or a compromise the copy does not already state.'));
  assert.ok(editorial.includes('Where the copy states no reason for a decision, the improved copy states none either.'));
});

// ---------------------------------------------------------------------------
// 13. SECTION-SPECIFIC EMPHASIS REACHES THE PROPOSAL AND THE REPORT
// ---------------------------------------------------------------------------

test('every named proposal section answers its own client question', () => {
  const prompt = writerPrompt();
  const expected = [{
    section: 'system_design_summary',
    answer: 'What has been designed for this room, and why does it suit it?',
  }, {
    section: 'spatial_resolution',
    answer: 'How does sound occupy and move through the room?',
  }, {
    section: 'dynamic_range',
    answer: 'Can the system move convincingly from quiet detail to demanding peaks?',
  }, {
    section: 'timbre_matching',
    answer: 'Does the tonal character remain familiar as sound moves and as listeners change seats?',
  }, {
    section: 'overall_design',
    answer: 'Why is this the right overall design for this room and this brief?',
  }, {
    section: 'key_performance_highlights',
    answer: 'What does the strongest evidence give this cinema?',
  }];

  for (const entry of expected) {
    assert.ok(
      prompt.includes(`Question it answers: ${entry.answer}`)
        || prompt.includes(entry.answer),
      `${entry.section} must state the question it answers`,
    );
  }

  // The stated limits travel with the sections they govern.
  assert.ok(prompt.includes('It is never an RP22 summary.'));
  assert.ok(prompt.includes('Dynamic Range is treated as a whole-system story and never as a bass-only story.'));
  assert.ok(prompt.includes('Never imply that every speaker group measures identically.'));
  assert.ok(prompt.includes('it does not repeat all the preceding results, and it ends with confidence rather than marketing language'));
});

test('the report contract carries the priority and the Design Intent emphasis', () => {
  assert.ok(report.includes('CLIENT NARRATIVE PRIORITY'));
  assert.ok(report.includes('What is this cinema for, and why is it built this way?'));
  assert.ok(report.includes('The equipment supports the story; it never opens it.'));
  // Positioned before the engineering-facing sections, so the writer reads it first.
  assert.ok(report.indexOf('CLIENT NARRATIVE PRIORITY') < report.indexOf('=== THE THREE THEMES'));
});

test('the smell test runs on the finished copy of both surfaces', () => {
  for (const question of CLIENT_NARRATIVE_SMELL_TEST) {
    assert.ok(proposal.includes(question) || report.includes(question), `the smell test must ask: ${question}`);
  }
  assert.ok(report.includes('Would an experienced cinema designer actually say this to a client?'));
});

// ---------------------------------------------------------------------------
// 14. THE EDITORIAL PASS USES THE SAME PRINCIPLES
// ---------------------------------------------------------------------------

test('ADI improves wording with the same narrative principles', () => {
  assert.ok(editorial.includes(ADI_NARRATIVE_EMPHASIS));
  assert.ok(editorial.includes('lead with the experience and let the evidence confirm it'));
  assert.ok(editorial.includes('keep the decision, the reason and what it means for the client together and in that order'));
  assert.ok(editorial.includes('keep that distinction and never widen it into every seat'));
  assert.ok(editorial.includes('Remove a superlative the evidence in the copy does not carry'));
  assert.ok(editorial.includes('Never open on an equipment list.'));
});

// ---------------------------------------------------------------------------
// 15. NOTHING THAT WAS OUT OF SCOPE MOVED
// ---------------------------------------------------------------------------

test('the section structure and every word limit are unchanged', () => {
  assert.deepEqual([...WRITER_SECTION_IDS], [
    'decision_summary',
    'what_stays_same',
    'what_changes',
    'key_performance_highlights',
    'spatial_resolution',
    'dynamic_range',
    'timbre_matching',
    'presented_options',
    'overall_design',
    'appendix_notes',
  ]);
  assert.deepEqual(
    Object.fromEntries(WRITER_SECTIONS.map((entry) => [entry.section, entry.word_limit])),
    {
      decision_summary: 250,
      what_stays_same: 180,
      what_changes: 220,
      key_performance_highlights: 190,
      spatial_resolution: 180,
      dynamic_range: 170,
      timbre_matching: 170,
      presented_options: 170,
      overall_design: 200,
      appendix_notes: 200,
    },
  );
});

test('the writer output contract is unchanged', () => {
  const schema = writerOutputJsonSchema();
  assert.deepEqual(Object.keys(schema.properties), ['contract_version', 'pack_fingerprint', 'sections']);
  assert.deepEqual(schema.required, ['contract_version', 'pack_fingerprint', 'sections']);
});

test('the editorial authority boundary is unchanged', () => {
  assert.equal(ADI_AUTHORITY_BOUNDARY.length, 17);
  for (const rule of ['add a new engineering fact', 'invent a reason', 'strengthen a performance claim', 'remove a material limitation', 'change equipment, or a quantity']) {
    assert.ok(ADI_AUTHORITY_BOUNDARY.includes(rule), `the boundary must still refuse: ${rule}`);
  }
});

test('the internal client summary is not given the client-facing priority', () => {
  const summary = buildSingleSummaryPrompt({ project: { name: 'Test' }, analysis: {} });
  assert.ok(!summary.includes('CLIENT NARRATIVE PRIORITY'));
});

test('the proposal authority still carries the rules it had before', () => {
  // The sales authority, the knowledge classes and the benefit standard are intact.
  assert.ok(proposal.includes('SELL THE EXPERIENCE, PROVE IT WITH THE ENGINEERING'));
  assert.ok(proposal.includes('THREE FORMS OF KNOWLEDGE'));
  assert.ok(proposal.includes('THE SOUND PROOF CLIENT BENEFIT STANDARD'));
  assert.ok(proposal.includes('WRITING DESIGN INTENT'));
  // The report authority's own voice rules are intact.
  assert.ok(report.includes('VOICE: DESIGNER-LED AND ROOM-FOCUSED'));
  assert.ok(report.includes('DESIGN INDEX (INTERNAL ONLY)'));
  assert.ok(report.includes('BANNED WORDS AND PHRASES'));
});

test('the report priority block composes without the proposal sections', () => {
  const block = reportNarrativePriority();
  assert.ok(block.includes('CLIENT NARRATIVE PRIORITY'));
  assert.ok(!block.includes('How does sound occupy and move through the room?'));
  assert.ok(block.includes('What is this cinema for, and why is it built this way?'));
});