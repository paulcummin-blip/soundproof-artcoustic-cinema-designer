/**
 * libraryProposalReadiness.js
 * ---------------------------
 * The Project Library's proposal-readiness words: what the Generated Reports tab
 * says when the designer's real question is "can I go to Proposal now?".
 *
 * The verdict is NOT derived here. It comes from the ONE readiness authority the
 * Proposal Centre already uses — useLibraryProposalReadiness wraps
 * useProposalReadiness + resolveProposalReadinessGate — so the banner and the
 * Proposal Centre can never disagree. This module only translates that verdict
 * into the Library's plain words and names the single action that unblocks it.
 *
 * The words avoid every internal term: no fingerprints, no report payloads, no
 * engine state names and no publication vocabulary reach the screen from here.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

import {
  READINESS_SOURCE,
  READINESS_STATE,
  resolveProposalReadinessGate,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';
import { PROPOSAL_SOURCE_REPORT } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

/** The banner's two verdicts. */
export const LIBRARY_READINESS_HEADLINE = Object.freeze({
  READY: 'Ready for Proposal',
  NOT_READY: 'Not ready for Proposal',
});

/** Shown under Ready for Proposal. */
export const LIBRARY_READY_DETAIL = 'All selected versions have current Visual and Technical Reports.';

/** Shown while the versions are still being read. */
export const LIBRARY_CHECKING_DETAIL = 'Checking each version’s reports…';

/** The checklist's simple status words. */
export const LIBRARY_CHECKLIST_STATUS = Object.freeze({
  READY: 'Ready',
  NEEDS_UPDATE: 'Needs updated report',
  NOT_GENERATED: 'Not generated',
  NEEDS_ENGINEERING: 'Needs engineering results',
});

/** Every action the banner offers. */
export const LIBRARY_READINESS_ACTION = Object.freeze({
  CREATE_PROPOSAL: 'Create Proposal',
  VIEW_PROPOSAL_CENTRE: 'View Proposal Centre',
  CREATE_UPDATED: 'Create updated report',
  GENERATE: 'Generate report',
  OPEN_REPORT: 'Open report',
  OPEN_ROOM_DESIGNER: 'Open Room Designer',
});

/** The one report the banner names in its blocking sentence. */
export const LIBRARY_COMBINED_REPORTS_LABEL = 'Visual and Technical Reports';

/** The checklist's report rows, in reading order. */
export const LIBRARY_READINESS_CELLS = Object.freeze([
  { source: READINESS_SOURCE.VISUAL, label: 'Visual Report' },
  { source: READINESS_SOURCE.TECHNICAL, label: 'Technical Report' },
]);

/** An action the banner can offer, with the version and report it acts on. */
function readinessAction(label, kind, extra = {}) {
  return { label, kind, reportType: null, versionId: null, ...extra };
}

/** The report type a readiness source names, or null for the engineering row. */
function reportTypeOf(source) {
  if (source === READINESS_SOURCE.VISUAL) return PROPOSAL_SOURCE_REPORT.VISUAL;
  if (source === READINESS_SOURCE.TECHNICAL) return PROPOSAL_SOURCE_REPORT.TECHNICAL;
  return null;
}

/**
 * One cell's plain status word — Ready, Needs updated report or Not generated.
 * A cell that is still being read states nothing.
 */
export function libraryCellStatus({ source, cell } = {}) {
  const state = cell?.state;
  if (!state || state === READINESS_STATE.CHECKING) return null;
  if (state === READINESS_STATE.CURRENT) return LIBRARY_CHECKLIST_STATUS.READY;
  if (source === READINESS_SOURCE.ENGINEERING) return LIBRARY_CHECKLIST_STATUS.NEEDS_ENGINEERING;
  if (state === READINESS_STATE.MISSING) return LIBRARY_CHECKLIST_STATUS.NOT_GENERATED;
  return LIBRARY_CHECKLIST_STATUS.NEEDS_UPDATE;
}

/** What one blocked version needs, as a clause. */
function blockerClause(blocker) {
  const label = blocker?.label || 'report';
  if (blocker?.source === READINESS_SOURCE.ENGINEERING) {
    return 'needs its engineering results calculated and saved';
  }
  if (blocker?.state === READINESS_STATE.MISSING) return `needs its ${label} generated`;
  if (blocker?.state === READINESS_STATE.LEGACY) return `needs its ${label} refreshed once`;
  return `needs an updated ${label}`;
}

/** The one sentence naming what stands between this project and a proposal. */
export function libraryBlockerSentence(row) {
  if (!row || row.ready || row.checking) return null;
  const blocker = (row.blockers || [])[0] || null;
  if (!blocker) return null;
  return `${row.versionName} ${blockerClause(blocker)} before a proposal can be created.`;
}

/**
 * One version's own readiness line: "Ready for Proposal", or exactly what it
 * still needs — "Needs updated Technical Report".
 */
export function libraryVersionReadinessLine(row) {
  if (!row || row.checking) return null;
  if (row.ready) return LIBRARY_READINESS_HEADLINE.READY;

  const blockers = Array.isArray(row.blockers) ? row.blockers : [];
  const reportBlockers = blockers.filter((blocker) => blocker.source !== READINESS_SOURCE.ENGINEERING);
  if (reportBlockers.length >= 2) return `Needs updated ${LIBRARY_COMBINED_REPORTS_LABEL}`;
  if (reportBlockers.length === 1) {
    const blocker = reportBlockers[0];
    return blocker.state === READINESS_STATE.MISSING
      ? `Needs ${blocker.label} generated`
      : `Needs updated ${blocker.label}`;
  }
  if (blockers.length > 0) return LIBRARY_CHECKLIST_STATUS.NEEDS_ENGINEERING;
  return null;
}

/** The single action that unblocks the first blocked version. */
function fixActionFor(row) {
  const blocker = (row?.blockers || [])[0] || null;
  const reportType = reportTypeOf(blocker?.source);
  if (!reportType) {
    return readinessAction(LIBRARY_READINESS_ACTION.OPEN_ROOM_DESIGNER, 'room-designer', {
      versionId: row?.versionId || null,
    });
  }
  const target = { reportType, versionId: row?.versionId || null };
  if (blocker.state === READINESS_STATE.MISSING) return readinessAction(LIBRARY_READINESS_ACTION.GENERATE, 'generate', target);
  if (blocker.state === READINESS_STATE.LEGACY) return readinessAction(LIBRARY_READINESS_ACTION.OPEN_REPORT, 'open', target);
  return readinessAction(LIBRARY_READINESS_ACTION.CREATE_UPDATED, 'update', target);
}

/**
 * The Library's readiness verdict, in the designer's words.
 *
 * @param {Object} params
 * @param {Array} params.rows        the readiness rows, one per design version
 * @param {boolean} [params.loading] the read is in flight
 * @param {Array} [params.versions]  the design versions, in Library order
 * @returns {Object} — headline, detail, checklist, showChecklist and the actions
 */
export function buildLibraryProposalReadiness({ rows = [], loading = false, versions = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const gate = resolveProposalReadinessGate({ rows: list, loading, minVersions: 1 });

  // The checklist reads in the order the version sections are shown, so the
  // banner and the sections below it name the versions in the same order.
  const orderedRows = (Array.isArray(versions) ? versions : [])
    .map((version) => list.find((row) => row.versionId === version.id))
    .filter(Boolean);
  const rowsInOrder = orderedRows.length > 0 ? orderedRows : list;

  const checklist = rowsInOrder.map((row) => ({
    versionId: row.versionId,
    versionName: row.versionName,
    ready: row.ready,
    line: libraryVersionReadinessLine(row),
    cells: LIBRARY_READINESS_CELLS.map(({ source, label }) => ({
      source,
      label,
      status: libraryCellStatus({ source, cell: row.cells?.[source] }),
    })),
  }));

  const blockedCells = checklist.reduce(
    (total, entry) => total
      + entry.cells.filter((cell) => cell.status && cell.status !== LIBRARY_CHECKLIST_STATUS.READY).length,
    0,
  );
  const firstBlockedRow = rowsInOrder.find((row) => !row.ready) || null;

  return {
    checking: gate.checking,
    ready: gate.ready,
    headline: gate.checking
      ? null
      : gate.ready
        ? LIBRARY_READINESS_HEADLINE.READY
        : LIBRARY_READINESS_HEADLINE.NOT_READY,
    detail: gate.checking
      ? LIBRARY_CHECKING_DETAIL
      : gate.ready
        ? LIBRARY_READY_DETAIL
        : libraryBlockerSentence(firstBlockedRow),
    checklist,
    // One blocked report reads as a sentence; several read as the short
    // checklist, so the designer sees every version at once.
    showChecklist: !gate.checking && blockedCells >= 2,
    primaryAction: gate.checking
      ? null
      : gate.ready
        ? readinessAction(LIBRARY_READINESS_ACTION.CREATE_PROPOSAL, 'create-proposal')
        : fixActionFor(firstBlockedRow),
    secondaryAction: !gate.checking && gate.ready
      ? readinessAction(LIBRARY_READINESS_ACTION.VIEW_PROPOSAL_CENTRE, 'proposal-centre')
      : null,
  };
}

export default buildLibraryProposalReadiness;