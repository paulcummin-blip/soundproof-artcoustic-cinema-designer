/**
 * proposalExportSource.js
 * ----------------------
 * The source identity a proposal is issued under, resolved at export time.
 *
 * A proposal does not calculate its own freshness: the existing proposal source
 * authority decides whether the versions it was built from still hold the saved
 * reports it needs and whether their published engineering result has moved on.
 * This module only reads what that authority needs, at the moment of export, so
 * the issued document records the state it was actually issued in.
 *
 * Reads only. Nothing here writes, regenerates or recalculates.
 */

import { base44 } from '@/api/base44Client';
import {
  proposalVersionIds,
  resolveProposalSourceState,
} from '@/components/proposal/library/proposalSourceState';

const LAYER_ONE_REPORT_TYPES = ['visual', 'technical'];

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

/**
 * @param {Object} proposal
 * @returns {Promise<{selectedVersionIds: string[], versionId: string|null,
 *                    sourceFingerprints: Object, sourceStatusAtExport: string}>}
 */
export async function resolveProposalExportSource(proposal) {
  const versionIds = proposalVersionIds(proposal);
  const base = {
    selectedVersionIds: versionIds,
    versionId: versionIds.length === 1 ? versionIds[0] : null,
    sourceFingerprints: {
      engineeringFingerprint: proposal?.engineering_snapshot?.engineeringFingerprint || null,
    },
    sourceStatusAtExport: 'current',
  };

  if (versionIds.length === 0) return base;

  const [versionRecords, snapshotRecords] = await Promise.all([
    base44.entities.ProjectVersion.filter({ id: { $in: versionIds } }),
    base44.entities.ReportSnapshot.filter(
      { version_id: { $in: versionIds }, report_type: { $in: LAYER_ONE_REPORT_TYPES } },
      { fields: ['version_id', 'report_type', 'source_fingerprints'], limit: 50 },
    ),
  ]);

  const versionsById = new Map(asItems(versionRecords).map((version) => [version.id, version]));
  const savedReportsByVersionId = new Map();
  asItems(snapshotRecords).forEach((snapshot) => {
    const entry = savedReportsByVersionId.get(snapshot.version_id) || {};
    if (!entry[snapshot.report_type]) entry[snapshot.report_type] = snapshot;
    savedReportsByVersionId.set(snapshot.version_id, entry);
  });

  const sourceState = resolveProposalSourceState({
    proposal,
    versionsById,
    savedReportsByVersionId,
  });

  return {
    ...base,
    // 'current' | 'source_changed' | 'missing_source' — the same vocabulary the
    // issued document records.
    sourceStatusAtExport: sourceState.state,
    sourceFingerprints: {
      engineeringFingerprint: sourceState.state === 'current' ? base.sourceFingerprints.engineeringFingerprint : null,
    },
  };
}

export default resolveProposalExportSource;