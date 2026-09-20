/**
 * Passive Engineering Snapshot adapter.
 *
 * The Room Designer is the only producer. This hook never mounts an analysis,
 * bass, rating, grading, grouping, or pricing engine; it copies the selected
 * version's published authority into the frozen proposal/PDF snapshot.
 */

import { useMemo } from 'react';
import { buildEngineeringSnapshot } from './buildEngineeringSnapshot';

export function useEngineeringSnapshot({
  projectId,
  versionId,
  project,
  version,
  mergedProject,
  publishedEngineering,
  engineeringSummary: explicitEngineeringSummary,
  seats,
  placedSpeakers,
  priceCalculation,
  proposalAssets,
  brandAsset,
  proposalMetadata,
  assumedLevels,
  assessmentModes,
}) {
  return useMemo(() => {
    if (!projectId || !versionId) {
      return { snapshot: null, loading: false, error: 'projectId and versionId are required.' };
    }

    const publication = publishedEngineering || null;
    const publicationVersionId = String(publication?.versionId || '');
    if (publicationVersionId && publicationVersionId !== String(versionId)) {
      return {
        snapshot: null,
        loading: false,
        error: 'The selected version has no matching published engineering result. Open that version in Room Designer and calculate it first.',
      };
    }

    const engineeringSummary =
      explicitEngineeringSummary ||
      publication?.engineeringSummary ||
      publication?.rating?.engineeringSummary ||
      null;

    if (!engineeringSummary) {
      return {
        snapshot: null,
        loading: false,
        error: 'No published engineering result is available for the selected version.',
      };
    }

    try {
      const snapshot = buildEngineeringSnapshot({
        projectId,
        versionId,
        project,
        version,
        mergedProject,
        engineeringSummary,
        designRating: publication?.rating || null,
        completedBassAuthority: publication?.calculationFingerprint
          ? { currentFingerprint: publication.calculationFingerprint }
          : null,
        seats: seats || publication?.seatingPositions || [],
        placedSpeakers: placedSpeakers || publication?.placedSpeakers || [],
        priceCalculation: priceCalculation || publication?.priceData || null,
        proposalAssets,
        brandAsset,
        proposalMetadata,
        assumedLevels,
        assessmentModes,
      });
      return {
        snapshot: snapshot?.available === false ? null : snapshot,
        loading: false,
        error: snapshot?.available === false ? snapshot.error : null,
      };
    } catch (err) {
      return {
        snapshot: null,
        loading: false,
        error: err?.message || 'Failed to build engineering snapshot.',
      };
    }
  }, [
    projectId,
    versionId,
    project,
    version,
    mergedProject,
    publishedEngineering,
    explicitEngineeringSummary,
    seats,
    placedSpeakers,
    priceCalculation,
    proposalAssets,
    brandAsset,
    proposalMetadata,
    assumedLevels,
    assessmentModes,
  ]);
}
