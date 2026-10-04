/**
 * LiveReportRow
 * -------------
 * One report type within one design version: the editable authority the designer
 * opens, generates or regenerates — always for the version it stands under.
 *
 * The row states its own state (Current, Stale, or Missing) and offers the one
 * action that state needs:
 *   Current   Open · Regenerate
 *   Stale     Open · Regenerate
 *   Missing   Generate
 *
 * Every action is handed the version of the row it was clicked in, so a Level 4
 * row can never act on another version.
 *
 * Presentation only: the actions are supplied by the caller.
 */

import React from 'react';
import { ExternalLink, FilePlus2, RefreshCw } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import LibraryStatusLabel from './LibraryStatusLabel';
import { LIVE_REPORT_STATE } from './librarySourceStatus';
import { formatLibraryDate } from './libraryFormat';

const ACTION_CLASS = 'flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349] disabled:opacity-50';

export default function LiveReportRow({
  reportLabel,
  versionText,
  generatedAt,
  generatedBy,
  statusState = LIVE_REPORT_STATE.CURRENT,
  statusLabel,
  hasReport = true,
  onOpen,
  onGenerate,
  onRegenerate,
}) {
  const generatedDate = formatLibraryDate(generatedAt);

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-4 py-4"
      data-live-report={reportLabel}
      data-report-state={statusState}
    >
      <div className="min-w-0">
        <div className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {reportLabel}
        </div>
        <div className="mt-1 text-xs text-[#8A8477] flex flex-wrap gap-x-3 gap-y-1">
          <span>{hasReport ? 'Current live report' : 'Not generated for this version'}</span>
          {versionText && <span>{versionText}</span>}
          {generatedDate && <span>Generated {generatedDate}</span>}
          {generatedBy && <span>by {generatedBy}</span>}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <LibraryStatusLabel state={statusState} label={statusLabel} />

        {hasReport ? (
          <>
            <button type="button" onClick={onOpen} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </button>
            <button type="button" onClick={onRegenerate} className={`${ACTION_CLASS} text-[#8A8477]`} style={{ fontFamily: REPORT_FONT_BODY }}>
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          </>
        ) : (
          <button type="button" onClick={onGenerate} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
            <FilePlus2 className="w-3.5 h-3.5" />
            Generate
          </button>
        )}
      </div>
    </div>
  );
}