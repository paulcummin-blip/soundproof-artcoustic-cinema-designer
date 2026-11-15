// conflicting-bass-record-check.test.mjs
// ---------------------------------------------------------------------------
// Isolated tests for the conflicting bass-record detection used by the
// report save-authority gate.
//
//   1. Two cache rows with the same fingerprint but conflicting completed
//      contracts are rejected as a conflict.
//   2. Historical cache rows with a different fingerprint are preserved and
//      do not block the current publication.

import test from "node:test";
import assert from "node:assert/strict";
import { detectConflictingBassRecords } from "../src/components/report/conflictingBassRecordCheck.js";

test('two rows with same fingerprint but conflicting contracts are rejected', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-B' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, true);
  assert.equal(result.noCurrent, false);
  assert.equal(result.matchingCount, 2);
});

test('a row missing the completed contract entry is a conflict', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: {},
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, true);
});

test('historical rows with a different fingerprint are preserved and do not block', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
    {
      current_fingerprint: 'fp-old',
      status: 'complete',
      completed_by_fingerprint: { 'fp-old': { job: { resultFingerprint: 'fp-old' } } },
    },
    {
      current_fingerprint: 'fp-older',
      status: 'complete',
      completed_by_fingerprint: { 'fp-older': { job: { resultFingerprint: 'fp-older' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, false);
  assert.equal(result.noCurrent, false);
  assert.equal(result.matchingCount, 1);
});

test('two rows with same fingerprint and same contract are not a conflict', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, false);
  assert.equal(result.matchingCount, 2);
});

test('no matching rows signals noCurrent', () => {
  const caches = [
    {
      current_fingerprint: 'fp-old',
      status: 'complete',
      completed_by_fingerprint: { 'fp-old': { job: { resultFingerprint: 'fp-old' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, false);
  assert.equal(result.noCurrent, true);
});

test('a single matching row is never a conflict', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, false);
  assert.equal(result.noCurrent, false);
  assert.equal(result.matchingCount, 1);
});

test('rows with status other than complete are ignored', () => {
  const caches = [
    {
      current_fingerprint: 'fp-A',
      status: 'updating',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-B' } } },
    },
    {
      current_fingerprint: 'fp-A',
      status: 'complete',
      completed_by_fingerprint: { 'fp-A': { job: { resultFingerprint: 'fp-A' } } },
    },
  ];
  const result = detectConflictingBassRecords(caches, 'fp-A');
  assert.equal(result.conflict, false);
  assert.equal(result.matchingCount, 1);
});