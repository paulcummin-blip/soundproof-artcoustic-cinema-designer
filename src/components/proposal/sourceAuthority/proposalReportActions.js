/**
 * proposalReportActions.js
 * ------------------------
 * The stable per-report action state behind the Proposal Centre "Proposal Source
 * Data" panel and the wizard's Versions step.
 *
 * TWO RULES:
 *
 * 1. The action is never withdrawn. Checking, missing, stale, failed and
 *    unresolved all keep it on screen, so the designer can always produce the
 *    report from this screen.
 * 2. The label never varies with the state: it is always "Generate <Report>".
 *    The status text — Current / Missing / Stale / Checking / Unavailable —
 *    already says whether the report exists, so the button never has to say
 *    anything more than what it does. The running state alone differs, because
 *    there the action cannot be run again.
 *
 * WHY THIS EXISTS
 * The source read is asynchronous. While it is in flight — and while the active
 * project version is still resolving — the report source is simply not known
 * yet. That window is presented as Checking, never as Missing, and it never
 * removes an action. Reporting the window as Missing is what made the buttons
 * disappear a few seconds after the panel appeared: the read settled on Current
 * and Current rendered no action at all.
 *
 * Derivation only: reads the existing proposal source status, generates no
 * report content and recalculates nothing.
 */

import {
  PROPOSAL_SOURCE_STATE,
  PROPOSAL_SOURCE_REPORT,
  PROPOSAL_SOURCE_REPORT_LABEL,
  PROPOSAL_SOURCE_REPORT_ROUTE,
  buildReportActionUrl,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

/** Both reports, always in this order. */
export const PROPOSAL_REPORT_ORDER = Object.freeze([
  PROPOSAL_SOURCE_REPORT.VISUAL,
  PROPOSAL_SOURCE_REPORT.TECHNICAL,
]);

/** The stable presentation states of one report source. */
export const PROPOSAL_REPORT_UI_STATE = Object.freeze({
  CHECKING: 'checking',
  CURRENT: 'current',
  /**
   * The report EXISTS and is current, but it predates the proposal evidence
   * capture. It needs refreshing — it is never presented as Missing.
   */
  LEGACY: 'legacy',
  MISSING: 'missing',
  STALE: 'stale',
  FAILED: 'failed',
  GENERATING: 'generating',
  UNRESOLVED: 'unresolved',
});

/** Canonical display text per UI state. */
export const PROPOSAL_REPORT_STATUS_TEXT = Object.freeze({
  [PROPOSAL_REPORT_UI_STATE.CHECKING]: 'Checking…',
  [PROPOSAL_REPORT_UI_STATE.CURRENT]: 'Current',
  [PROPOSAL_REPORT_UI_STATE.LEGACY]: 'Needs one-time evidence refresh',
  [PROPOSAL_REPORT_UI_STATE.MISSING]: 'Missing',
  [PROPOSAL_REPORT_UI_STATE.STALE]: 'Stale',
  [PROPOSAL_REPORT_UI_STATE.FAILED]: 'Unavailable',
  [PROPOSAL_REPORT_UI_STATE.GENERATING]: 'Generating…',
  [PROPOSAL_REPORT_UI_STATE.UNRESOLVED]: 'Unresolved',
});

/**
 * How long a requested generation counts as in flight without confirmation.
 * Bounded so a request can never leave a button stuck disabled.
 */
export const GENERATION_PENDING_MS = 60000;

const pendingGenerations = new Map();

/** Stable key for one report of one project version. */
export function generationKey(projectId, versionId, reportKey) {
  return `${projectId || '-'}:${versionId || '-'}:${reportKey || '-'}`;
}

/** Record that a generation was requested from this screen. */
export function markGenerationRequested(key, now = Date.now()) {
  if (!key) return false;
  pendingGenerations.set(key, now + GENERATION_PENDING_MS);
  return true;
}

/** Is a generation requested and still unconfirmed for this key? */
export function isGenerationPending(key, now = Date.now()) {
  const until = pendingGenerations.get(key);
  if (!until) return false;
  if (until <= now) {
    pendingGenerations.delete(key);
    return false;
  }
  return true;
}

/** Drop the pending flag — a confirmed Current report always clears it. */
export function clearGenerationPending(key) {
  pendingGenerations.delete(key);
}

/** Test helper: forget every pending generation request. */
export function clearAllPendingGenerations() {
  pendingGenerations.clear();
}

/**
 * The UI state of one report.
 *
 * A report that reads Current is definitive and wins over a pending request:
 * once generation has landed, the status is Current — not Generating.
 *
 * @param {Object} params
 * @param {string|null} params.reportState — source authority state
 * @param {boolean} params.checking        — the read has not settled
 * @param {boolean} params.generating      — a generation was requested
 * @returns {string} PROPOSAL_REPORT_UI_STATE
 */
export function resolveReportUiState({ reportState = null, checking = false, generating = false } = {}) {
  if (reportState === PROPOSAL_SOURCE_STATE.CURRENT) {
    return PROPOSAL_REPORT_UI_STATE.CURRENT;
  }
  if (generating) return PROPOSAL_REPORT_UI_STATE.GENERATING;
  if (checking) return PROPOSAL_REPORT_UI_STATE.CHECKING;

  switch (reportState) {
    case PROPOSAL_SOURCE_STATE.LEGACY:
      return PROPOSAL_REPORT_UI_STATE.LEGACY;
    case PROPOSAL_SOURCE_STATE.MISSING:
      return PROPOSAL_REPORT_UI_STATE.MISSING;
    case PROPOSAL_SOURCE_STATE.STALE:
      return PROPOSAL_REPORT_UI_STATE.STALE;
    case PROPOSAL_SOURCE_STATE.FAILED:
      return PROPOSAL_REPORT_UI_STATE.FAILED;
    default:
      return PROPOSAL_REPORT_UI_STATE.UNRESOLVED;
  }
}

/** The one action verb a report button ever uses. */
export const REPORT_ACTION_VERB = 'Generate';

/** The single button label for a report, identical in every runnable state. */
export function reportActionLabel(label) {
  return `${REPORT_ACTION_VERB} ${label}`;
}

/**
 * The action for a report.
 *
 * One label, always: "Generate <Report>", in every state where the report can
 * be run — missing, stale, failed, checking, unresolved and current. Only a
 * generation already in flight differs, and there the action is disabled.
 *
 * Emphasis is the only thing that softens: a Current report's action is quiet,
 * because re-running it is optional, while every other state is primary.
 *
 * @returns {{label: string, disabled: boolean, emphasis: 'primary'|'quiet'}}
 */
export function resolveReportAction({ label, uiState }) {
  if (uiState === PROPOSAL_REPORT_UI_STATE.GENERATING) {
    return { label: `Generating ${label}…`, disabled: true, emphasis: 'quiet' };
  }

  // A report that already exists and is current only needs its proposal
  // evidence refreshing. The action says exactly that, and never implies the
  // report is missing.
  if (uiState === PROPOSAL_REPORT_UI_STATE.LEGACY) {
    return { label: `Refresh ${label} evidence`, disabled: false, emphasis: 'primary' };
  }

  return {
    label: reportActionLabel(label),
    disabled: false,
    emphasis: uiState === PROPOSAL_REPORT_UI_STATE.CURRENT ? 'quiet' : 'primary',
  };
}

/**
 * One report row: its state, its display text, and its action.
 *
 * A confirmed Current report clears any pending generation request — the
 * generation has landed, so nothing is left in flight.
 *
 * @param {Object} params
 * @param {string} params.reportKey
 * @param {Object|null} params.report      — source authority report status
 * @param {boolean} [params.checking]      — the read has not settled
 * @param {boolean} [params.generating]    — a generation was requested
 * @param {string|null} [params.projectId]
 * @param {string|null} [params.versionId]
 * @param {string|null} [params.generatedAt]
 * @returns {Object} row
 */
export function buildReportActionRow({
  reportKey,
  report = null,
  checking = false,
  generating = false,
  projectId = null,
  versionId = null,
  generatedAt = null,
} = {}) {
  const key = report?.report || reportKey || null;
  const label = report?.label || PROPOSAL_SOURCE_REPORT_LABEL[key] || 'Report';
  const reportState = report?.state || null;
  const uiState = resolveReportUiState({ reportState, checking, generating });

  if (uiState === PROPOSAL_REPORT_UI_STATE.CURRENT) {
    clearGenerationPending(generationKey(projectId, versionId, key));
  }

  const action = resolveReportAction({ label, uiState });
  const route = report?.route || PROPOSAL_SOURCE_REPORT_ROUTE[key] || null;

  return {
    key,
    label,
    reportState,
    uiState,
    status: PROPOSAL_REPORT_STATUS_TEXT[uiState] || PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.UNRESOLVED],
    current: uiState === PROPOSAL_REPORT_UI_STATE.CURRENT,
    reason: uiState === PROPOSAL_REPORT_UI_STATE.CURRENT ? null : report?.reason || null,
    generatedAt: uiState === PROPOSAL_REPORT_UI_STATE.CURRENT ? generatedAt || null : null,
    actionLabel: action.label,
    actionUrl: buildReportActionUrl({ route, projectId, versionId }),
    actionDisabled: action.disabled,
    actionEmphasis: action.emphasis,
  };
}

/**
 * Every report row, in canonical order.
 *
 * @param {Object} params
 * @param {Object} [params.reports]        — source authority report statuses
 * @param {boolean} [params.checking]
 * @param {boolean} [params.generating]    — treat every report as generating
 * @param {(key: string) => boolean} [params.isGenerating] — per report
 * @param {string|null} [params.projectId]
 * @param {string|null} [params.versionId]
 * @param {string|null} [params.generatedAt]
 * @returns {Array} rows
 */
export function resolveReportActionRows({
  reports = {},
  checking = false,
  generating = false,
  isGenerating = null,
  projectId = null,
  versionId = null,
  generatedAt = null,
} = {}) {
  return PROPOSAL_REPORT_ORDER.map((reportKey) => {
    const report = reports?.[reportKey] || { report: reportKey };
    const rowGenerating = generating
      || (typeof isGenerating === 'function' && isGenerating(reportKey) === true);
    return buildReportActionRow({
      reportKey,
      report,
      checking,
      generating: rowGenerating,
      projectId,
      versionId,
      generatedAt,
    });
  });
}