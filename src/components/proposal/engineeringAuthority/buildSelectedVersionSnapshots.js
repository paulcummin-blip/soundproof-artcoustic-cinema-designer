/**
 * buildSelectedVersionSnapshots.js
 * --------------------------------
 * Builds the frozen Engineering Snapshot for EVERY selected version of a
 * comparison, using the same published authority and the same builder the
 * single-version path uses.
 *
 * This is what makes a System Design Comparison honest: each option carries its
 * own frozen engineering evidence, so the comparison table is calculated from
 * data instead of being written from one version's results.
 *
 * Nothing is recalculated here: the published engineering summary is read from
 * the durable publication (falling back to the same-window handoff) and copied
 * into the frozen snapshot. No writes of any kind.
 */

import { base44 } from '@/api/base44Client';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import {
  fetchDurablePublication,
  buildDurableSnapshot,
  composeAuthoritySnapshot,
  classifyAuthorityState,
  extractEngineeringSummary,
  readLocalHandoff,
  ENGINEERING_AUTHORITY_STATE,
} from '@/components/engineering/versionedEngineeringAuthority';
import { buildEngineeringSnapshot } from './buildEngineeringSnapshot';
import { hydrateCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { applyRestoredBassAuthority } from '@/components/engineering/restoredBassOverlay';
import { assessEngineeringReportCompleteness } from '@/components/engineering/engineeringReportCompleteness';

const MISSING_MESSAGE = 'No published engineering result was found for this version.';

/**
 * @param {Object} input
 * @param {string} input.projectId
 * @param {Array<string>} input.versionIds — selected versions, in report order
 * @param {string|null} [input.primaryVersionId] — the already-built version
 * @param {Object|null} [input.primarySnapshot] — its already-built snapshot
 * @returns {Promise<Array<{ version_id, version_name, snapshot, source, error }>>}
 */
export async function buildSelectedVersionSnapshots({
  projectId,
  versionIds = [],
  primaryVersionId = null,
  primarySnapshot = null,
} = {}) {
  const ids = (versionIds || []).filter(Boolean);
  if (!projectId || ids.length === 0) return [];

  const [projectRecords, versionRecords] = await Promise.all([
    base44.entities.Project.filter({ id: projectId }),
    base44.entities.ProjectVersion.filter({ project_id: projectId }),
  ]);
  const project = Array.isArray(projectRecords) && projectRecords.length ? projectRecords[0] : null;
  const versionsById = new Map(
    (Array.isArray(versionRecords) ? versionRecords : []).map((version) => [version.id, version]),
  );

  const results = [];
  for (const versionId of ids) {
    const version = versionsById.get(versionId) || null;
    const versionName = version?.version_name || null;

    // The primary version arrives already built by the wizard's snapshot hook,
    // so its snapshot is reused exactly as the single-report path uses it.
    if (primarySnapshot && String(versionId) === String(primaryVersionId)) {
      results.push({
        version_id: versionId,
        version_name: versionName,
        snapshot: primarySnapshot,
        source: 'primary',
        authoritySnapshot: null,
        engineeringState: 'current',
        engineeringReason: null,
      });
      continue;
    }

    try {
      const localSnapshot = readLocalHandoff(projectId, versionId);
      const durable = await fetchDurablePublication(projectId, versionId);
      const durableSnapshot = durable?.publication
        ? buildDurableSnapshot({
          projectId,
          versionId,
          publication: durable.publication,
          designState: version?.design_state,
        })
        : null;

      const authorityState = classifyAuthorityState({ durable, localSnapshot });
      const baseAuthoritySnapshot = composeAuthoritySnapshot({ localSnapshot, durableSnapshot });
      const completedBassAuthority = await hydrateCompletedBassAuthority(projectId, versionId);
      const baseSummary = extractEngineeringSummary(baseAuthoritySnapshot);
      const engineeringSummary = applyRestoredBassAuthority(baseSummary, {
        projectId,
        versionId,
        completedBassAuthority,
      });
      const authoritySnapshot = engineeringSummary && baseAuthoritySnapshot
        ? { ...baseAuthoritySnapshot, engineeringSummary }
        : baseAuthoritySnapshot;

      if (!engineeringSummary) {
        const missingReason = authorityState === ENGINEERING_AUTHORITY_STATE.PUBLISHED_STALE
          ? 'The published engineering result for this version is stale. Recalculate it in Room Designer.'
          : MISSING_MESSAGE;
        results.push({
          version_id: versionId,
          version_name: versionName,
          snapshot: null,
          source: authorityState,
          error: missingReason,
          authoritySnapshot: baseAuthoritySnapshot,
          // READ_STALE means a publication existed and no longer matches the
          // version; every other empty authority is simply not calculated yet.
          engineeringState: authorityState === ENGINEERING_AUTHORITY_STATE.PUBLISHED_STALE ? 'stale' : 'missing',
          engineeringReason: missingReason,
        });
        continue;
      }

      const reportCompleteness = assessEngineeringReportCompleteness(engineeringSummary);
      if (!reportCompleteness.complete) {
        results.push({
          version_id: versionId,
          version_name: versionName,
          snapshot: null,
          source: authorityState,
          error: reportCompleteness.reason || 'Complete every project assessment before generating this proposal.',
          authoritySnapshot,
          engineeringState: 'incomplete',
          engineeringReason: reportCompleteness.reason || null,
        });
        continue;
      }

      const designState = version?.design_state || {};
      const snapshot = buildEngineeringSnapshot({
        projectId,
        versionId,
        project,
        version,
        mergedProject: project ? mergeProjectAndVersion(project, version) : null,
        engineeringSummary,
        designRating: authoritySnapshot?.rating || null,
        completedBassAuthority: authoritySnapshot?.calculationFingerprint
          ? { currentFingerprint: authoritySnapshot.calculationFingerprint }
          : null,
        seats: authoritySnapshot?.seatingPositions || designState.seating_positions || [],
        placedSpeakers: authoritySnapshot?.placedSpeakers || designState.selected_speakers || [],
        priceCalculation: authoritySnapshot?.priceData || null,
      });

      results.push({
        version_id: versionId,
        version_name: versionName,
        snapshot: snapshot?.available === false ? null : snapshot,
        source: durableSnapshot ? 'db-publication' : 'browser-handoff',
        error: snapshot?.available === false ? (snapshot.error || MISSING_MESSAGE) : null,
        // The composed authority snapshot is what the current fingerprint set is
        // derived from — the same values the report pages compare against.
        authoritySnapshot,
        engineeringState: snapshot?.available === false ? 'missing' : 'current',
        engineeringReason: snapshot?.available === false ? (snapshot.error || MISSING_MESSAGE) : null,
      });
    } catch (error) {
      results.push({
        version_id: versionId,
        version_name: versionName,
        snapshot: null,
        source: 'error',
        error: error?.message || MISSING_MESSAGE,
        authoritySnapshot: null,
        // A failed read is never reported as "not calculated".
        engineeringState: 'unavailable',
        engineeringReason: error?.message || MISSING_MESSAGE,
      });
    }
  }

  return results;
}

export default buildSelectedVersionSnapshots;