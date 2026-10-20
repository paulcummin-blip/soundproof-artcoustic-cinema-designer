import { test } from 'vitest';
import fs from 'node:fs';
import { buildAdiEditorialPrompt, adiSectionContract } from '../base44/shared/adiEditorial/adiEditorialPrompt.js';

test('prompt', () => {
  const body = fs.readFileSync('/tmp/adi_body.html', 'utf8');
  const sectionContract = adiSectionContract({ sectionType: 'system_design_summary', sectionLabel: 'System Design Summary', mode: 'single', original: body });
  const prompt = buildAdiEditorialPrompt({
    sectionContract, sectionLabel: 'System Design Summary', mode: 'section', currentText: body,
    evidenceIdentity: { source: 'the version\u2019s frozen system authority', report_or_report_type: 'system_summary' },
    documentIdentity: { document: 'Cinemation' },
  });
  fs.writeFileSync('/tmp/adi_prompt.txt', prompt);
});