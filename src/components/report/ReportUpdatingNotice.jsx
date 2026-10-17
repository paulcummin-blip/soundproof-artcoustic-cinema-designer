/**
 * ReportUpdatingNotice
 * --------------------
 * The quiet line shown while Sound Proof prepares an updated report by itself.
 * It states what is happening and nothing else: no headline, no action and no
 * error treatment, because the designer has nothing to decide while it runs.
 *
 * Presentation only — the caller decides when an automatic update is running.
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';

export const UPDATING_REPORT_LABEL = 'Updating report…';

const NOTICE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 2px',
  marginBottom: 16,
  fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
  fontSize: 12,
  color: '#7A7468',
};

export default function ReportUpdatingNotice({ className = '' }) {
  return (
    <div className={className} style={NOTICE} data-report-updating="true">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: '#7A7468' }} />
      {UPDATING_REPORT_LABEL}
    </div>
  );
}