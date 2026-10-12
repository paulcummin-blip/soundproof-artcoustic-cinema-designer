import { test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { authorizeProposalExport } from '../base44/shared/proposalEdit/proposalExportAuthorization.js';
import { containsPrivateNote } from '../base44/shared/proposalEdit/privateNoteAuthority.js';
import { readCompleteDocument, readProposalRecords } from '../base44/shared/proposalEdit/readCompleteDocument.js';
import { buildOptionGuidance } from '../base44/shared/proposalWriter/writerOptionGuidance.js';
import { composeWriterSectionBodies } from '../base44/shared/proposalWriter/writerSectionMapping.js';
import { SYSTEM_SUMMARY_SECTIONS as backendSections } from '../base44/shared/systemDesignSummarySections.js';
import { SYSTEM_SUMMARY_SECTIONS as frontendSections } from '../src/components/proposal/proposalSections.js';
import { buildPackageRows } from '../src/components/proposal/print/proposalPackAuthority.js';
import { validatedOptionsCopy } from '../src/components/proposal/options/validatedOptionsCopy.js';
import ComparisonOptionsPage from '../src/components/proposal/print/ComparisonOptionsPage.jsx';
import SeatingStylePage from '../src/components/proposal/print/SeatingStylePage.jsx';
import ProposalPackDocument from '../src/components/proposal/print/ProposalPackDocument.jsx';
import { completeFixture, OPTIONS_COPY, PRIVATE_NOTE } from './fixtures/completeDocumentFixtures.mjs';
const validate = fixture => validateCompleteDocument(fixture);
const codes = result => result.errors.map(error => error.code);
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const placements = [1, 2].map(i => ({ id: `image-${i}`, source_file_url: `https://example.test/image-${i}.jpg`, source_caption: `Option ${i}`, editorial_role: 'comparison_option', crop_orientation: 'landscape' }));

test('valid complete proposal with alternatives is ready without mutating fixtures', () => {
  const fixture = completeFixture(); const before = JSON.stringify(fixture); const result = validate(fixture);
  expect(result.errors).toEqual([]); expect(result.valid).toBe(true); expect(result.options_text).toBe(OPTIONS_COPY); expect(JSON.stringify(fixture)).toBe(before);
});
test('no alternatives keeps Presented Options empty and disabled', () => {
  const result = validate(completeFixture({ alternatives: false }));
  expect(result.errors).toEqual([]); expect(result.options_text).toBe(''); expect(result.document_sections.find(row => row.section_type === 'presented_options').is_enabled).toBe(false);
});
test('required options copy missing blocks issue/export', () => {
  const fixture = completeFixture(); fixture.generationRecords[0].gpt_output.sections.find(row => row.section === 'presented_options').text = '';
  expect(codes(validate(fixture))).toContain('option_copy_missing');
});
test('hidden required options section is not silently enabled', () => {
  const fixture = completeFixture(); fixture.sections.find(row => row.section_type === 'presented_options').is_enabled = false;
  expect(codes(validate(fixture))).toContain('document_section_missing');
});
test('missing required narrative section blocks publication', () => {
  const fixture = completeFixture(); fixture.sections = fixture.sections.filter(row => row.section_type !== 'dynamic_range');
  expect(codes(validate(fixture))).toContain('document_section_missing');
});
test('latest invalid edit blocks even when older valid copy remains readable', () => {
  const fixture = completeFixture(); fixture.editRecords.push({ generation_id: 'fixture-generation', edit_id: 'invalid-edit', edit_number: 1, edited_at: '2026-10-11T13:00:00Z', validation_status: 'needs_human_review', validation_errors: [{ code: 'blocked_claim' }] });
  const result = validate(fixture); expect(codes(result)).toContain('copy_not_valid'); expect(result.document_sections.length).toBe(fixture.sections.length);
});
test('unsupported claim IDs are rejected by approved writer validator', () => {
  const fixture = completeFixture(); fixture.generationRecords[0].gpt_output.sections.find(row => row.section === 'presented_options').claim_ids = ['claim_unselected_product_999']; expect(validate(fixture).valid).toBe(false);
});
test('raw dealer note is blocked and removed from safe options rendering', () => {
  const fixture = completeFixture(); fixture.generationRecords[0].gpt_output.sections.find(row => row.section === 'presented_options').text = PRIVATE_NOTE;
  fixture.sections.find(row => row.section_type === 'presented_options').body = `<p>${PRIVATE_NOTE}</p>`;
  const result = validate(fixture); expect(codes(result)).toContain('raw_dealer_notes'); expect(result.options_text).toBe(''); expect(result.document_sections.find(row => row.section_type === 'presented_options').body).toBe('');
});
test('partial copied instructions and HTML-encoded notes cannot evade the guard', () => {
  expect(containsPrivateNote('A lead. Keep this precise private instruction out. An ending.', ['Keep this precise private instruction out. Use the other image later.'])).toBe(true);
  expect(containsPrivateNote('<p>Keep&#32;this precise private instruction out.</p>', ['Keep this precise private instruction out.'])).toBe(true);
});
test('stored unvalidated manual wording stays readable but blocks issue', () => {
  const fixture = completeFixture(); const row = fixture.sections.find(section => section.section_type === 'dynamic_range'); row.body = '<p>My saved manual review wording.</p>';
  const result = validate(fixture); expect(codes(result)).toContain('unvalidated_document_text'); expect(result.document_sections.find(section => section.id === row.id).body).toBe(row.body);
});
test('latest approved edit reaches the document instead of stale generated wording', () => {
  const fixture = completeFixture({ historical: true }); const edited = structuredClone(fixture.generationRecords[0].gpt_output.sections);
  edited.find(section => section.section === 'appendix_notes').text = 'Read the accompanying frozen report for the detailed evidence.';
  fixture.editRecords.push({ generation_id: 'fixture-generation', edit_id: 'valid-edit', edit_number: 1, edited_at: '2026-10-11T13:00:00Z', validation_status: 'valid', edited_sections: edited });
  const result = validate(fixture); expect(result.edit_id).toBe('valid-edit'); expect(result.document_sections.find(row => row.section_type === 'appendix').body).toContain('Read the accompanying frozen report');
});
test('tampered evidence fingerprint or wrong engineering snapshot blocks publication', () => {
  const fixture = completeFixture(); fixture.generationRecords[0].evidence_pack.options[0].version_name = 'Tampered'; expect(codes(validate(fixture))).toContain('frozen_evidence_mismatch');
  const other = completeFixture(); other.proposal.engineering_snapshot.identity.versionId = 'wrong-version'; expect(codes(validate(other))).toContain('engineering_snapshot_identity');
});
test('historical proposal stays unchanged and readable, never upgraded in place', () => {
  const fixture = completeFixture({ historical: true }); const before = JSON.stringify(fixture); const result = validate(fixture);
  expect(codes(result)).toContain('option_copy_missing'); expect(result.options_text).toBe(''); expect(result.document_sections.find(row => row.section_type === 'system_design_summary').body).toBeTruthy(); expect(JSON.stringify(fixture)).toBe(before);
});
test('ordinary gallery images and lone alternatives do not invent options copy', () => {
  expect(buildOptionGuidance([{ file_url: 'image', caption: 'Ordinary room' }])).toBe(null);
  expect(buildOptionGuidance([{ file_url: 'image', comparison_enabled: true, comparison_option_label: 'Only choice' }])).toBe(null);
  expect(buildOptionGuidance([{ file_url: 'a', seating_style: 'lounge' }, { file_url: 'b', seating_style: 'recliner' }]).groups).toHaveLength(1);
});
test('server export authorization rejects stale bodies, ordering and invalid validation', () => {
  const fixture = completeFixture(); const validation = validate(fixture); const request = { rendered_sections: validation.document_sections, engineering_snapshot: fixture.proposal.engineering_snapshot };
  expect(authorizeProposalExport({ validation, proposal: fixture.proposal, request }).allowed).toBe(true);
  const changed = structuredClone(request); changed.rendered_sections[0].order_index = 900;
  expect(authorizeProposalExport({ validation, proposal: fixture.proposal, request: changed }).allowed).toBe(false);
  expect(authorizeProposalExport({ validation: { ...validation, valid: false }, proposal: fixture.proposal, request }).allowed).toBe(false);
});
test('copy-only export needs fresh matching generation, edit and text', () => {
  const fixture = completeFixture(); const validation = validate(fixture); const copy = fixture.generationRecords[0].gpt_output.sections;
  const request = { export_kind: 'copy', generation_id: validation.generation_id, edit_id: null, rendered_copy: copy };
  expect(authorizeProposalExport({ validation, proposal: fixture.proposal, request, copy }).allowed).toBe(true);
  expect(authorizeProposalExport({ validation, proposal: fixture.proposal, request: { ...request, generation_id: 'stale' }, copy }).allowed).toBe(false);
});
test('read-only reader uses mocked entities, scopes version images and never writes', async () => {
  const fixture = completeFixture({ alternatives: false }); const calls = [];
  const entity = rows => new Proxy({ filter: async (query, options) => { calls.push({ query, options }); return { items: rows, has_more: false }; } }, { get(target, key) { if (key === 'filter') return target.filter; throw new Error(`Write forbidden: ${String(key)}`); } });
  const entities = { ProposalSection: entity(fixture.sections), ProposalGeneration: entity(fixture.generationRecords), ProposalEdit: entity([]), ProposalAsset: entity([{ file_url: 'a', scope: 'version', version_id: 'unselected', seating_style: 'lounge' }, { file_url: 'b', scope: 'version', version_id: 'unselected', seating_style: 'recliner' }]) };
  const result = await readCompleteDocument(entities, fixture.proposal); expect(result.options_required).toBe(false); expect(calls).toHaveLength(4); expect(calls.every(call => call.options.limit === 50)).toBe(true);
});
test('Editor and PDF render identical validated options, never group.message or notes', () => {
  const copy = validatedOptionsCopy({ document_validation: { options_text: OPTIONS_COPY } });
  const editor = renderToStaticMarkup(<ComparisonOptionsPage showHeader={false} placements={placements} validatedCopy={copy} message={PRIVATE_NOTE} />);
  const pdf = renderToStaticMarkup(<ComparisonOptionsPage showHeader={false} placements={placements} validatedCopy={copy} />);
  expect(editor).toBe(pdf); expect(editor).toContain(OPTIONS_COPY); expect(editor).not.toContain(PRIVATE_NOTE);
  const seating = renderToStaticMarkup(<SeatingStylePage placements={placements} validatedCopy={copy} />); expect(seating).toContain(OPTIONS_COPY); expect(seating).not.toContain(PRIVATE_NOTE);
});
test('backend/frontend section vocabulary agrees and options mapped exactly once', () => {
  expect(frontendSections.map(row => row.type)).toEqual(backendSections.map(row => row.type)); const fixture = completeFixture();
  const result = composeWriterSectionBodies({ output: fixture.generationRecords[0].gpt_output, mode: 'comparison', sectionTypes: backendSections.map(row => row.type) });
  expect(result.unmapped).toEqual([]); expect(result.bodies.filter(row => row.section_type === 'presented_options')).toHaveLength(1);
});
test('Genesis-shaped frozen equipment keeps two cabinets on one logical centre channel', () => {
  const snapshot = { system: { product_roles: [{ role: 'front_left_right', position_label: 'Front Left / Right', model_label: 'LCR model' }, { role: 'centre', position_label: 'Centre', model_label: 'C4-1', cabinet_count: 2, channel_count: 1 }] } }; const before = JSON.stringify(snapshot); const rows = buildPackageRows(snapshot);
  expect(rows.find(row => row.role === 'Front Left').model).toBe('LCR model'); expect(rows.find(row => row.role === 'Front Right').model).toBe('LCR model');
  // The table states what is specified — the position and its cabinets. The two
  // cabinets behind one centre channel remain the frozen data, unstated in copy.
  expect(rows.find(row => row.role === 'Centre').model).toBe('2 × C4-1');
  expect(rows.some(row => /physical cabinet|logical channel|mono/i.test(`${row.role} ${row.model}`))).toBe(false);
  expect(JSON.stringify(snapshot)).toBe(before);
});
test('unlabelled marked alternatives still require validated options prose', () => {
  const guidance = buildOptionGuidance([{ file_url: 'a', comparison_enabled: true }, { file_url: 'b', comparison_enabled: true }]);
  expect(guidance.groups[0].options).toEqual(['Option 1', 'Option 2']);
});
test('raw private instructions in a caption block publication', () => {
  const fixture = completeFixture(); fixture.publishedAssetText = [PRIVATE_NOTE];
  expect(codes(validate(fixture))).toContain('raw_dealer_notes');
});
test('altered pack inside writer input cannot reuse the original fingerprint', () => {
  const fixture = completeFixture();
  fixture.generationRecords[0].gpt_input.evidence_pack = structuredClone(fixture.generationRecords[0].evidence_pack);
  fixture.generationRecords[0].gpt_input.evidence_pack.options[0].version_name = 'Altered input';
  expect(codes(validate(fixture))).toContain('frozen_evidence_mismatch');
});
test('full PDF composition publishes approved options exactly once', () => {
  const fixture = completeFixture(); const validation = validate(fixture);
  const html = renderToStaticMarkup(<ProposalPackDocument proposal={{ ...fixture.proposal, proposal_type: 'system_summary' }} projectName="Fixture cinema" heroImageUrl={null} logoUrl={null} sections={validation.document_sections} validatedOptionsCopy="" projectImages={[]} />);
  expect(html.split(OPTIONS_COPY).length - 1).toBe(1);
  expect(html).not.toContain(PRIVATE_NOTE);
});
test('changed alternatives cannot publish an older approved brief', () => {
  const fixture = completeFixture(); fixture.optionGuidance.groups[0].options.push('New unapproved arrangement');
  expect(codes(validate(fixture))).toContain('option_guidance_changed');
});
test('history cursor pages are read without any mutation', async () => {
  const calls = []; const entity = { filter: async (query, options) => { calls.push(options.cursor); return options.cursor ? { items: [{ id: 'second' }], has_more: false } : { items: [{ id: 'first' }], has_more: true, next_cursor: 'next-page' }; } };
  expect(await readProposalRecords(entity, { proposal_id: 'fixture-proposal' })).toEqual([{ id: 'first' }, { id: 'second' }]);
  expect(calls).toEqual([undefined, 'next-page']);
});
test('issue/export source gates before writes or printing and never invokes generation', () => {
  const issue = source('../base44/functions/transitionProposalStatus/entry.ts'); expect(issue.indexOf('await readCompleteDocument')).toBeLessThan(issue.indexOf('await base44.entities.Proposal.update'));
  const exported = source('../src/components/proposal/export/useProposalExport.js'); expect(exported.indexOf("invoke('readProposalEditLayer'")).toBeLessThan(exported.indexOf('recordIssuedExportInBackground({'));
  const copy = source('../src/components/proposal/generation/ProposalEditCopyPreview.jsx'); expect(copy.indexOf("invoke('readProposalEditLayer'")).toBeLessThan(copy.indexOf('await printReportInWindow')); expect(exported).not.toContain("invoke('generateProposal'");
});