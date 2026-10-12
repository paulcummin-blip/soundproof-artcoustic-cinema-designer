import { test } from 'vitest';
import { editWorld } from './fixtures/proposalEditFixtures.mjs';
import { evidenceFor, attempt } from './fixtures/proposalGenerationFixtures.mjs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';

test('probe-editor-world', () => {
  const world = editWorld();
  console.log('STATUS', world.generation.status);
  console.log('HAS_OUTPUT', Boolean(world.generation.gpt_output));
  console.log('ERRORS', JSON.stringify(world.generation.validation_errors, null, 2));

  const { pack, input } = evidenceFor();
  const direct = attempt({ pack });
  console.log('DIRECT_STATUS', direct.status);
  console.log('DIRECT_ERRORS', JSON.stringify(direct.validation_errors, null, 2));

  if (direct.gpt_output) {
    const v = validateWriterOutput({ input, output: direct.gpt_output });
    console.log('WRITER_VALID', v.valid);
    console.log('WRITER_VIOLATIONS', JSON.stringify(v.violations, null, 2));
  }
  const history = createGenerationHistory();
  console.log('APPENDED_STATUS', history.append(attempt({ pack })).status);
});