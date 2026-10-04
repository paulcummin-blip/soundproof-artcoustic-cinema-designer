/**
 * ProjectLibraryReportsSection
 * ---------------------------
 * The active project's Generated Reports, per design version.
 *
 * Each version lists the reports it currently holds — the live report, which is
 * opened or regenerated where it is generated — and beneath them the PDFs that
 * were exported and are kept as fixed issued documents. A report that has been
 * regenerated does not replace an exported PDF: the issued file stays, marked
 * superseded by newer export.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { reportTypeLabel } from '@/components/report/reportSnapshotAuthority';
import {
  PROPOSAL_SOURCE_REPORT_ROUTE,
  buildReportActionUrl,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import LiveReportRow from './LiveReportRow';
import ExportedDocumentRow from './ExportedDocumentRow';
import { liveReportStatusLabel } from './librarySourceStatus';

function SectionHeading({ children }) {
  return (
    <h3
      className="text-[13px] uppercase tracking-[0.16em] text-[#625143] mb-2"
      style={{ fontFamily: REPORT_FONT_BODY }}
    >
      {children}
    </h3>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="text-sm text-[#8A8477] py-4" style={{ fontFamily: REPORT_FONT_BODY }}>
      {children}
    </p>
  );
}

export default function ProjectLibraryReportsSection({
  projectId,
  versions = [],
  versionById = new Map(),
  versionNameById = new Map(),
  liveReports = [],
  reportExports = [],
}) {
  const navigate = useNavigate();

  const openVersionReport = (reportType, versionId) => {
    const route = PROPOSAL_SOURCE_REPORT_ROUTE[reportType];
    if (!route) return;
    navigate(buildReportActionUrl({ route, projectId, versionId }));
  };

  const hasAnyAsset = liveReports.length > 0 || reportExports.length > 0;
  if (!hasAnyAsset) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileText className="w-9 h-9 text-[#DCDBD6] mb-4" />
        <p className="text-sm text-[#8A8477] text-center max-w-md leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
          No reports yet. Generate the Visual Report or the Technical Report for a design version, then export it —
          the exported PDF is kept here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {versions.map((version) => {
        const live = liveReports.filter((report) => report.versionId === version.id);
        const issued = reportExports.filter(({ record }) => (
          (record.version_id || null) === version.id
        ));

        if (live.length === 0 && issued.length === 0) return null;

        return (
          <section key={version.id} data-library-version={version.id}>
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#A79E8C] mb-2">Design version</div>
              <h2 className="text-xl text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
                {version.version_name || `Version ${version.version_number}`}
              </h2>
            </div>

            {live.length > 0 && (
              <div className="border-t border-[#E5E1D8]">
                {live.map((report) => (
                  <LiveReportRow
                    key={report.id}
                    reportLabel={reportTypeLabel(report.reportType)}
                    versionText={versionNameById.get(version.id) || null}
                    generatedAt={report.generatedAt}
                    generatedBy={report.generatedBy}
                    statusLabel={liveReportStatusLabel(report.status)}
                    sourceChanged={report.status === 'stale'}
                    onOpen={() => openVersionReport(report.reportType, version.id)}
                    onRegenerate={() => openVersionReport(report.reportType, version.id)}
                  />
                ))}
              </div>
            )}

            <div className="mt-6">
              <SectionHeading>Exported PDFs</SectionHeading>
              {issued.length === 0 ? (
                <EmptyNote>No PDF has been exported for this version yet.</EmptyNote>
              ) : (
                issued.map(({ record, superseded }) => (
                  <ExportedDocumentRow
                    key={record.id}
                    record={record}
                    versionText={versionNameById.get(version.id) || null}
                    statusLabel={superseded ? undefined : liveReportStatusLabel(
                      record.source_status_at_export === 'current' ? 'current' : 'stale',
                    )}
                    superseded={superseded}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}