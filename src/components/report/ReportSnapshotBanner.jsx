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
  // The report's own evidence did not agree with what the report shows, so a
  // proposal may not read it. The report itself stays fully visible.
  evidenceIncomplete = false,
  evidenceMismatches = [],
  className = '',
}) {
  const internalAudience = useInternalReportAudience();

  const stale = status === REPORT_SNAPSHOT_STATUS.STALE;
  if (!stale && !evidenceIncomplete) return null;

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
  const diagnosticLine = stale
    ? [buildStaleSentence(changedKeys), stamp ? `${stamp}.` : null].filter(Boolean).join(' ')
    : [
      `This ${reportTypeLabel(reportType)} is incomplete for proposal use.`,
      mismatchList.length > 0 ? `Mismatched values: ${mismatchList.join(', ')}.` : null,
      stamp ? `${stamp}.` : null,
    ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      style={NOTICE}
      data-report-snapshot-banner={stale ? 'stale' : 'update-needed'}
    >
      <div style={TEXT}>
        <div style={HEADLINE}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#B08A3E' }} />
          {stale ? DESIGN_UPDATED_HEADLINE : UPDATE_NEEDED_HEADLINE}
        </div>
        <div style={COPY}>{stale ? DESIGN_UPDATED_TEXT : UPDATE_NEEDED_BANNER_TEXT}</div>
        {stale ? <div style={SECONDARY}>{DESIGN_UPDATED_SECONDARY}</div> : null}
        {internalAudience && diagnosticLine ? (
          <details style={{ marginTop: 6 }}>
            <summary style={DIAGNOSTICS_SUMMARY}>Show diagnostics</summary>
            <div style={DIAGNOSTICS} data-report-snapshot-diagnostics="true">{diagnosticLine}</div>
          </details>
        ) : null}
      </div>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          aria-busy={regenerating}
          style={regenerating ? { ...BUTTON, ...BUTTON_BUSY } : BUTTON}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: regenerating ? '#7A6640' : '#FFFFFF' }} />
          {regenerating ? CREATING_UPDATED_REPORT_LABEL : CREATE_UPDATED_REPORT_LABEL}
        </button>
      )}
    </div>
  );
}