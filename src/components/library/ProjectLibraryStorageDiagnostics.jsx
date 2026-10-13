/**
 * ProjectLibraryStorageDiagnostics.jsx
 * -------------------------------------
 * The Project Library's record of this session's failed storage attempts.
 *
 * A failure notice is dismissed; the evidence of what the backend rejected is
 * not thrown away with it. Every failed attempt the session has already written
 * to the in-session diagnostic log is listed here, newest first, with the same
 * expandable technical detail — so a rejection can be read back, and copied, long
 * after the notice is gone.
 *
 * Rules this component holds:
 *   - Master admins only, and nothing at all when the session has no failure.
 *     A dealer sees no part of it.
 *   - It reports; it does not act. Nothing here retries, re-stores, edits or
 *     classifies an attempt, and no record is written or deleted.
 *   - In-session only. The log lives in memory for this session and is never
 *     persisted: no permanent diagnostic storage, and no database record.
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  readExportStorageDiagnostics,
  subscribeExportStorageDiagnostics,
} from './issuedDocument/exportStorageDiagnosticLog';
import {
  PROJECT_LIBRARY_STORAGE_SESSION_LABEL,
  canViewStorageTechnicalDetail,
  isProjectLibraryRecordFailure,
  storageDiagnosticSummary,
} from './issuedDocument/projectLibraryStorageDiagnostics';
import StorageFailureTechnicalDetail from './issuedDocument/StorageFailureTechnicalDetail';

/**
 * @param {Object} props
 * @param {string} [props.className] spacing for the section's own place.
 */
export default function ProjectLibraryStorageDiagnostics({ className = '' }) {
  const { user } = useAuth();
  const allowed = canViewStorageTechnicalDetail(user);
  const [records, setRecords] = useState(() => (allowed ? readExportStorageDiagnostics() : []));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!allowed) return undefined;
    // Read on mount, then follow the log: a failure that happens while the
    // Library is open appears here without a reload.
    setRecords(readExportStorageDiagnostics());
    return subscribeExportStorageDiagnostics(setRecords);
  }, [allowed]);

  if (!allowed || records.length === 0) return null;

  return (
    <section
      className={className}
      data-library-storage-diagnostics="true"
      data-storage-failure-count={records.length}
    >
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="group flex w-full items-center justify-between gap-4 border-t border-[#E5E1D8] pt-3 pb-2 text-left"
        >
          <span
            className="text-[13px] uppercase tracking-[0.16em] text-[#625143] transition-colors group-hover:text-[#3E4349]"
            style={{ fontFamily: REPORT_FONT_BODY }}
          >
            {PROJECT_LIBRARY_STORAGE_SESSION_LABEL} ({records.length})
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[#8A8477] transition-transform duration-200 group-hover:text-[#3E4349] ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>

      {expanded && (
        <div className="grid gap-3 py-2 text-[#3E4349]">
          <p className="text-xs text-[#8A8477] m-0 max-w-3xl leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
            Storage attempts that failed in this session. Each one states the exact rejection the backend
            returned. Nothing here is stored or sent anywhere: the log is held in the browser for this
            session only.
          </p>
          {records.map((record, index) => (
            <div
              key={`${record?.occurred_at || record?.project_id || 'failure'}-${index}`}
              className="border border-[#E5E1D8] rounded bg-white/60 px-3 py-2"
            >
              <div className="text-[11px] break-words" style={{ fontFamily: REPORT_FONT_BODY }}>
                {storageDiagnosticSummary(record)}
              </div>
              <div className="text-[10px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
                {record?.occurred_at || ''}
              </div>
              <StorageFailureTechnicalDetail
                diagnostic={record}
                className="mt-2"
                defaultOpen={index === 0 && isProjectLibraryRecordFailure(record) && records.length === 1}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}