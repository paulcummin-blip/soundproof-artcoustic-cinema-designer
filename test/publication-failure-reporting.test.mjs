// test/publication-failure-reporting.test.mjs
//
// Focused regression tests for the publication failure-reporting defect and
// the stale-overwrite guard.
//
// DEFECT: the existing publication effect's catch path logged exceptions but
// could leave the attempt stranded in QUEUED/PUBLISHING when the effect was
// cancelled during the async bass-save or backend call. A stale terminal
// record (FAILED/CANCELLED) from a cancelled async path could also overwrite
// a newer attempt for a different fingerprint.
//
// FIX:
//   - recordPublicationAttemptGuarded: a stale terminal (old fingerprint)
//     cannot overwrite a newer attempt (any fingerprint). A less-informative
//     terminal (CANCELLED) cannot overwrite a more-informative one
//     (ACKNOWLEDGED/FAILED) for the same fingerprint.
//   - The publication effect records a terminal CANCELLED on every cancelled
//     early-return, and checks `cancelled` after the backend call so a stale
//     response is never processed.
//   - The attempt record carries a `publisherRegistered` flag so the
//     diagnostic surface can distinguish "publisher not registered" from
//     "preflight blocked".
//
// These tests exercise the store-level guard and the attempt lifecycle
// directly. The React effect is not invoked; the contract is tested by
// driving the store through the same functions the effect uses.
//
// Run: node --import ./test/_alias-register.mjs test/publication-failure-reporting.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  PUBLICATION_ATTEMPT,
  recordPublicationAttempt,
  recordPublicationAttemptGuarded,
  readPublicationAttempt,
  isPublicationAttemptTerminal,
} from "@/components/engineering/publicationAcknowledgementStore";

const PROJECT_ID = "pub-failure-test";
const VERSION_ID = "v1";

const FP_A = "eng:v1:aaaa";
const FP_B = "eng:v1:bbbb";

function reset() {
  // The store is module-level; overwrite with a fresh non-terminal record to
  // isolate each test. Using recordPublicationAttempt (unguarded) ensures the
  // reset itself is not blocked.
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_A,
    message: "reset",
  });
}

test("1. A caught publication exception records a terminal FAILED with its reason", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.PUBLISHING,
    fingerprint: FP_A,
  });
  // Simulate the catch block: record FAILED with the actual error message.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED,
    fingerprint: FP_A,
    message: "The engineering assessment could not be saved: bass verification failed.",
    httpStatus: 500,
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.FAILED);
  assert.match(attempt.message, /bass verification failed/);
  assert.equal(isPublicationAttemptTerminal(attempt.status), true);
});

test("2. A cancelled debounce records a terminal CANCELLED (not stranded in QUEUED)", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_A,
  });
  // Simulate the cleanup path (timer not yet fired): record CANCELLED.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.CANCELLED,
    fingerprint: FP_A,
    message: "Publication cancelled before sending.",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.CANCELLED);
  assert.equal(isPublicationAttemptTerminal(attempt.status), true);
});

test("3. A cancelled async path (bass save in flight) records terminal CANCELLED", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.PUBLISHING,
    fingerprint: FP_A,
  });
  // Simulate the `if (cancelled) return;` path inside the async work.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.CANCELLED,
    fingerprint: FP_A,
    message: "Publication cancelled during bass save.",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.CANCELLED);
  assert.match(attempt.message, /bass save/);
});

test("4. A stale FAILED (old fingerprint) CANNOT overwrite a newer QUEUED (new fingerprint)", () => {
  reset();
  // Newer effect run records QUEUED for fingerprint B.
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_B,
    message: "Waiting for assessment to settle.",
  });
  // Stale async catch fires later with the OLD fingerprint A.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED,
    fingerprint: FP_A,
    message: "stale error from old design",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.QUEUED,
    "stale FAILED must not overwrite the newer QUEUED");
  assert.equal(attempt.fingerprint, FP_B,
    "the current fingerprint must remain B");
});

test("5. A stale CANCELLED (old fingerprint) CANNOT overwrite a newer QUEUED (new fingerprint)", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_B,
  });
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.CANCELLED,
    fingerprint: FP_A,
    message: "stale cleanup from old design",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.QUEUED);
  assert.equal(attempt.fingerprint, FP_B);
});

test("6. A stale ACKNOWLEDGED (old fingerprint) CANNOT overwrite a newer QUEUED (new fingerprint)", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_B,
  });
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    fingerprint: FP_A,
    publishedAt: "2026-11-11T10:00:00Z",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.QUEUED,
    "a stale success must not overwrite the newer attempt");
  assert.equal(attempt.fingerprint, FP_B);
});

test("7. A genuine ACKNOWLEDGED (same fingerprint) overwrites a prior FAILED (same fingerprint)", () => {
  reset();
  // The first attempt fails.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED,
    fingerprint: FP_A,
    message: "first attempt failed",
  });
  assert.equal(readPublicationAttempt(PROJECT_ID, VERSION_ID).status, PUBLICATION_ATTEMPT.FAILED);
  // A retry succeeds with the same fingerprint.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    fingerprint: FP_A,
    publishedAt: "2026-11-11T11:00:00Z",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    "a genuine success must overwrite a prior failure for the same fingerprint");
});

test("8. A CANCELLED (same fingerprint) does NOT overwrite a prior ACKNOWLEDGED (same fingerprint)", () => {
  reset();
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    fingerprint: FP_A,
    publishedAt: "2026-11-11T11:00:00Z",
  });
  // A late cleanup fires CANCELLED for the same fingerprint.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.CANCELLED,
    fingerprint: FP_A,
    message: "late cleanup",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    "CANCELLED must not overwrite a prior ACKNOWLEDGED success");
});

test("9. A FAILED (same fingerprint) does NOT overwrite a prior ACKNOWLEDGED (same fingerprint)", () => {
  reset();
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    fingerprint: FP_A,
    publishedAt: "2026-11-11T11:00:00Z",
  });
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED,
    fingerprint: FP_A,
    message: "stale catch",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    "FAILED must not overwrite a prior ACKNOWLEDGED success");
});

test("10. A FAILED (same fingerprint) overwrites a prior CANCELLED (same fingerprint) — more informative", () => {
  reset();
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.CANCELLED,
    fingerprint: FP_A,
    message: "cleanup cancelled",
  });
  // The async catch fires later with the actual error — more informative.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED,
    fingerprint: FP_A,
    message: "actual error: bass write failed",
    httpStatus: 500,
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.FAILED,
    "FAILED is more informative than CANCELLED and may overwrite it");
  assert.match(attempt.message, /actual error/);
});

test("11. A new QUEUED (new fingerprint) overwrites an old ACKNOWLEDGED (old fingerprint) — design changed", () => {
  reset();
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    fingerprint: FP_A,
    publishedAt: "2026-11-11T11:00:00Z",
  });
  // Design changed → new fingerprint → new effect run records QUEUED.
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_B,
    message: "Waiting for assessment to settle.",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.QUEUED,
    "a new non-terminal record must overwrite the old terminal for a different fingerprint");
  assert.equal(attempt.fingerprint, FP_B);
});

test("12. publisherRegistered flag is preserved on the attempt record", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.NOT_READY,
    fingerprint: FP_A,
    message: "publisher not mounted",
    publisherRegistered: false,
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.publisherRegistered, false);
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_A,
    publisherRegistered: true,
  });
  const attempt2 = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt2.publisherRegistered, true);
});

test("13. A NOT_READY (preflight blocked) is non-terminal and can be overwritten by any later record", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.NOT_READY,
    fingerprint: FP_A,
    message: "preflight blocked",
  });
  assert.equal(isPublicationAttemptTerminal(PUBLICATION_ATTEMPT.NOT_READY), false);
  // A later QUEUED (same fingerprint) overwrites NOT_READY.
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED,
    fingerprint: FP_A,
  });
  assert.equal(readPublicationAttempt(PROJECT_ID, VERSION_ID).status, PUBLICATION_ATTEMPT.QUEUED);
});

test("14. Full lifecycle: QUEUED → PUBLISHING → ACKNOWLEDGED (publication success reaches terminal)", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED, fingerprint: FP_A, publisherRegistered: true,
  });
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.PUBLISHING, fingerprint: FP_A, publisherRegistered: true,
  });
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED, fingerprint: FP_A,
    publishedAt: "2026-11-11T12:00:00Z", httpStatus: 200, publisherRegistered: true,
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.ACKNOWLEDGED);
  assert.equal(isPublicationAttemptTerminal(attempt.status), true);
  assert.equal(attempt.publisherRegistered, true);
});

test("15. Full lifecycle: QUEUED → PUBLISHING → FAILED (backend refusal records terminal failure)", () => {
  reset();
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED, fingerprint: FP_A, publisherRegistered: true,
  });
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.PUBLISHING, fingerprint: FP_A,
  });
  // Backend returns 422 with a missing-sections acknowledgement.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED, fingerprint: FP_A,
    message: "The saved assessment is incomplete (RP22 P1 to P21 results).",
    missing: [{ key: "rp22_parameters", label: "RP22 P1 to P21 results" }],
    httpStatus: 422,
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.FAILED);
  assert.equal(isPublicationAttemptTerminal(attempt.status), true);
  assert.equal(attempt.httpStatus, 422);
  assert.match(attempt.message, /incomplete/);
});

test("16. A stale FAILED (old fingerprint) does NOT overwrite a newer ACKNOWLEDGED (new fingerprint)", () => {
  reset();
  // The real effect always records QUEUED then PUBLISHING (unguarded) for the
  // new fingerprint before recording a terminal. This establishes the new
  // fingerprint as the current attempt so the guarded terminal is not
  // mistaken for a stale cross-fingerprint record.
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.QUEUED, fingerprint: FP_B, publisherRegistered: true,
  });
  recordPublicationAttempt(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.PUBLISHING, fingerprint: FP_B,
  });
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.ACKNOWLEDGED, fingerprint: FP_B,
    publishedAt: "2026-11-11T12:00:00Z",
  });
  // Stale catch from the old run (FP_A) fires later — must not overwrite.
  recordPublicationAttemptGuarded(PROJECT_ID, VERSION_ID, {
    status: PUBLICATION_ATTEMPT.FAILED, fingerprint: FP_A,
    message: "stale error",
  });
  const attempt = readPublicationAttempt(PROJECT_ID, VERSION_ID);
  assert.equal(attempt.status, PUBLICATION_ATTEMPT.ACKNOWLEDGED,
    "a stale FAILED must not overwrite a newer ACKNOWLEDGED");
  assert.equal(attempt.fingerprint, FP_B);
});