// useNormalizedRoomTransferLive.js — Phase 2B: Live-result hook for the
// normalized room-transfer engine, with a two-stage calculation.
//
// Stage 1 — Interactive preview:
//   - Starts after ~50 ms debounce (coalesced — a single timer fires with the
//     latest geometry, it is NOT reset by intermediate drag coordinates).
//   - Uses the same modal/direct acoustic engine with reflections disabled
//     (image-source refinement off). Modal frequencies, source summation,
//     phase, seat handling and source-position physics are unchanged.
//   - Target time-to-visible-curve: under 150 ms for four subs + RSP + 3 seats.
//
// Stage 2 — Full refinement:
//   - Starts only after geometry has remained unchanged for ~280 ms.
//   - Uses the complete production flat-source physics (including reflections).
//   - Runs off the main thread in a separate worker.
//   - Replaces the preview only when its fingerprint still matches the current
//     geometry. It may take ~1 s at present.
//
// Both paths are advisory room-only curves, never RP22 publication authority.
// The previous accepted curve stays visible while the next calculation runs.
//
// PERSISTENT PREVIEW WORKER + IN-FLIGHT/PENDING SCHEDULING:
//   The preview worker is created once and NEVER terminated when geometry
//   changes. Terminating an executing preview every time a newer drag coordinate
//   arrives caused worker starvation during continuous dragging. Instead:
//     • At most ONE preview request is in flight.
//     • At most ONE replaceable pending request holds the latest geometry
//       snapshot. Intermediate movements replace the pending request; they do
//       not terminate the in-flight computation.
//     • During the same active drag/context, completed previews may advance
//       the display in strictly increasing generation order. On release/cancel,
//       only the exact current generation and fingerprint may be accepted.
//       The latest pending geometry is posted after each completed request.
//   The refinement worker is still terminated immediately when geometry
//   changes, so a long refinement never delays the next interactive preview.
//
// Race protection uses a single geometry generation counter shared across both
// stages. The generation is incremented immediately when geometry changes.
// Every response must match its dispatched request. Intermediate previews also
// require the active gesture/context epoch and a newer display generation.
// Refined results always require exact current generation/fingerprint matching;
// they can replace the same-generation preview but never a newer result.
//
// The fingerprint is truly product-independent: it excludes model key, product
// curve, product capability, product-derived source IDs, requested SPL, EQ
// settings, priority mode, and graph smoothing/display controls.
//
// No valid room, listener or source returns status "idle" (not an exception).
//
// Returned shape:
//   {
//     status,                  // "idle" | "calculating" | "ready" | "error"
//     result,                   // last valid normalized result (or null)
//     geometryFingerprint,      // product-independent fingerprint (or null)
//     requestedAt,              // epoch ms of last worker post, or null
//     completedAt,               // epoch ms of last result acceptance, or null
//     calculationDurationMs,     // from the last accepted result, or null
//     errorMessage,              // string or null
//     isUpdating,                 // true while a newer result is calculating
//     quality,                    // null | "preview" | "refined"
//     isRefining,                  // true while refinement is pending or in flight
//     previewDurationMs,           // last preview calculation duration (ms), or null
//     refinementDurationMs,        // last refinement calculation duration (ms), or null
//   }

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { classifyRoomPreviewResponse } from "./roomPreviewDisplayPolicy";
import { computeNormalizedTransferFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";
import { buildPreviewPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";

const PREVIEW_DEBOUNCE_MS = 50;
const REFINEMENT_DEBOUNCE_MS = 280;
// Preview uses reduced frequency resolution for interactive speed. The modal
// frequencies, source summation, phase, seat handling and source-position
// physics are unchanged — only the output frequency grid is coarser. The
// refinement uses the full 96 points/octave (320 points for 20–200 Hz).
const PREVIEW_POINTS_PER_OCTAVE = 8;

function hasValidListener(rspPosition, seatingPositions) {
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) return true;
  if (Array.isArray(seatingPositions) && seatingPositions.some(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))) return true;
  return false;
}

function hasValidSource(subs) {
  return Array.isArray(subs) && subs.length > 0 &&
    subs.some(s => s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
}

function hasValidRoom(roomDims) {
  return roomDims && Number.isFinite(roomDims.widthM) && Number.isFinite(roomDims.lengthM) && Number.isFinite(roomDims.heightM);
}

export function useNormalizedRoomTransferLive({ roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions, analysisRequestId = null, analysisRequestFingerprint = null, followCurrentGeometry = false, interactionActive = false, previewContextKey = null, isInteractionActive = null }) {
  const canonicalInputs = useMemo(
    () => canonicalizeNormalizedRoomInputs({ roomDims, rspPosition, seatingPositions }),
    [roomDims, rspPosition, seatingPositions]
  );
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [requestedAt, setRequestedAt] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [calculationDurationMs, setCalculationDurationMs] = useState(null);
  const [quality, setQuality] = useState(null);
  const [isRefining, setIsRefining] = useState(false);
  const [previewDurationMs, setPreviewDurationMs] = useState(null);
  const [refinementDurationMs, setRefinementDurationMs] = useState(null);

  // Preview worker — created once and NEVER terminated when geometry changes.
  // Display admission is checked in onmessage; never terminate mid-calculation.
  // Terminated only on unmount.
  const previewWorkerRef = useRef(null);
  // Refinement worker — terminated on geometry change, recreated on next refinement.
  const refinementWorkerRef = useRef(null);

  // Single geometry generation counter — shared across preview and refinement.
  // Incremented IMMEDIATELY when geometry changes, before any debounce.
  const geometryGenerationRef = useRef(0);

  // The latest requested fingerprint — updated IMMEDIATELY when the fingerprint
  // changes, before the debounce. Settled and refined responses must match it.
  // Intermediate drag previews retain their own dispatched fingerprint.
  const currentFingerprintRef = useRef(null);
  // Separate gesture/context lifetime from individual coordinate generations.
  // End/restart, disable, or canonical design/version changes invalidate old work.
  const interactionRef = useRef({ key: null, epoch: 0, dragging: false });
  const interactionReaderRef = useRef(null);

  // The currently in-flight preview request { generation, fingerprint }. Set
  // when a preview is posted, cleared when its response is handled.
  const activePreviewRequestRef = useRef(null);
  // The single replaceable pending preview request: the latest geometry
  // snapshot waiting for the in-flight preview to complete. Intermediate
  // movements replace this; only the latest is ever posted.
  const previewPendingRef = useRef(null);
  // Latest preview payload (basePayload + previewPhysicsOptions), updated on
  // every geometry change so the coalesced debounce timer fires with the
  // newest geometry rather than the one that armed the timer.
  const previewPayloadRef = useRef(null);

  const activeRefinementRequestRef = useRef(null);

  const previewTimerRef = useRef(null);
  const refinementTimerRef = useRef(null);

  // Last valid result cache — used to skip redundant recalculations and to
  // keep the previous curve visible while a newer one is calculating.
  const lastValidResultRef = useRef(null);
  const lastValidFingerprintRef = useRef(null);
  const lastValidQualityRef = useRef(null);
  const lastValidGenerationRef = useRef(0);

  // Compute the product-independent fingerprint. Returns null for invalid
  // inputs (no valid room, listener, or source).
  const geometryFingerprint = useMemo(() => {
    if (!hasValidRoom(canonicalInputs.roomDims)) return null;
    if (!hasValidSource(subsForSimulation)) return null;
    if (!hasValidListener(canonicalInputs.rspPosition, canonicalInputs.seatingPositions)) return null;

    const po = physicsOptions || {};
    return computeNormalizedTransferFingerprint({
      roomDims: canonicalInputs.roomDims,
      rspPosition: canonicalInputs.rspPosition,
      seatingPositions: canonicalInputs.seatingPositions,
      sources: subsForSimulation,
      surfaceAbsorption: po.surfaceAbsorption,
      roomDamping: po.roomDamping,
      axialQ: po.axialQ,
      modalSourceReferenceMode: po.modalSourceReferenceMode,
      modalGainScalar: po.modalGainScalar,
      modalDistanceBlend: po.modalDistanceBlend,
      modalStorageMode: po.modalStorageMode,
      propagationPhaseScale: po.propagationPhaseScale,
      enableRewCoreReflections: po.enableReflections,
      qStrategy: po.qStrategy,
      rewModalBandwidthScale: po.rewModalBandwidthScale,
      disableReflectionPhaseJitter: po.disableReflectionPhaseJitter,
      disableReflectionCoherenceWeight: po.disableReflectionCoherenceWeight,
      disableLateField: po.disableLateField,
      disableModalPropagationPhase: po.disableModalPropagationPhase,
      mute68HzAxialMode: po.mute68HzAxialMode,
      debugDisableModalContribution: po.debugDisableModalContribution,
      rewParityFieldMode: po.rewParityFieldMode,
      abApplyModeMultiplicity: po.abApplyModeMultiplicity,
      roomIsSealed: po.roomIsSealed,
      abMidbandQScale: po.abMidbandQScale,
      abGlobalQScale: po.abGlobalQScale,
      modeGenerationFMaxHz: po.modeGenerationFMaxHz,
      overrideConstantAxialQ: po.overrideConstantAxialQ,
      overrideAbsorptionAxialQ: po.overrideAbsorptionAxialQ,
      debugMode200Multiplier: po.debugMode200Multiplier,
      debugModalPhaseConvention: po.debugModalPhaseConvention,
      reflectionGainScale: po.reflectionGainScale,
      debugModalHSign: po.debugModalHSign,
      rewParityModalMagnitudeScale: po.rewParityModalMagnitudeScale,
      modalCoherenceMode: po.modalCoherenceMode,
      highOrderAxialScale: po.highOrderAxialScale,
    });
  }, [canonicalInputs, subsForSimulation, physicsOptions]);

  // Preview physics: same as refinement physics but with reflections disabled.
  const previewPhysicsOptions = useMemo(
    () => buildPreviewPhysicsOptions(physicsOptions),
    [physicsOptions]
  );

  // Post the latest pending preview request (the single replaceable snapshot).
  // Strict generation/fingerprint check: a pending request that no longer
  // matches the current geometry is dropped, never posted. Returns true when a
  // request was actually posted.
  const dispatchPendingPreview = useCallback(() => {
    const pending = previewPendingRef.current;
    previewPendingRef.current = null;
    if (!pending) return false;
    if (pending.generation !== geometryGenerationRef.current) return false;
    if (pending.fingerprint !== currentFingerprintRef.current) return false;
    if (pending.epoch !== interactionRef.current.epoch) return false;
    const worker = previewWorkerRef.current;
    if (!worker) return false;
    activePreviewRequestRef.current = { generation: pending.generation, fingerprint: pending.fingerprint, epoch: pending.epoch, dragging: pending.dragging };
    setRequestedAt(Date.now());
    worker.postMessage(pending.message);
    return true;
  }, []);

  // Lazily create the preview worker (reused across calculations, never
  // terminated on geometry change).
  const ensurePreviewWorker = useCallback(() => {
    if (!previewWorkerRef.current && typeof Worker !== "undefined") {
      previewWorkerRef.current = new Worker(
        new URL("./normalizedRoomTransfer.worker.js", import.meta.url),
        { type: "module" }
      );
      previewWorkerRef.current.onmessage = (e) => {
        const msg = e.data || {};
        const active = activePreviewRequestRef.current;

        // No active request — nothing to do (should not happen, defensive).
        if (!active) return;

        const admission = classifyRoomPreviewResponse({
          message: msg, active,
          generation: geometryGenerationRef.current,
          fingerprint: currentFingerprintRef.current,
          epoch: interactionRef.current.epoch,
          // Read the live store as well: release/cancel closes admission even
          // before React has committed the corresponding render.
          interactionActive: interactionRef.current.dragging &&
            interactionReaderRef.current?.() === true,
          displayedGeneration: lastValidGenerationRef.current,
        });
        if (admission === "foreign") return;
        if (admission === "discard") {
          activePreviewRequestRef.current = null;
          dispatchPendingPreview();
          return;
        }

        if (msg.type === "complete") {
          // A preview is accepted only if no refined result for this generation
          // has already been accepted (refined > preview). Since both share the
          // same generation, if lastValidGenerationRef === active.generation and
          // lastValidQualityRef === "refined", the refined result is newer — skip.
          if (lastValidGenerationRef.current === active.generation &&
              lastValidQualityRef.current === "refined") {
            activePreviewRequestRef.current = null;
            dispatchPendingPreview();
            return;
          }

          lastValidResultRef.current = msg.result;
          lastValidFingerprintRef.current = active.fingerprint;
          lastValidQualityRef.current = "preview";
          lastValidGenerationRef.current = active.generation;
          activePreviewRequestRef.current = null;
          setResult(msg.result);
          setQuality("preview");
          setPreviewDurationMs(msg.result?.calculationDurationMs ?? null);
          setCalculationDurationMs(msg.result?.calculationDurationMs ?? null);
          setCompletedAt(Date.now());
          setErrorMessage(null);
          // Intermediate frames remain explicitly updating, never current.
          setStatus(admission === "intermediate" ? "calculating" : "ready");
          // After accepting, if a newer geometry is pending, dispatch it now.
          dispatchPendingPreview();
        } else if (msg.type === "error") {
          activePreviewRequestRef.current = null;
          setErrorMessage(msg.error || "Unknown error");
          setStatus("error");
          // Even on error, try to process the latest pending geometry so a
          // transient failure does not stall continuous dragging.
          dispatchPendingPreview();
        }
      };
      previewWorkerRef.current.onerror = (e) => {
        const active = activePreviewRequestRef.current;
        if (!active || active.fingerprint !== currentFingerprintRef.current ||
            active.generation !== geometryGenerationRef.current) {
          activePreviewRequestRef.current = null;
          dispatchPendingPreview();
          return;
        }
        activePreviewRequestRef.current = null;
        setErrorMessage(e?.message || "Preview worker error");
        setStatus("error");
        dispatchPendingPreview();
      };
    }
    return previewWorkerRef.current;
  }, [dispatchPendingPreview]);

  // Post a preview for the LATEST geometry (read from refs). Used by the
  // coalesced debounce timer so a single timer fires with the newest geometry
  // rather than the one that armed it.
  const postLatestPreview = useCallback(() => {
    previewTimerRef.current = null;
    const fp = currentFingerprintRef.current;
    const gen = geometryGenerationRef.current;
    if (!fp) return;
    const payload = previewPayloadRef.current;
    if (!payload) return;
    // If a preview is already in flight, the effect will have stored the
    // pending request; the debounce must not post a second in-flight.
    if (activePreviewRequestRef.current) return;
    const worker = ensurePreviewWorker();
    if (!worker) return;
    const message = {
      generation: gen,
      fingerprint: fp,
      quality: "preview",
      payload: { ...payload.basePayload, physicsOptions: payload.previewPhysicsOptions, pointsPerOctave: PREVIEW_POINTS_PER_OCTAVE },
    };
    activePreviewRequestRef.current = { generation: gen, fingerprint: fp, epoch: interactionRef.current.epoch, dragging: interactionRef.current.dragging };
    setRequestedAt(Date.now());
    worker.postMessage(message);
  }, [ensurePreviewWorker]);

  // Create a fresh refinement worker. The previous one is terminated on
  // geometry change, so this always creates a new instance when needed.
  const ensureRefinementWorker = useCallback(() => {
    if (!refinementWorkerRef.current && typeof Worker !== "undefined") {
      refinementWorkerRef.current = new Worker(
        new URL("./normalizedRoomTransfer.worker.js", import.meta.url),
        { type: "module" }
      );
      refinementWorkerRef.current.onmessage = (e) => {
        const msg = e.data || {};
        const active = activeRefinementRequestRef.current;
        // Race protection: accept only when generation AND fingerprint match.
        if (!active) return;
        if (msg.generation !== active.generation) return;
        if (msg.fingerprint !== active.fingerprint) return;
        if (active.fingerprint !== currentFingerprintRef.current) return;
        if (active.generation !== geometryGenerationRef.current) return;
        if (active.generation < lastValidGenerationRef.current) return;

        if (msg.type === "complete") {
          // Refined result replaces preview for the same fingerprint (same generation).
          lastValidResultRef.current = msg.result;
          lastValidFingerprintRef.current = active.fingerprint;
          lastValidQualityRef.current = "refined";
          lastValidGenerationRef.current = active.generation;
          setResult(msg.result);
          setQuality("refined");
          setRefinementDurationMs(msg.result?.calculationDurationMs ?? null);
          setCalculationDurationMs(msg.result?.calculationDurationMs ?? null);
          setCompletedAt(Date.now());
          setErrorMessage(null);
          setStatus("ready");
          setIsRefining(false);
        } else if (msg.type === "error") {
          // Refinement error — keep the preview visible, just clear isRefining.
          setIsRefining(false);
          setErrorMessage(msg.error || "Refinement error");
        }
      };
      refinementWorkerRef.current.onerror = (e) => {
        const active = activeRefinementRequestRef.current;
        if (!active || active.fingerprint !== currentFingerprintRef.current ||
            active.generation !== geometryGenerationRef.current) return;
        setIsRefining(false);
        setErrorMessage(e?.message || "Refinement worker error");
      };
    }
    return refinementWorkerRef.current;
  }, []);

  // Main effect: when the fingerprint changes, increment the generation,
  // cancel in-flight REFINEMENT only, then schedule preview and refinement.
  // The preview worker is NOT terminated. Completion admission preserves
  // display order within a drag, then the latest pending geometry is posted.
  useLayoutEffect(() => {
    // Commit these guards before a worker message can observe a newly rendered
    // design with the old admission rules.
    const requestedFingerprint = followCurrentGeometry ? geometryFingerprint : analysisRequestFingerprint;
    const enabled = !!geometryFingerprint && !!analysisRequestId &&
      requestedFingerprint === geometryFingerprint;
    const interactionKey = JSON.stringify([previewContextKey, interactionActive, enabled]);
    if (interactionRef.current.key !== interactionKey) {
      interactionRef.current = {
        key: interactionKey, epoch: interactionRef.current.epoch + 1,
        dragging: enabled && interactionActive && !!previewContextKey,
      };
    }
    interactionReaderRef.current = isInteractionActive;
    // Clear the refinement debounce only. The preview debounce is coalesced
    // (see below) and is NOT cleared here — a single timer fires with the
    // latest geometry.
    if (refinementTimerRef.current) {
      clearTimeout(refinementTimerRef.current);
      refinementTimerRef.current = null;
    }

    // IMMEDIATELY increment the geometry generation and store the new fingerprint.
    // Refined/settled acceptance tracks this exact generation. While dragging,
    // earlier completed previews may display only in increasing request order.
    const gen = ++geometryGenerationRef.current;
    currentFingerprintRef.current = geometryFingerprint;

    // Terminate the REFINEMENT worker only. The preview worker stays persistent
    // during continuous dragging — terminating it mid-computation causes worker
    // starvation.
    if (refinementWorkerRef.current) {
      refinementWorkerRef.current.terminate();
      refinementWorkerRef.current = null;
    }
    activeRefinementRequestRef.current = null;
    setIsRefining(false);

    // Store the latest payload so the coalesced debounce timer and any pending
    // request carry the newest geometry, not the one that armed the timer.
    const basePayload = { ...canonicalInputs, subsForSimulation };
    previewPayloadRef.current = { basePayload, previewPhysicsOptions };

    if (!enabled) {
      // Invalid — clear any pending preview and the debounce timer. An in-flight
      // preview (if any) completes later and is discarded by the generation check.
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      previewPendingRef.current = null;
      setStatus("idle");
      return;
    }

    // Only a refined exact cache hit is complete. A cached preview still
    // needs refinement for the settled geometry.
    if (lastValidFingerprintRef.current === geometryFingerprint && lastValidResultRef.current && lastValidQualityRef.current === "refined") {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      previewPendingRef.current = null;
      setStatus("ready");
      setResult(lastValidResultRef.current);
      setQuality(lastValidQualityRef.current);
      lastValidGenerationRef.current = gen;
      return;
    }

    // Mark as calculating (previous result stays visible via `result` state).
    setStatus("calculating");

    const fp = geometryFingerprint;
    const message = {
      generation: gen,
      fingerprint: fp,
      quality: "preview",
      payload: { ...basePayload, physicsOptions: previewPhysicsOptions, pointsPerOctave: PREVIEW_POINTS_PER_OCTAVE },
    };

    // If a preview is already in flight, store this as the single replaceable
    // pending request. The in-flight computation is NOT terminated — it
    // completes, is admitted or discarded by the display policy, then this
    // pending request is posted.
    if (activePreviewRequestRef.current) {
      previewPendingRef.current = { generation: gen, fingerprint: fp, message, epoch: interactionRef.current.epoch, dragging: interactionRef.current.dragging };
    } else if (!previewTimerRef.current) {
      // No in-flight and no debounce armed: start ONE coalesced debounce timer.
      // The timer is NOT reset by intermediate geometry changes — it fires once
      // with the latest geometry (read from refs), coalescing rapid drag
      // coordinates within the debounce window into a single preview post.
      previewTimerRef.current = setTimeout(() => {
        postLatestPreview();
      }, PREVIEW_DEBOUNCE_MS);
    }
    // If a debounce timer is already armed and no preview is in flight, leave
    // it running — it will fire with the latest geometry (refs already updated).

    // Stage 2: Refinement timer (~280 ms debounce after geometry stabilises).
    // This timer IS reset on every geometry change (via the cleanup below), so
    // refinement only fires once geometry has settled.
    refinementTimerRef.current = setTimeout(() => {
      if (currentFingerprintRef.current !== fp) return;
      if (geometryGenerationRef.current !== gen) return;

      const worker = ensureRefinementWorker();
      if (!worker) return;

      activeRefinementRequestRef.current = { generation: gen, fingerprint: fp };
      setIsRefining(true);
      setRequestedAt(Date.now());
      worker.postMessage({
        generation: gen,
        fingerprint: fp,
        quality: "refined",
        payload: { ...basePayload, physicsOptions },
      });
    }, REFINEMENT_DEBOUNCE_MS);

    // Cleanup: clear ONLY the refinement timer. The preview debounce timer is
    // deliberately left running so it coalesces the next geometry change.
    return () => {
      if (refinementTimerRef.current) {
        clearTimeout(refinementTimerRef.current);
        refinementTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryFingerprint, analysisRequestId, analysisRequestFingerprint, followCurrentGeometry, interactionActive, previewContextKey, isInteractionActive]);

  // Cleanup on unmount — terminate both workers and clear both timers.
  useEffect(() => {
    return () => {
      if (previewWorkerRef.current) {
        previewWorkerRef.current.terminate();
        previewWorkerRef.current = null;
      }
      if (refinementWorkerRef.current) {
        refinementWorkerRef.current.terminate();
        refinementWorkerRef.current = null;
      }
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (refinementTimerRef.current) {
        clearTimeout(refinementTimerRef.current);
        refinementTimerRef.current = null;
      }
      activePreviewRequestRef.current = null;
      previewPendingRef.current = null;
    };
  }, []);

  return {
    status,
    result,
    geometryFingerprint,
    requestedAt,
    completedAt,
    calculationDurationMs,
    errorMessage,
    isUpdating: status === "calculating",
    quality,
    isRefining,
    previewDurationMs,
    refinementDurationMs,
  };
}