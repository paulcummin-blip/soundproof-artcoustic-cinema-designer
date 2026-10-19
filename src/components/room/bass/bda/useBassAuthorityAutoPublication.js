// useBassAuthorityAutoPublication — the automatic save/publication step.
//
// PRODUCT RULE: a completed bass result saves itself. The designer runs
// "Calculate Bass Performance" and nothing else: there is no "Ready to save"
// state and no "Save Assessment" button anywhere in the app, because there is no
// second step to perform.
//
// PLUMBING ONLY. This hook computes no engineering value, grades nothing, writes
// no authority, and adds no second publication path. It asks the ONE existing
// publication path — the callback the engineering publication effect registers
// for its own project + version — to publish the settled assessment, at most
// ONCE per saved result identity.
//
// When it fires: only in the state that means "the saved result is not published
// yet" (CALCULATED_NOT_PUBLISHED). A current result needs nothing, and a failure
// is never retried automatically: it is reported honestly and the designer
// chooses Retry save or Recalculate, so a refused assessment can never spin in a
// silent retry loop.
//
// Retry save re-offers the SAME authoritative contract to the SAME persistence
// path — a failed row write is never swallowed — and SEQUENCES it: the durable
// save is awaited to its outcome, and publication is asked for only once that
// save has succeeded. The publication path additionally re-reads the stored row
// before it publishes, so a result that still has not persisted is refused there
// rather than announced as saved.
import { useCallback, useEffect, useRef } from "react";
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";
import {
  readEngineeringPublishTrigger,
  subscribeEngineeringPublishTrigger,
} from "@/components/engineering/engineeringPublishTrigger";
import { retryBassAuthorityPersistence } from "@/components/room/bass/completedBassResultStore";

export default function useBassAuthorityAutoPublication({
  projectId = null,
  versionId = null,
  stateCode = null,
  resultFingerprint = null,
} = {}) {
  const requestedRef = useRef(new Set());

  // A different version is a different lifecycle: the automatic pass is allowed
  // once again for its results.
  useEffect(() => {
    requestedRef.current = new Set();
  }, [projectId, versionId]);

  useEffect(() => {
    if (!projectId || !versionId) return undefined;
    if (stateCode !== BASS_AUTHORITY_STATE.CALCULATED_NOT_PUBLISHED) return undefined;
    return subscribeEngineeringPublishTrigger(projectId, versionId, () => {
      const identity = `${projectId}::${versionId}::${resultFingerprint || "result"}`;
      if (requestedRef.current.has(identity)) return;
      const publish = readEngineeringPublishTrigger(projectId, versionId);
      // Nothing is mounted that can publish: the publication effect is not up
      // for this version yet, so this request is not spent — the subscription
      // fires again the moment it registers.
      if (typeof publish !== "function") return;
      requestedRef.current.add(identity);
      publish();
    });
  }, [projectId, versionId, stateCode, resultFingerprint]);

  const retrySave = useCallback(async () => {
    if (!projectId || !versionId) {
      return { persisted: false, fingerprint: null, error: "No project version is open." };
    }
    // ORDER IS THE FIX: the existing completed calculation is saved and the
    // write's outcome awaited BEFORE anything is published. Publication must
    // never begin on a result that has not reached durable storage, and a
    // failed save is reported and left alone — the completed result, its
    // fingerprint and its curves stay in memory for another retry.
    const outcome = await retryBassAuthorityPersistence(projectId, versionId);
    if (!outcome?.persisted) return outcome;
    const publish = readEngineeringPublishTrigger(projectId, versionId);
    if (typeof publish === "function") publish();
    return outcome;
  }, [projectId, versionId]);

  return { retrySave };
}