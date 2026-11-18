import test from 'node:test';
import assert from 'node:assert/strict';
import { ISSUED_DOCUMENT_COMPOSITION as compositions } from '../components/library/issuedDocument/issuedDocumentTypes.js';

test('the stored consolidated report includes every technical page family alongside its visual pages', () => {
  const selected = new Set(compositions.project.pageSelector.split(', ').map(s => s.trim()));
  assert.ok(selected.has('.client-report-page'));
  for (const page of compositions.technical.pageSelector.split(', ')) {
    assert.ok(selected.has(page), 'stored PDF must include ' + page);
  }
  assert.equal(compositions.project.nodeSelector, '.client-report-root');
  assert.equal(compositions.visual.pageSelector, '.client-report-page', 'legacy visual documents retain their own composition');
});
