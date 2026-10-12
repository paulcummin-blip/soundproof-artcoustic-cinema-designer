import { buildProposalEvidence } from '../../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../../base44/shared/proposalWriter/writerOutputValidator.js';
import { composeWriterSectionBodies } from '../../base44/shared/proposalWriter/writerSectionMapping.js';
import { option } from './proposalEvidenceFixtures.mjs';
export const ARRANGEMENT = 'The centre uses two physical C4-1 cabinets to reproduce one logical centre channel.';
export const PRACTICAL = 'Lounge seating offers relaxed comfort, while cinema recliners provide individual support, cupholders and a dedicated seat for every viewer.';
export function writer12Fixture({ cabinets = 2, comparison = false, alternatives = false, model = 'C4-1', secondCabinets = 1, weakBass = false } = {}) {
  const versions = [option('a', { savedName: 'Genesis' })];
  if (comparison) versions.push(option('b', { savedName: 'Alternative Design' }));
  for (const [index, version] of versions.entries()) {
    if (weakBass) {
      const p20 = version.snapshot.report_parameters.find(row => row.parameter_id === 20);
      Object.assign(p20, { level: 'L1', value: '+/-16 dB', text: 'L1 · +/-16 dB' });
    }
    const qty = index ? secondCabinets : cabinets;
    version.snapshot.system.product_roles = [
      { role: 'front_left_right', model_label: 'Q6-3', model_statement: 'Q6-3', cabinet_count: 2, channel_count: 2 },
      { role: 'centre', model_label: model, model_statement: `${qty} × ${model}`, cabinet_count: qty, channel_count: 1, structure: qty > 1 ? 'dual-centre' : 'single' },
    ];
    version.snapshot.system.products_selected.lcr = ['Q6-3 x 2', `${model} x ${qty}`];
    version.snapshot.system.products_selected.rows[0].value = `Q6-3 x 2; ${model} x ${qty}`;
  }
  const pack = buildProposalEvidence({ versions, generatedAt: '2026-10-11T12:00:00Z' });
  const guidance = alternatives ? { groups: [{ group: 'Seating style', options: ['Lounge', 'Recliners'], note: 'Present the alternatives as comfort choices while preserving listening positions.' }] } : null;
  const input = buildWriterInput({ pack, optionGuidance: guidance });
  const output = { contract_version: input.contract_version, pack_fingerprint: pack.pack_fingerprint,
    sections: input.section_requirements.map(spec => ({ section: spec.section,
      text: spec.section === 'presented_options' ? (alternatives ? PRACTICAL : '') : 'Cinema evenings begin here.',
      claim_ids: spec.section === 'presented_options' && alternatives ? input.allowed_claims.filter(claim => ['credibility', 'shared_result'].includes(claim.kind)).map(claim => claim.claim_id) : [] })) };
  if (cabinets > 1) output.sections.find(row => row.section === 'what_stays_same').text = `${comparison ? 'Genesis: ' : ''}${ARRANGEMENT.replace('two', cabinets === 2 ? 'two' : String(cabinets)).replace('C4-1', model)}`;
  if (comparison && secondCabinets > 1) output.sections.find(row => row.section === 'what_changes').text = `Alternative Design: The centre uses ${secondCabinets} physical ${model} cabinets to reproduce one logical centre channel.`;
  const generation = { generation_id: 'writer12-fixture', generation_number: 1, proposal_id: 'fixture-proposal', project_id: 'project',
    created_at: '2026-10-11T12:00:00Z', status: 'valid_generated', record_fingerprint: 'fixture-record',
    evidence_pack: pack, evidence_pack_fingerprint: pack.pack_fingerprint, gpt_input: input, gpt_output: output,
    validation_result: validateWriterOutput({ input, output }) };
  const proposal = { id: 'fixture-proposal', project_id: 'project', status: 'generated', proposal_type: comparison ? 'comparison' : 'single',
    selected_version_ids: pack.options.map(row => row.version_id), engineering_snapshot: { available: true, identity: { projectId: 'project', versionId: 'a' } } };
  const sections = composeWriterSectionBodies({ output, mode: pack.mode }).bodies.map((body, i) => ({ id: `section-${i}`, section_type: body.section_type, title: body.section_type, body: body.html, is_enabled: true, order_index: i }));
  return { input, output, pack, proposal, sections, generationRecords: [generation], editRecords: [], optionGuidance: guidance };
}
export default writer12Fixture;