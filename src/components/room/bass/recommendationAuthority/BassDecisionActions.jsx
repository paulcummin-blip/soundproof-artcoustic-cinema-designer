// BassDecisionActions.jsx
// ---------------------------------------------------------------------------
// Recommendation Decision Workflow — the designer-gated interaction layer
// that sits below the Recommendation / Applied Calibration presentation.
//
// This component implements the agreed interaction model:
//
//   When no Applied Calibration exists:
//     → renders nothing (the single-step OptimiseAndCalculate handles it)
//
//   When Applied Calibration exists AND a fresh Recommendation exists:
//     DIFFERS  → Accept Recommendation  +  Continue With Current Design
//     MATCHES  → "Current design matches the recommendation." (no buttons)
//
//   When Recommendation is Stale:
//     → Accept disabled, "Recommendation is stale. Re-optimise required."
//     → Continue With Current Design still available
//
//   When Applied Calibration is Stale:
//     → Recalculate  +  Continue With Current Design  +  Reset
//
// Accept Recommendation:
//   Accept Transition → commit instances → engineering recalculation
//
// Continue With Current Design:
//   Mark User Accepted (if stale) → engineering recalculation from current
//
// No silent mutation. Every action shows its consequence before the click.
// ---------------------------------------------------------------------------

import React, { useCallback, useRef, useState } from "react";
import { Check, AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { useActiveProjectId } from "@/components/state/project-session";
import { useSharedBassResults } from "../bassResultsStore";
import { useRecommendationAuthority } from "./recommendationAuthorityStore";
import { useAppliedCalibrationAuthority } from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore";
import {
  RECOMMENDATION_STATUS,
  RECOMMENDATION_INTENT,
} from "./recommendationAuthority";
import {
  APPLIED_CALIBRATION_STATUS,
  resolveAppliedCalibrationStatus,
  computeAppliedCalibrationBasisFingerprint,
  markAsUserAccepted,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority";
import { acceptRecommendation } from "./acceptTransition";
import {
  resetAppliedCalibrationAuthority,
  setAppliedCalibrationAuthority,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore";

const SLEEP_MS = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Decision states ──────────────────────────────────────────────────────

const DECISION_STATE = {
  NO_CALIBRATION: "no_calibration",
  NO_RECOMMENDATION: "no_recommendation",
  MATCHES: "matches",
  DIFFERS: "differs",
  REC_STALE: "rec_stale",
  CAL_STALE: "cal_stale",
};

// ── Consequence text ─────────────────────────────────────────────────────

const CONSEQUENCE = {
  ACCEPT: "Accepting applies the recommended calibration to your design. The engineering prediction will recalculate from the updated calibration.",
  CONTINUE: "Continuing retains your current calibration. The engineering prediction will recalculate from your current design.",
  RECALCULATE: "Recalculating will update the engineering prediction from your current room and subwoofer layout.",
  RESET: "Resetting clears all calibration from this design. The engineering prediction will recalculate with no calibration applied.",
  STALE_REC: "Recommendation is stale. Re-optimise required.",
};

// ── Pure helpers ─────────────────────────────────────────────────────────

function applyRecommendationToInstances(instances, values) {
  if (!Array.isArray(instances) || !Array.isArray(values)) return instances;
  const byId = new Map(values.map((v) => [String(v.id), v]));
  return instances.map((inst) => {
    const v = byId.get(String(inst.id));
    if (!v) return inst;
    return {
      ...inst,
      delayMs: Number(v.delayMs) || 0,
      gainDb: Number(v.gainDb) || 0,
      polarity: Number(v.polarity) || 1,
      phaseControlDeg: Number(v.phaseControlDeg) || 0,
    };
  });
}

function resetCalibrationInInstances(instances) {
  if (!Array.isArray(instances)) return instances;
  return instances.map((inst) => ({
    ...inst,
    delayMs: 0,
    gainDb: 0,
    polarity: 1,
    phaseControlDeg: 0,
  }));
}

const TOL = 0.05;

function valuesMatch(recValues, appliedValues) {
  if (!Array.isArray(recValues) || !Array.isArray(appliedValues)) return false;
  if (recValues.length !== appliedValues.length) return false;
  const byId = new Map(appliedValues.map((v) => [String(v.id), v]));
  for (const rec of recValues) {
    const ap = byId.get(String(rec.id));
    if (!ap) return false;
    if (Math.abs((Number(rec.delayMs) || 0) - (Number(ap.delayMs) || 0)) > TOL) return false;
    if (Math.abs((Number(rec.gainDb) || 0) - (Number(ap.gainDb) || 0)) > TOL) return false;
    if ((Number(rec.polarity) || 1) !== (Number(ap.polarity) || 1)) return false;
    if (Math.abs((Number(rec.phaseControlDeg) || 0) - (Number(ap.phaseControlDeg) || 0)) > TOL) return false;
  }
  return true;
}

// ── Button component ────────────────────────────────────────────────────

function DecisionButton({ onClick, disabled, inProgress, variant, icon: Icon, children }) {
  const base = "flex-1 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed";
  const variants = {
    accept: "bg-[#213428] text-white hover:bg-[#2a4033] disabled:opacity-45",
    continue: "bg-white text-[#1B1A1A] border border-[#D9D5CE] hover:bg-[#F5F5F0] disabled:opacity-45",
    recalc: "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] hover:bg-[#DBEAFE] disabled:opacity-45",
    reset: "bg-white text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] disabled:opacity-45",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || inProgress}
      className={`${base} ${variants[variant] || variants.continue}`}
    >
      {inProgress ? (
        <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" />
      ) : null}
      {children}
    </button>
  );
}

function ConsequenceText({ children }) {
  return (
    <p className="text-[10px] text-[#625143] leading-relaxed mt-1.5 ml-0.5">
      {children}
    </p>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export default function BassDecisionActions({ appState, commitInstances }) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const shared = useSharedBassResults();
  const { current: recommendation } = useRecommendationAuthority(projectId, versionId);
  const appliedAuthority = useAppliedCalibrationAuthority(projectId, versionId);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState(null);

  const sharedRef = useRef(shared);
  sharedRef.current = shared;

  // ── Current basis fingerprint ──
  const currentBasisFingerprint = React.useMemo(() => {
    try {
      const instances = appState?.subwooferInstances;
      const roomDims = appState?.roomDims;
      if (!Array.isArray(instances) || !roomDims) return null;
      return computeAppliedCalibrationBasisFingerprint({
        subwooferInstances: instances,
        roomDims,
        seatingPositions: appState?.seatingPositions,
        rspPosition: null,
        selectedSubModel: appState?.selectedSubModel,
      });
    } catch {
      return null;
    }
  }, [appState?.subwooferInstances, appState?.roomDims, appState?.seatingPositions, appState?.selectedSubModel]);

  // ── Resolve effective statuses ──
  const recResolved = React.useMemo(() => {
    if (!recommendation) return { status: null, isStale: false };
    const stored = recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED;
    if (stored === RECOMMENDATION_STATUS.STALE) {
      return { status: RECOMMENDATION_STATUS.STALE, isStale: true };
    }
    if (stored === RECOMMENDATION_STATUS.ACCEPTED || stored === RECOMMENDATION_STATUS.SUPERSEDED) {
      return { status: stored, isStale: false };
    }
    if (currentBasisFingerprint && recommendation.geometryFingerprint &&
        recommendation.geometryFingerprint !== currentBasisFingerprint) {
      return { status: RECOMMENDATION_STATUS.STALE, isStale: true };
    }
    return { status: stored, isStale: false };
  }, [recommendation, currentBasisFingerprint]);

  const calResolved = React.useMemo(() => {
    if (!appliedAuthority) return { status: null, isStale: false, staleReason: null };
    if (currentBasisFingerprint) {
      return resolveAppliedCalibrationStatus(appliedAuthority, currentBasisFingerprint);
    }
    return {
      status: appliedAuthority.status || APPLIED_CALIBRATION_STATUS.UNKNOWN,
      isStale: false,
      staleReason: null,
    };
  }, [appliedAuthority, currentBasisFingerprint]);

  // ── Determine decision state ──
  const decisionState = React.useMemo(() => {
    if (!appliedAuthority) return DECISION_STATE.NO_CALIBRATION;
    if (!recommendation) return DECISION_STATE.NO_RECOMMENDATION;
    if (recommendation.intent !== RECOMMENDATION_INTENT.CALIBRATION) return DECISION_STATE.NO_RECOMMENDATION;

    // Stale calibration takes priority — the calibration itself is invalid
    if (calResolved.isStale) return DECISION_STATE.CAL_STALE;
    // Stale recommendation — can't accept, but can continue
    if (recResolved.isStale) return DECISION_STATE.REC_STALE;

    // Both fresh — check if values match
    if (valuesMatch(recommendation.recommendationValues, appliedAuthority.values)) {
      return DECISION_STATE.MATCHES;
    }
    return DECISION_STATE.DIFFERS;
  }, [appliedAuthority, recommendation, recResolved, calResolved]);

  // ── Wait for fingerprint to advance, then recalculate ──
  const waitForFingerprintAndRecalculate = useCallback(async () => {
    const previousCacheKey = sharedRef.current?.cacheKey;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(SLEEP_MS);
      const live = sharedRef.current;
      const advanced = !previousCacheKey
        || (!!live?.cacheKey && live.cacheKey !== previousCacheKey);
      if (advanced && live?.canCalculate === true && typeof live?.onCalculate === "function") {
        return live.onCalculate();
      }
    }
    if (typeof sharedRef.current?.onCalculate === "function") {
      sharedRef.current.onCalculate();
    }
  }, []);

  // ── Accept Recommendation ──
  const handleAccept = useCallback(async () => {
    if (actionInProgress) return;
    setActionInProgress(true);
    setError(null);
    try {
      // 1. Accept Transition (transactional — writes Applied Calibration Authority + Acceptance Record)
      acceptRecommendation(projectId, versionId, {
        currentGeometryFingerprint: currentBasisFingerprint,
      });

      // 2. Commit the recommendation values to subwooferInstances
      if (typeof commitInstances === "function" && recommendation?.recommendationValues) {
        const newInstances = applyRecommendationToInstances(
          appState?.subwooferInstances,
          recommendation.recommendationValues,
        );
        commitInstances(newInstances);
      }

      // 3. Wait for fingerprint advance and trigger engineering recalculation
      await waitForFingerprintAndRecalculate();
    } catch (err) {
      setError(err.message || "Accept failed. The recommendation may be stale.");
    } finally {
      setActionInProgress(false);
    }
  }, [projectId, versionId, currentBasisFingerprint, recommendation, commitInstances, appState?.subwooferInstances, actionInProgress, waitForFingerprintAndRecalculate]);

  // ── Continue With Current Design ──
  const handleContinue = useCallback(async () => {
    if (actionInProgress) return;
    setActionInProgress(true);
    setError(null);
    try {
      // If calibration is stale, mark it as User Accepted (designer's explicit Keep)
      if (calResolved.isStale && appliedAuthority) {
        const userAccepted = markAsUserAccepted(appliedAuthority);
        setAppliedCalibrationAuthority(projectId, versionId, userAccepted);
      }

      // Trigger engineering recalculation from current calibration
      await waitForFingerprintAndRecalculate();
    } catch (err) {
      setError(err.message || "Recalculation failed.");
    } finally {
      setActionInProgress(false);
    }
  }, [projectId, versionId, calResolved.isStale, appliedAuthority, actionInProgress, waitForFingerprintAndRecalculate]);

  // ── Recalculate (stale calibration — trigger recalculation from current design) ──
  const handleRecalculate = useCallback(async () => {
    if (actionInProgress) return;
    setActionInProgress(true);
    setError(null);
    try {
      if (typeof sharedRef.current?.onCalculate === "function") {
        sharedRef.current.onCalculate();
      }
    } catch (err) {
      setError(err.message || "Recalculation failed.");
    } finally {
      setActionInProgress(false);
    }
  }, [actionInProgress]);

  // ── Reset (clear calibration) ──
  const handleReset = useCallback(async () => {
    if (actionInProgress) return;
    setActionInProgress(true);
    setError(null);
    try {
      // 1. Clear Applied Calibration Authority
      resetAppliedCalibrationAuthority(projectId, versionId);

      // 2. Reset calibration values in subwooferInstances
      if (typeof commitInstances === "function") {
        const resetInstances = resetCalibrationInInstances(appState?.subwooferInstances);
        commitInstances(resetInstances);
      }

      // 3. Trigger engineering recalculation
      await waitForFingerprintAndRecalculate();
    } catch (err) {
      setError(err.message || "Reset failed.");
    } finally {
      setActionInProgress(false);
    }
  }, [projectId, versionId, commitInstances, appState?.subwooferInstances, actionInProgress, waitForFingerprintAndRecalculate]);

  // ── Render ──

  // No calibration → single-step workflow handles it
  if (decisionState === DECISION_STATE.NO_CALIBRATION) return null;

  // No recommendation → nothing to decide
  if (decisionState === DECISION_STATE.NO_RECOMMENDATION) return null;

  return (
    <div className="space-y-2.5" data-bass-decision-actions="true">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <Check className="w-3.5 h-3.5 text-[#213428]" />
        <span
          className="text-[12px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Decision
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
            <p className="text-[11px] text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* MATCHES — no buttons needed */}
      {decisionState === DECISION_STATE.MATCHES && (
        <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
            <p className="text-[11px] text-[#1B1A1A] leading-relaxed">
              Current design matches the recommendation.
            </p>
          </div>
        </div>
      )}

      {/* DIFFERS — Accept + Continue */}
      {decisionState === DECISION_STATE.DIFFERS && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <DecisionButton
              onClick={handleAccept}
              disabled={false}
              inProgress={actionInProgress}
              variant="accept"
              icon={Check}
            >
              Accept Recommendation
            </DecisionButton>
            <DecisionButton
              onClick={handleContinue}
              disabled={false}
              inProgress={actionInProgress}
              variant="continue"
            >
              Continue With Current Design
            </DecisionButton>
          </div>
          <ConsequenceText>{CONSEQUENCE.ACCEPT}</ConsequenceText>
          <ConsequenceText>{CONSEQUENCE.CONTINUE}</ConsequenceText>
        </div>
      )}

      {/* REC_STALE — Accept disabled, Continue available */}
      {decisionState === DECISION_STATE.REC_STALE && (
        <div className="space-y-1.5">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                {CONSEQUENCE.STALE_REC}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <DecisionButton
              onClick={() => {}}
              disabled={true}
              inProgress={false}
              variant="accept"
              icon={Check}
            >
              Accept Recommendation
            </DecisionButton>
            <DecisionButton
              onClick={handleContinue}
              disabled={false}
              inProgress={actionInProgress}
              variant="continue"
            >
              Continue With Current Design
            </DecisionButton>
          </div>
          <ConsequenceText>{CONSEQUENCE.CONTINUE}</ConsequenceText>
        </div>
      )}

      {/* CAL_STALE — Recalculate + Continue + Reset */}
      {decisionState === DECISION_STATE.CAL_STALE && (
        <div className="space-y-1.5">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {calResolved.staleReason || "Applied calibration belongs to an earlier version of this design."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <DecisionButton
              onClick={handleRecalculate}
              disabled={false}
              inProgress={actionInProgress}
              variant="recalc"
              icon={RotateCcw}
            >
              Recalculate
            </DecisionButton>
            <DecisionButton
              onClick={handleContinue}
              disabled={false}
              inProgress={actionInProgress}
              variant="continue"
            >
              Continue With Current Design
            </DecisionButton>
            <DecisionButton
              onClick={handleReset}
              disabled={false}
              inProgress={actionInProgress}
              variant="reset"
              icon={Trash2}
            >
              Reset
            </DecisionButton>
          </div>
          <ConsequenceText>{CONSEQUENCE.RECALCULATE}</ConsequenceText>
          <ConsequenceText>{CONSEQUENCE.CONTINUE}</ConsequenceText>
          <ConsequenceText>{CONSEQUENCE.RESET}</ConsequenceText>
        </div>
      )}
    </div>
  );
}