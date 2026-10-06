/**
 * LiveReportRow
 * -------------
 * One report type within one design version: the report the designer opens and
 * exports — always for the version it stands under.
 *
 * The row states one of two product states, plus the not-yet-generated case:
 *   Current          Open · Export PDF
 *   Previous report  Open previous · Create updated report
 *   Not generated    Generate report
 *
 * A report is permanent. It is Current until the design changes, so a Current row
 * carries no refresh action at all, and exporting, opening or using the report in
 * a proposal never changes its state. Once the design has moved past it the row
 * says so plainly and the report is kept as history.
 *
 * Every action is handed the version of the row it was clicked in, so a Level 4
 * row can never act on another version.
 *
 * Presentation only: the actions are supplied by the caller.
 */

import React from 'react';
import { ExternalLink, FileDown, FilePlus2, History, RefreshCw } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import LibraryStatusLabel from './LibraryStatusLabel';
import {
  LIVE_REPORT_DESIGN_CHANGED_NOTE,
  LIVE_REPORT_STATE,
  PREVIOUS_REPORT_HISTORY_LABEL,
  REPORT_ROW_ACTION,
} from './librarySourceStatus';
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
  onOpenPrevious,
  onCreateUpdated,
  onExportPdf,
  onGenerate,
}) {
  const generatedDate = formatLibraryDate(generatedAt);
  const previous = statusState === LIVE_REPORT_STATE.STALE;

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
        {hasReport && previous && (
          <div className="mt-1 text-xs text-[#7A5A10]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {PREVIOUS_REPORT_HISTORY_LABEL}
          </div>
        )}
        <div className="mt-1 text-xs text-[#8A8477] flex flex-wrap gap-x-3 gap-y-1">
          {hasReport ? (
            generatedDate ? <span>Created {generatedDate}</span> : <span>Created</span>
          ) : (
            <span>Not generated for this version</span>
          )}
          {versionText && <span>{versionText}</span>}
          {generatedBy && <span>by {generatedBy}</span>}
        </div>
        {hasReport && previous && (
          <div className="mt-1 text-xs text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {LIVE_REPORT_DESIGN_CHANGED_NOTE}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <LibraryStatusLabel state={statusState} label={statusLabel} />

        {!hasReport && (
          <button type="button" onClick={onGenerate} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
            <FilePlus2 className="w-3.5 h-3.5" />
            {REPORT_ROW_ACTION.GENERATE}
          </button>
        )}

        {hasReport && !previous && (
          <>
            <button type="button" onClick={onOpen} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <ExternalLink className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.OPEN}
            </button>
            <button type="button" onClick={onExportPdf} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <FileDown className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.EXPORT_PDF}
            </button>
          </>
        )}

        {hasReport && previous && (
          <>
            <button type="button" onClick={onOpenPrevious} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <History className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.OPEN_PREVIOUS}
            </button>
            <button type="button" onClick={onCreateUpdated} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <RefreshCw className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.CREATE_UPDATED}
            </button>
          </>
        )}
      </div>
    </div>
  );
}