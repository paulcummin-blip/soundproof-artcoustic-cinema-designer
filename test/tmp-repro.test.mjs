import { test } from 'vitest';
import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import { multiCabinetChannelViolations } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { preparePublishedSectionBody, plainTextOf } from '../base44/shared/proposalEdit/publishedSectionPreparation.js';
import { composeWriterSectionBodies } from '../base44/shared/proposalWriter/writerSectionMapping.js';

const LIVE_OVERVIEW = 'This cinema is built around a 115" TV and a 9.1.6 loudspeaker system, with six overhead speakers and four subwoofers to place effects around and above the audience. At the front, the left and right channels use Q6-3; the centre channel uses two C4-1 cabinets working together as one audio channel.';
const LIVE_WHY = 'As voices and effects move between the screen, surround and overhead channels, their tonal character remains consistent across all eight assessed seating positions.';
const LIVE_SUMMARY_HTML = `<h2>Design Summary</h2><p>Voices and effects retain their tonal character as sound travels from the screen to the surround and overhead channels, keeping changes in direction natural to follow. The 115" TV and 9.1.6 layout bring that sound into a cinema with two seating rows, while four subwoofers provide the specified low-frequency authority.</p><h2>Design Overview</h2><p>${LIVE_OVERVIEW}</p><h2>Why This Specification</h2><p>${LIVE_WHY}</p>`;

test('repro2', () => {
  const f = writer12Fixture();
  const at = (id) => f.output.sections.find((row) => row.section === id);
  at('what_stays_same').text = LIVE_OVERVIEW;
  at('what_changes').text = LIVE_WHY;
  const mode = f.pack.mode;
  f.sections = composeWriterSectionBodies({ output: f.output, mode }).bodies
    .map((body, i) => ({ id: `section-${i}`, section_type: body.section_type, title: body.section_type, body: body.html, is_enabled: true, order_index: i }));

  const publishedRow = {
    section: 'system_design_summary',
    text: plainTextOf(preparePublishedSectionBody(LIVE_SUMMARY_HTML, {
      title: 'System Design Summary', sectionType: 'system_design_summary', proposalType: 'system_summary',
    })),
  };
  const writer = validateWriterOutput({ input: f.input, output: f.output });
  const complete = validateCompleteDocument(f);

  console.log(JSON.stringify({
    writerSections: multiCabinetChannelViolations({ input: f.input, sections: f.output.sections }).map((v) => v.detail),
    mergedPublication: multiCabinetChannelViolations({ input: f.input, sections: [publishedRow] }).map((v) => v.detail),
    writerValid: writer.valid,
    writerViolations: writer.violations.map((v) => `${v.code}:${v.detail}`),
    completeValid: complete.valid,
    completeErrors: complete.errors.map((e) => `${e.code}:${e.detail}`),
    blocked: complete.blocked_reason,
  }, null, 2));
});