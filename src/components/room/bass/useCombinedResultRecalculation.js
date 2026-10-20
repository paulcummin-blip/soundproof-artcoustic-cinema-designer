// useCombinedResultRecalculation.js
// ---------------------------------------------------------------------------
// The single manual REQUEST path for a bass recalculation, and the combined
// LCR + subwoofer validity that goes with it.
//
// Every manual calculation request — the band's own action and the recalculate
// button — goes through requestCalculate, so a completed recalculation is
// recognised however it was started. The existing authoritative workflow does
// all the work: this hook starts nothing, computes nothing and publishes
// nothing.
//
// The combined result's configuration signature is stamped ONLY when a request
// made on those settings has actually finished with a current result. If the
// crossover changes while the calculation runs, the stamp does not happen and
// the warning stays — an in-flight calculation can never make a different
// configuration current.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCrossoverConfigurationSignature,
  readCombinedResultSignature,
  writeCombinedResultSignature,
  resolveCombinedResultState,
} from "@/components/room/bass/combinedResultAuthority";

export default function useCombinedResultRecalculation({
  projectId = null,
  versionId = null,
  crossover = null,
  subOnlyCurrent = false,
  hasCombinedResult = false,
  calculating = false,
  onCalculate = null,
} = {}) {
  const currentSignature = useMemo(
    () => buildCrossoverConfigurationSignature(crossover),
    [crossover],
  );
  const [savedSignature, setSavedSignature] = useState(
    () => readCombinedResultSignature(projectId, versionId),
  );

  useEffect(() => {
    setSavedSignature(readCombinedResultSignature(projectId, versionId));
  }, [projectId, versionId]);

  // A result that is already current and has no recorded signature yet (a
  // design calculated before this record existed) establishes its signature
  // from the settings it is current on, so later changes are detected.
  useEffect(() => {
    if (!subOnlyCurrent || !currentSignature) return;
    if (readCombinedResultSignature(projectId, versionId)) return;
    writeCombinedResultSignature(projectId, versionId, currentSignature);
    setSavedSignature(currentSignature);
  }, [projectId, versionId, subOnlyCurrent, currentSignature]);

  const pendingSignatureRef = useRef(null);
  const wasCalculatingRef = useRef(false);

  // Completion edge: a request this hook started, finishing on the SAME
  // settings, establishes the combined result at those settings. Anything else
  // leaves the warning in place.
  useEffect(() => {
    if (calculating) {
      wasCalculatingRef.current = true;
      return;
    }
    if (!wasCalculatingRef.current) return;
    wasCalculatingRef.current = false;
    const pending = pendingSignatureRef.current;
    pendingSignatureRef.current = null;
    if (!pending) return;
    if (pending !== currentSignature || !subOnlyCurrent) return;
    writeCombinedResultSignature(projectId, versionId, pending);
    setSavedSignature(pending);
  }, [calculating, currentSignature, subOnlyCurrent, projectId, versionId]);

  const requestCalculate = useCallback(() => {
    if (typeof onCalculate !== "function") return;
    pendingSignatureRef.current = currentSignature;
    onCalculate();
  }, [onCalculate, currentSignature]);

  const combinedState = resolveCombinedResultState({
    savedSignature,
    currentSignature,
    subOnlyCurrent,
    hasCombinedResult,
  });

  return { combinedState, currentSignature, requestCalculate };
}