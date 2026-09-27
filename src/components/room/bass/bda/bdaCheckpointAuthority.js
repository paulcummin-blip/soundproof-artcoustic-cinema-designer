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
  getTargetBankSnapshot,
  restoreTargetBankSnapshot,
  setRestoreLock,
} from "@/components/room/bass/p14TargetCache";
import { fireSubwooferDraftReset } from "./subwooferDraftResetStore";
import {
  publishCachedCompactBassContract,
  isAuthoritativeBassContract,
  getCompletedBassAuthority,
} from "@/components/room/bass/completedBassResultStore";
import { getP14TargetBackgroundScheduler } from "@/components/room/bass/p14TargetBackgroundScheduler";
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
  // TEMP DIAG (CAPTURE-DIAG) — diagnostic only, no logic change. Remove after diagnosis.
  const _diag = {
    projectIdPresent: !!projectId,
    versionIdPresent: !!versionId,
    hasAppState: !!appState,
    authoritative: !!completedBassAuthority?.authoritative,
    captureEligible: !!completedBassAuthority?.captureEligible,
    authorityStatus: completedBassAuthority?.authorityStatus || null,
    hasContract: !!completedBassAuthority?.contract?.job?.resultFingerprint,
    currentFingerprint: completedBassAuthority?.currentFingerprint || null,
    contractResultFingerprint: completedBassAuthority?.contract?.job?.resultFingerprint || null,
    currentFingerprintMatchesContract:
      !!completedBassAuthority?.currentFingerprint
      && !!completedBassAuthority?.contract?.job?.resultFingerprint
      && completedBassAuthority.currentFingerprint === completedBassAuthority.contract.job.resultFingerprint,
    contractBaseDesign: completedBassAuthority?.contract?.fingerprints?.baseDesign || null,
    hasEngineeringFingerprint: false,
  };

  if (!projectId || !versionId || !appState) {
    _diag.reason = 'missing projectId/versionId/appState';
    if (typeof console !== 'undefined' && console.log) console.log('[CAPTURE-DIAG] return false', _diag);
    return false;
  }

  // Coherence check — only capture a known-good state.
  // FIX 1: When the authority is STALE but captureEligible is true (cold-open
  // with a valid cached target bank and matching baseDesign), allow the
  // capture. The stale currentFingerprint is from a previous session's move
  // that was returned; the contract is for the current physical design.
  const isCaptureEligible = !!completedBassAuthority?.captureEligible;
  if (!completedBassAuthority?.authoritative && !isCaptureEligible) {
    _diag.reason = '!authoritative && !captureEligible';
    if (typeof console !== 'undefined' && console.log) console.log('[CAPTURE-DIAG] return false', _diag);
    return false;
  }
  if (!completedBassAuthority?.contract?.job?.resultFingerprint) {
    _diag.reason = 'no contract.job.resultFingerprint';
    if (typeof console !== 'undefined' && console.log) console.log('[CAPTURE-DIAG] return false', _diag);
    return false;
  }
  const bassFp = completedBassAuthority.contract.job.resultFingerprint;
  // For an AUTHORITATIVE authority, the currentFingerprint must match the
  // contract fingerprint (the authority is for the current physical design).
  // For a captureEligible STALE authority, the currentFingerprint is expected
  // to differ (that's what makes it STALE) — skip this check since the
  // captureEligible flag already verified the contract's baseDesign matches.
  if (completedBassAuthority.authoritative && completedBassAuthority.currentFingerprint !== bassFp) {
    _diag.reason = 'authoritative && currentFingerprint !== contractResultFingerprint';
    if (typeof console !== 'undefined' && console.log) console.log('[CAPTURE-DIAG] return false', _diag);
    return false;
  }

  const engineeringFingerprint = computeEngFingerprint(appState);
  _diag.hasEngineeringFingerprint = !!engineeringFingerprint;
  if (!engineeringFingerprint) {
    _diag.reason = 'no engineeringFingerprint';
    if (typeof console !== 'undefined' && console.log) console.log('[CAPTURE-DIAG] return false', _diag);
    return false;
  }

  // Fix 2: capture the target bank snapshot alongside the physical design so
  // restore can recover 8/8 targets without a full background recalculation.
  const targetBank = getTargetBankSnapshot(projectId, versionId);
  const _captured = captureCheckpoint(projectId, versionId, {
    subwooferInstances: appState.subwooferInstances,
    seatingPositions: appState.seatingPositions,
    bassFingerprint: bassFp,
    engineeringFingerprint,
    includesSeating,
    baseDesignFingerprint: targetBank?.baseDesignFingerprint || null,
    targetBankSnapshot: targetBank?.targets || null,
    targetBankCount: targetBank?.count || 0,
  });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[CAPTURE-DIAG] success', { ..._diag, captured: !!_captured, targetBankCount: targetBank?.count || 0 });
  }
  return _captured;
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

  // STEP 0 — Cancel the background P14 scheduler to prevent stale workers
  // from the moved design from completing and overwriting the restored
  // target bank (FIX 1). The scheduler will be re-scheduled by the normal
  // effect after the restore, with the restored baseDesignFingerprint.
  // Since the restored bank has 8/8 targets, the scheduler will skip all.
  try {
    getP14TargetBackgroundScheduler().cancel();
  } catch { /* non-fatal — scheduler may not exist yet */ }

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
    // Fix 4: physical restore failed — KEEP the checkpoint so the designer
    // can retry. Do not clear it.
    return { ok: false, reason: "physical-restore-failed" };
  }

  // Fix 5: clear stale draft/preview positions so the plan redraws from the
  // restored canonical positions immediately.
  fireSubwooferDraftReset(projectId, versionId);

  // STEP B — Wait for the live bass fingerprint to match the checkpoint.
  // Fix 4: the checkpoint is KEPT during this wait so a re-render or retry
  // still has the restore point. It is only cleared on full success or when
  // the physical design was restored but bass cannot be promoted (stale
  // checkpoint that points to the now-current design).
  const fingerprintReady = await waitForBassFingerprint(sharedRef, checkpoint.bassFingerprint);
  if (!fingerprintReady) {
    clearCheckpoint(projectId, versionId);
    return { ok: false, reason: "fingerprint-not-ready", physicalRestored: true };
  }

  // STEP C — Find + promote cached bass result
  const cachedContract = await fetchCachedCompactContract(projectId, versionId, checkpoint.bassFingerprint);
  if (!cachedContract || !isAuthoritativeBassContract(cachedContract)) {
    // CACHE MISS — physical restored, bass authority is STALE.
    clearCheckpoint(projectId, versionId);
    return { ok: false, reason: "cache-miss", physicalRestored: true };
  }

  const promoted = publishCachedCompactBassContract(
    projectId, versionId, cachedContract, checkpoint.bassFingerprint,
  );
  if (!promoted) {
    clearCheckpoint(projectId, versionId);
    return { ok: false, reason: "promotion-failed", physicalRestored: true };
  }

  // STEP C2 — Restore the target bank snapshot (Fix 2) so 8/8 targets are
  // immediately available without a full background recalculation.
  if (checkpoint.targetBankSnapshot && checkpoint.baseDesignFingerprint) {
    restoreTargetBankSnapshot(
      projectId, versionId,
      checkpoint.baseDesignFingerprint,
      checkpoint.targetBankSnapshot,
    );
    // FIX 2: Set a restore lock that protects the restored bank from being
    // wiped by transient baseDesignFingerprint transitions or stale background
    // workers. The lock is released by BassBackgroundAnalysisOwner when
    // coherence is observed (baseDesign matches, completed authority matches,
    // effectiveContract matches, target bank count matches).
    setRestoreLock(projectId, versionId, {
      baseDesignFingerprint: checkpoint.baseDesignFingerprint,
      targetCount: checkpoint.targetBankCount || 0,
      bassFingerprint: checkpoint.bassFingerprint,
    });
  }

  // STEP E — Verify coherence (FIX 5): the published authority must be
  // AUTHORITATIVE and match the checkpoint's bass fingerprint. If not, keep
  // the checkpoint so the designer can retry — do NOT show "Performance is
  // current" over an incoherent state.
  const authority = getCompletedBassAuthority(projectId, versionId);
  if (!authority?.authoritative
    || authority?.contract?.job?.resultFingerprint !== checkpoint.bassFingerprint) {
    return { ok: false, reason: "authority-not-coherent", physicalRestored: true };
  }

  // STEP D — Restore engineering publication pointer
  await repointEngineeringPublication(
    projectId, versionId, checkpoint.engineeringFingerprint, checkpoint.bassFingerprint,
  );

  // Fix 4: full success — now clear the checkpoint.
  clearCheckpoint(projectId, versionId);
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