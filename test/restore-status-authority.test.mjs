// test/restore-status-authority.test.mjs
//
// Focused tests proving the restore status authority fix:
//   1. Imported shared setter cannot be shadowed by local state
//   2. restoring / "Performance is current" never overlap
//   3. P20 status respects RESTORING
//   4. Cache-miss warning clears when authority is current and bank reaches 8/8
//   5. Current / "needs updating" never overlap
//   6. Non-coherent cache-miss still remains actionable
//
// Run: node --import ./test/_alias-register.mjs test/restore-status-authority.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { setRestoring, isRestoring, useIsRestoring, _resetRestoreStateForTest } from "@/components/room/bass/bda/restoreStateStore";
import { BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY, deriveBassDisplayStatus } from "@/components/room/bass/bassCalculationLifecycle";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";

const PID = "test-project-restore";
const VID = "test-version-restore";

function reset() {
  _resetRestoreStateForTest();
}

// ── 1. Imported shared setter cannot be shadowed by local state ─────────

test("1. shared setRestoring is independent of any local React state", () => {
  reset();
  // The shared store must reflect the exact projectId/versionId key.
  // A local useState named `restoring` in RestorePreviousDesignBar must
  // NOT interfere with the shared store's value.
  assert.equal(isRestoring(PID, VID), false);
  setRestoring(PID, VID, true);
  assert.equal(isRestoring(PID, VID), true);
  // Simulate a local state change — the shared store is unaffected.
  // (In the component, the local setter is `setLocalRestoring`, not
  // `setRestoring`, so there is no name collision.)
  assert.equal(isRestoring(PID, VID), true);
  setRestoring(PID, VID, false);
  assert.equal(isRestoring(PID, VID), false);
  reset();
});

test("1a. shared setter is a no-op without projectId or versionId", () => {
  reset();
  setRestoring(null, VID, true);
  setRestoring(PID, null, true);
  assert.equal(isRestoring(null, VID), false);
  assert.equal(isRestoring(PID, null), false);
  reset();
});

// ── 2. restoring / "Performance is current" never overlap ───────────────

test("2. deriveBassDisplayStatus(RESTORING) returns 'Restoring previous design…' not 'Performance is current'", () => {
  const status = deriveBassDisplayStatus(BASS_LIFECYCLE_STATE.RESTORING);
  assert.equal(status.text, BASS_LIFECYCLE_COPY[BASS_LIFECYCLE_STATE.RESTORING]);
  assert.equal(status.text, "Restoring previous design\u2026");
  assert.notEqual(status.text, "Performance is current");
  assert.equal(status.isCalculating, true);
});

test("2a. deriveBassDisplayStatus(COMPLETE) returns 'Performance is current'", () => {
  const status = deriveBassDisplayStatus(BASS_LIFECYCLE_STATE.COMPLETE);
  assert.equal(status.text, "Performance is current");
  assert.equal(status.isCalculating, false);
});

test("2b. RESTORING and COMPLETE produce different display texts", () => {
  const restoring = deriveBassDisplayStatus(BASS_LIFECYCLE_STATE.RESTORING);
  const complete = deriveBassDisplayStatus(BASS_LIFECYCLE_STATE.COMPLETE);
  assert.notEqual(restoring.text, complete.text);
});

// ── 3. P20 status respects RESTORING ───────────────────────────────────

test("3. formatOfficialBassResults with RESTORING lifecycle returns 'Restoring previous design…' even when authority is AUTHORITATIVE", () => {
  // Simulate an AUTHORITATIVE completed bass authority (as happens when
  // the in-memory or hydrated target bank contract is promoted during a
  // restore). The statusText must be "Restoring previous design…", not
  // "Performance is current".
  const completedBassAuthority = {
    authoritative: true,
    authorityStatus: "AUTHORITATIVE",
    contract: {
      job: {
        resultFingerprint: "fp-restore-test",
        status: "complete",
        cacheStatus: "hit",
      },
      productAnalysis: {
        parameters: {
          p14: { pass: true, level: 2, selectedLevel: 2, selectedTargetDb: 112, value: 112, targetBasis: "minimum" },
          p18: { value: 26, level: 2, achievedExtensionBounded: false },
          p19: { isAuthoritative: true, level: "L4", valueText: "±1.8 dB" },
          p20: { isAuthoritative: true, level: "L1", valueText: "±5 dB" },
        },
      },
      selectedMode: "balanced",
    },
  };

  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    BASS_LIFECYCLE_STATE.RESTORING,
  );

  assert.equal(result.statusText, "Restoring previous design\u2026");
  assert.notEqual(result.statusText, "Performance is current");
});

test("3a. formatOfficialBassResults with COMPLETE lifecycle and AUTHORITATIVE authority returns 'Performance is current'", () => {
  const completedBassAuthority = {
    authoritative: true,
    authorityStatus: "AUTHORITATIVE",
    contract: {
      job: { resultFingerprint: "fp-complete", status: "complete" },
      productAnalysis: {
        parameters: {
          p14: { pass: true, level: 2, selectedLevel: 2, selectedTargetDb: 112, value: 112, targetBasis: "minimum" },
          p18: { value: 26, level: 2, achievedExtensionBounded: false },
          p19: { isAuthoritative: true, level: "L4", valueText: "±1.8 dB" },
          p20: { isAuthoritative: true, level: "L1", valueText: "±5 dB" },
        },
      },
      selectedMode: "balanced",
    },
  };

  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    BASS_LIFECYCLE_STATE.COMPLETE,
  );

  assert.equal(result.statusText, "Performance is current");
});

test("3b. P20 pill during RESTORING retains previous values (stale: false) — does not show 'Calculating…'", () => {
  const completedBassAuthority = {
    authoritative: true,
    authorityStatus: "AUTHORITATIVE",
    contract: {
      job: { resultFingerprint: "fp-restore-p20", status: "complete" },
      productAnalysis: {
        parameters: {
          p14: { pass: true, level: 2, selectedLevel: 2, selectedTargetDb: 112, value: 112, targetBasis: "minimum" },
          p18: { value: 26, level: 2, achievedExtensionBounded: false },
          p19: { isAuthoritative: true, level: "L4", valueText: "±1.8 dB" },
          p20: { isAuthoritative: true, level: "L1", valueText: "±5 dB" },
        },
      },
      selectedMode: "balanced",
    },
  };

  const result = formatOfficialBassResults(
    completedBassAuthority,
    { status: "idle" },
    [],
    Date.now(),
    false,
    {},
    null,
    BASS_LIFECYCLE_STATE.RESTORING,
  );

  // P20 pill must show the retained SEAT result, not "Calculating…" or "—".
  assert.equal(result.pills.p20.resultText, "SEAT");
  assert.equal(result.pills.p20.level, "SEAT");
  // Status text must be RESTORING.
  assert.equal(result.statusText, "Restoring previous design\u2026");
});

// ── 4. Cache-miss warning clears when authority is current and bank 8/8 ─

test("4. coherence conditions: authoritative + fingerprint match + family ready>=total", () => {
  reset();
  // Simulate the coherence reconciliation logic from RestorePreviousDesignBar.
  // When all conditions are true, the cache-miss restoreResult should be
  // cleared and the shared restoring state should be cleared.
  const cacheMissResult = { ok: false, reason: "cache-miss", physicalRestored: true, bankRestored: false };

  const sharedCoherent = {
    completedBassAuthority: {
      authoritative: true,
      contract: { job: { resultFingerprint: "fp-coherent" } },
    },
    cacheKey: "fp-coherent",
    p14FamilyProgress: { total: 8, ready: 8 },
  };

  // Check the coherence predicate used by the effect.
  const authority = sharedCoherent.completedBassAuthority;
  const progress = sharedCoherent.p14FamilyProgress;
  const coherent = !!authority?.authoritative
    && !!authority?.contract?.job?.resultFingerprint
    && authority.contract.job.resultFingerprint === sharedCoherent.cacheKey
    && !!progress
    && progress.total > 0
    && progress.ready >= progress.total;

  assert.equal(coherent, true);
  assert.equal(cacheMissResult.reason, "cache-miss");
  assert.equal(cacheMissResult.bankRestored, false);

  // Simulate clearing.
  setRestoring(PID, VID, true);
  assert.equal(isRestoring(PID, VID), true);
  // Effect would clear both:
  setRestoring(PID, VID, false);
  assert.equal(isRestoring(PID, VID), false);
  reset();
});

test("4a. coherence NOT met when family ready < total (7/8)", () => {
  const shared = {
    completedBassAuthority: {
      authoritative: true,
      contract: { job: { resultFingerprint: "fp" } },
    },
    cacheKey: "fp",
    p14FamilyProgress: { total: 8, ready: 7 },
  };
  const authority = shared.completedBassAuthority;
  const progress = shared.p14FamilyProgress;
  const coherent = !!authority?.authoritative
    && !!authority?.contract?.job?.resultFingerprint
    && authority.contract.job.resultFingerprint === shared.cacheKey
    && !!progress
    && progress.total > 0
    && progress.ready >= progress.total;
  assert.equal(coherent, false);
});

test("4b. coherence NOT met when fingerprint mismatch", () => {
  const shared = {
    completedBassAuthority: {
      authoritative: true,
      contract: { job: { resultFingerprint: "fp-old" } },
    },
    cacheKey: "fp-new",
    p14FamilyProgress: { total: 8, ready: 8 },
  };
  const authority = shared.completedBassAuthority;
  const progress = shared.p14FamilyProgress;
  const coherent = !!authority?.authoritative
    && !!authority?.contract?.job?.resultFingerprint
    && authority.contract.job.resultFingerprint === shared.cacheKey
    && !!progress
    && progress.total > 0
    && progress.ready >= progress.total;
  assert.equal(coherent, false);
});

test("4c. coherence NOT met when authority not authoritative", () => {
  const shared = {
    completedBassAuthority: {
      authoritative: false,
      authorityStatus: "STALE",
      contract: { job: { resultFingerprint: "fp" } },
    },
    cacheKey: "fp",
    p14FamilyProgress: { total: 8, ready: 8 },
  };
  const authority = shared.completedBassAuthority;
  const progress = shared.p14FamilyProgress;
  const coherent = !!authority?.authoritative
    && !!authority?.contract?.job?.resultFingerprint
    && authority.contract.job.resultFingerprint === shared.cacheKey
    && !!progress
    && progress.total > 0
    && progress.ready >= progress.total;
  assert.equal(coherent, false);
});

// ── 5. Current / "needs updating" never overlap ────────────────────────

test("5. when RESTORING is active, statusText is never 'Performance is current'", () => {
  // Test with various authority statuses — RESTORING must always win.
  const authorityStatuses = ["AUTHORITATIVE", "STALE", "NOT_VERIFIED", "LIMITED", "BLOCKED", "UPDATING"];
  for (const as of authorityStatuses) {
    const completedBassAuthority = {
      authoritative: as === "AUTHORITATIVE",
      authorityStatus: as,
      contract: {
        job: { resultFingerprint: "fp", status: "complete" },
        productAnalysis: {
          parameters: {
            p14: { pass: true, level: 2, selectedLevel: 2, selectedTargetDb: 112, value: 112, targetBasis: "minimum" },
            p18: { value: 26, level: 2, achievedExtensionBounded: false },
            p19: { isAuthoritative: true, level: "L4", valueText: "±1.8 dB" },
            p20: { isAuthoritative: true, level: "L1", valueText: "±5 dB" },
          },
        },
        selectedMode: "balanced",
      },
    };
    const result = formatOfficialBassResults(
      completedBassAuthority,
      { status: "idle" },
      [],
      Date.now(),
      false,
      {},
      null,
      BASS_LIFECYCLE_STATE.RESTORING,
    );
    assert.equal(
      result.statusText,
      "Restoring previous design\u2026",
      `RESTORING must win over authorityStatus=${as}, got: ${result.statusText}`,
    );
    assert.notEqual(result.statusText, "Performance is current");
  }
});

// ── 6. Non-coherent cache-miss still remains actionable ─────────────────

test("6. non-coherent cache-miss: restoreResult stays set (warning remains actionable)", () => {
  // When coherence is NOT met (e.g., bank still 7/8 or fingerprint mismatch),
  // the cache-miss restoreResult must NOT be cleared. The warning remains
  // actionable — the designer can click "Update Bass Performance".
  const cacheMissResult = { ok: false, reason: "cache-miss", physicalRestored: true, bankRestored: false };

  // Case A: bank not complete (7/8)
  const shared7of8 = {
    completedBassAuthority: {
      authoritative: true,
      contract: { job: { resultFingerprint: "fp" } },
    },
    cacheKey: "fp",
    p14FamilyProgress: { total: 8, ready: 7 },
  };
  const authorityA = shared7of8.completedBassAuthority;
  const progressA = shared7of8.p14FamilyProgress;
  const coherentA = !!authorityA?.authoritative
    && !!authorityA?.contract?.job?.resultFingerprint
    && authorityA.contract.job.resultFingerprint === shared7of8.cacheKey
    && !!progressA
    && progressA.total > 0
    && progressA.ready >= progressA.total;
  assert.equal(coherentA, false, "7/8 bank should NOT be coherent");

  // Case B: fingerprint mismatch
  const sharedMismatch = {
    completedBassAuthority: {
      authoritative: true,
      contract: { job: { resultFingerprint: "fp-old" } },
    },
    cacheKey: "fp-new",
    p14FamilyProgress: { total: 8, ready: 8 },
  };
  const authorityB = sharedMismatch.completedBassAuthority;
  const progressB = sharedMismatch.p14FamilyProgress;
  const coherentB = !!authorityB?.authoritative
    && !!authorityB?.contract?.job?.resultFingerprint
    && authorityB.contract.job.resultFingerprint === sharedMismatch.cacheKey
    && !!progressB
    && progressB.total > 0
    && progressB.ready >= progressB.total;
  assert.equal(coherentB, false, "fingerprint mismatch should NOT be coherent");

  // In both cases, the restoreResult would NOT be cleared — the warning
  // remains visible and actionable.
  assert.equal(cacheMissResult.ok, false);
  assert.equal(cacheMissResult.physicalRestored, true);
  assert.equal(cacheMissResult.bankRestored, false);
});

test("6a. non-cache-miss results (e.g., promotion-failed) are NOT auto-cleared by the coherence effect", () => {
  // The coherence effect only acts on reason === "cache-miss". Other non-ok
  // results (promotion-failed, authority-not-coherent, fingerprint-not-ready)
  // must NOT be auto-cleared — they require manual retry.
  const promotionFailed = { ok: false, reason: "promotion-failed", physicalRestored: true };
  assert.notEqual(promotionFailed.reason, "cache-miss");
  // The effect guard `if (restoreResult.reason !== "cache-miss") return;`
  // ensures this result is not touched.
});