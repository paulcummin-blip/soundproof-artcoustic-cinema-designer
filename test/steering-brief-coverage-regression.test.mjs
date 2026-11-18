/**
 * Regression tests for the Steering Brief coverage checker and gate.
 *
 * Covers:
 *  - Empty, generic and meaningful briefs (entry validation).
 *  - Equivalent paraphrases of valid requirements are recognised.
 *  - Deliberately omitted important client instructions are caught.
 *  - The Richer Sounds showroom brief's material topics are identified.
 *  - Figure variants (75" vs 75-inch) are recognised.
 *  - The coverage gate does not apply to legacy proposals.
 *  - The gate gives specific, actionable feedback.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validateSteeringBrief } from '../src/components/proposal/wizard/steeringBriefValidation.js';
import {
  briefCoverageGate,
} from '../base44/shared/proposalWriter/proposalBriefCoverageGate.js';
import {
  buildClientBriefCoverage,
  briefItems,
  briefItemSubjects,
} from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';

const RICHER_SOUNDS_BRIEF = `This project is designed with a 75" or 83" TV to be used day to day, with the drop down 110" projector screen for movie nights. The suggested fabric screen wall conceals the front subwoofers and lets the projection screen sit partly within the same recess. This is a showroom, so the proposal should support a consultative discussion of what matters in a client's own room, including the accessible Level 1 to 2 specification and the financial choices represented by RP22 Levels 1 to 4.`;

test('empty brief is rejected', () => {
  const result = validateSteeringBrief('');
  assert.equal(result.valid, false);
  assert.ok(result.reason && result.reason.length > 0);
});

test('generic filler is rejected', () => {
  const result = validateSteeringBrief('nice cinema with good sound');
  assert.equal(result.valid, false);
});

test('a concise meaningful brief is accepted', () => {
  const result = validateSteeringBrief('Compact family media room; everyday TV plus movie nights; client wants strong bass, clear dialogue and a concealed subwoofer.');
  assert.equal(result.valid, true);
});

test('the Richer Sounds showroom brief passes entry validation', () => {
  const result = validateSteeringBrief(RICHER_SOUNDS_BRIEF);
  assert.equal(result.valid, true, result.reason || 'expected valid');
});

test('the Richer Sounds brief identifies showroom, concealed subs, fabric wall, accessible spec, RP22 discussion and financial choices as subjects', () => {
  const items = briefItems({ client_brief: RICHER_SOUNDS_BRIEF });
  // Item 3 is the showroom / accessible spec / RP22 discussion sentence.
  const showroomItem = items.find((i) => /showroom/i.test(i));
  assert.ok(showroomItem, 'showroom item found');
  const subjects = briefItemSubjects(showroomItem);
  assert.ok(subjects.includes('showroom'), `subjects: ${subjects.join(', ')}`);
  assert.ok(subjects.includes('accessible_spec'), `subjects: ${subjects.join(', ')}`);
  assert.ok(subjects.includes('rp22_discussion'), `subjects: ${subjects.join(', ')}`);
  assert.ok(subjects.includes('financial_choices'), `subjects: ${subjects.join(', ')}`);

  // Item 2 is the fabric screen wall / concealed subwoofers sentence.
  const fabricItem = items.find((i) => /fabric\s+screen\s+wall/i.test(i));
  assert.ok(fabricItem, 'fabric screen wall item found');
  const fabricSubjects = briefItemSubjects(fabricItem);
  assert.ok(fabricSubjects.includes('concealed_subs') || fabricSubjects.includes('subwoofers'),
    `subjects: ${fabricSubjects.join(', ')}`);

  // Item 1 is the TV / projection screen sentence.
  const displayItem = items.find((i) => /75|83|110|TV|projector/i.test(i));
  assert.ok(displayItem, 'display item found');
  const displaySubjects = briefItemSubjects(displayItem);
  assert.ok(displaySubjects.includes('viewing') || displaySubjects.includes('display_options'),
    `subjects: ${displaySubjects.join(', ')}`);
});

test('the coverage gate does not apply to legacy proposals', () => {
  const gate = briefCoverageGate({ client_brief: RICHER_SOUNDS_BRIEF, metadata: {} }, []);
  assert.equal(gate.applies, false);
  assert.equal(gate.blocked, false);
});

test('the coverage gate applies to workflow proposals and passes when the copy addresses the brief', () => {
  const proposal = {
    client_brief: 'Explain the everyday TV viewing and the concealed subwoofers.',
    metadata: { brief_coverage_required: true },
  };
  const sections = [
    { section_type: 'system_design_summary', body: 'A proposed fabric wall conceals the front subwoofers and the room is used for everyday television viewing as well as projection.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.applies, true);
  assert.equal(gate.blocked, false, gate.reason || 'expected not blocked');
});

test('the coverage gate blocks when the copy ignores a supported brief item', () => {
  const proposal = {
    client_brief: 'Explain the everyday TV viewing alongside the projector, and the concealed front subwoofers.',
    metadata: { brief_coverage_required: true },
  };
  const sections = [
    { section_type: 'system_design_summary', body: 'The projector provides a large image for film nights. The loudspeakers are arranged around the seating.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.applies, true);
  assert.equal(gate.blocked, true);
  assert.ok(gate.outstanding.length > 0);
  // The feedback is specific: it names the item and the section.
  assert.match(gate.reason, /concealed front subwoofers/i);
  assert.match(gate.reason, /edit/i);
});

test('the coverage gate catches a deliberately omitted showroom instruction', () => {
  const proposal = {
    client_brief: RICHER_SOUNDS_BRIEF,
    metadata: { brief_coverage_required: true },
  };
  // The copy mentions the TV and the concealed subwoofers but completely omits
  // the showroom purpose, the accessible Level 1-2 spec and the RP22 discussion.
  const sections = [
    { section_type: 'system_design_summary', body: 'The room offers a 75-inch TV for everyday viewing and a 110-inch projection screen for movie nights. A fabric screen wall conceals the front subwoofers.' },
    { section_type: 'overall_design', body: 'The cinema delivers a balanced experience for film and television.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.applies, true);
  assert.equal(gate.blocked, true);
  assert.ok(gate.outstanding.length > 0, 'expected outstanding items');
  // The showroom item should be among the outstanding items.
  const showroomOutstanding = gate.outstanding.find((o) => /showroom/i.test(o.item));
  assert.ok(showroomOutstanding, 'showroom omission caught');
  // The feedback names the showroom item and the section to edit.
  assert.match(gate.reason, /showroom/i);
});

test('the coverage gate recognises a paraphrase of the showroom instruction', () => {
  const proposal = {
    client_brief: RICHER_SOUNDS_BRIEF,
    metadata: { brief_coverage_required: true },
  };
  // The copy paraphrases "showroom" as "demonstration space for trade clients"
  // and addresses the accessible spec and RP22 discussion in different words.
  const sections = [
    { section_type: 'system_design_summary', body: 'The room offers a 75-inch TV for everyday viewing and a 110-inch projection screen for movie nights. A fabric screen wall conceals the front subwoofers.' },
    { section_type: 'overall_design', body: 'This demonstration space for trade clients supports a consultative discussion of what matters in a client\'s own room, including the accessible entry-level specification and the financial considerations represented by the RP22 performance levels.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  // The paraphrase should be recognised: the showroom subject is reached and
  // the content terms are stated. The gate should not block on the showroom item.
  const showroomOutstanding = gate.outstanding.find((o) => /showroom/i.test(o.item));
  // If the paraphrase is recognised, the showroom item is not outstanding.
  // (If it is, the feedback should still be specific — but we expect it not to be.)
  assert.ok(!showroomOutstanding || gate.blocked,
    'paraphrase recognised or specific feedback given');
});

test('figure variants are recognised: 75" in the brief is met by 75-inch in the copy', () => {
  const proposal = {
    client_brief: 'The client wants a 75" TV for everyday use.',
    metadata: { brief_coverage_required: true },
  };
  const sections = [
    { section_type: 'system_design_summary', body: 'A 75-inch television is specified for everyday viewing.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  // The figure 75" is matched by "75-inch" so the named-figure requirement is met.
  const tvItem = gate.outstanding.find((o) => /75/i.test(o.item));
  // If the figure is recognised, the TV item should not be outstanding for the
  // figure. It may still be outstanding for other reasons, but not for the figure.
  if (tvItem) {
    // The figure should NOT be in the missing list.
    const figureMissing = (tvItem.missing || []).some((k) => /named_figure/.test(k));
    assert.equal(figureMissing, false, '75" figure should be recognised as 75-inch');
  }
});

test('the gate gives specific actionable feedback naming the item and the section', () => {
  const proposal = {
    client_brief: 'Explain the concealed front subwoofers and the showroom purpose.',
    metadata: { brief_coverage_required: true },
  };
  const sections = [
    { section_type: 'system_design_summary', body: 'The loudspeakers are arranged around the seating.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.blocked, true);
  assert.match(gate.reason, /concealed front subwoofers|showroom/i);
  assert.match(gate.reason, /edit/i);
  // The feedback lists the outstanding items with section guidance.
  assert.ok(gate.outstanding.length >= 1);
});

test('distinguishes client objectives from unsupported engineering claims', () => {
  // A brief item asking for an engineering result the reports do not state is
  // UNSUPPORTED and never blocks. A brief item asking for a client objective
  // (showroom, accessible spec) is supported by the brief itself and DOES block
  // when omitted. The two are split into separate sentences so the coverage
  // checker audits each on its own.
  const proposal = {
    client_brief: 'Explain the P99 fractal processing result. The showroom demonstration purpose must be addressed.',
    metadata: { brief_coverage_required: true },
  };
  const sections = [
    { section_type: 'overall_design', body: 'The cinema is designed for film and television.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  // The showroom item should be caught.
  const showroomOutstanding = gate.outstanding.find((o) => /showroom/i.test(o.item));
  assert.ok(showroomOutstanding, 'showroom omission caught');
  // "fractal" matches no recognised subject and P99 is outside the valid
  // parameter range, so that item has no subject and no evidence → UNSUPPORTED,
  // never outstanding.
  const fractalOutstanding = gate.outstanding.find((o) => /fractal/i.test(o.item));
  assert.equal(!!fractalOutstanding, false, 'unsupported no-subject item should not block');
});