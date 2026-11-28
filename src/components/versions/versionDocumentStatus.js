/**
 * versionDocumentStatus.js
 * ------------------------
 * Per-version document status for the Room Designer version switcher: for each
 * design version, whether its saved Project Report is current or needs
 * updating, and where its newest proposal stands.
 *
 * Sound Proof has ONE report: the Project Report (ReportSnapshot
 * report_type 'project'). The legacy Visual and Technical reports are retired
 * as status sources and are never consulted here. This derivation therefore
 * uses the SAME canonical report and the SAME fingerprint status authority the
 * report pages, the Project Library and the Proposal Centre use:
 *
 *   - the canonical saved report per version is resolved by collapseLiveReports
 *     (the one shared selection rule);
 *   - that report's Current / Stale state is resolved by resolveSnapshotStatus,
 *     the same fingerprint comparison useReportSnapshot and the readiness
 *     authority use.
 *
 * No separate status calculation is introduced, and no issued PDF export is
 * required: a valid current ReportSnapshot is enough.
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
} from '@/components/library/librarySourceStatus';
import {
  isSnapshotRestorable,
  resolveSnapshotStatus,
} from '@/components/report/reportSnapshotAuthority';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { getStatusLabel } from '@/components/proposal/proposalLifecycle';
import { identifyDesignChanges } from '@/components/documentWorkflow/documentFreshnessReason';

/** The ONE report type the selector states. Legacy 'visual'/'technical' are retired. */
const REPORT_TYPES = ['project'];

export const NO_REPORTS_LABEL = 'No report yet';
export const CURRENT_REPORTS_LABEL = 'Project Report current';
export const REPORTS_NEED_UPDATING_LABEL = 'Project Report needs updating';
export const REPORTS_VERIFICATION_UNAVAILABLE_LABEL = 'Project Report verification unavailable';
export const REPORT_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  MISSING: 'missing',
  VERIFICATION_UNAVAILABLE: 'verification_unavailable',
});

/** The current fingerprint held for one version id, from a Map or a plain object. */
function fingerprintFor(byVersion, versionId) {
  if (!byVersion || !versionId) return null;
  if (typeof byVersion.get === 'function') return byVersion.get(versionId) ?? null;
  return byVersion[versionId] ?? null;
}

/**
 * Derive each version's document status from the project's saved reports and
 * proposals.
 *
 * @param {Object} input
 * @param {Array<Object>} input.snapshots   saved reports (ReportSnapshot), any order
 * @param {Array<Object>} input.proposals   saved proposals, newest first
 * @param {Map|Object|null} [input.currentFingerprintByVersion] each version's
 *   current authority fingerprint, so the canonical report is resolved against
 *   the design the version holds now.
 * @param {Map|Object|null} [input.publicationsByVersion] each version's
 *   engineering_publications map (fingerprint → publication), so a fingerprint
 *   mismatch is judged by the SAME canonical design-fact comparison
 *   (identifyDesignChanges) the Document Workflow cards use — not a second
 *   independent fingerprint-string calculation. A mismatch with no design
 *   change is a presentation-only move (Current); an established change is
 *   Stale; a publication that cannot be read is Verification unavailable.
 * @returns {Map<string, {
 *   reportsState: string,
 *   reportsLabel: string,
 *   reportsGenerated: string[],
 *   proposal: Object|null,
 *   proposalStatus: string|null,
 *   proposalLabel: string|null,
 * }>}
 */
export function deriveVersionDocumentStatus({
  snapshots = [],
  proposals = [],
  currentFingerprintByVersion = null,
  publicationsByVersion = null,
} = {}) {
  const entries = new Map();
  const entryFor = (versionId) => {
    if (!versionId) return null;
    if (!entries.has(versionId)) {
      entries.set(versionId, { reportStatusByType: {}, proposal: null });
    }
    return entries.get(versionId);
  };

  const publicationsFor = (versionId) => {
    if (!publicationsByVersion || !versionId) return null;
    if (typeof publicationsByVersion.get === 'function') return publicationsByVersion.get(versionId) ?? null;
    return publicationsByVersion[versionId] ?? null;
  };

  // Every version the caller knows about gets an entry, so a version with no
  // report and no proposal still receives the authority's "No report yet"
  // label rather than a fallback the component invents.
  if (currentFingerprintByVersion) {
    const versionIds = typeof currentFingerprintByVersion.keys === 'function'
      ? [...currentFingerprintByVersion.keys()]
      : Object.keys(currentFingerprintByVersion);
    versionIds.forEach((versionId) => { entryFor(versionId); });
  }

  // ONE saved report per version and report type — the CANONICAL one, resolved
  // by the same rule every other surface uses (collapseLiveReports →
  // selectCanonicalReportSnapshot), so a newer stale or incomplete duplicate
  // cannot make this version read "needs updating" while the Library and the
  // report pages show a Current report.
  collapseLiveReports(snapshots, { currentFingerprintByVersion })
    .filter(isSnapshotRestorable)
    .forEach((snapshot) => {
      if (!REPORT_TYPES.includes(snapshot.report_type)) return;
      const versionId = snapshot.version_id;
      const entry = entryFor(versionId);
      if (!entry) return;
      const currentFingerprint = fingerprintFor(currentFingerprintByVersion, versionId) || null;
      const savedFingerprint = snapshot.source_fingerprints?.engineeringFingerprint || null;

      // Judge a fingerprint mismatch by the SAME canonical design-fact
      // comparison the Document Workflow cards use (identifyDesignChanges),
      // not a second fingerprint-string calculation. When the two frozen
      // publications state the same physical design, the move is
      // presentation-only and the saved report stays Current. When a
      // publication cannot be read, verification is unavailable — distinct
      // from a confirmed design change — so the badge never reads "needs
      // updating" for a document whose validity simply could not be checked.
      let presentationOnlyMove = false;
      let verificationUnavailable = !!currentFingerprint && !!publicationsFor(versionId) && !publicationsFor(versionId)[currentFingerprint];
      if (currentFingerprint && savedFingerprint && savedFingerprint !== currentFingerprint) {
        // Only upgrade to the canonical design-fact comparison when the
        // version's engineering_publications are available. When they are not
        // (the hook has not loaded them, or no version carries a published
        // fingerprint), fall back to the same fingerprint-string comparison
        // the report pages use, so the badge never reads "verification
        // unavailable" merely because publications have not been read yet.
        const publications = publicationsFor(versionId);
        if (publications) {
          const savedPublication = publications[savedFingerprint] || null;
          const currentPublication = publications[currentFingerprint] || null;
          if (savedPublication && currentPublication) {
            const changes = identifyDesignChanges(savedPublication, currentPublication);
            if (changes == null) {
              verificationUnavailable = true;
            } else {
              presentationOnlyMove = changes.length === 0;
            }
          } else {
            verificationUnavailable = true;
          }
        }
      }

      if (verificationUnavailable) {
        entry.reportStatusByType[snapshot.report_type] = REPORT_STATE.VERIFICATION_UNAVAILABLE;
        return;
      }

      // The status the report pages and the Proposal Centre read: the saved
      // report's own fingerprints compared against the version's current
      // published authority. No second status calculation is introduced here.
      const resolution = resolveSnapshotStatus({
        saved: snapshot,
        currentFingerprints: {
          engineeringFingerprint: currentFingerprint,
        },
        presentationOnlyMove,
      });
      if (resolution.status === 'none') return;
      entry.reportStatusByType[snapshot.report_type] = resolution.status;
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
    const verificationUnavailable = generated.some(
      (type) => entry.reportStatusByType[type] === REPORT_STATE.VERIFICATION_UNAVAILABLE,
    );
    const reportsState = generated.length === 0
      ? REPORT_STATE.MISSING
      : (stale
        ? REPORT_STATE.STALE
        : (verificationUnavailable ? REPORT_STATE.VERIFICATION_UNAVAILABLE : REPORT_STATE.CURRENT));

    statusByVersionId.set(versionId, {
      reportsState,
      reportsGenerated: generated,
      // The dealer's words: a version's Project Report is current, the design
      // has moved on and it needs updating, or its validity could not be
      // verified. No internal state name is rendered.
      reportsLabel: generated.length === 0
        ? NO_REPORTS_LABEL
        : (stale
          ? REPORTS_NEED_UPDATING_LABEL
          : (verificationUnavailable ? REPORTS_VERIFICATION_UNAVAILABLE_LABEL : CURRENT_REPORTS_LABEL)),
      proposal: entry.proposal,
      proposalStatus: entry.proposal?.status || null,
      proposalLabel: entry.proposal ? getStatusLabel(entry.proposal.status) : null,
    });
  });

  return statusByVersionId;
}

export default deriveVersionDocumentStatus;