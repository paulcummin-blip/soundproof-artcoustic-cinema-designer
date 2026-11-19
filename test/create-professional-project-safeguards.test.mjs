import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(new URL('../base44/functions/createProfessionalProject/entry.ts', import.meta.url));
const entry = readFileSync(entryPath, 'utf8');

test('imports the per-account creation lock and idempotency modules', () => {
  assert.match(entry, /from ['"]\.\.\/\.\.\/shared\/projectCreationLock\.js['"]/);
  assert.match(entry, /from ['"]\.\.\/\.\.\/shared\/projectCreationIdempotency\.js['"]/);
});

test('account lookup failure fails closed — returns ELIGIBILITY_CHECK_FAILED, no fall-through', () => {
  assert.match(entry, /catch \(acctErr\)[\s\S]*?ELIGIBILITY_CHECK_FAILED/);
  // No silent fall-through comment remains.
  assert.doesNotMatch(entry, /If we can't resolve the account, fall through/);
});

test('a missing account fails closed — no fall-through to capacity', () => {
  assert.match(entry, /if \(!account\)[\s\S]*?ELIGIBILITY_CHECK_FAILED/);
});

test('promotion lookup failure fails closed — returns ELIGIBILITY_CHECK_FAILED, no fall-through', () => {
  assert.match(entry, /catch \(promoErr\)[\s\S]*?ELIGIBILITY_CHECK_FAILED/);
  assert.doesNotMatch(entry, /If promotion check fails, fall through/);
});

test('per-account creation lock is acquired before any Project/Ledger write and released in finally', () => {
  assert.match(entry, /acquireCreationLock\(service, accountId/);
  assert.match(entry, /finally\s*\{[\s\S]*?releaseCreationLock\(service, accountId, lock\.token\)/);
});

test('a not-acquired lock returns CREATION_BUSY instead of proceeding', () => {
  assert.match(entry, /if \(!lock\.acquired\)[\s\S]*?CREATION_BUSY/);
});

test('request_id idempotency is wired: lookup, pending reserve, complete, discard', () => {
  assert.match(entry, /body\.request_id/);
  assert.match(entry, /findExistingReceipt/);
  assert.match(entry, /createPendingReceipt/);
  assert.match(entry, /completeReceipt/);
  assert.match(entry, /deleteReceipt/);
});

test('a completed receipt replays its stored response payload', () => {
  assert.match(entry, /existing\.status === 'COMPLETED' && existing\.response_payload/);
  assert.match(entry, /Response\.json\(existing\.response_payload/);
});

test('a pending receipt during an in-flight creation returns CREATION_BUSY (no second project)', () => {
  assert.match(entry, /PENDING[\s\S]*?CREATION_BUSY/);
});

test('the admin internal-project bypass is preserved and bypasses the lock', () => {
  assert.match(entry, /if \(isAdmin\)[\s\S]*?commercial_tier: 'INTERNAL'/);
});

test('one token per project: ledger delta stays -1 and idempotency_key is activation:projectId', () => {
  assert.match(entry, /transaction_type: 'PROJECT_ACTIVATION'/);
  assert.match(entry, /delta: -1/);
  assert.match(entry, /`activation:\$\{project\.id\}`/);
});

test('the existing ledger idempotency guard (findActivationEntry) is preserved', () => {
  assert.match(entry, /findActivationEntry\(service, project\.id\)/);
});

test('the promotional path still creates a PromotionUsage and no ledger entry', () => {
  assert.match(entry, /UNLIMITED_PRO_PROJECTS/);
  assert.match(entry, /PromotionUsage\.create/);
});