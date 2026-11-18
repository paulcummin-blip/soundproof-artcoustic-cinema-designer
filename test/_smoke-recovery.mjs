import test from "node:test";
import assert from "node:assert/strict";
import { attemptRecoveryRetry, isAuthoritativeForFingerprint, POST_APPLY_FAILURE_PHASES, TERMINAL_FAILURE_OUTCOMES, contractStructurallyComplete } from "../src/components/room/bass/optimiseWorkflow/recoveryRetry.js";
import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";

// Structurally-complete contract (satisfies the ESTABLISHED validator the
// orchestrator now imports).
function completeContract(cacheKey, { currentJobFingerprint = cacheKey } = {}) {
  return {
    version: BASS_ANALYSIS_CONTRACT_VERSION,
    metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
    selectedCandidate: { perSeatP20Results: [{ seatId: "seat-1", variationDbRaw: 3, level: "L3" }] },
    selectedCandidateId: "cand-" + cacheKey,
    job: { status: "complete", metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, calculationId: "calc-" + cacheKey, resultFingerprint: cacheKey, currentJobFingerprint },
  };
}

test("smoke: fallback for non-post-apply phase", async () => {
  const result = await attemptRecoveryRetry({ lastErrorPhase: "applying", sharedRef: {current:{}}, phaseRef: {current:"idle"}, readLiveIdentity: () => ({projectId:"p1",versionId:"v1",settingsSignature:"s1"}) });
  assert.equal(result.action, "fallback-reset");
});

test("smoke: isAuthoritativeForFingerprint requires currentJobFingerprint match", () => {
  const shared = { completedBassAuthority: { authorityStatus: "AUTHORITATIVE", contract: completeContract("fp-A") } };
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-A"), true);
  assert.equal(isAuthoritativeForFingerprint(shared, "fp-B"), false);
  const staleJob = { completedBassAuthority: { authorityStatus: "AUTHORITATIVE", contract: completeContract("fp-A", { currentJobFingerprint: "fp-B" }) } };
  assert.equal(isAuthoritativeForFingerprint(staleJob, "fp-A"), false, "currentJobFingerprint mismatch must reject");
});