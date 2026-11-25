import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { buildProjectReportTitle } from '../components/report/reportPdfTitle.js';
const require = createRequire(import.meta.url);

test('saved incomplete report offers recovery; retry saves once despite full storage; reopen reuses it', async () => {
  let snapshot = { id: 'saved-report', generated_at: 'generation-1', payload: {}, source_fingerprints: {} };
  let calls = 0, snapshotReads = 0;
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} },
    dispatchEvent: () => {},
  };
  globalThis.__intentRecoveryApi = {
    entities: { ReportSnapshot: { filter: async () => { snapshotReads++; return { items: [snapshot] }; } } },
    functions: { invoke: async () => {
      calls++;
      snapshot = { ...snapshot, payload: { design_intent: { status: 'accepted' } } };
      return { data: { ok: true } };
    } },
  };
  let source = await fs.readFile(new URL('../components/report/projectReport/useAutoDesignIntent.js', import.meta.url), 'utf8');
  source = source.replace("from 'react'", "from " + JSON.stringify(pathToFileURL(require.resolve('react')).href));
  source = source.replace("import { base44 } from '@/api/base44Client';", 'const base44 = globalThis.__intentRecoveryApi;');
  source = source.replace("import {reportClientFailure} from '@/components/systemHealth/clientExperienceMonitor';", 'const reportClientFailure = () => {};');
  for (const name of ['autoDesignIntentStorage', 'autoDesignIntentGate', 'reportNarrativeCurrent']) {
    source = source.replace("from './" + name + "'", "from " + JSON.stringify(new URL('../components/report/projectReport/' + name + '.js', import.meta.url).href));
  }
  const { default: useIntent } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let latest;
  const Probe = () => { latest = useIntent({ projectId: 'cable-test', versionId: 'original', enabled: false, onBeforeGenerate: () => Promise.resolve(true) }); return null; };
  let view;
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(Probe)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    assert.equal(latest.status, 'failed');
    assert.match(latest.reason, /missing a completed project summary/);
    assert.equal(calls, 0, 'opening a saved report must not write');
    await act(async () => { await latest.retry(); });
    assert.equal(latest.status, 'complete');
    assert.equal(calls, 1);
    await act(async () => { await latest.retry(); });
    assert.equal(calls, 1, 'retry reads a completed snapshot rather than duplicating generation');
    await act(async () => { view.unmount(); view = TestRenderer.create(React.createElement(Probe)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    assert.equal(latest.status, 'complete');
    assert.equal(calls, 1);
    const settledReads = snapshotReads;
    for (let index = 0; index < 3; index++) {
      await act(async () => { view.update(React.createElement(Probe, { tick: index })); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    }
    assert.equal(snapshotReads, settledReads, 'settled narrative is not reread on each readiness-clock render');
  } finally {
    await act(async () => { view?.unmount(); });
    delete globalThis.__intentRecoveryApi;
    delete globalThis.window;
  }
});
test('Cable Smart export uses the agreed Technical Report filename', () => {
  assert.equal(buildProjectReportTitle('Cable Smart', { name: 'Original Design' }, {
    clientName: 'Doran', projectReference: 'Cinema Room',
  }), 'Sound Proof Technical Report - Cable Smart - Doran - Cinema Room - Original Design');
});
