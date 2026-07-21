// useNormalizedRoomTransferLive.js — Phase 2B: Live-result hook for the
// normalized room-transfer engine, with a two-stage calculation.
//
// Stage 1 — Interactive preview:
//   - Starts after ~50 ms debounce.
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
// The fast preview is for interaction. The refined result is the authoritative
// room-response curve. The previous valid curve stays visible while the next
// preview or refinement runs.
//
// Race protection uses a single geometry generation counter shared across both
// stages. The generation is incremented immediately when geometry changes.
// Preview and refined results are accepted only when BOTH generation and
// fingerprint match the current values. A refined result may replace a preview
// only for the same fingerprint (same generation). Older refinement results
// never overwrite a newer preview. Model-only changes (same fingerprint) queue
// neither preview nor refinement.
//
// Worker blocking prevention: separate preview and refinement workers are used.
// The refinement worker is terminated immediately when geometry changes, so a
// long refinement never delays the next interactive preview. The preview worker
// is reused across calculations. Both workers are terminated on unmount.
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

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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

export function useNormalizedRoomTransferLive({ roomDims, rspPosition, seatingPositions, subsForSimulation, physicsOptions }) {
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

  // Preview worker — reused across calculations (fast, short-lived jobs).
  const previewWorkerRef = useRef(null);
  // Refinement worker — terminated on geometry change, recreated on next refinement.
  const refinementWorkerRef = useRef(null);

  // Single geometry generation counter — shared across preview and refinement.
  // Incremented IMMEDIATELY when geometry changes, before any debounce.
  const geometryGenerationRef = useRef(0);

  // The latest requested fingerprint — updated IMMEDIATELY when the fingerprint
  // changes, before the debounce. An in-flight worker response must match this
  // to be accepted.
  const currentFingerprintRef = useRef(null);

  // Active posted requests { generation, fingerprint }. Set when a worker is
  // posted, cleared immediately when a newer generation supersedes it.
  const activePreviewRequestRef = useRef(null);
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

  // Lazily create the preview worker (reused across calculations).
  const ensurePreviewWorker = useCallback(() => {
    if (!previewWorkerRef.current && typeof Worker !== "undefined") {
      previewWorkerRef.current = new Worker(
        new URL("./normalizedRoomTransfer.worker.js", import.meta.url),
        { type: "module" }
      );
      previewWorkerRef.current.onmessage = (e) => {
        const msg = e.data || {};
        const active = activePreviewRequestRef.current;
        // Race protection: accept only when generation AND fingerprint match
        // the current values. An old preview from a previous generation is
        // discarded even if it completes during the debounce.
        if (!active) return;
        if (msg.generation !== active.generation) return;
        if (msg.fingerprint !== active.fingerprint) return;
        if (active.fingerprint !== currentFingerprintRef.current) return;
        if (active.generation !== geometryGenerationRef.current) return;

        if (msg.type === "complete") {
          // A preview is accepted only if no refined result for this generation
          // has already been accepted (refined > preview). Since both share the
          // same generation, if lastValidGenerationRef === active.generation and
          // lastValidQualityRef === "refined", the refined result is newer — skip.
          if (lastValidGenerationRef.current === active.generation &&
              lastValidQualityRef.current === "refined") return;

          lastValidResultRef.current = msg.result;
          lastValidFingerprintRef.current = active.fingerprint;
          lastValidQualityRef.current = "preview";
          lastValidGenerationRef.current = active.generation;
          setResult(msg.result);
          setQuality("preview");
          setPreviewDurationMs(msg.result?.calculationDurationMs ?? null);
          setCalculationDurationMs(msg.result?.calculationDurationMs ?? null);
          setCompletedAt(Date.now());
          setErrorMessage(null);
          setStatus("ready");
        } else if (msg.type === "error") {
          setErrorMessage(msg.error || "Unknown error");
          setStatus("error");
        }
      };
      previewWorkerRef.current.onerror = (e) => {
        const active = activePreviewRequestRef.current;
        if (!active || active.fingerprint !== currentFingerprintRef.current ||
            active.generation !== geometryGenerationRef.current) return;
        setErrorMessage(e?.message || "Preview worker error");
        setStatus("error");
      };
    }
    return previewWorkerRef.current;
  }, []);

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
  // cancel all in-flight work, then start preview and refinement timers.
  useEffect(() => {
    // Clear both debounce timers.
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (refinementTimerRef.current) {
      clearTimeout(refinementTimerRef.current);
      refinementTimerRef.current = null;
    }

    // IMMEDIATELY increment the geometry generation and store the new fingerprint.
    // This invalidates any in-flight preview or refinement response — they will
    // fail the generation check in onmessage and be discarded.
    const gen = ++geometryGenerationRef.current;
    currentFingerprintRef.current = geometryFingerprint;

    // Terminate the active refinement worker immediately so a long refinement
    // never delays the next interactive preview. The preview worker is reused.
    if (refinementWorkerRef.current) {
      refinementWorkerRef.current.terminate();
      refinementWorkerRef.current = null;
    }
    activePreviewRequestRef.current = null;
    activeRefinementRequestRef.current = null;
    setIsRefining(false);

    if (!geometryFingerprint) {
      setStatus("idle");
      return;
    }

    // Same fingerprint as the last completed result — no work needed.
    if (lastValidFingerprintRef.current === geometryFingerprint && lastValidResultRef.current) {
      setStatus("ready");
      setResult(lastValidResultRef.current);
      setQuality(lastValidQualityRef.current);
      return;
    }

    // Mark as calculating (previous result stays visible via `result` state).
    setStatus("calculating");

    const fp = geometryFingerprint;
    const basePayload = { ...canonicalInputs, subsForSimulation };

    // Stage 1: Preview timer (~50 ms debounce).
    previewTimerRef.current = setTimeout(() => {
      // Guard: a newer fingerprint may have superseded us during the debounce.
      if (currentFingerprintRef.current !== fp) return;
      if (geometryGenerationRef.current !== gen) return;

      const worker = ensurePreviewWorker();
      if (!worker) return;

      activePreviewRequestRef.current = { generation: gen, fingerprint: fp };
      setRequestedAt(Date.now());
      worker.postMessage({
        generation: gen,
        fingerprint: fp,
        quality: "preview",
        payload: { ...basePayload, physicsOptions: previewPhysicsOptions, pointsPerOctave: PREVIEW_POINTS_PER_OCTAVE },
      });
    }, PREVIEW_DEBOUNCE_MS);

    // Stage 2: Refinement timer (~280 ms debounce after geometry stabilises).
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

    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (refinementTimerRef.current) {
        clearTimeout(refinementTimerRef.current);
        refinementTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryFingerprint]);

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