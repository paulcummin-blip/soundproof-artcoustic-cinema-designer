/**
 * versionDocumentStatus.js
 * ------------------------
 * Per-version document status for the Room Designer version switcher: for each
 * design version, whether its saved reports are current and where its newest
 * proposal stands.
 *
 * Every value is derived for one exact version, so one version's report or
 * proposal state can never appear against another version. Nothing is written
 * and nothing is recalculated — the saved reports and proposals are read as
 * they are.
 *
 * Derivation only: pure, no reads, no writes.
 */

import {
  collapseLiveReports,
  liveReportStatusLabel,
} from '@/components/library/librarySourceStatus';
import { isSnapshotRestorable } from '@/components/report/reportSnapshotAuthority';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { getStatusLabel } from '@/components/proposal/proposalLifecycle';

const REPORT_TYPES = ['visual', 'technical'];

export const NO_REPORTS_LABEL = 'No reports yet';
export const REPORT_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  MISSING: 'missing',
});

/**
 * Derive each version's document status from the project's saved reports and
 * proposals.
 *
 * @param {Object} input
 * @param {Array<Object>} input.snapshots   saved reports (ReportSnapshot), any order
 * @param {Array<Object>} input.proposals   saved proposals, newest first
 * @returns {Map<string, {
 *   reportsState: string,
 *   reportsLabel: string,
 *   reportsGenerated: string[],
 *   proposal: Object|null,
 *   proposalStatus: string|null,
 *   proposalLabel: string|null,
 * }>}
 */
export function deriveVersionDocumentStatus({ snapshots = [], proposals = [] } = {}) {
  const entries = new Map();
  const entryFor = (versionId) => {
    if (!versionId) return null;
    if (!entries.has(versionId)) {
      entries.set(versionId, { reportStatusByType: {}, proposal: null });
    }
    return entries.get(versionId);
  };

  // ONE saved report per version and report type — the newest generation.
  collapseLiveReports(snapshots)
    .filter(isSnapshotRestorable)
    .forEach((snapshot) => {
      if (!REPORT_TYPES.includes(snapshot.report_type)) return;
      const entry = entryFor(snapshot.version_id);
      if (entry) entry.reportStatusByType[snapshot.report_type] = snapshot.status || 'current';
    });

  // Proposals arrive newest first, so the first one naming a version is that
  // version's latest proposal.
  (Array.isArray(proposals) ? proposals : []).forEach((proposal) => {
    proposalVersionIds(proposal).forEach((versionId) => {
      const entry = entryFor(versionId);
      if (entry && !entry.proposal) entry.proposal = proposal;
    });
  });

  const statusByVersionId = new Map();

  entries.forEach((entry, versionId) => {
    const generated = REPORT_TYPES.filter((type) => entry.reportStatusByType[type]);
    const stale = generated.some((type) => entry.reportStatusByType[type] === 'stale');
    const reportsState = generated.length === 0
      ? REPORT_STATE.MISSING
      : (stale ? REPORT_STATE.STALE : REPORT_STATE.CURRENT);

    statusByVersionId.set(versionId, {
      reportsState,
      reportsGenerated: generated,
      reportsLabel: generated.length === 0
        ? NO_REPORTS_LABEL
        : `${liveReportStatusLabel(stale ? 'stale' : 'current')} reports`,
      proposal: entry.proposal,
      proposalStatus: entry.proposal?.status || null,
      proposalLabel: entry.proposal ? getStatusLabel(entry.proposal.status) : null,
    });
  });

  return statusByVersionId;
}

export default deriveVersionDocumentStatus;