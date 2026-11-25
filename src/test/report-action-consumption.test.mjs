import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readReportActionIntent, withoutReportActionIntent, useConsumedReportActionIntent, useReportActionIntent } from '../components/report/reportActionIntent.js';

test('creation survives URL cleanup only for this visit; remount and refresh cannot replay; explicit new remains possible', async () => {
  let url = new URLSearchParams('projectId=p&versionId=v&autoStore=1&updateReport=1&regenerateIntent=1&ctxRev=context');
  let calls = 0, replaceOptions, view, forceRender;
  const setParams = (next, options) => { url = next; replaceOptions = options; forceRender(value => value + 1); };
  const Probe = () => {
    const [, bump] = React.useState(0); forceRender = bump;
    const { intent, consumed } = useConsumedReportActionIntent(url, setParams);
    useReportActionIntent({ requested: consumed && intent.autoStore, ready: true, onRun: () => { calls++; } });
    return null;
  };
  await act(async () => { view = TestRenderer.create(React.createElement(Probe)); });
  assert.equal(calls, 1);
  assert.deepEqual(replaceOptions, { replace: true });
  assert.equal(url.toString(), 'projectId=p&versionId=v&ctxRev=context');
  await act(async () => { forceRender(value => value + 1); });
  assert.equal(calls, 1, 'cache/render changes do not repeat the action');
  await act(async () => { view.unmount(); });
  await act(async () => { view = TestRenderer.create(React.createElement(Probe)); });
  assert.equal(calls, 1, 'reopened clean history entry is read-only');
  await act(async () => { view.unmount(); });
  url.set('autoStore', '1');
  await act(async () => { view = TestRenderer.create(React.createElement(Probe)); });
  assert.equal(calls, 2, 'a new explicit navigation can create again');
  await act(async () => { view.unmount(); });
});

test('consumption never removes project/version or context and never reports completion', () => {
  const url = new URLSearchParams('projectId=p&version_id=v&autoPrint=1&autoStore=1&updateReport=1&regenerateIntent=1&ctxRev=x');
  assert.equal(readReportActionIntent(url).updateReport, true);
  const clean = withoutReportActionIntent(url);
  assert.equal(clean.get('version_id'), 'v');
  assert.equal(clean.get('ctxRev'), 'x');
  assert.deepEqual(readReportActionIntent(clean), { exportPdf: false, updateReport: false, autoStore: false, regenerateIntent: false });
  assert.equal(url.get('autoStore'), '1', 'input is not mutated');
});
