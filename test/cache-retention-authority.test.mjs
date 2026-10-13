/**
 * cache-retention-authority.test.mjs
 * ----------------------------------
 * The bounded retention that keeps a version's analysis cache row writable.
 *
 * A publish rewrites that row. When the row grew past the entity write limit the
 * publication write at the end of a publish failed AFTER the version pointer had
 * been written, leaving the version referencing a publication that was never
 * stored — an unsaved assessment with nothing to explain it.
 *
 * Protected here: the version's CURRENT completed result is always retained, every
 * result a SAVED report still reads is retained, everything pruned is reported,
 * and an already-bounded row is returned untouched (same object, no write).
 */

import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  COMPLETED_RESULT_RETENTION_RECENT,
  collectPublicationBassFingerprints,
  retainCompletedResults,
} from '../base44/shared/cacheRetentionAuthority.js';

const completed = (at) => ({ version: 24, job: { status: 'complete', completedAtMs: at } });

test('the current completed result is always retained', () => {
  const record = {
    current_fingerprint: 'cal:current',
    completed_by_fingerprint: {
      'cal:old-1': completed(1),
      'cal:old-2': completed(2),
      'cal:current': completed(3),
    },
  };
  const result = retainCompletedResults(record, { keepFingerprint: 'cal:current' });
  assert.deepEqual(Object.keys(result.completed), ['cal:current']);
  assert.deepEqual(result.pruned.sort(), ['cal:old-1', 'cal:old-2']);
  assert.equal(result.changed, true);
  assert.equal(COMPLETED_RESULT_RETENTION_RECENT, 0);
});

test('a completed result a saved report still reads is never pruned', () => {
  const record = {
    current_fingerprint: 'cal:current',
    completed_by_fingerprint: {
      'cal:report': completed(1),
      'cal:current': completed(2),
      'cal:other': completed(3),
    },
  };
  const result = retainCompletedResults(record, {
    keepFingerprint: 'cal:current',
    protectedFingerprints: ['cal:report', null, 'cal:absent'],
  });
  assert.deepEqual(Object.keys(result.completed).sort(), ['cal:current', 'cal:report']);
  assert.deepEqual(result.pruned, ['cal:other']);
});

test('nothing is dropped silently: every pruned fingerprint is reported', () => {
  const record = {
    current_fingerprint: 'cal:current',
    completed_by_fingerprint: {
      a: completed(1), b: completed(2), c: completed(3), 'cal:current': completed(4),
    },
  };
  const result = retainCompletedResults(record, { keepFingerprint: 'cal:current' });
  assert.deepEqual(result.pruned.sort(), ['a', 'b', 'c']);
  assert.equal(
    Object.keys(result.completed).length + result.pruned.length,
    Object.keys(record.completed_by_fingerprint).length,
  );
});

test('an already bounded row is returned untouched, so no write is made', () => {
  const record = {
    current_fingerprint: 'cal:current',
    completed_by_fingerprint: { 'cal:current': completed(1) },
  };
  const result = retainCompletedResults(record, { keepFingerprint: 'cal:current' });
  assert.equal(result.changed, false);
  assert.deepEqual(result.pruned, []);
  assert.equal(result.completed, record.completed_by_fingerprint);
});

test('a record with no completed results at all is handled without a write', () => {
  assert.deepEqual(retainCompletedResults(null, { keepFingerprint: 'cal:current' }), {
    completed: {}, pruned: [], changed: false,
  });
  assert.deepEqual(retainCompletedResults({}, { keepFingerprint: 'cal:current' }), {
    completed: {}, pruned: [], changed: false,
  });
});

test('a version with no recorded current result keeps the newest, never an empty map', () => {
  const record = {
    completed_by_fingerprint: { 'cal:old': completed(1), 'cal:newer': completed(2) },
  };
  const result = retainCompletedResults(record, { keepFingerprint: null });
  assert.equal(result.changed, true);
  assert.deepEqual(Object.keys(result.completed), ['cal:newer']);
  assert.deepEqual(result.pruned, ['cal:old']);
});

test('a row whose current fingerprint is not among its results is never emptied', () => {
  const record = {
    current_fingerprint: 'cal:not-calculated-yet',
    completed_by_fingerprint: { a: completed(1), b: completed(2), c: completed(3) },
  };
  const result = retainCompletedResults(record, { keepFingerprint: 'cal:not-calculated-yet' });
  assert.equal(Object.keys(result.completed).length, 1);
  assert.deepEqual(Object.keys(result.completed), ['c']);
});

test('the bass contract every stored publication is backed by is protected', () => {
  const record = {
    current_fingerprint: 'cal:current',
    engineering_publications: {
      'eng:a': { provenance: { bass_fingerprint: 'cal:published' } },
      'eng:b': { provenance: { bass_fingerprint: 'cal:published' } },
      'eng:c': { provenance: {} },
    },
    completed_by_fingerprint: {
      'cal:current': completed(1),
      'cal:published': completed(2),
      'cal:unreferenced': completed(3),
    },
  };
  const protectedFingerprints = collectPublicationBassFingerprints(record);
  assert.deepEqual(protectedFingerprints, ['cal:published']);
  const result = retainCompletedResults(record, {
    keepFingerprint: 'cal:current',
    protectedFingerprints,
  });
  assert.deepEqual(Object.keys(result.completed).sort(), ['cal:current', 'cal:published']);
  assert.deepEqual(result.pruned, ['cal:unreferenced']);
});