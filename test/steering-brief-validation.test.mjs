import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validateSteeringBrief } from '../src/components/proposal/wizard/steeringBriefValidation.js';
import { briefCoverageGate } from '../base44/shared/proposalWriter/proposalBriefCoverageGate.js';

const RICHER_SOUNDS_BRIEF = `This project is designed with a 75" or 83" TV to be used day to day, with the drop down 110" projector screen for movie nights. The suggested fabric screen wall conceals the front subwoofers and lets the projection screen sit partly within the same recess. This is a showroom, so the proposal should support a consultative discussion of what matters in a client's own room, including the accessible Level 1 to 2 specification and the financial choices represented by RP22 Levels 1 to 4.`;

const CONCISE_BRIEF = 'Compact family media room; everyday TV plus movie nights; client wants strong bass, clear dialogue and a concealed subwoofer.';

test('the Richer Sounds showroom brief passes the entry requirement', () => {
  const result = validateSteeringBrief(RICHER_SOUNDS_BRIEF);
  assert.equal(result.valid, true, result.reason || 'expected valid');
  assert.equal(result.reason, null);
});

test('a concise but meaningful brief passes', () => {
  const result = validateSteeringBrief(CONCISE_BRIEF);
  assert.equal(result.valid, true, result.reason || 'expected valid');
});

test('an empty brief is rejected with a specific reason', () => {
  const result = validateSteeringBrief('');
  assert.equal(result.valid, false);
  assert.ok(result.reason && result.reason.length > 0);
  assert.match(result.reason, /how the room will be used/i);
});

test('a single token is rejected', () => {
  const result = validateSteeringBrief('Cinema');
  assert.equal(result.valid, false);
  assert.ok(result.reason);
});

test('filler words without project context are rejected', () => {
  const result = validateSteeringBrief('yes yes yes yes yes yes yes');
  assert.equal(result.valid, false);
});

test('the coverage gate does not apply to proposals created before the workflow', () => {
  const gate = briefCoverageGate({ client_brief: RICHER_SOUNDS_BRIEF, metadata: {} }, []);
  assert.equal(gate.applies, false);
  assert.equal(gate.blocked, false);
});

test('the coverage gate applies to proposals flagged for the workflow', () => {
  const proposal = { client_brief: 'Explain the everyday TV viewing and the concealed subwoofers.', metadata: { brief_coverage_required: true } };
  const sections = [
    { section_type: 'system_design_summary', body: 'A proposed fabric wall conceals the front subwoofers and the room is used for everyday television viewing as well as projection.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.applies, true);
  // The copy addresses both the TV viewing subject and the subwoofers subject.
  assert.equal(gate.blocked, false, gate.reason || 'expected not blocked');
});

test('the coverage gate blocks a workflow proposal whose copy ignores a supported brief item', () => {
  const proposal = { client_brief: 'Explain the everyday TV viewing alongside the projector, and the concealed front subwoofers.', metadata: { brief_coverage_required: true } };
  // The copy mentions the projector but never the TV or the subwoofers.
  const sections = [
    { section_type: 'system_design_summary', body: 'The projector provides a large image for film nights. The loudspeakers are arranged around the seating.' },
  ];
  // Hard enforcement is off by default; pass it explicitly to test blocking.
  const gate = briefCoverageGate(proposal, sections, { hard_enforcement: true });
  assert.equal(gate.applies, true);
  assert.equal(gate.blocked, true);
  assert.ok(gate.reason && gate.reason.length > 0);
  assert.ok(Array.isArray(gate.outstanding) && gate.outstanding.length > 0);
});

test('the coverage gate reports outstanding items without blocking when hard enforcement is off', () => {
  const proposal = { client_brief: 'Explain the everyday TV viewing alongside the projector, and the concealed front subwoofers.', metadata: { brief_coverage_required: true } };
  const sections = [
    { section_type: 'system_design_summary', body: 'The projector provides a large image for film nights. The loudspeakers are arranged around the seating.' },
  ];
  const gate = briefCoverageGate(proposal, sections);
  assert.equal(gate.applies, true);
  assert.equal(gate.blocked, false, 'hard enforcement is off by default');
  assert.ok(Array.isArray(gate.outstanding) && gate.outstanding.length > 0, 'outstanding items are still reported');
});