//
// Bass authority auto-publication — the automatic save step.
//
// Product rule: a completed bass result saves itself. After "Calculate Bass
// Performance" completes there is no "Ready to save" state and no "Save
// Assessment" button; the band reports Saving while the result is stored and
// published, then Performance Current.
//
// Covered here, against the REAL modules (the hook, the one publication
// registration seam and the state vocabulary):
//   1. a saved-but-unpublished result requests the ONE publication path, once;
//   2. a further render does not ask again, but a new result does;
//   3. a current result asks for nothing;
//   4. a failed save is never retried silently — only the designer's explicit
//      retry reaches the publisher;
//   5. the publisher is reached even when it registers after the band mounted;
//   6. another version's publisher is never used.
import { register } from 'node:module';
register('../../test/_alias-loader.mjs', import.meta.url);
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const useBassAuthorityAutoPublication = (
  await import('../components/room/bass/bda/useBassAuthorityAutoPublication.js')
).default;
const {
  registerEngineeringPublishTrigger,
} = await import('../components/engineering/engineeringPublishTrigger.js');
const {
  BASS_AUTHORITY_STATE,
} = await import('../components/room/bass/bassAuthorityState.js');

const PROJECT = 'project:auto';
const VERSION = 'version:auto';
const OTHER_VERSION = 'version:other';

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function publisher() {
  let calls = 0;
  const publish = () => { calls += 1; };
  const unregister = registerEngineeringPublishTrigger(PROJECT, VERSION, publish);
  cleanups.push(unregister);
  return () => calls;
}

function mount(props) {
  const api = { current: null };
  const Harness = ({ value }) => {
    api.current = useBassAuthorityAutoPublication(value);
    return null;
  };
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Harness, { value: props })); });
  cleanups.push(() => act(() => renderer.unmount()));
  return {
    api,
    update: (next) => act(() => { renderer.update(React.createElement(Harness, { value: next })); }),
  };
}

const saved = {
  projectId: PROJECT,
  versionId: VERSION,
  stateCode: BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED,
  resultFingerprint: 'cal:a',
};

test('TEST 1 — a saved-but-unpublished result publishes itself, once', () => {
  const count = publisher();
  mount(saved);
  assert.equal(count(), 1, 'the completed result asked for publication by itself');
});

test('TEST 2 — a further render does not ask again, a new result does', () => {
  const count = publisher();
  const handle = mount(saved);
  assert.equal(count(), 1);
  handle.update({ ...saved });
  handle.update({ ...saved });
  assert.equal(count(), 1, 'one request per saved result');
  handle.update({ ...saved, resultFingerprint: 'cal:b' });
  assert.equal(count(), 2, 'a new result is a new save');
});

test('TEST 3 — a current result asks for nothing', () => {
  const count = publisher();
  mount({ ...saved, stateCode: BASS_AUTHORITY_STATE.CURRENT });
  assert.equal(count(), 0);
});

test('TEST 4 — a failed save is never retried silently', () => {
  const count = publisher();
  const handle = mount({ ...saved, stateCode: BASS_AUTHORITY_STATE.SAVE_FAILED });
  assert.equal(count(), 0, 'the failure is reported, not spun in a silent loop');
  act(() => handle.api.current.retrySave());
  assert.equal(count(), 1, "the designer's Retry save reaches the same one publication path");
});

test('TEST 5 — a publisher that registers later is still reached', () => {
  const handle = mount(saved);
  let calls = 0;
  cleanups.push(registerEngineeringPublishTrigger(PROJECT, VERSION, () => { calls += 1; }));
  assert.equal(calls, 1, 'the request is not spent before a publisher exists');
  handle.update({ ...saved });
  assert.equal(calls, 1);
});

test('TEST 6 — another version is never published for this one', () => {
  let calls = 0;
  cleanups.push(registerEngineeringPublishTrigger(PROJECT, OTHER_VERSION, () => { calls += 1; }));
  mount(saved);
  assert.equal(calls, 0);
});