// selectedCombinationPreview.js
// Canonical live preview for the selected combination of bass improvements.
//
// Replaces the naive field-overlay merge with a real canonical confirmation:
//   selected changes → chained retune → canonical confirmation → live seat preview
//
// Reuses cached raw transfers. Does NOT rerun Stage 1 or the full optimiser.
// Does NOT mutate the project.
//
// Only the selected calibration levers are retuned, chained in deterministic
// order: phase → delay → gain. Each search builds on the previous result's
// tuning. Unselected levers are not searched.

import { runInWorker, isFatalLifecycleError } from "./improveBassV2WorkerLifecycle.js";
import { bindTuningToSourceIds } from "./improveBassV2ApplyCalibration.js";
import { RECOMMENDATION_CONTRACT_VERSION } from "./confirmedCandidateValidity.js";
import { STAGE2_CANONICAL_VERSION } from "../stage2/stage2Constants.js";
import {
  setPreviewState, nextPreviewGeneration, getPreviewGeneration,
} from "./selectedCombinationPreviewStore.js";

const previewCache = new Map();
const CALIBRATION_ORDER = ["phase", "delay", "gain"];
const AUTHORITY_VERSION = `${RECOMMENDATION_CONTRACT_VERSION}:${STAGE2_CANONICAL_VERSION}`;

function buildCacheKey(fingerprint, sortedKeys, geometryKey) {
  return `${fingerprint}::${sortedKeys}::${geometryKey}::${AUTHORITY_VERSION}`;
}

function getSelectedCalibrationLevers(selectedKeys) {
  return CALIBRATION_ORDER.filter((k) => selectedKeys.has(k));
}

function getGeometryKey(selectedKeys, selection) {
  const useSeating = selectedKeys.has("seating");
  const usePosition = selectedKeys.has("subPositions");
  if (useSeating && usePosition) return "seating+pos";
  if (useSeating) return `seating:${selection?.seatingResult?.seatingOffsetMm || 0}`;
  if (usePosition) {
    const posResults = (selection?.confirmedResults || []).filter(
      (r) => r?.isPositionCandidate && r.candidateKind !== "current",
    );
    return `pos:${posResults[0]?.candidateId || "unknown"}`;
  }
  return "current";
}

function getRawTransferForGeometry(selectedKeys, selection) {
  const useSeating = selectedKeys.has("seating");
  const usePosition = selectedKeys.has("subPositions");
  const transfers = selection?.previewRawTransfers || {};
  if (useSeating && usePosition) return null; // needs computation
  if (useSeating) return transfers.seating || null;
  if (usePosition) return transfers.position || null;
  return transfers.current || null;
}

function findBestPositionResult(selection) {
  const posResults = (selection?.confirmedResults || []).filter(
    (r) => r?.isPositionCandidate && r.candidateKind !== "current",
  );
  return posResults[0] || null;
}

/**
 * Run a canonical live preview for the selected combination of improvements.
 *
 * @param {object} params - See component props for details.
 * @returns {Promise<object|null>} The confirmed canonical result, or null on error/cancel.
 */
export async function runSelectedCombinationPreview(params) {
  const {
    projectId, versionId, selection, selectedKeys,
    currentDesignFingerprint,
    roomDims, subwooferInstances, rspPosition,
    selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
    seatingPositions, p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    signal,
  } = params;

  const gen = nextPreviewGeneration(projectId, versionId);
  const isLatest = () => getPreviewGeneration(projectId, versionId) === gen && !signal?.aborted;

  // ── Check cache ──────────────────────────────────────────────────────
  const sortedKeys = Array.from(selectedKeys).sort().join(",");
  const geometryKey = getGeometryKey(selectedKeys, selection);
  const cacheKey = buildCacheKey(currentDesignFingerprint, sortedKeys, geometryKey);
  const cached = previewCache.get(cacheKey);
  if (cached) {
    if (isLatest()) {
      setPreviewState(projectId, versionId, {
        status: "complete", result: cached, selectedKeys, progress: null, error: null,
      });
    }
    return cached;
  }

  const useSeating = selectedKeys.has("seating");
  const usePosition = selectedKeys.has("subPositions");
  const calibrationLevers = getSelectedCalibrationLevers(selectedKeys);
  const sourceIds = (subwooferInstances || []).filter((s) => s.enabled !== false).map((s) => s.id);
  const totalStages = calibrationLevers.length + 1; // +1 for confirmation

  const worker = new Worker(new URL("./improveBassV2.worker.js", import.meta.url), { type: "module" });

  try {
    // ── 1. Get rawTransfer for the selected geometry ───────────────────
    let rawTransfer = getRawTransferForGeometry(selectedKeys, selection);

    // Combined geometry (seating + position) — compute new rawTransfer
    if (useSeating && usePosition && !rawTransfer) {
      if (isLatest()) {
        setPreviewState(projectId, versionId, {
          status: "preparing", selectedKeys,
          progress: { stage: "preparing", label: "Preparing selected geometry", current: 0, total: totalStages },
        });
      }
      const bestPos = findBestPositionResult(selection);
      if (!bestPos) {
        if (isLatest()) {
          setPreviewState(projectId, versionId, { status: "error", error: "No position candidate available", selectedKeys });
        }
        return null;
      }
      const coords = bestPos.positionCoordinates || bestPos.coordinates || [];
      const W = Number(roomDims?.widthM) || 0;
      const L = Number(roomDims?.lengthM) || 0;
      if (!W || !L || !coords.length) {
        if (isLatest()) {
          setPreviewState(projectId, versionId, { status: "error", error: "Invalid geometry for combined preview", selectedKeys });
        }
        return null;
      }
      const finalist = {
        id: "preview-combined",
        familyId: "preview",
        sources: coords.map((c) => ({ xNorm: Number(c.x) / W, yNorm: Number(c.y) / L })),
      };
      const seatingPos = selection?.seatingResult?.seatingPositions || seatingPositions;
      rawTransfer = await runInWorker(worker, "placement", {
        finalist, roomDims, rspPosition, seatingPositions: seatingPos,
        selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
      }, signal);
      if (signal?.aborted) return null;
    }

    if (!rawTransfer?.perSourcePerSeatComplexTransfers?.length) {
      if (isLatest()) {
        setPreviewState(projectId, versionId, { status: "error", error: "No raw transfer available for selected geometry", selectedKeys });
      }
      return null;
    }

    // ── 2. Chained retune of selected calibration levers ──────────────
    // Order: phase → delay → gain. Each builds on the previous result.
    const baseline = selection?.currentResult?.appliedTuning || [];
    let tuning = baseline;

    for (let i = 0; i < calibrationLevers.length; i++) {
      if (signal?.aborted) return null;
      const lever = calibrationLevers[i];
      const workerPhase = lever === "phase" ? "grouped-phase"
        : lever === "delay" ? "grouped-delay"
        : "grouped-gain";
      const label = lever === "phase" ? "Retuning phase"
        : lever === "delay" ? "Retuning delay"
        : "Retuning gain";
      if (isLatest()) {
        setPreviewState(projectId, versionId, {
          status: "retuning", selectedKeys,
          progress: { stage: "retuning", label, current: i + 1, total: totalStages },
        });
      }
      try {
        const searchResult = await runInWorker(worker, workerPhase, {
          rawTransfer, instances: subwooferInstances, roomDims, effectiveBaseline: tuning,
        }, signal);
        if (signal?.aborted) return null;
        const bestTuning = searchResult?.candidates?.[0]?.tuning;
        if (bestTuning) tuning = bestTuning;
      } catch (err) {
        if (isFatalLifecycleError(err)) throw err;
        // Non-fatal: keep current tuning and continue to next lever
      }
    }

    // ── 3. Canonical confirmation ─────────────────────────────────────
    if (isLatest()) {
      setPreviewState(projectId, versionId, {
        status: "confirming", selectedKeys,
        progress: { stage: "confirming", label: "Confirming seat response", current: totalStages, total: totalStages },
      });
    }
    const result = await runInWorker(worker, "confirmation", {
      rawTransfer, tuning, tuningVariant: "delay-polarity-trim",
      p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    }, signal);
    if (signal?.aborted) return null;
    if (!result) {
      if (isLatest()) {
        setPreviewState(projectId, versionId, { status: "error", error: "Canonical confirmation failed", selectedKeys });
      }
      return null;
    }

    // ── 4. Bind result with tuning, positions, seating ────────────────
    const appliedTuning = bindTuningToSourceIds(tuning, sourceIds);
    const bestPos = usePosition ? findBestPositionResult(selection) : null;
    const positions = bestPos?.positionCoordinates || bestPos?.coordinates || null;
    const seatingPos = useSeating ? (selection?.seatingResult?.seatingPositions || null) : null;
    const bound = {
      ...result,
      appliedTuning,
      positionCoordinates: positions,
      seatingPositions: seatingPos,
    };

    // ── 5. Cache ─────────────────────────────────────────────────────
    previewCache.set(cacheKey, bound);

    // ── 6. Publish (only if latest generation) ───────────────────────
    if (isLatest()) {
      setPreviewState(projectId, versionId, {
        status: "complete", result: bound, selectedKeys, progress: null, error: null,
      });
    }
    return bound;
  } catch (err) {
    if (isFatalLifecycleError(err)) {
      if (isLatest()) {
        setPreviewState(projectId, versionId, { status: "cancelled", result: null, progress: null });
      }
      return null;
    }
    if (isLatest()) {
      setPreviewState(projectId, versionId, { status: "error", error: err.message, selectedKeys });
    }
    return null;
  } finally {
    try { worker.terminate(); } catch { /* already terminated */ }
  }
}

export function clearPreviewCache() {
  previewCache.clear();
}