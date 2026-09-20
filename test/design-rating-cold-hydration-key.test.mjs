// test/design-rating-cold-hydration-key.test.mjs
//
// Regression tests for the Design Rating cold-hydration project-key match fix.
//
// Root cause: useAppDesignRating compared completedBassAuthority.projectId
// (composite "{projectId}::{versionId}" key) against the raw projectId, so
// projectIdMatch was ALWAYS false → bassReadiness.reason = "project-id-mismatch"
// → isPublishable = false → Engineering Summary never published.
//
// Fix: use bassProjectIdMatch(completedBassAuthority, projectId, effectiveVersionId)
// which compares against the SAME composite bassCacheKey the store uses.
//
// Run: node test/design-rating-cold-hydration-key.test.mjs

import { strict as assert } from "node:assert";
import { bassCacheKey, bassProjectIdMatch } from "../src/components/room/bass/bassCacheKey.js";
import { isDesignRatingPublishable } from "../src/components/state/designRatingPublicationAuthority.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

// ── Mock authority builder ──
function makeAuthority(projectId, versionId, { authoritative = true, fingerprint = "fp-abc" } = {}) {
  const key = bassCacheKey(projectId, versionId);
  return {
    projectId: key,
    authorityStatus: authoritative ? "AUTHORITATIVE" : "LOADING",
    currentFingerprint: fingerprint,
    contract: authoritative
      ? { job: { resultFingerprint: fingerprint, currentJobFingerprint: fingerprint } }
      : null,
    authoritative,
    structurallyComplete: authoritative,
    hydrationSettled: true,
  };
}

// ── 1. Positive: matching project+version → projectIdMatch = true ──
test("1: matching project+version → projectIdMatch = true", () => {
  const authority = makeAuthority("proj-1", "ver-1");
  const match = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(match, true, "projectIdMatch should be true when composite keys agree");
});

// ── 2. Old broken comparison would fail here (proof) ──
test("2: old raw-projectId comparison fails against composite key (proof of bug)", () => {
  const authority = makeAuthority("proj-1", "ver-1");
  // This is what the OLD code did: String(projectId) vs composite key
  const oldMatch = String(authority.projectId) === String("proj-1");
  assert.equal(oldMatch, false, "old comparison must fail (composite key != raw projectId)");
});

// ── 3. Negative: version mismatch → projectIdMatch = false ──
test("3: version mismatch → projectIdMatch = false", () => {
  const authority = makeAuthority("proj-1", "ver-2");
  const match = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(match, false, "different version must not match");
});

// ── 4. Negative: project mismatch → projectIdMatch = false ──
test("4: project mismatch → projectIdMatch = false", () => {
  const authority = makeAuthority("proj-2", "ver-1");
  const match = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(match, false, "different project must not match");
});

// ── 5. Full cold-hydration flow: AUTHORITATIVE → ready → publishable ──
test("5: AUTHORITATIVE hydrated authority → bassReadiness.ready=true → isPublishable=true", () => {
  const authority = makeAuthority("proj-1", "ver-1", { authoritative: true, fingerprint: "fp-match" });

  // Step 1: projectIdMatch (the fix)
  const projectIdMatch = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(projectIdMatch, true);

  // Step 2: bassReadiness for AUTHORITATIVE with matching fingerprints
  // (replicates resolveBassReadiness AUTHORITATIVE branch)
  const currentFp = authority.currentFingerprint;
  const resultFp = authority.contract?.job?.resultFingerprint;
  const bassReadiness = (currentFp && resultFp && currentFp === resultFp)
    ? { ready: true, pending: false, reason: "authoritative", fingerprint: currentFp }
    : { ready: false, pending: true, reason: "fingerprint-mismatch", fingerprint: currentFp };
  assert.equal(bassReadiness.ready, true, "bassReadiness.ready must be true for AUTHORITATIVE + matching fingerprints");

  // Step 3: isPublishable
  const isPublishable = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness,
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(isPublishable, true, "isPublishable must be true when bassReadiness.ready");
});

// ── 6. Old broken code would produce isPublishable = false (proof) ──
test("6: old broken projectIdMatch → bassReadiness not ready → isPublishable=false (proof)", () => {
  const authority = makeAuthority("proj-1", "ver-1");

  // Old broken comparison
  const oldProjectIdMatch = String(authority.projectId) === String("proj-1");
  assert.equal(oldProjectIdMatch, false);

  // Old bassReadiness would be project-id-mismatch
  const oldBassReadiness = { ready: false, pending: true, reason: "project-id-mismatch", fingerprint: null };

  const isPublishable = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness: oldBassReadiness,
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(isPublishable, false, "old broken path must not publish");
});

// ── 7. Fail-closed: LOADING authority → not publishable ──
test("7: LOADING authority → bassReadiness not ready → isPublishable=false (fail-closed)", () => {
  const authority = makeAuthority("proj-1", "ver-1", { authoritative: false });
  const projectIdMatch = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(projectIdMatch, true, "keys match but authority is LOADING");

  // bassReadiness for LOADING
  const bassReadiness = { ready: false, pending: true, reason: "loading", fingerprint: null };
  const isPublishable = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness,
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(isPublishable, false, "LOADING must not publish");
});

// ── 8. Fail-closed: fingerprint mismatch → not publishable ──
test("8: AUTHORITATIVE but fingerprint mismatch → not publishable (fail-closed)", () => {
  const authority = makeAuthority("proj-1", "ver-1", { authoritative: true, fingerprint: "fp-current" });
  // Simulate resultFingerprint != currentFingerprint
  authority.contract.job.resultFingerprint = "fp-different";

  const projectIdMatch = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(projectIdMatch, true);

  const currentFp = authority.currentFingerprint;
  const resultFp = authority.contract.job.resultFingerprint;
  const bassReadiness = (currentFp && resultFp && currentFp === resultFp)
    ? { ready: true, pending: false, reason: "authoritative", fingerprint: currentFp }
    : { ready: false, pending: true, reason: "fingerprint-mismatch", fingerprint: currentFp };
  assert.equal(bassReadiness.ready, false);

  const isPublishable = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness,
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(isPublishable, false, "fingerprint mismatch must not publish");
});

// ── 9. Fail-closed: wrong version → not publishable ──
test("9: wrong version → projectIdMatch=false → not publishable (fail-closed)", () => {
  const authority = makeAuthority("proj-1", "ver-2");
  const projectIdMatch = bassProjectIdMatch(authority, "proj-1", "ver-1");
  assert.equal(projectIdMatch, false);

  const bassReadiness = { ready: false, pending: true, reason: "project-id-mismatch", fingerprint: null };
  const isPublishable = isDesignRatingPublishable({
    minimumSystemMet: true,
    bassReadiness,
    retainedFromRefresh: false,
    isP14TargetUnselected: false,
  });
  assert.equal(isPublishable, false, "wrong version must not publish");
});

// ── 10. "free" project fallback ──
test("10: free project fallback works correctly", () => {
  const authority = makeAuthority("free", "free", { authoritative: true, fingerprint: "fp-free" });
  const match = bassProjectIdMatch(authority, "free", "free");
  assert.equal(match, true);
});

// ── 11. null authority → projectIdMatch = false (fail-closed) ──
test("11: null authority → projectIdMatch = false (fail-closed)", () => {
  const match = bassProjectIdMatch(null, "proj-1", "ver-1");
  assert.equal(match, false);
});

// ── Run all tests ──
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);