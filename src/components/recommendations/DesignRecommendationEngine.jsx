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

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const analysisResult = useRP22AnalysisEngine({
    diagnosticOwner: `asdr-recommendation:${candidate.id}`,
    placedSpeakers: analysisSpeakers,
    visiblePlanSpeakers: analysisSpeakers,
    seatingPositions: candidate.seats,
    dimensions,
    mlpBasis: "front",
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

  const recommendations = useMemo(() => ({
    ...rankDesignRecommendations({ baselineRating, evaluatedCandidates }),
    candidateCount: candidates.length,
    // Reveal useful results as soon as the first canonical re-run settles.
    // Remaining candidates continue to refine the shortlist in the background.
    isEvaluating: candidates.length > 0 && evaluatedCandidates.length === 0,
    bassScenarioPolicy: "Current verified bass result held constant; subwoofer alternatives are not evaluated in V1.",
  }), [baselineRating, evaluatedCandidates, candidates.length]);

  useEffect(() => {
    onRecommendationsChange?.(recommendations);
  }, [onRecommendationsChange, recommendations]);

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
