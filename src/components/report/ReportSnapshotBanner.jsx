// ReportSnapshotBanner.jsx
// ------------------------
// The saved-report banner shown above a report that was created before the
// latest design update. The report itself stays fully visible and is never
// blanked; the banner states plainly that the design moved on, and offers the
// one action that brings the report up to date.
//
// The dealer-facing wording is deliberately plain: no bass, gate, stale,
// evidence or publication vocabulary reaches the screen. Which inputs moved on,
// when the report was generated and by whom, and any evidence mismatch are
// diagnostics: they are shown only to a master admin or with Engineering Mode on
// (the development preview flag).
//
// Presentation only: the caller supplies the status and the regenerate action.

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isMasterAdmin } from '@/lib/accountAccess';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';
import {
  REPORT_SNAPSHOT_STATUS,
  buildStaleSentence,
  reportTypeLabel,
} from './reportSnapshotAuthority';

const BANNER = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  background: '#F7F1E6',
  border: '1px solid #E2D7BE',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  color: '#7A6640',
  fontSize: 13,
  lineHeight: 1.55,
  fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
};

/** What the designer reads when the design has moved past the saved report. */
export const STALE_BANNER_TEXT = 'This report was created before the latest design update.';

/** What the designer reads when the saved report must be recreated to be usable. */
export const UPDATE_NEEDED_BANNER_TEXT = 'This report needs updating before it can be used in a proposal.';

/** The line both states end on. */
export const BANNER_UNCHANGED_TEXT = 'The saved report is shown unchanged.';

const DIAGNOSTIC = {
  marginTop: 6,
  fontSize: 11,
  color: '#8A8580',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();

  const stale = status === REPORT_SNAPSHOT_STATUS.STALE;
  if (!stale && !evidenceIncomplete) return null;

  // Diagnostics only: master admin, or the development preview flag.
  const showDiagnostics = isMasterAdmin(user) || engineeringMode === true;

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
    <div className={className} style={BANNER} data-report-snapshot-banner={stale ? 'stale' : 'update-needed'}>
      <AlertTriangle className="w-4 h-4 mt-[2px] flex-shrink-0" style={{ color: '#B08A3E' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ color: '#213428' }}>
          {stale ? STALE_BANNER_TEXT : UPDATE_NEEDED_BANNER_TEXT}
        </strong>{' '}
        {BANNER_UNCHANGED_TEXT}
        {showDiagnostics && diagnosticLine ? (
          <div style={DIAGNOSTIC} data-report-snapshot-diagnostics="true">{diagnosticLine}</div>
        ) : null}
      </div>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            cursor: regenerating ? 'default' : 'pointer',
            background: regenerating ? '#EDE6D6' : '#213428',
            border: '1px solid #213428',
            borderRadius: 8,
            padding: '7px 14px',
            color: regenerating ? '#7A6640' : '#FFFFFF',
            fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: regenerating ? '#7A6640' : '#FFFFFF' }} />
          {regenerating ? 'Creating updated report…' : 'Create updated report'}
        </button>
      )}
    </div>
  );
}