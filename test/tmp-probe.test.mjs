import { test } from 'vitest';
import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { composeWriterSectionBodies } from '../base44/shared/proposalWriter/writerSectionMapping.js';

const CENTRE = 'At the front, the left and right channels use Q6-3; the centre channel uses two C4-1 cabinets working together as one audio channel.';
const WHY = 'As voices and effects move between the screen, surround and overhead channels, their tonal character remains consistent across all eight assessed seating positions.';

test('probe-writer', () => {
  const f = writer12Fixture();
  const row = (id) => f.output.sections.find((e) => e.section === id);
  const claims = f.input.allowed_claims.filter((c) => ['shared_result', 'credibility'].includes(c.kind)).map((c) => c.claim_id);
  row('what_stays_same').text = CENTRE;
  row('what_changes').text = WHY;
  row('what_changes').claim_ids = claims;
  f.sections = composeWriterSectionBodies({ output: f.output, mode: f.pack.mode }).bodies
    .map((b, i) => ({ id: `s${i}`, section_type: b.section_type, title: b.section_type, body: b.html, is_enabled: true, order_index: i }));

  const v = validateWriterOutput({ input: f.input, output: f.output });
  console.log(JSON.stringify({
    valid: v.valid,
    violations: v.violations.map((x) => ({ code: x.code, section: x.section, detail: x.detail })),
    claimKinds: [...new Set(f.input.allowed_claims.map((c) => c.kind))],
    claimsForChanges: claims,
    allowedClaims: f.input.allowed_claims.map((c) => ({ id: c.claim_id, kind: c.kind, area: c.area })),
  }, null, 2));
});

test('probe-hook-import', async () => {
  globalThis.window = {
    location: { href: 'http://localhost/ProposalEditor', search: '', pathname: '/ProposalEditor' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  };
  globalThis.localStorage = globalThis.window.localStorage;
  globalThis.document = { body: { classList: { add: () => {}, remove: () => {} } }, createElement: () => ({ style: {} }), addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null };
  globalThis.navigator = { userAgent: 'node' };
  try {
    const mod = await import('../src/components/proposal/export/useProposalExport.js');
    console.log('IMPORTED', Object.keys(mod));
    console.log('PREVIEW', JSON.stringify(mod.resolveProposalExportReadiness({
      proposal: { id: 'p' }, sections: [{ is_enabled: true, body: '<p>x</p>' }], issueBlockReason: 'review me', mode: 'preview',
    })));
    console.log('EXPORT', JSON.stringify(mod.resolveProposalExportReadiness({
      proposal: { id: 'p' }, sections: [{ is_enabled: true, body: '<p>x</p>' }], issueBlockReason: 'review me', mode: 'export',
    })));
  } catch (error) {
    console.log('IMPORT_FAILED', String(error && error.message));
  }
});