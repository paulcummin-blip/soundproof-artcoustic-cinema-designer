/**
 * LiveReportRow
 * -------------
 * One report type within one design version: the report the designer opens and
 * exports — always for the version it stands under.
 *
 * The row states one of the three dealer-facing states, supplied by the caller
 * from the version's proposal-readiness cell — the same authority the Library
 * banner uses:
 *   Current          Open · Export PDF
 *   Update needed    Open saved report · Create updated report
 *   Not generated    Generate report
 *
 * A report is permanent. It reads Current only while the readiness authority
 * accepts it as a proposal source, so a row can never say Current while the
 * banner says the report needs updating. Once the design has moved past it, the
 * row says so in plain words and the report is kept as history.
 *
 * Every action is handed the version of the row it was clicked in, so a Level 4
 * row can never act on another version.
 *
 * Presentation only: the state, its words and the actions are supplied by the
 * caller.
 */

import React from 'react';
import { AlertTriangle, Check, CircleSlash, ExternalLink, FileDown, FilePlus2, History, RefreshCw } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { LIVE_REPORT_STATE, REPORT_ROW_ACTION } from './librarySourceStatus';
import { formatLibraryDate } from './libraryFormat';

const ACTION_CLASS = 'flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349] disabled:opacity-50';

const STATE_STYLE = {
  [LIVE_REPORT_STATE.CURRENT]: { colour: '#213428', Icon: Check },
  [LIVE_REPORT_STATE.UPDATE_NEEDED]: { colour: '#7A5A10', Icon: AlertTriangle },
  [LIVE_REPORT_STATE.MISSING]: { colour: '#7A2E10', Icon: CircleSlash },
};

export default function LiveReportRow({
  reportLabel,
  versionText,
  generatedAt,
  generatedBy,
  statusState = LIVE_REPORT_STATE.CURRENT,
  statusLabel,
  note = null,
  hasReport = true,
  onOpen,
  onOpenSaved,
  onCreateUpdated,
  onExportPdf,
  onGenerate,
}) {
  const generatedDate = formatLibraryDate(generatedAt);
  const style = STATE_STYLE[statusState] || null;
  const StateIcon = style?.Icon || null;
  const updateNeeded = statusState === LIVE_REPORT_STATE.UPDATE_NEEDED;
  const current = statusState === LIVE_REPORT_STATE.CURRENT;

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-4 py-4"
      data-live-report={reportLabel}
      data-report-state={statusState}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {reportLabel}
          </span>
          {statusLabel && style && (
            <>
              <span className="text-[#C9C4B8]" aria-hidden="true">—</span>
              <span className="inline-flex items-center gap-1.5" data-library-status={statusState}>
                <StateIcon className="w-3.5 h-3.5 shrink-0" style={{ color: style.colour }} />
                <span
                  className="text-[11px] uppercase tracking-[0.12em] font-semibold"
                  style={{ color: style.colour, fontFamily: REPORT_FONT_BODY }}
                >
                  {statusLabel}
                </span>
              </span>
            </>
          )}
        </div>

        {note && (
          <div className="mt-1 text-xs text-[#7A5A10]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {note}
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
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {!hasReport && (
          <button type="button" onClick={onGenerate} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
            <FilePlus2 className="w-3.5 h-3.5" />
            {REPORT_ROW_ACTION.GENERATE}
          </button>
        )}

        {hasReport && updateNeeded && (
          <>
            <button type="button" onClick={onOpenSaved} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <History className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.OPEN_SAVED}
            </button>
            <button type="button" onClick={onCreateUpdated} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <RefreshCw className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.CREATE_UPDATED}
            </button>
          </>
        )}

        {hasReport && !updateNeeded && (
          <>
            <button type="button" onClick={onOpen} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
              <ExternalLink className="w-3.5 h-3.5" />
              {REPORT_ROW_ACTION.OPEN}
            </button>
            {current && (
              <button type="button" onClick={onExportPdf} className={ACTION_CLASS} style={{ fontFamily: REPORT_FONT_BODY }}>
                <FileDown className="w-3.5 h-3.5" />
                {REPORT_ROW_ACTION.EXPORT_PDF}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}