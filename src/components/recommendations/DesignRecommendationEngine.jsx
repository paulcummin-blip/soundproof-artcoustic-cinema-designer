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
  rankDesignRecommendations,
} from "./designRecommendationCandidates";

const EMPTY_SELECTIONS = Object.freeze({});

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
    caveat: item?.caveat || null,
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

  const seatSplMetrics = useAllSeatSplMetrics({
    _seatingPositions: candidate.seats,
    analysisSpeakers,
    appState,
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
    p15ConstructionLevel: appState?.p15ConstructionLevel,
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
      aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
      speakerSystem: candidateSpeakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
      lcrAimMode: appState?.lcrAimMode,
    },
    aimState: {
      lcrAimMode: appState?.lcrAimMode,
      aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
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

  useEffect(() => {
    if (!rating) return;
    onResult(candidate, rating);
  }, [
    candidate,
    onResult,
    rating?.status,
    rating?.displayPercentage,
    rating?.actualPoints,
    rating?.maximumAvailablePoints,
    rating?.coveragePercent,
  ]);

  // A malformed or temporarily unavailable candidate must not hold the whole
  // recommendation panel in a permanent loading state. Valid results replace
  // this settled-null marker if they become available later.
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
  const candidates = useMemo(() => buildDesignRecommendationCandidates({
    seats,
    placedSpeakers,
    screen,
    dolbyLayout,
    dimensions,
    mlpPoint,
    soundbarSelections: safeSoundbarSelections,
    allowUkPricing,
  }), [
    seats,
    placedSpeakers,
    screen,
    dolbyLayout,
    dimensions,
    mlpPoint,
    safeSoundbarSelections,
    allowUkPricing,
  ]);

  const candidateSignature = useMemo(
    () => candidates.map((candidate) => candidate.id).join("|"),
    [candidates]
  );
  const [resultsById, setResultsById] = useState({});

  const handleResult = useCallback((candidate, rating) => {
    setResultsById((previous) => {
      const current = previous[candidate.id];
      if (
        current &&
        current.rating?.status === rating?.status &&
        current.rating?.displayPercentage === rating?.displayPercentage &&
        current.rating?.actualPoints === rating?.actualPoints &&
        current.rating?.maximumAvailablePoints === rating?.maximumAvailablePoints
      ) {
        return previous;
      }
      return { ...previous, [candidate.id]: { candidate, rating } };
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

  const recommendations = useMemo(() => ({
    ...rankDesignRecommendations({ baselineRating, evaluatedCandidates }),
    candidateCount,
    completedCount,
    pendingCount,
    // isSettled: true when all candidates have terminated (valid or timeout/null)
    // OR when there are no candidates. The export gate consumes this so the PDF
    // cannot capture a partial shortlist or an "Evaluating…" placeholder.
    isSettled,
    // isEvaluating (legacy, for progressive live UI): true only BEFORE the first
    // candidate terminates. Do NOT use for export gating — it flips false after
    // one candidate, which is not a settled-state authority.
    isEvaluating: candidateCount > 0 && completedCount === 0,
    bassScenarioPolicy: "Current verified bass result held constant; subwoofer alternatives are not evaluated in V1.",
  }), [baselineRating, evaluatedCandidates, candidateCount, completedCount, pendingCount, isSettled]);

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
    }),
    [recommendations]
  );
  const lastPublishedRecommendationSignatureRef = useRef(null);
  useEffect(() => {
    if (lastPublishedRecommendationSignatureRef.current === recommendationPublicationSignature) return;
    lastPublishedRecommendationSignatureRef.current = recommendationPublicationSignature;
    onRecommendationsChange?.(recommendations);
  }, [onRecommendationsChange, recommendations, recommendationPublicationSignature]);

  return (
    <>
      {candidates.map((candidate) => (
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