/**
 * useEngineeringSnapshot.js
 * --------------------------------
 * React hook that assembles the frozen Engineering Snapshot from the SAME
 * settled authorities already used by Room Designer / Compliance / Design Rating.
 *
 * This hook is designed to run in a context where the Room Designer state is
 * available — either the Room Designer itself, or a report page that has
 * hydrated AppState for the selected version.
 *
 * It calls:
 *   - useCompletedBassAuthority(projectId, versionId)
 *   - buildComplianceBassPresentation
 *   - useAppDesignRating (for scopedRatings + p19SeatAuthority + designRating)
 *   - usePriceCalculation (for commercial pricing)
 *   - buildEngineeringSnapshot (pure builder)
 *
 * The returned snapshot is frozen and version-safe. Later design edits do not
 * silently change an existing snapshot — the snapshot is stored on the
 * Proposal at generation time.
 */

import { useMemo } from 'react';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { buildComplianceBassPresentation } from '@/components/room/bass/bassCompliancePresentation';
import { useAppDesignRating } from '@/components/hooks/useAppDesignRating';
import { usePriceCalculation } from '@/components/pricing/usePriceCalculation';
import { buildEngineeringSnapshot } from './buildEngineeringSnapshot';

/**
 * @param {Object} params
 * @param {string} params.projectId — REQUIRED
 * @param {string} params.versionId — REQUIRED
 * @param {Object} params.project — Project entity
 * @param {Object} params.version — ProjectVersion entity
 * @param {Object} params.mergedProject — mergeProjectAndVersion result
 * @param {Object} params.appState — from useAppState()
 * @param {Array}  params.seats — canonical seating positions
 * @param {Object} params.analysisResult — from useRP22AnalysisEngine
 * @param {Array}  params.placedSpeakers — placed speaker objects
 * @param {boolean} [params.minimumSystemMet=true]
 * @param {Object} [params.priceCalculationOverrides] — optional pre-computed price calc
 * @param {Array}  [params.proposalAssets]
 * @param {Object} [params.brandAsset]
 * @param {Object} [params.proposalMetadata]
 * @param {Object} [params.assumedLevels]
 * @param {Object} [params.assessmentModes]
 * @param {Object} [params.priceCalcInputs] — inputs for usePriceCalculation if not provided
 * @returns {{ snapshot: Object|null, loading: boolean, error: string|null }}
 */
export function useEngineeringSnapshot({
  projectId,
  versionId,
  project,
  version,
  mergedProject,
  appState,
  seats,
  analysisResult,
  placedSpeakers,
  minimumSystemMet = true,
  proposalAssets,
  brandAsset,
  proposalMetadata,
  assumedLevels,
  assessmentModes,
  priceCalcInputs,
}) {
  const effectiveVersionId = versionId || version?.id || null;

  // ── Canonical bass authority (version-keyed) ──
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free', effectiveVersionId || 'free');
  const bassErrorMessage = completedBassAuthority?.errorMessage || null;

  const completedBassPresentation = useMemo(
    () => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage),
    [completedBassAuthority, bassErrorMessage],
  );

  // ── Canonical design rating (scopedRatings + p19SeatAuthority) ──
  const designRating = useAppDesignRating({
    appState,
    seats,
    analysisResult,
    placedSpeakers,
    projectId,
    versionId: effectiveVersionId,
    minimumSystemMet,
  });

  // ── Canonical pricing (separate from engineering) ──
  const defaultPriceInputs = useMemo(() => ({
    placedSpeakers: placedSpeakers || [],
    frontSubsCfg: mergedProject?.front_subs_cfg || appState?.frontSubsCfg || null,
    rearSubsCfg: mergedProject?.rear_subs_cfg || appState?.rearSubsCfg || null,
    difficultyMultiplier: Number(appState?.difficultyMultiplier) || 1.0,
    priceMode: appState?.priceMode || 'incVat',
    soundbarSelections: appState?.soundbarSelections || {},
    acousticTreatmentEnabled: mergedProject?.acoustic_treatment_enabled || false,
    selectedAbfuserQty: Number(mergedProject?.selected_abfuser_qty) || 0,
  }), [placedSpeakers, mergedProject, appState]);

  const priceCalculation = usePriceCalculation(priceCalcInputs || defaultPriceInputs);

  // ── Assemble the frozen snapshot ──
  const result = useMemo(() => {
    if (!projectId || !effectiveVersionId) {
      return { snapshot: null, loading: false, error: 'projectId and versionId are required.' };
    }

    try {
      const snapshot = buildEngineeringSnapshot({
        projectId,
        versionId: effectiveVersionId,
        project,
        version,
        mergedProject,
        analysisResult,
        completedBassAuthority,
        completedBassPresentation,
        designRating,
        seats,
        placedSpeakers,
        priceCalculation,
        proposalAssets,
        brandAsset,
        proposalMetadata,
        assumedLevels,
        assessmentModes,
      });
      return { snapshot, loading: false, error: null };
    } catch (err) {
      return { snapshot: null, loading: false, error: err?.message || 'Failed to build engineering snapshot.' };
    }
  }, [
    projectId,
    effectiveVersionId,
    project,
    version,
    mergedProject,
    analysisResult,
    completedBassAuthority,
    completedBassPresentation,
    designRating,
    seats,
    placedSpeakers,
    priceCalculation,
    proposalAssets,
    brandAsset,
    proposalMetadata,
    assumedLevels,
    assessmentModes,
  ]);

  return result;
}