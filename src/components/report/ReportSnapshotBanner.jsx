// ReportSnapshotBanner.jsx
// ------------------------
// The notice shown above a report that was created before the latest design
// change. It is deliberately small and secondary: the report itself stays the
// headline act on the page.
//
// A dealer or client reads exactly three things: the design has moved on, the
// report on screen is the previous saved report, and one action creates an
// updated one. Nothing else reaches the screen — no fingerprint or gate detail,
// no stale vocabulary, no publication wording, no generation metadata.
//
// A stale report that Sound Proof is updating by itself reaches the screen as
// nothing at all: there is no decision in it, so no notice and no button is
// shown while that work runs. The notice returns only when the update could not
// be finished, when a retry is genuinely needed.
//
// Which inputs moved on, when the report was generated and by whom, and any
// evidence mismatch are diagnostics: they are mounted only for a true internal
// master admin or an Engineering Mode session, and even then they are collapsed.
//
// Presentation only: the caller supplies the status and the regenerate action.
// No staleness, fingerprint or regeneration rule lives here.

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import useInternalReportAudience from './useInternalReportAudience';
import {
  REPORT_SNAPSHOT_STATUS,
  buildStaleSentence,
  reportTypeLabel,
} from './reportSnapshotAuthority';

/** Dealer-facing copy. Exported so it can be asserted as written. */
export const DESIGN_UPDATED_HEADLINE = 'DESIGN UPDATED';
export const DESIGN_UPDATED_TEXT = 'This report was created before the latest design changes.';
export const DESIGN_UPDATED_SECONDARY = 'You are viewing the previous report.';
export const UPDATE_NEEDED_HEADLINE = 'REPORT NEEDS UPDATING';
export const UPDATE_NEEDED_BANNER_TEXT = 'This report needs updating before it can be used in a proposal.';
export const CREATE_UPDATED_REPORT_LABEL = 'Create Updated Report';
export const CREATING_UPDATED_REPORT_LABEL = 'Creating Updated Report…';
// The automatic update was attempted and produced no stored report: the report
// is genuinely out of date and only a retry can bring it up to date.
export const UPDATE_FAILED_HEADLINE = 'REPORT UPDATE FAILED';
export const UPDATE_FAILED_TEXT = 'The updated report could not be prepared, so the previous report is still shown.';
export const RETRY_LABEL = 'Retry';
export const RETRYING_LABEL = 'Retrying…';
// A save that produced no stored report is never presented as success.
export const NOT_SAVED_HEADLINE = 'REPORT NOT SAVED';
export const NOT_SAVED_TEXT = 'This report could not be saved, so it is not yet available in the Project Library. Try again.';
export const TRY_AGAIN_LABEL = 'Try Again';
export const TRYING_AGAIN_LABEL = 'Trying Again…';

const NOTICE = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  background: '#FBF7EF',
  border: '1px solid #EAE0CD',
  borderRadius: 8,
  padding: '8px 12px',
  marginBottom: 16,
  fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
};

const TEXT = { flex: '1 1 260px', minWidth: 0 };

const HEADLINE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: '#8A6A2F',
  marginBottom: 2,
};

const COPY = { fontSize: 12.5, lineHeight: 1.45, color: '#3E4349' };
const SECONDARY = { fontSize: 11.5, lineHeight: 1.4, color: '#7A7468', marginTop: 1 };

const BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  cursor: 'pointer',
  background: '#213428',
  border: '1px solid #213428',
  borderRadius: 6,
  padding: '6px 12px',
  color: '#FFFFFF',
  fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};

const BUTTON_BUSY = {
  cursor: 'default',
  background: '#EDE6D6',
  color: '#7A6640',
};

const DIAGNOSTICS = {
  marginTop: 6,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  color: '#8A8580',
  wordBreak: 'break-word',
};

const DIAGNOSTICS_SUMMARY = {
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#A39C90',
  listStyle: 'none',
};

function formatGeneratedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ReportSnapshotBanner({
  status,
  reportType,
  changedKeys = [],
  generatedAt = null,
  generatedBy = null,
  regenerating = false,
  onRegenerate = null,
  // Sound Proof is preparing an updated copy of this stale report by itself, so
  // the designer is asked nothing. Set by the page that owns the automatic
  // update; absent means the caller handles the stale report itself and the
  // notice is shown as before.
  autoUpdating = false,
  // That automatic update was attempted and produced no stored report.
  autoUpdateFailed = false,
  // The report's own evidence did not agree with what the report shows, so a
  // proposal may not read it. The report itself stays fully visible.
  evidenceIncomplete = false,
  evidenceMismatches = [],
  // No report record was written, so this report exists only on screen. One
  // plain sentence reaches the designer; the technical reason stays collapsed
  // and internal, exactly as the other diagnostics do.
  saveFailed = false,
  blockedReason = null,
  onRetry = null,
  className = '',
}) {
  const internalAudience = useInternalReportAudience();

  const stale = status === REPORT_SNAPSHOT_STATUS.STALE;
  const notSaved = !stale && !evidenceIncomplete && !!saveFailed;
  // Automatic work is not a notice. While Sound Proof is updating the report
  // itself the designer is told nothing; if that update could not be finished
  // the report is stated as failed with the one action that helps.
  const automaticUpdate = stale && autoUpdating === true;
  const updateFailed = automaticUpdate && autoUpdateFailed === true;
  if (automaticUpdate && !updateFailed) return null;
  if (!stale && !evidenceIncomplete && !notSaved) return null;

  // Diagnostics: internal audiences only, and collapsed whenever they exist.
  const when = formatGeneratedAt(generatedAt);
  const author = (typeof generatedBy === 'string' && generatedBy.trim()) ? generatedBy.trim() : null;
  const stamp = [when ? `Generated ${when}` : null, author ? `by ${author}` : null]
    .filter(Boolean)
    .join(' ');
  const mismatchList = (Array.isArray(evidenceMismatches) ? evidenceMismatches : [])
    .map((entry) => entry?.key || entry?.area)
    .filter(Boolean)
    .slice(0, 6);
  const diagnosticLine = updateFailed
    ? [
      buildStaleSentence(changedKeys),
      typeof blockedReason === 'string' && blockedReason.trim() ? blockedReason.trim() : 'The automatic update was attempted and produced no stored report.',
      stamp ? `${stamp}.` : null,
    ].filter(Boolean).join(' ')
    : stale
      ? [buildStaleSentence(changedKeys), stamp ? `${stamp}.` : null].filter(Boolean).join(' ')
      : notSaved
      ? [typeof blockedReason === 'string' && blockedReason.trim() ? blockedReason.trim() : 'The report record was not written.', stamp ? `${stamp}.` : null].filter(Boolean).join(' ')
      : [
        `This ${reportTypeLabel(reportType)} is incomplete for proposal use.`,
        mismatchList.length > 0 ? `Mismatched values: ${mismatchList.join(', ')}.` : null,
        stamp ? `${stamp}.` : null,
      ].filter(Boolean).join(' ');

  const headline = updateFailed ? UPDATE_FAILED_HEADLINE
    : stale ? DESIGN_UPDATED_HEADLINE
      : notSaved ? NOT_SAVED_HEADLINE
        : UPDATE_NEEDED_HEADLINE;
  const copy = updateFailed ? UPDATE_FAILED_TEXT
    : stale ? DESIGN_UPDATED_TEXT
      : notSaved ? NOT_SAVED_TEXT
        : UPDATE_NEEDED_BANNER_TEXT;
  const action = (updateFailed || notSaved) ? onRetry : onRegenerate;

  return (
    <div
      className={className}
      style={NOTICE}
      data-report-snapshot-banner={
        updateFailed ? 'update-failed' : (stale ? 'stale' : (notSaved ? 'not-saved' : 'update-needed'))
      }
    >
      <div style={TEXT}>
        <div style={HEADLINE}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#B08A3E' }} />
          {headline}
        </div>
        <div style={COPY}>{copy}</div>
        {stale && !updateFailed ? <div style={SECONDARY}>{DESIGN_UPDATED_SECONDARY}</div> : null}
        {internalAudience && diagnosticLine ? (
          <details style={{ marginTop: 6 }}>
            <summary style={DIAGNOSTICS_SUMMARY}>Show diagnostics</summary>
            <div style={DIAGNOSTICS} data-report-snapshot-diagnostics="true">{diagnosticLine}</div>
          </details>
        ) : null}
      </div>
      {action && (
        <button
          type="button"
          onClick={action}
          disabled={regenerating}
          aria-busy={regenerating}
          style={regenerating ? { ...BUTTON, ...BUTTON_BUSY } : BUTTON}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: regenerating ? '#7A6640' : '#FFFFFF' }} />
          {updateFailed
            ? (regenerating ? RETRYING_LABEL : RETRY_LABEL)
            : notSaved
              ? (regenerating ? TRYING_AGAIN_LABEL : TRY_AGAIN_LABEL)
              : (regenerating ? CREATING_UPDATED_REPORT_LABEL : CREATE_UPDATED_REPORT_LABEL)}
        </button>
      )}
    </div>
  );
}