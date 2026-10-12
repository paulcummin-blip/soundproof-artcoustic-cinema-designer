import { test } from 'vitest';
import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import { GENESIS_CENTRE_SENTENCE } from './fixtures/genesisProposalFixture.mjs';
import { multiCabinetChannelViolations } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { cabinetCounts, logicalChannelCounts, namesCabinetPosition } from '../base44/shared/proposalWriter/writerCabinetLanguage.js';

const SURROUND = 'Voices and effects also keep a consistent tonal character as they cross between screen, surround and overhead channels, across all 8 assessed seating positions.';

test('repro', () => {
  const f = writer12Fixture();
  const requirement = f.input.multi_cabinet_channels.required[0];
  const combined = `${GENESIS_CENTRE_SENTENCE} ${SURROUND}`;
  console.log(JSON.stringify({
    requirement,
    sentenceOnly: {
      names: namesCabinetPosition(GENESIS_CENTRE_SENTENCE, requirement),
      cabinets: cabinetCounts(GENESIS_CENTRE_SENTENCE, requirement),
      channels: logicalChannelCounts(GENESIS_CENTRE_SENTENCE, requirement),
    },
    combined: {
      names: namesCabinetPosition(combined, requirement),
      cabinets: cabinetCounts(combined, requirement),
      channels: logicalChannelCounts(combined, requirement),
    },
  }, null, 2));

  const section = f.output.sections.find((row) => row.section === 'what_stays_same');
  section.text = combined;
  console.log('VIOLATIONS:', JSON.stringify(multiCabinetChannelViolations({ input: f.input, sections: f.output.sections })));
  console.log('VALIDATION:', JSON.stringify(validateWriterOutput({ input: f.input, output: f.output }).violations));
});