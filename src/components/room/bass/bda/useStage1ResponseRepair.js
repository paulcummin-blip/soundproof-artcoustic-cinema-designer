import { useEffect, useMemo, useRef, useState } from "react";
import { refineMissingResponse, replaceRecommendation, resultField } from "./repairStage1Recommendation";
import { getStage1State, updateRecoveredBucket } from "../stage1/stage1PlacementStore";
import { saveRepairedResponse } from "../stage1/stage1PlacementPersistence";

// The background runner owns one instance per card. Unrelated model, P14
// and UI changes never change the identity of a repair job.
export function useStage1ResponseRepair(option, projectId, versionId, context) {
  const inputs = useRef(null);
  inputs.current = { option, context };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState(null);
  const pending = useRef(null);
  const key = option && !option.ready ? JSON.stringify([projectId, versionId, option.evidenceKey]) : null;
  useEffect(() => {
    if (!key) { pending.current = null; setStatus(null); return; }
    const { option, context } = inputs.current;
    const field = resultField[option.quantity];
    const previous = getStage1State(projectId, versionId)[field];
    const controller = new AbortController();
    const { signal } = controller;
    let timeout;
    setStatus({ key, active: true });
    const repair = async () => {
      let evidence = pending.current?.key === key ? pending.current.evidence : null;
      if (!evidence) evidence = await refineMissingResponse(previous, option, context, signal);
      if (signal.aborted) return;
      pending.current = { key, evidence };
      const bucket = projectId && versionId && projectId !== "free"
        ? await saveRepairedResponse(projectId, versionId, option, evidence, context.seatingPositions, signal)
        : replaceRecommendation(previous, option, evidence);
      if (!signal.aborted) updateRecoveredBucket(projectId, versionId, option.fingerprint, field, previous, bucket);
    };
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Response recovery timed out.")), 90000);
    });
    Promise.race([repair(), deadline]).then(() => {
      if (!signal.aborted) setStatus({ key, active: false });
    }).catch(error => {
      if (!signal.aborted) {
        controller.abort();
        setStatus({ key, active: false, error: error?.message || "The response could not be recovered." });
      }
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [key, attempt, projectId, versionId]);
  return useMemo(() => key && status?.key === key
    ? { ...status, retry: () => setAttempt(n => n + 1) }
    : null, [key, status]);
}
