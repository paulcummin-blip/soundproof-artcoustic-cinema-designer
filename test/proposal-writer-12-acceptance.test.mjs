import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writer12Fixture, ARRANGEMENT, PRACTICAL } from './fixtures/proposalWriter12Fixtures.mjs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { requiredMultiCabinetChannels, multiCabinetChannelViolations } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { authorizeProposalExport } from '../base44/shared/proposalEdit/proposalExportAuthorization.js';
import { validationRegisterPhrase } from '../base44/shared/proposalWriter/writerValidationRegister.js';
import { buildWriterPrompt, writerOutputJsonSchema, assertWriterInputCarriesNoLiveState } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { WRITER_PROMPT_VERSION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { VALIDATOR_SOURCE_MANIFEST } from '../base44/shared/proposalWriter/validatorSourceManifest.js';
import { deriveGenerationStatus } from '../base44/shared/proposalGeneration/generationStatuses.js';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const validate = f => validateWriterOutput({ input: f.input, output: f.output });
const multi = f => multiCabinetChannelViolations({ input: f.input, sections: f.output.sections });
const replace = (f, text, section = 'what_stays_same') => { f.output.sections.find(row => row.section === section).text = text; return f; };
const codes = r => r.violations.map(row => row.code);

test('A. frozen Genesis front_stage requires two physical cabinets and one logical centre channel', () => {
  const f = writer12Fixture();
  assert.equal(f.pack.options[0].facts.system.front_stage.physical_centre_cabinets, 2);
  assert.equal(f.pack.options[0].facts.system.front_stage.logical_centre_channels, 1);
  assert.equal(requiredMultiCabinetChannels(f.pack)[0].version_name, 'Genesis');
  assert.equal(validate(f).valid, true, JSON.stringify(validate(f).violations));
  assert.equal(validateCompleteDocument(f).valid, true, JSON.stringify(validateCompleteDocument(f).errors));
});
test('A. accurate natural alternatives and evidence wording are accepted without fixed phrasing', () => {
  for (const text of [ARRANGEMENT, 'A pair of centre enclosures shares the same audio channel.',
    'Both centre cabinets carry the same centre signal.', 'One centre channel is reproduced by two physical cabinets.',
    'The centre is specified with 2 × C4-1 loudspeakers fed from a single centre channel.',
    'Two physical centre cabinets are fed from ONE logical centre channel.']) {
    assert.deepEqual(multi(replace(writer12Fixture(), text)), [], text);
  }
});
test('B. omission and unspecified physical count fail the approved pipeline', () => {
  for (const text of ['The centre channel is specified.', 'Several centre cabinets reproduce a single channel.']) {
    const f = replace(writer12Fixture(), text);
    assert(codes(validate(f)).includes('multi_cabinet_channel'), text);
  }
});
test('C. contradictory physical counts fail even alongside a correct explanation', () => {
  for (const text of ['The centre uses three C4-1 cabinets for one centre channel.',
    'A single centre cabinet carries the one centre channel.', 'The centre has 7 loudspeakers reproducing one audio channel.']) {
    const f = replace(writer12Fixture(), `${ARRANGEMENT} ${text}`);
    assert(multi(f).some(v => v.detail.startsWith('cabinet_count_contradicts')), text);
    assert(codes(validate(f)).includes('multi_cabinet_channel'));
  }
});
test('D. physical cabinets cannot become separate logical channels', () => {
  for (const text of ['Two centre cabinets reproduce two discrete centre channels.',
    'The centre uses two cabinets fed from two logical audio channels.', 'Each centre cabinet carries a separate channel.']) {
    const f = replace(writer12Fixture(), `${ARRANGEMENT} ${text}`);
    assert(multi(f).some(v => v.detail.startsWith('physical_cabinets_described')), text);
    assert(codes(validate(f)).includes('multi_cabinet_channel'));
  }
});
test('E. single-cabinet designs remain unaffected and rules are not product-specific', () => {
  const single = writer12Fixture({ cabinets: 1 });
  assert.deepEqual(single.input.multi_cabinet_channels.required, []);
  assert.equal(validate(single).valid, true);
  const other = writer12Fixture({ cabinets: 3, model: 'Q8-3' });
  assert.deepEqual(multi(other), []);
  assert.equal(other.input.multi_cabinet_channels.required[0].cabinets, 3);
});
test('comparison explanation must apply to the multi-cabinet design, not the other option', () => {
  const f = writer12Fixture({ comparison: true });
  assert.deepEqual(multi(f), []);
  replace(f, `Alternative Design: ${ARRANGEMENT}`);
  assert(multi(f).some(v => v.detail.startsWith('required_arrangement_not_described')));
  replace(f, `Genesis: ${ARRANGEMENT} Alternative Design: A single centre cabinet reproduces one centre channel.`);
  assert.deepEqual(multi(f), []);
});
test('comparisons with different multi-cabinet counts validate each design independently', () => {
  const f = writer12Fixture({ comparison: true, secondCabinets: 3 });
  assert.deepEqual(multi(f), []);
  replace(f, 'Alternative Design: The centre uses two cabinets to reproduce one centre channel.', 'what_changes');
  assert(multi(f).some(v => v.version_id === 'b' && v.detail.startsWith('cabinet_count_contradicts')));
});
test('comparison clauses can describe different arrangements in one natural sentence', () => {
  const f = writer12Fixture({ comparison: true, secondCabinets: 3 });
  replace(f, 'Genesis uses two physical centre cabinets for one centre channel, while Alternative Design uses three centre cabinets for one logical centre channel.');
  replace(f, 'Cinema evenings begin here.', 'what_changes');
  assert.deepEqual(multi(f), []);
});
test('required explanation belongs to Summary or specification, not an unrelated section', () => {
  const f = replace(writer12Fixture(), 'Cinema evenings begin here.');
  replace(f, ARRANGEMENT, 'dynamic_range');
  assert(codes(validate(f)).includes('multi_cabinet_channel'));
  replace(f, 'The centre uses two physical cabinets. These share the same audio channel.');
  assert.deepEqual(multi(f), []);
});
test('new rejection codes retain generation review and issue safeguards', () => {
  for (const code of ['multi_cabinet_channel', 'validation_register']) {
    assert.equal(deriveGenerationStatus({ outputReceived: true, validation: { valid: false, violations: [{ code }] } }), 'needs_human_review');
  }
});
test('F. prompt 12 gives positive, evidence-scoped Dynamic Range guidance', () => {
  const f = writer12Fixture({ comparison: true }); const prompt = buildWriterPrompt({ input: f.input });
  assert.equal(WRITER_PROMPT_VERSION, 'proposal-writer-prompt-13');
  assert.equal(f.input.prompt_version, WRITER_PROMPT_VERSION);
  const dynamic = f.input.section_requirements.find(row => row.section === 'dynamic_range');
  const requirement = dynamic.requirement_single;
  assert(dynamic.requirement.includes('frozen dynamic-range evidence'));
  for (const phrase of ['headroom', 'dynamic peaks', 'confident', 'P14', 'P18', 'P19', 'P20']) assert(requirement.includes(phrase), phrase);
  assert(!/not a claim about|Do not claim bass response quality/i.test(requirement));
  assert(prompt.includes(f.input.multi_cabinet_channels.rule));
  replace(f, 'Demanding soundtracks have headroom for dynamic peaks, with a clear, confident presentation at the designed listening levels.', 'dynamic_range');
  f.output.sections.find(row => row.section === 'dynamic_range').claim_ids = f.input.allowed_claims.filter(c => ['p12', 'p13', 'p14'].includes(c.area)).map(c => c.claim_id);
  assert.equal(validate(f).valid, true, JSON.stringify(validate(f).violations));
});
test('F. internal validation register is rejected; practical seating qualifications remain', () => {
  for (const text of ['This is not a claim about bass response quality.', 'This parameter does not prove seat consistency.',
    'Validation evidence indicates excellent performance.', 'The design passed the regression test.', 'Internal scoring confirms the result.']) {
    assert(validationRegisterPhrase(text), text);
    assert(codes(validate(replace(writer12Fixture(), text, 'dynamic_range'))).includes('validation_register'), text);
  }
  assert.equal(validationRegisterPhrase(PRACTICAL), null);
});
test('G. unsupported bass consistency and reference-position scope remain rejected', () => {
  const f = writer12Fixture({ comparison: true, weakBass: true });
  // This block is assembled from frozen, weak P20 evidence, not added by the test.
  assert(f.input.bass.blocked.some(row => row.reason === 'no_solved_bass_consistency'));
  replace(f, 'Bass is consistent across all seats.', 'dynamic_range');
  assert(codes(validate(f)).includes('p20_bass_contradiction'), JSON.stringify(validate(f).violations));
  replace(f, 'The response at the reference position is consistent across all seats.', 'dynamic_range');
  assert.equal(validate(f).valid, false);
});
test('H. Presented Options stays validated, mapped and qualified for listening geometry', () => {
  const f = writer12Fixture({ alternatives: true, comparison: true }); const r = validateCompleteDocument(f);
  assert.equal(validate(f).valid, true, JSON.stringify(validate(f).violations));
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(r.options_text, PRACTICAL);
  assert(r.document_sections.find(s => s.section_type === 'presented_options').body.includes('listening positions'));
  assert(source('base44/shared/proposalWriter/writerContractSchema.js').includes('relevant room geometry are maintained'));
});
test('I. historical inputs gain no new rejection and existing records remain byte-identical', () => {
  const saved = JSON.parse(source('test/fixtures/marqueeLiveGeneration.json')); const before = JSON.stringify(saved);
  const baseline = validateWriterOutput({ input: saved.input, output: saved.output });
  assert(!codes(baseline).includes('multi_cabinet_channel'));
  assert(!codes(baseline).includes('validation_register'));
  assert.equal(JSON.stringify(saved), before);
  const f = writer12Fixture(); delete f.input.multi_cabinet_channels; delete f.input.editorial_rules.validation_register;
  replace(f, 'This is not a claim about bass quality.');
  assert(!codes(validate(f)).includes('multi_cabinet_channel'));
  assert(!codes(validate(f)).includes('validation_register'));
});
test('complete-document gate checks published bodies and blocks dropped mapping or hidden explanation', () => {
  const f = writer12Fixture(); const before = JSON.stringify(f);
  assert.equal(validateCompleteDocument(f).valid, true);
  assert.equal(JSON.stringify(f), before);
  f.sections.find(row => row.section_type === 'system_design_summary').is_enabled = false;
  const r = validateCompleteDocument(f);
  assert.equal(r.valid, false);
  assert(r.errors.some(v => v.code === 'multi_cabinet_channel'));
  assert.equal(authorizeProposalExport({ validation: r, proposal: f.proposal, request: {} }).allowed, false);
});
test('correct provider copy cannot approve a mapped body that drops the arrangement', () => {
  const f = writer12Fixture();
  f.sections.find(row => row.section_type === 'system_design_summary').body = '<p>Cinema evenings begin here.</p>';
  const r = validateCompleteDocument(f);
  assert.equal(r.valid, false);
  assert(r.errors.some(v => v.code === 'multi_cabinet_channel' && v.detail.startsWith('required_arrangement_not_described')));
});
test('published contradiction cannot be masked by a correct original writer response', () => {
  const f = writer12Fixture();
  f.sections.find(row => row.section_type === 'system_design_summary').body = '<p>The centre has three physical cabinets reproducing one centre channel.</p>';
  const r = validateCompleteDocument(f);
  assert(r.errors.some(v => v.code === 'unvalidated_document_text'));
  assert(r.errors.some(v => v.code === 'multi_cabinet_channel'));
});
test('backend schema, frontend mapping and Editor/PDF share the approved content contract', () => {
  const f = writer12Fixture(); assertWriterInputCarriesNoLiveState(f.input);
  assert.deepEqual(writerOutputJsonSchema().properties.sections.items.properties.section.enum,
    f.input.output.sections.map(row => row.section));
  const editor = source('src/pages/ProposalEditor.jsx');
  assert(editor.includes('document_validation?.document_sections'));
  assert(editor.includes('const readableSections = documentSections.filter'));
  assert(editor.match(/sections: documentSections/)); assert(editor.match(/sections=\{documentSections\}/));
  const front = source('src/components/proposal/proposalSections.js');
  const back = source('base44/shared/systemDesignSummarySections.js');
  assert(front.includes('presented_options')); assert(back.includes('presented_options'));
  const mapped = validateCompleteDocument(f).document_sections.find(row => row.section_type === 'system_design_summary').body;
  assert(mapped.includes(ARRANGEMENT));
});
test('validator provenance manifest hashes every edited and new rule module', () => {
  for (const [path, hash] of Object.entries(VALIDATOR_SOURCE_MANIFEST)) assert.equal(createHash('sha256').update(source(path)).digest('hex'), hash, path);
  for (const name of ['writerMultiCabinetRules', 'writerCabinetLanguage', 'writerValidationRegister']) assert(`base44/shared/proposalWriter/${name}.js` in VALIDATOR_SOURCE_MANIFEST);
});