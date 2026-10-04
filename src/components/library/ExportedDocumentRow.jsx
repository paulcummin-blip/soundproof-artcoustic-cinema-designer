/**
 * ExportedDocumentRow
 * -------------------
 * One issued document — a PDF that was exported and is kept as a fixed project
 * asset. It offers Open and Download only: an issued document is never
 * overwritten and is never deleted from here.
 *
 * The row's state is stated by the caller — the same library vocabulary every
 * other row uses — so an exported report can read "Same as current", "Older
 * export", "Source changed since export" or "Superseded by newer export".
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

export default function ExportedDocumentRow({
  record,
  versionText,
  statusState,
  statusLabel,
  superseded = false,
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

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-4 border-t border-[#EFECE4] py-4"
      data-issued-document={record.id}
      data-superseded={superseded ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3 min-w-0">
        <FileText className="w-4 h-4 mt-0.5 shrink-0 text-[#8A8477]" />
        <div className="min-w-0">
          <div
            className="text-sm text-[#1B1A1A] break-words"
            style={{ fontFamily: REPORT_FONT_BODY }}
            title={record.filename}
          >
            {record.filename}
          </div>
          <div className="mt-1 text-xs text-[#8A8477] flex flex-wrap gap-x-3 gap-y-1">
            <span>{issuedDocumentLabel(record.document_type)}</span>
            {versionText && <span>{versionText}</span>}
            {exportedDate && <span>Exported {exportedDate}</span>}
            <span>{record.page_count ? `${record.page_count} pages` : 'PDF'}</span>
          </div>
          {failure && <p className="mt-1 text-xs text-[#7A2E10]">{failure}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <LibraryStatusLabel
          state={statusState || (superseded ? LIBRARY_SOURCE_STATE.SUPERSEDED : LIBRARY_SOURCE_STATE.CURRENT)}
          label={statusLabel}
        />
        <button
          type="button"
          onClick={() => run(openIssuedDocument, 'open')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349] disabled:opacity-50"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {busy === 'open' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Open
        </button>
        <button
          type="button"
          onClick={() => run(downloadIssuedDocument, 'download')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#213428] hover:text-[#3E4349] disabled:opacity-50"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download
        </button>
      </div>
    </div>
  );
}