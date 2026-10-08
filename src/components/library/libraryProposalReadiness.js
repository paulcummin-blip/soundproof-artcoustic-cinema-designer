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
 * The words are the dealer's words, and they are the same three states a report
 * row carries: Current, Update needed, Not generated. No internal term reaches
 * the screen from here — no fingerprints, no report payloads, no engine state
 * names, no evidence or publication vocabulary.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

import {
  READINESS_SOURCE,
  READINESS_STATE,
  resolveProposalReadinessGate,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';
import { PROPOSAL_SOURCE_REPORT } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

/** The banner's three verdicts. */
export const LIBRARY_VERDICT = Object.freeze({
  READY: 'ready',
  UPDATES_NEEDED: 'updates-needed',
  NOT_ASSESSED: 'not-assessed',
  CHECKING: 'checking',
});

/** The banner's title, per verdict. */
export const LIBRARY_READINESS_HEADLINE = Object.freeze({
  READY: 'Ready for Proposal',
  UPDATES_NEEDED: 'Update reports before creating a proposal',
  NOT_ASSESSED: 'Reports are not ready yet',
});

/** Shown under Ready for Proposal. */
export const LIBRARY_READY_DETAIL =
  'The current Visual and Technical Reports are ready for proposal creation.';

/** Shown when the design has moved past one or more reports. */
export const LIBRARY_UPDATES_NEEDED_DETAIL =
  'The design has changed since one or more reports were created. '
  + 'Create updated reports before preparing the proposal.';

/**
 * Shown when a version's reports were never created. The designer is told to
 * create them — not to "update" something that does not exist.
 */
export const LIBRARY_MISSING_REPORTS_HEADLINE = 'Create the reports before creating a proposal';

/** Shown under the missing-reports headline: exactly which report is absent. */
export const LIBRARY_MISSING_REPORTS_DETAIL =
  'One or more versions have no Visual or Technical Report yet. '
  + 'Create the reports named below, then prepare the proposal.';

/** Shown when a version has not been assessed, so its reports cannot be created. */
export const LIBRARY_NOT_ASSESSED_DETAIL =
  'One or more versions have not been fully assessed yet. '
  + 'Complete the assessment in the Room Designer, then create the reports.';

/** Shown while the versions are still being read. */
export const LIBRARY_CHECKING_DETAIL = 'Checking each version’s reports…';

/** The compact list's three status words. */
export const LIBRARY_CHECKLIST_STATUS = Object.freeze({
  READY: 'Ready',
  UPDATE_NEEDED: 'Update needed',
  NOT_GENERATED: 'Not generated',
});

/** Every action the banner offers. */
export const LIBRARY_READINESS_ACTION = Object.freeze({
  CREATE_PROPOSAL: 'Create Proposal',
  VIEW_PROPOSAL_CENTRE: 'View Proposal Centre',
  UPDATE_REQUIRED: 'Update required reports',
  GENERATE_REQUIRED: 'Generate required reports',
  VIEW_REPORTS: 'View reports',
  OPEN_ROOM_DESIGNER: 'Open Room Designer',
});

/** The compact list's report rows, in reading order. */
export const LIBRARY_READINESS_CELLS = Object.freeze([
  { source: READINESS_SOURCE.VISUAL, label: 'Visual Report' },
  { source: READINESS_SOURCE.TECHNICAL, label: 'Technical Report' },
]);

/** An action the banner can offer, with the version and report it acts on. */
function readinessAction(label, kind, extra = {}) {
  return { label, kind, reportType: null, versionId: null, ...extra };
}

/** The report type a readiness source names. */
function reportTypeOf(source) {
  return source === READINESS_SOURCE.VISUAL
    ? PROPOSAL_SOURCE_REPORT.VISUAL
    : PROPOSAL_SOURCE_REPORT.TECHNICAL;
}

/** A report cell that stands between this version and a proposal. */
function blockedReportCell(row) {
  for (const { source, label } of LIBRARY_READINESS_CELLS) {
    const cell = row?.cells?.[source];
    if (cell && !cell.current && !cell.checking) return { source, label, cell };
  }
  return null;
}

/**
 * Whether every report standing in the way was simply never created, as opposed
 * to one the design has moved past. The two read as different jobs, so they are
 * never described with the same words.
 */
function allBlockersMissing(rows) {
  const blocked = (Array.isArray(rows) ? rows : []).map((row) => blockedReportCell(row)).filter(Boolean);
  return blocked.length > 0 && blocked.every(({ cell }) => cell.state === READINESS_STATE.MISSING);
}

/**
 * One compact-list cell's status word — Ready, Update needed or Not generated.
 * A cell that is still being read states nothing, and no internal state name
 * ever reaches the list: every report state other than Current reads as Update
 * needed.
 */
export function libraryCellStatus({ cell } = {}) {
  const state = cell?.state;
  if (!state || state === READINESS_STATE.CHECKING) return null;
  if (state === READINESS_STATE.CURRENT) return LIBRARY_CHECKLIST_STATUS.READY;
  if (state === READINESS_STATE.MISSING) return LIBRARY_CHECKLIST_STATUS.NOT_GENERATED;
  return LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED;
}

/**
 * One version's own line: "Ready for Proposal" when it can go to Proposal, the
 * same words the report rows use when it cannot.
 */
export function libraryVersionReadinessLine(row) {
  if (!row || row.checking) return null;
  if (row.ready) return LIBRARY_READINESS_HEADLINE.READY;
  if (blockedReportCell(row)) return LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED;
  return 'Not assessed yet';
}

/** The one action that unblocks the first blocked version. */
function fixActionFor(row) {
  const blocked = blockedReportCell(row);
  if (!blocked) {
    return readinessAction(LIBRARY_READINESS_ACTION.OPEN_ROOM_DESIGNER, 'room-designer', {
      versionId: row?.versionId || null,
    });
  }
  // A report that was never created is GENERATED. "Update" is offered only for
  // a report that exists and has been overtaken by the design — the only case
  // the report page has something to update.
  const neverCreated = blocked.cell.state === READINESS_STATE.MISSING;
  return readinessAction(
    neverCreated ? LIBRARY_READINESS_ACTION.GENERATE_REQUIRED : LIBRARY_READINESS_ACTION.UPDATE_REQUIRED,
    neverCreated ? 'generate' : 'update',
    {
      reportType: reportTypeOf(blocked.source),
      versionId: row?.versionId || null,
    },
  );
}

/** The verdict the gate's own rows read as, in the Library's words. */
function verdictFor({ checking, ready, rows }) {
  if (checking) return LIBRARY_VERDICT.CHECKING;
  if (ready) return LIBRARY_VERDICT.READY;
  return rows.some((row) => blockedReportCell(row))
    ? LIBRARY_VERDICT.UPDATES_NEEDED
    : LIBRARY_VERDICT.NOT_ASSESSED;
}

const VERDICT_DETAIL = {
  [LIBRARY_VERDICT.READY]: LIBRARY_READY_DETAIL,
  [LIBRARY_VERDICT.UPDATES_NEEDED]: LIBRARY_UPDATES_NEEDED_DETAIL,
  [LIBRARY_VERDICT.NOT_ASSESSED]: LIBRARY_NOT_ASSESSED_DETAIL,
  [LIBRARY_VERDICT.CHECKING]: LIBRARY_CHECKING_DETAIL,
};

/**
 * The Library's readiness verdict, in the designer's words.
 *
 * @param {Object} params
 * @param {Array} params.rows        the readiness rows, one per design version
 * @param {boolean} [params.loading] the read is in flight
 * @param {Array} [params.versions]  the design versions, in Library order
 * @returns {Object} — verdict, headline, detail, checklist, showChecklist and the actions
 */
export function buildLibraryProposalReadiness({ rows = [], loading = false, versions = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const gate = resolveProposalReadinessGate({ rows: list, loading, minVersions: 1 });

  // The compact list reads in the order the version sections are shown, so the
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
      status: libraryCellStatus({ cell: row.cells?.[source] }),
    })),
  }));

  const blockedCells = checklist.reduce(
    (total, entry) => total
      + entry.cells.filter((cell) => cell.status && cell.status !== LIBRARY_CHECKLIST_STATUS.READY).length,
    0,
  );
  const firstBlockedRow = rowsInOrder.find((row) => !row.ready) || null;
  const verdict = verdictFor({ checking: gate.checking, ready: gate.ready, rows: rowsInOrder });
  const ready = verdict === LIBRARY_VERDICT.READY;
  // A report that was never created and a report the design has moved past are
  // two different jobs, so the headline and the one action say which is asked.
  const missingReportsOnly = verdict === LIBRARY_VERDICT.UPDATES_NEEDED && allBlockersMissing(rowsInOrder);

  return {
    checking: gate.checking,
    ready: gate.ready,
    verdict,
    headline: verdict === LIBRARY_VERDICT.CHECKING
      ? null
      : verdict === LIBRARY_VERDICT.READY
        ? LIBRARY_READINESS_HEADLINE.READY
        : verdict === LIBRARY_VERDICT.UPDATES_NEEDED
          ? (missingReportsOnly ? LIBRARY_MISSING_REPORTS_HEADLINE : LIBRARY_READINESS_HEADLINE.UPDATES_NEEDED)
          : LIBRARY_READINESS_HEADLINE.NOT_ASSESSED,
    detail: missingReportsOnly ? LIBRARY_MISSING_REPORTS_DETAIL : VERDICT_DETAIL[verdict],
    checklist,
    // The short per-version list is shown whenever a report stands in the way,
    // so the designer sees which report and which version at a glance.
    showChecklist: !gate.checking && blockedCells >= 1,
    primaryAction: gate.checking
      ? null
      : ready
        ? readinessAction(LIBRARY_READINESS_ACTION.CREATE_PROPOSAL, 'create-proposal')
        : fixActionFor(firstBlockedRow),
    secondaryAction: gate.checking
      ? null
      : ready
        ? readinessAction(LIBRARY_READINESS_ACTION.VIEW_PROPOSAL_CENTRE, 'proposal-centre')
        : readinessAction(LIBRARY_READINESS_ACTION.VIEW_REPORTS, 'view-reports'),
  };
}

export default buildLibraryProposalReadiness;