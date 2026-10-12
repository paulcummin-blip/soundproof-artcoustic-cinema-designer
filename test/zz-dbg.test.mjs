import { test } from 'vitest';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { crossSectionDuplicates } from '../base44/shared/proposalWriter/writerSalesPolishRules.js';
import { evidenceFor } from './fixtures/proposalGenerationFixtures.mjs';
import { validDraft } from './fixtures/proposalWriterFixtures.mjs';

test('dbg', () => {
  const { pack } = evidenceFor();
  const input = buildWriterInput({ pack });
  const old = 'Where the brief supplies seating or layout options, present them in 2–3 natural sentences: say what each arrangement gives the room, that both work within the seating positions this design specifies, and that the final choice is one of comfort and personal preference. State that the predicted acoustic performance is unchanged provided the assessed listening positions and the relevant room geometry are maintained. Present the options as alternatives within ONE design, never as a performance difference, and claim no performance result. Where the brief supplies no option, return an empty string for this section.';
  const patched = JSON.parse(JSON.stringify(input));
  patched.prompt_version = 'proposal-writer-prompt-16';
  const row = patched.section_requirements.find((s) => s.section === 'presented_options');
  row.requirement_single = old;
  row.requirement = old;

  const codes = (res) => res.violations.map((v) => `${v.code}:${v.section}`);
  console.log('CURRENT  ', JSON.stringify(codes(validateWriterOutput({ input, output: validDraft(input) }))));
  console.log('OLD TEXT ', JSON.stringify(codes(validateWriterOutput({ input: patched, output: validDraft(patched) }))));
  console.log('DIRECT DUP', JSON.stringify(codes({ violations: crossSectionDuplicates(validDraft(input).sections) })));
  console.log('EDITORIAL RULES', JSON.stringify(input.editorial_rules));
});