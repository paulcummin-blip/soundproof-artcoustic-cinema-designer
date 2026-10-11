import { buildProposalEvidence } from '../../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../base44/shared/proposalWriter/writerInputBuilder.js';
import { composeWriterSectionBodies } from '../../base44/shared/proposalWriter/writerSectionMapping.js';
import { validateWriterOutput } from '../../base44/shared/proposalWriter/writerOutputValidator.js';
import { twoOptions } from './proposalEvidenceFixtures.mjs';
import { validDraft } from './proposalWriterFixtures.mjs';
export const PRIVATE_NOTE = 'Please present these two arrangements as comfort choices, not an equipment upgrade.';
export const OPTIONS_COPY = 'Lounge seating offers a relaxed way to settle in, while cinema recliners provide individual comfort. The final choice rests on personal preference within the same design.';
export function completeFixture({ alternatives = true, historical = false } = {}) {
  const pack = buildProposalEvidence({ versions: twoOptions(), generatedAt: '2026-10-11T12:00:00Z' });
  const guidance = alternatives ? { groups: [{ group: 'Seating style', options: ['Lounge seating', 'Cinema recliners'], note: PRIVATE_NOTE }] } : null;
  const input = buildWriterInput({ pack, optionGuidance: guidance });
  const output = validDraft(input);
  // Older generic fixtures repeat full claim sentences in several sections.
  // Retain the facts/citations but give each section its own unique prose, as
  // the approved duplication rule now requires. No production writing changes.
  const seen = new Set();
  output.sections.forEach((row, index) => {
    const sentences = row.text.split(/(?<=[.!?])\s+/).filter(sentence => {
      if (sentence.trim().split(/\s+/).length < 10) return true;
      if (seen.has(sentence)) return false;
      seen.add(sentence);
      return true;
    });
    row.text = sentences.join(' ') || `The accompanying report records this design area (${index + 1}).`;
  });
  output.sections.find(row => row.section === 'appendix_notes').text = 'See the accompanying Project Report for detailed source evidence.';
  output.sections.find(row => row.section === 'presented_options').text = alternatives ? OPTIONS_COPY : '';
  if (historical) {
    input.contract_version = 1;
    input.section_requirements = input.section_requirements.filter(row => row.section !== 'presented_options');
    output.contract_version = 1;
    output.sections = output.sections.filter(row => row.section !== 'presented_options');
    input.option_guidance = { groups: [] };
  }
  const generation = { generation_id: 'fixture-generation', generation_number: 1, proposal_id: 'fixture-proposal', project_id: 'project',
    created_at: '2026-10-11T12:00:00Z', status: 'valid_generated', record_fingerprint: 'fixture-record',
    evidence_pack: pack, evidence_pack_fingerprint: pack.pack_fingerprint, gpt_input: input, gpt_output: output,
    validation_result: historical ? { valid: true } : validateWriterOutput({ input, output }) };
  const sections = composeWriterSectionBodies({ output, mode: 'comparison' }).bodies.map((body, i) => ({ id: `fixture-section-${i}`, proposal_id: 'fixture-proposal',
    section_type: body.section_type, section_key: body.section_type, title: body.section_type,
    body: body.html, is_enabled: true, order_index: i, dealer_notes: '', metadata: {} }));
  if (!alternatives || historical) sections.push({ id: 'empty-options', section_type: 'presented_options', body: '', is_enabled: false, order_index: 9 });
  const proposal = { id: 'fixture-proposal', project_id: 'project', status: 'generated', proposal_type: 'comparison',
    selected_version_ids: ['a', 'b'], engineering_snapshot: { available: true, identity: { projectId: 'project', versionId: 'a' }, system: {} } };
  return { proposal, sections, generationRecords: [generation], editRecords: [], optionGuidance: guidance };
}