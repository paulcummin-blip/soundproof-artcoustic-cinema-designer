import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { adiSectionContract, buildAdiEditorialPrompt } from '../base44/shared/adiEditorial/adiEditorialPrompt.js';
import { runAdiWordingPass } from '../base44/shared/adiEditorial/adiWordingPass.js';
import { writerDraftsFromProposalSectionBody } from '../base44/shared/proposalWriter/writerSectionMapping.js';
import { improveProposalSectionWording } from '../base44/shared/adiEditorial/proposalSectionWordingEditorial.js';
import { publishedSectionFingerprint, sectionApprovalFingerprint } from '../base44/shared/proposalApproval/sectionApprovalAuthority.js';
import { persistAdiProposalSectionRevision } from '../base44/shared/proposalEdit/persistAdiProposalSectionRevision.js';
import { editWorld, sectionsOf } from './fixtures/proposalEditFixtures.mjs';

const source = '<h2>Design Summary</h2><p>The room has 8 seats.</p><h2>Design Overview</h2><p>The screen speakers carry voices.</p><h2>Why This Specification</h2><p>The bass extends to 22 Hz.</p>';
const improved = source.replace('The screen speakers carry voices.', 'Voices come from the screen speakers.');
const contract = adiSectionContract({ sectionType: 'system_design_summary', sectionLabel: 'System Design Summary', mode: 'single', original: source });
const structure = (body) => {
  try { writerDraftsFromProposalSectionBody({ sectionType: 'system_design_summary', body, mode: 'single' }); return { ok: true }; }
  catch (error) { return { ok: false, violations: [{ code: 'required_section_structure', detail: error.message }] }; }
};
async function passFor(original, candidates, extra = {}) {
  const prompts = [];
  const pass = await runAdiWordingPass({
    original, prompt: buildAdiEditorialPrompt({ currentText: original, sectionContract: contract }),
    sectionContract: contract,
    invokeLLM: async ({ prompt }) => { prompts.push(prompt); return candidates.shift(); },
    ...extra,
  });
  return { pass, prompts };
}

describe('section-aware ADI correction', () => {
  it('reads the summary headings from the frozen writer contract and preserves safe shortening on candidate one', async () => {
    assert.deepEqual(contract.required_headings, ['Design Summary', 'Design Overview', 'Why This Specification']);
    const { pass } = await passFor(source, [improved], { validate: structure });
    assert.equal(pass.outcome, 'improved');
    assert.equal(pass.attempts, 1);
    assert.equal(pass.corrected, false);
    assert.equal(pass.attempt_audit[0].outcome, 'accepted');
    for (const heading of contract.required_headings) assert.ok(pass.text.includes('<h2>' + heading + '</h2>'));
  });
  it('repairs one semantic violation without losing the useful first-candidate wording or headings', async () => {
    const first = improved.replace('22 Hz', '20 Hz');
    const { pass, prompts } = await passFor(source, [first, improved], { validate: structure });
    assert.equal(pass.outcome, 'improved');
    assert.equal(pass.attempts, 2);
    assert.equal(pass.corrected, true);
    assert.equal(pass.text, improved);
    assert.equal(pass.attempt_audit[0].outcome, 'rejected');
    assert.equal(pass.attempt_audit[1].outcome, 'accepted');
    assert.ok(prompts[1].includes(first));
    assert.ok(prompts[1].includes(source));
    assert.ok(prompts[1].includes('Do not start again from scratch'));
    assert.ok(prompts[1].includes('Design Overview'));
  });
  it('routes missing mandatory headings through the same correction path', async () => {
    const { pass } = await passFor(source, [improved.replace('<h2>Design Overview</h2>', ''), improved], { validate: structure });
    assert.equal(pass.attempt_audit[0].violations[0].code, 'required_section_structure');
    assert.equal(pass.outcome, 'improved');
    assert.equal(pass.text, improved);
  });
  for (const type of ['spatial_resolution', 'dynamic_range', 'timbre_matching', 'overall_design']) {
    it(type + ' corrects a violation while retaining valid editorial improvements', async () => {
      const original = '<p>The predicted low-frequency response extends to 22 Hz across the primary seats.</p>';
      const fixed = '<p>Across the primary seats, the predicted low-frequency response extends to 22 Hz.</p>';
      const { pass } = await passFor(original, [fixed.replace('22 Hz', '20 Hz'), fixed], {
        sectionContract: adiSectionContract({ sectionType: type, sectionLabel: type, original }),
      });
      assert.equal(pass.text, fixed);
      assert.equal(pass.corrected, true);
      assert.equal(pass.attempt_audit.length, 2);
    });
  }
  it('rejects a failed correction and records both exact rule lists without a third attempt', async () => {
    const { pass, prompts } = await passFor(source, [improved.replace('22 Hz', '20 Hz'), improved.replace('22 Hz', '18 Hz')], { validate: structure });
    assert.equal(pass.outcome, 'rejected');
    assert.equal(prompts.length, 2);
    assert.equal(pass.attempt_audit[1].outcome, 'rejected');
    assert.ok(pass.attempt_audit.every((entry) => entry.violations.length > 0));
  });
  it('records the actual writer-validator stage rather than the grounding fallback', async () => {
    const { pass } = await passFor(source, [improved, improved], {
      validateStage: 'product_grounding',
      validate: async () => ({ ok: false, stage: 'original_surface_validator', violations: [{ code: 'unsupported_recommendation' }] }),
    });
    assert.equal(pass.outcome, 'rejected');
    assert.ok(pass.attempt_audit.every((entry) => entry.rejectionStage === 'original_surface_validator'));
    assert.equal(pass.attempts, 2);
  });
  it('validation-only mode writes no section and creates no history record', async () => {
    const { generation, input } = editWorld();
    const section = { id: 'section', section_type: 'dynamic_range' };
    let writes = 0;
    const entities = {
      ProposalGeneration: { filter: async () => [generation] },
      ProposalEdit: { filter: async () => [], create: async () => { writes += 1; } },
      ProposalSection: { update: async () => { writes += 1; } },
    };
    const text = sectionsOf(input).find((row) => row.section === 'dynamic_range').text;
    const checked = await persistAdiProposalSectionRevision({ entities, proposalId: generation.proposal_id, section, body: '<p>' + text + '</p>', validateOnly: true });
    assert.equal(checked.accepted, true);
    assert.equal(writes, 0);
  });
});

function merge(a, b) {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(a?.[key] || {}, value) : value;
  return out;
}
function undoWorld(drop = null) {
  const before = '<p>The bass extends to 22 Hz.</p>';
  const original = { body: before, last_user_edited_at: null, last_gpt_generated_at: '2026-10-18T12:00:00.000Z' };
  const approval = { status: 'approved', fingerprint: sectionApprovalFingerprint({ publishedBody: before, storedBody: before, lastGptGeneratedAt: original.last_gpt_generated_at }), approved_by: 'Designer' };
  const marker = { previous_body: before, previous_last_user_edited_at: null, previous_last_gpt_generated_at: original.last_gpt_generated_at, previous_approval: approval, source_fingerprint: publishedSectionFingerprint(before) };
  let stored = { id: 's', proposal_id: 'p', section_type: 'dynamic_range', body: '<p>Bass extends to 22 Hz.</p>', last_user_edited_at: null, last_gpt_generated_at: '2026-10-19T12:00:00.000Z', metadata: { approval, adi_editorial: marker } };
  let writes = 0, reads = 0;
  const entities = {
    Proposal: { filter: async () => [{ id: 'p' }] },
    ProposalSection: {
      filter: async () => { reads += 1; return [structuredClone(stored)]; },
      update: async (_, patch) => {
        writes += 1;
        const applied = structuredClone(patch);
        if (drop === 'timestamp') delete applied.last_gpt_generated_at;
        if (drop === 'marker') delete applied.metadata.adi_editorial;
        stored = merge(stored, applied);
        return patch; // optimistic response must never substitute for the read-back
      },
    },
  };
  return { entities, original, approval, state: () => stored, counts: () => ({ writes, reads }) };
}
describe('atomic Undo under nested metadata merge semantics', () => {
  it('restores body, both timestamps, approval and source fingerprint in one write and verifies storage', async () => {
    const world = undoWorld();
    const result = await improveProposalSectionWording({ entities: world.entities, proposalId: 'p', sectionId: 's', action: 'undo' });
    assert.equal(result.applied, true);
    assert.equal(world.state().body, world.original.body);
    assert.equal(world.state().last_gpt_generated_at, world.original.last_gpt_generated_at);
    assert.equal(world.state().last_user_edited_at, null);
    assert.equal(world.state().metadata.adi_editorial, null);
    assert.deepEqual(world.state().metadata.approval, world.approval);
    assert.equal(publishedSectionFingerprint(world.state().body), publishedSectionFingerprint(world.original.body));
    assert.equal(world.counts().writes, 1);
    assert.ok(world.counts().reads >= 2);
  });
  for (const field of ['timestamp', 'marker']) {
    it('refuses successful Undo when storage fails to restore ' + field, async () => {
      const world = undoWorld(field);
      const result = await improveProposalSectionWording({ entities: world.entities, proposalId: 'p', sectionId: 's', action: 'undo' });
      assert.equal(result.ok, false);
      assert.equal(result.block.code, 'undo_verification_failed');
      assert.equal(result.block.diagnostics.rejectionStage, 'undo_persistence');
    });
  }
  it('keeps retry telemetry inside the master-admin response and Engineering-only component', () => {
    const entry = readFileSync(new URL('../base44/functions/improveAdiWording/entry.ts', import.meta.url), 'utf8');
    const panel = readFileSync(new URL('../src/components/adi/AdiEditorialRejectionDiagnostics.jsx', import.meta.url), 'utf8');
    assert.ok(entry.includes('diagnostics: accessContext.isMasterAdmin === true'));
    assert.ok(entry.includes('attempt_audit: outcome.attempt_audit'));
    assert.ok(panel.includes('const mayView = engineeringMode === true'));
    assert.ok(panel.includes('data-adi-attempt-audit'));
  });
});
