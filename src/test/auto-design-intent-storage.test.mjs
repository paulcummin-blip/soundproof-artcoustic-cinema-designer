import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentStorage } from '../components/report/projectReport/autoDesignIntentStorage.js';

test('full storage retains running, failure reason and accepted completion in this session', () => {
  const saved = new Map([['status', 'idle'], ['reason', 'old failure']]);
  const storage = createIntentStorage(() => ({
    getItem: key => saved.get(key) || null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('QuotaExceededError'); },
  }));
  storage.set('status', 'running');
  storage.set('generation', 'snapshot-1');
  assert.equal(storage.get('status'), 'running');
  assert.equal(storage.get('generation'), 'snapshot-1');
  storage.set('status', 'failed');
  storage.set('reason', 'provider_failed');
  assert.equal(storage.get('status'), 'failed');
  assert.equal(storage.get('reason'), 'provider_failed');
  storage.set('status', 'complete');
  storage.set('reason', null);
  assert.equal(storage.get('status'), 'complete');
  assert.equal(storage.get('reason'), null);
});
test('blocked storage is recoverable without erasing unrelated saved data', () => {
  const storage = createIntentStorage(() => { throw new Error('SecurityError'); });
  assert.equal(storage.get('status'), null);
  storage.set('status', 'failed');
  assert.equal(storage.get('status'), 'failed');
});
test('normal storage persists transitions for a later page session', () => {
  const saved = new Map();
  const getStorage = () => ({
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key),
  });
  createIntentStorage(getStorage).set('status', 'complete');
  assert.equal(createIntentStorage(getStorage).get('status'), 'complete');
});
