import test from "node:test";
import assert from "node:assert/strict";
import { attemptRecoveryRetry, isAuthoritativeForFingerprint, POST_APPLY_FAILURE_PHASES, TERMINAL_FAILURE_OUTCOMES, contractStructurallyComplete } from "../src/components/room/bass/optimiseWorkflow/recoveryRetry.js";

test("smoke: fallback for non-post-apply phase", async () => {
  const result = await attemptRecoveryRetry({ lastErrorPhase: "applying", sharedRef: {current:{}}, phaseRef: {current:"idle"}, readLiveIdentity: () => ({projectId:"p1",versionId:"v1",settingsSignature:"s1"}) });
  assert.equal(result.action, "fallback-reset");
});

test("smoke: isAuthoritativeForFingerprint requires currentJobFingerprint match", () => {
  const shared = { completedBassAuthority: { authorityStatus: "AUTHORITATIVE", contract: { job: { status: "complete", resultFingerprint: "fp-A", currentJobFingerprint: "fp-A" } } } };
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-A"), true);
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-B"), false);
  const staleJob = { completedBassAuthority: { authorityStatus: "AUTHORITATIVE", contract: { job: { status: "complete", resultFingerprint: "fp-A", currentJobFingerprint: "fp-B" } } } };
  assert.equal(isAuthoritativeForFingerprint(staleJob, "fp-A"), false, "currentJobFingerprint mismatch must reject");
});