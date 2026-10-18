// project-library-notice.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library save/export notification, in every state it
// can be shown in:
//
//   FULL SUCCESS      a quiet confirmation that dismisses itself after ~5 s
//   PREVIEW FAILED    a DEGRADED SUCCESS. The PDF is stored, so it is worded and
//                     toned that way (never as a failure), it stays until the
//                     designer dismisses it, and it offers support guidance.
//   STORAGE FAILURE   stays until dismissed, keeps the red failure tone
//
// Only true success auto-dismisses. Nothing under test stores, reads, retries or
// alters a document: these are the notification's own decisions.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  STORED_NOTICE_STATE,
  STORED_NOTICE_STAYS_MS,
  STORED_NOTICE_TONE,
  STORED_NOTICE_MS,
  resolveStoredNotice,
} from '../components/library/issuedDocument/libraryStoredNoticeAuthority.js';
import {
  STORAGE_NOTICE_CLASS,
  buildStorageNotice,
} from '../components/library/issuedDocument/exportStorageFailure.js';

const stored = (preview_status) => ({
  document_type: 'system_design_summary',
  filename: 'Sound Proof System Design Summary - Barton Solutions - Original Design.pdf',
  preview_status,
});

test('full success dismisses itself after about five seconds', () => {
  const notice = resolveStoredNotice(stored('available'));
  assert.equal(notice.state, STORED_NOTICE_STATE.STORED);
  assert.equal(notice.duration, STORED_NOTICE_MS);
  assert.equal(notice.duration, 5000);
  assert.equal(notice.title, 'Stored in Project Library');
  assert.equal(notice.support, false, 'a full success asks nothing of the designer');
});

test('only true success auto-dismisses', () => {
  for (const status of ['available', 'unavailable', 'partial', undefined, null]) {
    const notice = resolveStoredNotice(stored(status));
    assert.equal(
      Number.isFinite(notice.duration),
      notice.state === STORED_NOTICE_STATE.STORED,
      `status ${String(status)}`,
    );
  }
});

test('a preview failure is a degraded success: the PDF is stated as stored', () => {
  const notice = resolveStoredNotice(stored('unavailable'));
  assert.equal(notice.state, STORED_NOTICE_STATE.PREVIEW_INCOMPLETE);
  assert.equal(notice.duration, STORED_NOTICE_STAYS_MS);
  assert.equal(Number.isFinite(notice.duration), false, 'no auto-dismiss');
  assert.match(notice.previewSentence, /saved successfully/);
  assert.match(notice.previewSentence, /its page preview could not be created/);
  assert.equal(notice.support, true, 'support guidance is offered');
});

test('a partial preview is the same degraded success, worded for its own state', () => {
  const notice = resolveStoredNotice(stored('partial'));
  assert.equal(notice.state, STORED_NOTICE_STATE.PREVIEW_INCOMPLETE);
  assert.equal(Number.isFinite(notice.duration), false, 'no auto-dismiss');
  assert.match(notice.previewSentence, /saved successfully/);
  assert.match(notice.previewSentence, /some pages have no preview/);
});

test('a stored document is never toned as an error', () => {
  assert.match(STORAGE_NOTICE_CLASS, /destructive/, 'the failure tone is the red one');

  for (const state of Object.values(STORED_NOTICE_STATE)) {
    const tone = STORED_NOTICE_TONE[state];
    assert.equal(/destructive|red-/.test(tone), false, `${state} must not be red`);
    assert.notEqual(tone, STORAGE_NOTICE_CLASS, `${state} must not reuse the failure tone`);
  }

  assert.notEqual(
    STORED_NOTICE_TONE[STORED_NOTICE_STATE.STORED],
    STORED_NOTICE_TONE[STORED_NOTICE_STATE.PREVIEW_INCOMPLETE],
    'success and degraded success are visually distinct',
  );
});

test('a storage failure stays until it is dismissed', () => {
  const notice = buildStorageNotice({
    title: 'Project Library save failed',
    reason: 'The PDF could not be stored in Project Library.',
    duration: STORED_NOTICE_STAYS_MS,
  });

  assert.equal(notice.variant, 'destructive');
  assert.equal(notice.className, STORAGE_NOTICE_CLASS);
  assert.equal(notice.duration, STORED_NOTICE_STAYS_MS);
  assert.equal(Number.isFinite(notice.duration), false, 'no auto-dismiss');
});