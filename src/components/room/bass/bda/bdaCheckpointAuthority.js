// bdaCheckpointAuthority.js
//
// Shared BDA-level authority for the safe bass design experimentation workflow.
//
// Two responsibilities:
//   1. captureBeforeApply — capture the previous-design checkpoint immediately
//      BEFORE an Apply operation mutates the physical bass design. Enforces the
//      capture rule: only capture when the current design is coherent.
//   2. restorePreviousDesign — the ordered authority transaction that restores
//      the physical design, promotes the matching cached bass result, and
//      repoints the engineering publication pointer.
//
// This module reuses existing authority machinery:
//   - publishCachedCompactBassContract (completedBassResultStore)
//   - publishEngineering / readPublishedEngineering (backend functions)
//   - computeEngineeringFingerprint (engineeringFingerprint)
//
// It does NOT change acoustic maths, optimiser maths, fingerprints, or
// calculation publication rules.

import { useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  captureCheckpoint,
  markCheckpointIncludesSeating,
  getCheckpoint,
  clearCheckpoint,
} from "./previousDesignCheckpoint";
import {
  publishCachedCompactBassContract,
  isAuthoritativeBassContract,
} from "@/components/room/bass/completedBassResultStore";
import { ENGINEERING_AUTHORITY_VERSION } from "@/components/proposal/engineeringAuthority";
import { ENGINEERING_SNAPSHOT_VERSION } from "@/components/proposal/engineeringAuthority/buildEngineeringSnapshot";
import { ENGINEERING_SUMMARY_SCHEMA_VERSION } from "@/components/engineering/engineeringSummaryAuthority";
import {
  INSTANCE_AUTHORITY_VERSION,
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";
import {
  computeEngineeringFingerprint,
} from "@/components/proposal/engineeringAuthority/engineeringFingerprint";

// ── Engineering fingerprint from appState ─────────────────────────────────
// Mirrors the designState construction in RoomDesigner.jsx so the checkpoint
// engineering fingerprint matches the one used by useEngineeringPublicationEffect.

function buildEngineeringDesignState(appState) {
  if (!appState) return null;
  return {
    roomDims: appState.roomDims,
    roomOrientation: appState.roomOrientation,
    screenWall: appState.screenWall,
    seatingPositions: appState.seatingPositions,
    rowSpacingM: appState.rowSpacingM,
    seatsPerRowByRow: appState.seatsPerRowByRow,
    seatingBlockOffset: appState.seatingBlockOffset,
    mlpBasis: appState.mlpBasis,
    linkEarPlatformHeights: appState.linkEarPlatformHeights,
    selectedSpeakersByRole: appState.selectedSpeakersByRole,
    globalSurroundModel: appState.globalSurroundModel,
    sevenBedLayoutType: appState.sevenBedLayoutType,
    enableFrontWides: appState.enableFrontWides,
    extraSurroundCount: appState.extraSurroundCount,
    overheadGlobalModel: appState.overheadGlobalModel,
    overheadFrontOverride: appState.overheadFrontOverride,
    overheadMidOverride: appState.overheadMidOverride,
    overheadRearOverride: appState.overheadRearOverride,
    useFrontGlobal: appState.useFrontGlobal,
    useMidGlobal: appState.useMidGlobal,
    useRearGlobal: appState.useRearGlobal,
    subwooferInstances: appState.subwooferInstances,
    screen: appState.screen,
    screenFrontPlaneM: appState.screenFrontPlaneM,
    lcrAimMode: appState.lcrAimMode,
    rspMode: appState.rspMode,
    manualRspX_m: appState.manualRspX_m,
    manualRspY_m: appState.manualRspY_m,
    designatedRspSeatId: appState.designatedRspSeatId,
    splConfig: appState.splConfig,
    targetSpl: appState.targetSpl,
    assumedP15Level: appState.assumedP15Level,
    assumedP21Level: appState.assumedP21Level,
    p15ConstructionLevel: appState.p15ConstructionLevel,
    acousticTreatmentEnabled: appState.acousticTreatmentEnabled,
    selectedAbfuserQty: appState.selectedAbfuserQty,
    aimFrontWidesAtMLP: appState.aimFrontWidesAtMLP,
    aimRearSurroundsAtMLP: appState.aimRearSurroundsAtMLP,
    aimSideSurroundsAtMLP: appState.aimSideSurroundsAtMLP,
  };
}

function computeEngFingerprint(appState) {
  const ds = buildEngineeringDesignState(appState);
  if (!ds) return null;
  return computeEngineeringFingerprint(ds, {
    engineVersion: ENGINEERING_AUTHORITY_VERSION,
    rp22Version: String(RP22_BASS_METRIC_SCHEMA_VERSION),
    algorithmVersion: String(BASS_ANALYSIS_CONTRACT_VERSION),
    instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
    summarySchemaVersion: ENGINEERING_SUMMARY_SCHEMA_VERSION,
  });
}

// ── Capture rule ──────────────────────────────────────────────────────────

/**
 * Capture the previous-design checkpoint if the current design is coherent.
 *
 * COHERENT means:
 *   - completedBassAuthority.authoritative === true  (COMPLETE / AUTHORITATIVE)
 *   - completedBassAuthority.contract.job.resultFingerprint exists
 *   - completedBassAuthority.currentFingerprint === resultFingerprint
 *     (the authority is for the CURRENT physical design, not a stale one)
 *
 * If the current design is NOT coherent (stale/updating/failed), this is a
 * no-op. A failed experiment cannot destroy the last known-good restore point.
 */
export function captureBeforeApply(projectId, versionId, {
  appState,
  completedBassAuthority,
  includesSeating = false,
}) {
  if (!projectId || !versionId || !appState) return false;

  // Coherence check — only capture a known-good state.
  if (!completedBassAuthority?.authoritative) return false;
  if (!completedBassAuthority?.contract?.job?.resultFingerprint) return false;
  const bassFp = completedBassAuthority.contract.job.resultFingerprint;
  if (completedBassAuthority.currentFingerprint !== bassFp) return false;

  const engineeringFingerprint = computeEngFingerprint(appState);
  if (!engineeringFingerprint) return false;

  return captureCheckpoint(projectId, versionId, {
    subwooferInstances: appState.subwooferInstances,
    seatingPositions: appState.seatingPositions,
    bassFingerprint: bassFp,
    engineeringFingerprint,
    includesSeating,
  });
}

// ── Restore ────────────────────────────────────────────────────────────────

const RESTORE_POLL_MS = 100;
const RESTORE_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a cached compact contract from ProjectAnalysisCache.completed_by_fingerprint
 * by bass fingerprint. Returns the compact contract or null.
 */
async function fetchCachedCompactContract(projectId, versionId, bassFingerprint) {
  try {
    const records = await base44.entities.ProjectAnalysisCache.filter(
      { project_id: projectId, version_id: versionId },
      "-updated_date",
      1,
    );
    const record = Array.isArray(records) ? records[0] : null;
    if (!record?.completed_by_fingerprint) return null;
    const entry = record.completed_by_fingerprint[bassFingerprint];
    if (!entry) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Repoint ProjectVersion.published_fingerprint to an existing engineering
 * publication via the idempotent publishEngineering backend.
 *
 * First confirms the publication exists via readPublishedEngineering. If it
 * does, calls publishEngineering with the existing engineering_summary so the
 * backend hits the idempotent path (no duplicate publication, pointer updated).
 *
 * If the publication does NOT exist, this is a no-op — we do NOT fabricate a
 * new publication. The debounced useEngineeringPublicationEffect will handle
 * it eventually once the design rating recomputes.
 */
async function repointEngineeringPublication(projectId, versionId, engineeringFingerprint, bassFingerprint) {
  try {
    // 1. Confirm the existing publication is available.
    const readRes = await base44.functions.invoke("readPublishedEngineering", {
      project_id: projectId,
      version_id: versionId,
      engineering_fingerprint: engineeringFingerprint,
    });
    const readData = readRes?.data || readRes;
    if (readData?.status !== "published" || !readData?.publication) {
      return { ok: false, reason: "publication-not-found" };
    }

    // 2. Repoint via the idempotent publishEngineering path.
    //    Pass the existing engineering_summary so the backend idempotent hit
    //    ignores it and only updates the pointer.
    await base44.functions.invoke("publishEngineering", {
      project_id: projectId,
      version_id: versionId,
      engineering_summary: readData.publication.engineering_summary,
      engineering_fingerprint: engineeringFingerprint,
      engine_version: readData.publication.engine_version || ENGINEERING_AUTHORITY_VERSION,
      rp22_version: readData.publication.rp22_version || String(RP22_BASS_METRIC_SCHEMA_VERSION),
      algorithm_version: readData.publication.algorithm_version || String(BASS_ANALYSIS_CONTRACT_VERSION),
      publication_reason: "restore-previous-design",
      provenance: {
        snapshot_version: ENGINEERING_SNAPSHOT_VERSION,
        instance_authority_version: INSTANCE_AUTHORITY_VERSION,
        summary_schema_version: ENGINEERING_SUMMARY_SCHEMA_VERSION,
        bass_fingerprint: bassFingerprint || null,
        restore: true,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "publish-failed", error: err?.message || String(err) };
  }
}

/**
 * Wait until the live bass fingerprint (shared.cacheKey) matches the target.
 */
async function waitForBassFingerprint(sharedRef, targetFingerprint) {
  if (!targetFingerprint) return false;
  const deadline = Date.now() + RESTORE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RESTORE_POLL_MS);
    const live = sharedRef?.current;
    const liveFp = live?.cacheKey || live?.completedBassAuthority?.currentFingerprint || null;
    if (liveFp === targetFingerprint) return true;
  }
  return false;
}

/**
 * Restore the previous design — the ordered authority transaction.
 *
 * STEP A — Restore physical state (commitInstances + commitSeating)
 * STEP B — Wait for live bass fingerprint to match checkpoint
 * STEP C — Find + promote cached bass result via publishCachedCompactBassContract
 * STEP D — Repoint engineering publication pointer via publishEngineering
 *
 * @returns {Object} { ok, reason?, physicalRestored? }
 */
export async function restorePreviousDesign(projectId, versionId, {
  commitInstances,
  commitSeating,
  sharedRef,
}) {
  const checkpoint = getCheckpoint(projectId, versionId);
  if (!checkpoint) return { ok: false, reason: "no-checkpoint" };

  // STEP A — Restore physical state
  try {
    if (typeof commitInstances === "function") {
      commitInstances(checkpoint.subwooferInstances, {
        front: { placementMode: "manual", isManual: true },
        rear: { placementMode: "manual", isManual: true },
      });
    }
    if (checkpoint.includesSeating && typeof commitSeating === "function") {
      commitSeating(checkpoint.seatingPositions);
    }
  } catch {
    return { ok: false, reason: "physical-restore-failed" };
  }

  // The checkpoint has served its primary purpose (physical restore).
  // Clear it now — the physical design is restored; bass promotion + pointer
  // repoint are consequences, not the checkpoint itself.
  clearCheckpoint(projectId, versionId);

  // STEP B — Wait for the live bass fingerprint to match the checkpoint
  const fingerprintReady = await waitForBassFingerprint(sharedRef, checkpoint.bassFingerprint);
  if (!fingerprintReady) {
    return { ok: false, reason: "fingerprint-not-ready", physicalRestored: true };
  }

  // STEP C — Find + promote cached bass result
  const cachedContract = await fetchCachedCompactContract(projectId, versionId, checkpoint.bassFingerprint);
  if (!cachedContract || !isAuthoritativeBassContract(cachedContract)) {
    // CACHE MISS — physical restored, bass authority is STALE.
    // Do NOT fabricate the old result. Do NOT silently use Result B.
    return { ok: false, reason: "cache-miss", physicalRestored: true };
  }

  const promoted = publishCachedCompactBassContract(
    projectId, versionId, cachedContract, checkpoint.bassFingerprint,
  );
  if (!promoted) {
    return { ok: false, reason: "promotion-failed", physicalRestored: true };
  }

  // STEP D — Restore engineering publication pointer
  await repointEngineeringPublication(
    projectId, versionId, checkpoint.engineeringFingerprint, checkpoint.bassFingerprint,
  );

  return { ok: true };
}

// ── Hook: checkpointed commit wrappers ────────────────────────────────────

/**
 * Wraps commitInstances and commitSeating so the previous-design checkpoint
 * is captured BEFORE the first commit in an apply batch.
 *
 * A microtask-level lock prevents double-capture when both commitInstances
 * and commitSeating are called in the same synchronous apply action
 * (e.g. AdiRecommendation.handleApplySeating).
 *
 * Returns { checkpointedCommitInstances, checkpointedCommitSeating }.
 * Pass these to all BDA children that physically mutate bass design.
 */
export function useCheckpointedCommits({
  projectId,
  versionId,
  appState,
  completedBassAuthority,
  commitInstances,
  commitSeating,
}) {
  const captureLockRef = useRef(false);
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const authorityRef = useRef(completedBassAuthority);
  authorityRef.current = completedBassAuthority;

  const captureNow = useCallback((includesSeating) => {
    if (captureLockRef.current) {
      if (includesSeating) markCheckpointIncludesSeating(projectId, versionId);
      return;
    }
    captureLockRef.current = true;
    captureBeforeApply(projectId, versionId, {
      appState: appStateRef.current,
      completedBassAuthority: authorityRef.current,
      includesSeating,
    });
    // Release the lock at the end of the current microtask so a subsequent
    // commitSeating call in the same synchronous batch is recognised as part
    // of the same apply action.
    Promise.resolve().then(() => { captureLockRef.current = false; });
  }, [projectId, versionId]);

  const checkpointedCommitInstances = useCallback((nextInstances, ...rest) => {
    captureNow(false);
    if (typeof commitInstances === "function") {
      return commitInstances(nextInstances, ...rest);
    }
  }, [captureNow, commitInstances]);

  const checkpointedCommitSeating = useCallback((nextSeating, ...rest) => {
    captureNow(true);
    if (typeof commitSeating === "function") {
      return commitSeating(nextSeating, ...rest);
    }
  }, [captureNow, commitSeating]);

  return { checkpointedCommitInstances, checkpointedCommitSeating };
}