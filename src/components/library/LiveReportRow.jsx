/**
 * LiveReportRow
 * -------------
 * One version's current live report — the editable authority the designer opens
 * or regenerates. Offered alongside the exported PDFs so the Library shows what
 * the project currently holds as well as what was issued.
 *
 * Regenerate opens the report itself, which is where a report is regenerated.
 *
 * Presentation only.
 */

import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import LibraryStatusLabel from './LibraryStatusLabel';
import { LIBRARY_SOURCE_STATE } from './librarySourceStatus';
import { formatLibraryDate } from './libraryFormat';

export default function LiveReportRow({
  reportLabel,
  versionText,
  generatedAt,
  generatedBy,
  statusLabel,
  sourceChanged = false,
  onOpen,
  onRegenerate,
}) {
  const generatedDate = formatLibraryDate(generatedAt);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-4" data-live-report={reportLabel}>
      <div className="min-w-0">
        <div className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {reportLabel}
        </div>
        <div className="mt-1 text-xs text-[#8A8477] flex flex-wrap gap-x-3 gap-y-1">
          <span>Current live report</span>
          {versionText && <span>{versionText}</span>}
          {generatedDate && <span>Generated {generatedDate}</span>}
          {generatedBy && <span>by {generatedBy}</span>}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <LibraryStatusLabel
          state={sourceChanged ? LIBRARY_SOURCE_STATE.SOURCE_CHANGED : LIBRARY_SOURCE_STATE.CURRENT}
          label={statusLabel}
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349]"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#8A8477] hover:text-[#213428]"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </button>
      </div>
    </div>
  );
}