/**
 * DesignRecommendationEngine.jsx
 * --------------------------------
 * Non-mutating what-if runner for the ASDR recommendation feature.
 *
 * Each candidate is evaluated by the existing canonical React authorities:
 *   useAnalysisSpeakers → useAllSeatSplMetrics → useRP22AnalysisEngine
 *   → useAppDesignRating
 *
 * No RP22 thresholds or ASDR scoring rules are copied here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { useAnalysisSpeakers } from "@/components/hooks/useAnalysisSpeakers";
import { useAllSeatSplMetrics } from "@/components/hooks/useAllSeatSplMetrics";
import { useRP22AnalysisEngine } from "@/components/hooks/useRP22AnalysisEngine";
import { useAppDesignRating } from "@/components/hooks/useAppDesignRating";
import {
  buildDesignRecommendationCandidates,
  isViewingGeometryCandidate,
  rankDesignRecommendations,
} from "./designRecommendationCandidates";
import { useProductPriceMap } from "@/components/pricing/useProductPriceMap";
import { buildPerRowViewingData } from "@/components/utils/viewingAngleUtils";
import {
  buildViewingPrioritySummary,
  normaliseViewingPriority,
} from "@/components/utils/viewingPriorityAuthority";

const EMPTY_SELECTIONS = Object.freeze({});
const LCR_EVALUATION_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);

function viewingSummaryPublicationSnapshot(summary) {
  if (!summary) return null;
  return {
    priorityMode: summary.priorityMode || null,
    worstRowLevel: summary.worstRowLevel || null,
    bestRowLevel: summary.bestRowLevel || null,
    levelSpread: summary.levelSpread ?? null,
    angleSpreadDeg: summary.angleSpreadDeg ?? null,
    totalDeviationFrom57_5: summary.totalDeviationFrom57_5 ?? null,
    rows: Array.isArray(summary.rows)
      ? summary.rows.map((row) => ({
          rowNumber: row?.rowNumber ?? null,
          viewingAngleDeg: row?.viewingAngleDeg ?? null,
          viewingDistanceM: row?.viewingDistanceM ?? null,
          rp23Level: row?.rp23Level || null,
        }))
      : [],
  };
}

function recommendationItemPublicationSnapshot(item) {
  return {
    id: item?.id || null,
    kind: item?.kind || null,
    title: item?.title || null,
    currentPercentage: item?.currentPercentage ?? null,
    newPercentage: item?.newPercentage ?? null,
    scoreDelta: item?.scoreDelta ?? null,
    scoreDeltaPoints: item?.scoreDeltaPoints ?? null,
    costDeltaExVat: item?.costDeltaExVat ?? null,
    savingExVat: item?.savingExVat ?? null,
    affectedParameters: Array.isArray(item?.affectedParameters) ? item.affectedParameters : [],
    parameterLevelChanges: Array.isArray(item?.parameterLevelChanges)
      ? item.parameterLevelChanges.map((change) => ({
          display: change?.display || null,
          beforeLevel: change?.beforeLevel || null,
          afterLevel: change?.afterLevel || null,
        }))
      : [],
    priorityLabel: item?.priorityLabel || null,
    disruption: item?.disruption || null,
    confidence: item?.confidence || null,
    p12Level: item?.p12Level || null,
    p12BaselineLevel: item?.p12BaselineLevel || null,
    p12RawDb: item?.p12RawDb ?? null,
    p12BaselineRawDb: item?.p12BaselineRawDb ?? null,
    p12MinimumLevel: item?.p12MinimumLevel || null,
    p12RecommendedLevel: item?.p12RecommendedLevel || null,
    p12BaselineMinimumLevel: item?.p12BaselineMinimumLevel || null,
    p12BaselineRecommendedLevel: item?.p12BaselineRecommendedLevel || null,
    p13RawDb: item?.p13RawDb ?? null,
    p13BaselineRawDb: item?.p13BaselineRawDb ?? null,
    p13MinimumLevel: item?.p13MinimumLevel || null,
    p13RecommendedLevel: item?.p13RecommendedLevel || null,
    p13BaselineMinimumLevel: item?.p13BaselineMinimumLevel || null,
    p13BaselineRecommendedLevel: item?.p13BaselineRecommendedLevel || null,
    caveat: item?.caveat || null,
    recommendationDirection: item?.recommendationDirection || null,
    candidateModelKey: item?.candidateModelKey || null,
    materialUpgradeLabel: item?.materialUpgradeLabel || null,
    recommendationClass: item?.recommendationClass || null,
    technicalLine: item?.technicalLine || null,
    applyAction: item?.applyAction || null,
    lcrPowerBeforeW: item?.lcrPowerBeforeW ?? null,
    lcrPowerAfterW: item?.lcrPowerAfterW ?? null,
    amplifierUpgradeRequired: item?.amplifierUpgradeRequired === true,
    amplifierCostIncluded: item?.amplifierCostIncluded === true,
    physicalFit: item?.physicalFit || null,
    viewingBefore: viewingSummaryPublicationSnapshot(item?.viewingBefore),
    viewingAfter: viewingSummaryPublicationSnapshot(item?.viewingAfter),
    viewingComparison: item?.viewingComparison || null,
    viewingPriorityMode: item?.viewingPriorityMode || null,
    viewingTradeoff: item?.viewingTradeoff === true,
  };
}

function CandidateRatingEvaluator({
  candidate,
  appState,
  dimensions,
  projectId,
  onResult,
}) {
  const candidateSpeakerSystem = useMemo(() => ({
    ...(appState?.speakerSystem || {}),
    placedSpeakers: candidate.placedSpeakers,
    dolbyLayout: candidate.dolbyLayout,
    dolbyPreset: candidate.dolbyLayout,
    layout: candidate.dolbyLayout,
    format: candidate.dolbyLayout,
  }), [appState?.speakerSystem, candidate.placedSpeakers, candidate.dolbyLayout]);

  const analysisSpeakers = useAnalysisSpeakers({
    placedSpeakers: candidate.placedSpeakers,
    speakerSystem: candidateSpeakerSystem,
    sevenBedLayoutType: appState?.sevenBedLayoutType,
    getSpeakerVisibility: appState?.getSpeakerVisibility,
    dolbyPreset: candidate.dolbyLayout,
  });

  const candidateAppState = useMemo(() => {
    const proposedPowerW = Number(candidate?.lcrPowerAfterW);
    const hasPowerOverride = candidate?.amplifierUpgradeRequired && Number.isFinite(proposedPowerW) && proposedPowerW > 0;
    const aimingOverride = candidate?.aimingOverride;

    if (!hasPowerOverride && !aimingOverride) return appState;

    const baseGetEffectiveSplInputs = appState?.getEffectiveSplInputs;
    return {
      ...appState,
      splConfig: hasPowerOverride
        ? { ...(appState?.splConfig || {}), lcrW: proposedPowerW }
        : appState?.splConfig,
      getEffectiveSplInputs: hasPowerOverride
        ? (role) => {
            const baseInputs = baseGetEffectiveSplInputs?.(role) || {
              powerW: Number(appState?.splConfig?.lcrW) || 100,
              eqHeadroomDb: Number(appState?.splConfig?.globalEqHeadroomDb) || 0,
              radiationMode: appState?.splConfig?.radiationMode || "half-space",
            };
            if (!LCR_EVALUATION_ROLES.has(String(role || "").toUpperCase())) return baseInputs;
            const currentRolePowerW = Number(baseInputs?.powerW);
            return {
              ...baseInputs,
              powerW: Math.max(
                Number.isFinite(currentRolePowerW) && currentRolePowerW > 0 ? currentRolePowerW : 100,
                proposedPowerW
              ),
            };
          }
        : appState?.getEffectiveSplInputs,
      // Stage E2: aiming override for best-practice candidates.
      lcrAimMode: aimingOverride?.lcrAimMode ?? appState?.lcrAimMode,
      aimFrontWidesAtMLP: aimingOverride?.aimFrontWidesAtMLP ?? appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: aimingOverride?.aimSideSurroundsAtMLP ?? appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: aimingOverride?.aimRearSurroundsAtMLP ?? appState?.aimRearSurroundsAtMLP,
    };
  }, [
    appState,
    candidate?.amplifierUpgradeRequired,
    candidate?.lcrPowerAfterW,
    candidate?.aimingOverride,
  ]);

  const seatSplMetrics = useAllSeatSplMetrics({
    _seatingPositions: candidate.seats,
    analysisSpeakers,
    appState: candidateAppState,
    mlpAnchorEffective: candidate.mlpPoint,
    getSpeakerModelMeta,
  });

  const primarySeatingPosition = useMemo(() => {
    if (!Array.isArray(candidate.seats) || candidate.seats.length === 0) return null;
    const anchor = candidate.mlpPoint;
    if (!anchor || !Number.isFinite(Number(anchor.y))) return candidate.seats[0] || null;
    let closest = null;
    let minimumDistance = Infinity;
    for (const seat of candidate.seats) {
      const distance = Math.hypot(
        (Number(seat?.x) || 0) - (Number(anchor.x) || 0),
        (Number(seat?.y) || 0) - Number(anchor.y)
      );
      if (distance < minimumDistance) {
        minimumDistance = distance;
        closest = seat;
      }
    }
    return closest
      ? { ...closest, x: Number(dimensions?.width) / 2 }
      : null;
  }, [candidate.seats, candidate.mlpPoint, dimensions?.width]);

  const analysisResult = useRP22AnalysisEngine({
    diagnosticOwner: `asdr-recommendation:${candidate.id}`,
    placedSpeakers: candidate.placedSpeakers,
    visiblePlanSpeakers: analysisSpeakers,
    seatingPositions: candidate.seats,
    dimensions,
    mlpBasis: "front",
    sevenBedLayoutType: appState?.sevenBedLayoutType,
    extraSurroundCount: appState?.extraSurroundCount,
    mlpPointOverride: candidate.mlpPoint,
    seatSplMetrics,
    assumedP15Level: appState?.assumedP15Level,
    screen: candidate.screen,
    dolbyLayout: candidate.dolbyLayout,
    includeBassAnalysis: false,
    overheadState: {
      globalModel: appState?.overheadGlobalModel,
      frontOverride: appState?.overheadFrontOverride,
      midOverride: appState?.overheadMidOverride,
      rearOverride: appState?.overheadRearOverride,
      useFrontGlobal: appState?.useFrontGlobal,
      useMidGlobal: appState?.useMidGlobal,
      useRearGlobal: appState?.useRearGlobal,
      aimFrontWidesAtMLP: candidateAppState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: candidateAppState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: candidateAppState?.aimRearSurroundsAtMLP,
      speakerSystem: candidateSpeakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
      lcrAimMode: candidateAppState?.lcrAimMode,
    },
    aimState: {
      lcrAimMode: candidateAppState?.lcrAimMode,
      aimFrontWidesAtMLP: candidateAppState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: candidateAppState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: candidateAppState?.aimRearSurroundsAtMLP,
      speakerSystem: candidateSpeakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
    },
  });

  const rating = useAppDesignRating({
    appState,
    seats: candidate.seats,
    analysisResult,
    placedSpeakers: analysisSpeakers,
    stableDimensions: dimensions,
    primarySeatingPosition: candidate.mlpPoint,
    projectId,
  });

  const p12RawDb = analysisResult?.gradedParameters?.primary?.[12]?.value;
  const p13RawDb = analysisResult?.gradedParameters?.primary?.[13]?.value;

  useEffect(() => {
    if (!rating) return;
    // Do not publish a pending rating. Wait for the shared bass authority to
    // settle so candidates are never evaluated against a partial baseline.
    if (rating.isPendingBass) return;
    onResult(candidate, rating, {
      p12RawDb: Number.isFinite(Number(p12RawDb)) ? Number(p12RawDb) : null,
      p13RawDb: Number.isFinite(Number(p13RawDb)) ? Number(p13RawDb) : null,
    });
  }, [
    candidate,
    onResult,
    rating?.status,
    rating?.designPerformanceIndex,
    rating?.actualPoints,
    rating?.maximumAvailablePoints,
    rating?.coveragePercent,
    rating?.isPendingBass,
    p12RawDb,
    p13RawDb,
  ]);

  // A malformed or temporarily unavailable candidate must not hold the whole
  // recommendation panel in a permanent loading state. Valid results replace
  // this settled-null marker if they become available later. The timeout must
  // NOT fire while bass authority is still loading — the candidate simply
  // hasn't had a chance to produce a valid result yet. rating is non-null but
  // pending in that case, so Boolean(rating) stays true and the timeout waits.
  useEffect(() => {
    if (rating) return undefined;
    const timeoutId = window.setTimeout(() => onResult(candidate, null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [candidate.id, onResult, Boolean(rating)]);

  return null;
}

export default function DesignRecommendationEngine({
  appState,
  seats,
  placedSpeakers,
  screen,
  dolbyLayout,
  dimensions,
  mlpPoint,
  projectId,
  baselineRating,
  allowUkPricing = true,
  soundbarSelections = null,
  onRecommendationsChange,
}) {
  const safeSoundbarSelections = soundbarSelections || EMPTY_SELECTIONS;
  const { priceMap, soundbarOptions } = useProductPriceMap();
  const candidates = useMemo(() => buildDesignRecommendationCandidates({
    seats,
    placedSpeakers,
    screen,
    dolbyLayout,
    dimensions,
    mlpPoint,
    soundbarSelections: safeSoundbarSelections,
    allowUkPricing,
    lcrPowerW: appState?.splConfig?.lcrW,
    appState,
    priceMap,
    soundbarOptions,
  }), [
    seats,
    placedSpeakers,
    screen,
    dolbyLayout,
    dimensions,
    mlpPoint,
    safeSoundbarSelections,
    allowUkPricing,
    appState?.splConfig?.lcrW,
    appState?.lcrAimMode,
    appState?.aimFrontWidesAtMLP,
    appState?.aimSideSurroundsAtMLP,
    appState?.aimRearSurroundsAtMLP,
    priceMap,
    soundbarOptions,
  ]);

  const viewingContext = useMemo(() => {
    const planeCandidates = [
      Number(appState?.screenFrontPlaneM),
      Number(screen?.screenPlaneY_m),
      Number(screen?.floatDepthM),
      0,
    ];
    const screenFrontPlaneM = planeCandidates.find((value) => Number.isFinite(value));
    const beforeRows = buildPerRowViewingData({
      seatingPositions: seats,
      screen,
      screenFrontPlaneM,
    });

    // Stage D is intentionally inert for one-row projects.
    if (beforeRows.length < 2) return null;

    const priorityMode = normaliseViewingPriority(
      appState?.viewingPriority,
      beforeRows.length
    );
    const before = buildViewingPrioritySummary(beforeRows, priorityMode);
    const afterByCandidateId = {};

    for (const candidate of candidates) {
      if (!isViewingGeometryCandidate(candidate)) continue;
      const afterRows = buildPerRowViewingData({
        seatingPositions: candidate.seats,
        screen: candidate.screen,
        screenFrontPlaneM,
      });
      if (afterRows.length < 2) continue;
      afterByCandidateId[candidate.id] = buildViewingPrioritySummary(
        afterRows,
        priorityMode
      );
    }

    return { priorityMode, before, afterByCandidateId };
  }, [
    appState?.screenFrontPlaneM,
    appState?.viewingPriority,
    candidates,
    screen,
    seats,
  ]);

  const candidateSignature = useMemo(
    () => candidates.map((candidate) => candidate.id).join("|"),
    [candidates]
  );
  const [resultsById, setResultsById] = useState({});

  const handleResult = useCallback((candidate, rating, metadata) => {
    setResultsById((previous) => {
      const current = previous[candidate.id];
      if (
        current &&
        current.rating?.status === rating?.status &&
        current.rating?.designPerformanceIndex === rating?.designPerformanceIndex &&
        current.rating?.actualPoints === rating?.actualPoints &&
        current.rating?.maximumAvailablePoints === rating?.maximumAvailablePoints
      ) {
        return previous;
      }
      return {
        ...previous,
        [candidate.id]: {
          candidate,
          rating,
          p12RawDb: metadata?.p12RawDb ?? null,
          p13RawDb: metadata?.p13RawDb ?? null,
        },
      };
    });
  }, []);

  const evaluatedCandidates = useMemo(() => {
    const activeIds = new Set(candidates.map((candidate) => candidate.id));
    return Object.values(resultsById).filter((entry) => activeIds.has(entry?.candidate?.id));
  }, [resultsById, candidateSignature, candidates]);

  // Terminal completion count — every candidate ID that has reported a terminal
  // result (valid rating OR timeout/null). Distinct from evaluatedCandidates
  // (used for ranking) and from valid results. A timed-out candidate still
  // counts as completed so it cannot block export indefinitely.
  const completedCount = useMemo(() => {
    const activeIds = new Set(candidates.map((candidate) => candidate.id));
    let count = 0;
    for (const id of Object.keys(resultsById)) {
      if (activeIds.has(id)) count += 1;
    }
    return count;
  }, [resultsById, candidateSignature, candidates]);

  const candidateCount = candidates.length;
  const pendingCount = Math.max(0, candidateCount - completedCount);
  const isSettled = candidateCount === 0 || completedCount >= candidateCount;

  // Do not evaluate, rank, or mark recommendations settled against a pending
  // baseline rating. The ranking and candidate evaluation wait until the
  // shared baseline bass authority is final.
  const baselineBassPending = baselineRating?.isPendingBass === true;

  const recommendations = useMemo(() => {
    if (baselineBassPending) {
      return {
        improvements: [],
        savings: [],
        bestPractice: [],
        candidateCount,
        completedCount: 0,
        pendingCount: candidateCount,
        isSettled: false,
        isEvaluating: true,
        bassScenarioPolicy: "Current verified bass result held constant; subwoofer alternatives are not evaluated in V1.",
      };
    }
    return {
      ...rankDesignRecommendations({
        baselineRating,
        evaluatedCandidates,
        viewingContext,
      }),
      candidateCount,
      completedCount,
      pendingCount,
      isSettled,
      isEvaluating: candidateCount > 0 && completedCount === 0,
      bassScenarioPolicy: "Current verified bass result held constant; subwoofer alternatives are not evaluated in V1.",
    };
  }, [
    baselineBassPending,
    baselineRating,
    evaluatedCandidates,
    viewingContext,
    candidateCount,
    completedCount,
    pendingCount,
    isSettled,
  ]);

  // Candidate inputs can be recreated with equivalent values when a parent
  // renders. Do not publish an equivalent recommendation object back to that
  // parent: setter -> parent render -> rebuilt candidates -> setter otherwise
  // forms a self-sustaining report/Room Designer render loop.
  const recommendationPublicationSignature = useMemo(
    () => JSON.stringify({
      candidateCount: recommendations.candidateCount,
      completedCount: recommendations.completedCount,
      pendingCount: recommendations.pendingCount,
      evaluatedCount: recommendations.evaluatedCount,
      isSettled: recommendations.isSettled,
      isEvaluating: recommendations.isEvaluating,
      improvements: recommendations.improvements.map(recommendationItemPublicationSnapshot),
      savings: recommendations.savings.map(recommendationItemPublicationSnapshot),
      bestPractice: (recommendations.bestPractice || []).map(recommendationItemPublicationSnapshot),
    }),
    [recommendations]
  );
  const lastPublishedRecommendationSignatureRef = useRef(null);
  useEffect(() => {
    if (lastPublishedRecommendationSignatureRef.current === recommendationPublicationSignature) return;
    lastPublishedRecommendationSignatureRef.current = recommendationPublicationSignature;
    onRecommendationsChange?.(recommendations);
  }, [onRecommendationsChange, recommendations, recommendationPublicationSignature]);

  // Do not mount candidate evaluators while the baseline bass authority is
  // pending. Candidates share the same useCompletedBassAuthority(projectId),
  // so their ratings would also be pending. Mounting them only after the
  // baseline settles ensures every candidate uses the same verified bass
  // result and no candidate is marked terminal by a bass-loading timeout.
  return (
    <>
      {!baselineBassPending && candidates.map((candidate) => (
        <CandidateRatingEvaluator
          key={candidate.id}
          candidate={candidate}
          appState={appState}
          dimensions={dimensions}
          projectId={projectId}
          onResult={handleResult}
        />
      ))}
    </>
  );
}