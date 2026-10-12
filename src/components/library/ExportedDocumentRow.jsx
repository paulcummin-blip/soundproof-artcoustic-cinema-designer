/**
 * ExportedDocumentRow
 * -------------------
 * One issued document — a PDF that was exported and is kept as a fixed project
 * asset. It offers Open and Download only: an issued document is never
 * overwritten and is never deleted from here.
 *
 * The row's state is stated by the caller — the same library vocabulary every
 * other row uses — so an issued file reads "Current", "Archived issued PDF",
 * "Archived — older than current design" or "Superseded by newer export". An
 * archived file also carries the caller's one-line note, so it reads as history
 * rather than as something that blocks a proposal.
 *
 * The row owns its own open/download state, so it can be dropped into any
 * section without prop plumbing.
 */

import React, { useCallback, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import LibraryStatusLabel from './LibraryStatusLabel';
import { LIBRARY_SOURCE_STATE } from './librarySourceStatus';
import { issuedDocumentLabel } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { downloadIssuedDocument, openIssuedDocument } from '@/components/library/issuedDocument/issuedDocumentActions';
import { formatLibraryDate } from './libraryFormat';

/** The two card treatments: a current file, and a file kept for records. */
const CURRENT_CARD = 'mb-3 rounded-lg border border-[#DCDBD6] bg-white px-4 py-3.5 shadow-sm';
const ARCHIVED_CARD = 'mb-2 rounded-lg border border-[#EFECE4] bg-[#FAFAF9] px-4 py-3';
const ACTION_CURRENT = 'flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349] disabled:opacity-50';
const ACTION_ARCHIVED = 'flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#8A8477] hover:text-[#3E4349] disabled:opacity-50';

export default function ExportedDocumentRow({
  record,
  versionText,
  statusState,
  statusLabel,
  superseded = false,
  note = null,
  variant = 'archived',
  explanation = null,
}) {
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);

  const run = useCallback(async (action, key) => {
    setBusy(key);
    setFailure(null);
    try {
      await action(record);
    } catch (actionError) {
      console.error('[ProjectLibrary] Issued document action failed:', actionError);
      setFailure(actionError?.message || 'This document could not be opened.');
    } finally {
      setBusy(null);
    }
  }, [record]);

  const exportedDate = formatLibraryDate(record.exported_at);
  const current = variant === 'current';
  const documentLabel = issuedDocumentLabel(record.document_type);
  const actionClass = current ? ACTION_CURRENT : ACTION_ARCHIVED;

  return (
    <div
      className={`${current ? CURRENT_CARD : ARCHIVED_CARD} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6`}
      data-issued-document={record.id}
      data-superseded={superseded ? 'true' : 'false'}
      data-file-variant={variant}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${current ? 'text-[#213428]' : 'text-[#8A8477]'}`} />
        <div className="min-w-0">
          {/* A CURRENT file is stated by its document name — "Speaker Design" —
              with the stored filename beneath it. An ARCHIVED file is stated by
              the filename itself: the record of what was issued. */}
          {current && (
            <div className="text-[15px] font-semibold text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
              {documentLabel}
            </div>
          )}
          <div
            className={`${current ? 'mt-0.5 text-xs text-[#8A8477]' : 'text-sm text-[#3E4349]'} break-words`}
            style={{ fontFamily: REPORT_FONT_BODY }}
            title={record.filename}
          >
            {record.filename}
          </div>
          {current && explanation && (
            <p className="mt-1 text-xs text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
              {explanation}
            </p>
          )}
          <div className="mt-1 text-xs text-[#8A8477] flex flex-wrap gap-x-3 gap-y-1">
            {!current && <span>{documentLabel}</span>}
            {versionText && <span>{versionText}</span>}
            {exportedDate && <span>Exported {exportedDate}</span>}
            <span>{record.page_count ? `${record.page_count} pages` : 'PDF'}</span>
          </div>
          {failure && <p className="mt-1 text-xs text-[#7A2E10]">{failure}</p>}
          {note && !failure && (
            <p className="mt-1 text-xs text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 sm:justify-end">
        {/* A fixed status slot keeps Open and Download in the same column on
            every row, however long the individual state label is. */}
        <div className="sm:min-w-[11rem]">
          <LibraryStatusLabel
            state={statusState || (superseded ? LIBRARY_SOURCE_STATE.SUPERSEDED : LIBRARY_SOURCE_STATE.CURRENT)}
            label={statusLabel}
            variant={current ? 'pill' : 'plain'}
          />
        </div>
        <button
          type="button"
          onClick={() => run(openIssuedDocument, 'open')}
          disabled={busy !== null}
          className={actionClass}
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {busy === 'open' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Open
        </button>
        <button
          type="button"
          onClick={() => run(downloadIssuedDocument, 'download')}
          disabled={busy !== null}
          className={actionClass}
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download
        </button>
      </div>
    </div>
  );
}