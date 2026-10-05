// ReportSnapshotBanner.jsx
// ------------------------
// The saved-report banner shown above a report that was generated before the
// latest changes to the project. The report itself stays fully visible and is
// never blanked; the banner states what moved on, when the report was generated
// and by whom, and offers Regenerate.
//
// Presentation only: the caller supplies the status and the regenerate action.

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
  const stale = status === REPORT_SNAPSHOT_STATUS.STALE;
  if (!stale && !evidenceIncomplete) return null;

  const when = formatGeneratedAt(generatedAt);
  const author = (typeof generatedBy === 'string' && generatedBy.trim()) ? generatedBy.trim() : null;
  const stamp = [when ? `Generated ${when}` : null, author ? `by ${author}` : null]
    .filter(Boolean)
    .join(' ');
  const mismatchList = (Array.isArray(evidenceMismatches) ? evidenceMismatches : [])
    .map((entry) => entry?.key || entry?.area)
    .filter(Boolean)
    .slice(0, 6);

  return (
    <div className={className} style={BANNER}>
      <AlertTriangle className="w-4 h-4 mt-[2px] flex-shrink-0" style={{ color: '#B08A3E' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {stale ? (
          <>
            <strong style={{ color: '#213428' }}>
              This {reportTypeLabel(reportType)} was generated before the latest changes.
            </strong>{' '}
            {buildStaleSentence(changedKeys)}
            {stamp ? ` ${stamp}.` : ''}{' '}
            The saved report is shown unchanged. Regenerate it to bring it up to date.
          </>
        ) : (
          <>
            <strong style={{ color: '#213428' }}>
              This {reportTypeLabel(reportType)} is incomplete for proposal use.
            </strong>{' '}
            The evidence saved with this report does not match the values the report shows
            {mismatchList.length > 0 ? ` (${mismatchList.join(', ')})` : ''}.
            A proposal cannot use this report until it is regenerated.
            {stamp ? ` ${stamp}.` : ''}
          </>
        )}
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
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
      )}
    </div>
  );
}