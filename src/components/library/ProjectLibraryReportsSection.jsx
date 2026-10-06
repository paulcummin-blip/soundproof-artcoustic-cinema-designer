/**
 * ProjectLibraryReportsSection
 * ---------------------------
 * The active project's Generated Reports, per design version.
 *
 * Each design version lists, in two groups:
 *
 *   Current reports    ONE row per report type, always shown — so the Library
 *                      states whether each report EXISTS for this version. A
 *                      Current report offers Open and Export PDF and nothing
 *                      else; a report whose design has moved on is kept as
 *                      history and offers Open previous and Create updated
 *                      report. Every row's action carries the version of the
 *                      section it stands in, so a Level 4 row acts on Level 4
 *                      and never on another version.
 *
 *   Issued PDFs        the LATEST issued PDF per report type. An earlier export
 *                      of the same version and report type stays in storage but
 *                      is not listed. An issued PDF is a fixed historical
 *                      document: it is only ever opened or downloaded, and it
 *                      reads "Issued PDF — design changed since export" once the
 *                      design has moved on.
 *
 * Nothing here changes a report's status: exporting, opening or listing a report
 * leaves it exactly as it was.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { reportTypeLabel } from '@/components/report/reportSnapshotAuthority';
import {
  PROPOSAL_SOURCE_REPORT,
  PROPOSAL_SOURCE_REPORT_ROUTE,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import { buildLibraryReportActionUrl } from '@/components/report/reportLibraryContext';
import {
  REPORT_AUTOPRINT_PARAM,
  REPORT_UPDATE_PARAM,
} from '@/components/report/reportActionIntent';
import LiveReportRow from './LiveReportRow';
import ExportedDocumentRow from './ExportedDocumentRow';
import {
  liveReportStateLabel,
  resolveExportLiveState,
  resolveLiveReportState,
  selectLatestExports,
  LIVE_REPORT_STATE,
} from './librarySourceStatus';

/** The two report types every version states a row for, in reading order. */
const REPORT_TYPES = [PROPOSAL_SOURCE_REPORT.VISUAL, PROPOSAL_SOURCE_REPORT.TECHNICAL];

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

  /**
   * Open, generate or regenerate one report — always for the exact version of
   * the row it was clicked in. The version is passed explicitly and is the only
   * authority the report page reads; nothing here consults the loaded Room
   * Designer version.
   *
   * The URL also carries the Library context, so the report keeps the designer's
   * place: it can return to this version's section, and the two report types stay
   * paired on this version rather than the version loaded in the Room Designer.
   */
  const openVersionReport = (reportType, versionId, extraParams = null) => {
    const route = PROPOSAL_SOURCE_REPORT_ROUTE[reportType];
    if (!route || !versionId) return;
    navigate(buildLibraryReportActionUrl({ route, projectId, versionId, extraParams }));
  };

  /**
   * Export the report's PDF. The report page runs its own export once it is
   * ready — the same export its own button calls — so the Library never grows a
   * second export implementation and the report's status never changes.
   */
  const exportVersionReport = (reportType, versionId) => openVersionReport(reportType, versionId, {
    [REPORT_AUTOPRINT_PARAM]: '1',
  });

  /** Create an updated report: the report page updates it from the current design. */
  const updateVersionReport = (reportType, versionId) => openVersionReport(reportType, versionId, {
    [REPORT_UPDATE_PARAM]: '1',
  });

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileText className="w-9 h-9 text-[#DCDBD6] mb-4" />
        <p className="text-sm text-[#8A8477] text-center max-w-md leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
          No design versions yet. Save a design version in the Room Designer and its reports appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {versions.map((version) => {
        // This version's own rows only. The live report of a type is judged
        // against the export of the SAME type, and both belong to THIS version.
        const liveByType = new Map(
          liveReports
            .filter((report) => report.versionId === version.id)
            .map((report) => [report.reportType, report]),
        );

        // ONE exported PDF per report type: the latest. Older exports of the
        // same version and type are not listed.
        const issued = selectLatestExports(
          reportExports.filter(({ record }) => (record.version_id || null) === version.id),
        );
        return (
          <section key={version.id} data-library-version={version.id}>
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#A79E8C] mb-2">Design version</div>
              <h2 className="text-xl text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
                {version.version_name || `Version ${version.version_number}`}
              </h2>
            </div>

            <SectionHeading>Current reports</SectionHeading>
            <div className="border-t border-[#E5E1D8]">
              {REPORT_TYPES.map((reportType) => {
                const report = liveByType.get(reportType) || null;
                const state = resolveLiveReportState(report);
                return (
                  <LiveReportRow
                    key={reportType}
                    reportLabel={reportTypeLabel(reportType)}
                    versionText={versionNameById.get(version.id) || null}
                    generatedAt={report?.generatedAt}
                    generatedBy={report?.generatedBy}
                    statusState={state}
                    statusLabel={liveReportStateLabel(state)}
                    hasReport={state !== LIVE_REPORT_STATE.MISSING}
                    onOpen={() => openVersionReport(reportType, version.id)}
                    onOpenPrevious={() => openVersionReport(reportType, version.id)}
                    onCreateUpdated={() => updateVersionReport(reportType, version.id)}
                    onExportPdf={() => exportVersionReport(reportType, version.id)}
                    onGenerate={() => openVersionReport(reportType, version.id)}
                  />
                );
              })}
            </div>

            <div className="mt-6">
              <SectionHeading>Issued PDFs</SectionHeading>
              {issued.length === 0 ? (
                <EmptyNote>No PDF has been issued for this version yet.</EmptyNote>
              ) : (
                issued.map(({ record, superseded }) => {
                  const state = resolveExportLiveState({
                    record,
                    version,
                    liveReport: liveByType.get(record.document_type) || null,
                    superseded,
                  });

                  return (
                    <ExportedDocumentRow
                      key={record.id}
                      record={record}
                      versionText={versionNameById.get(version.id) || null}
                      statusState={state.state}
                      statusLabel={state.label}
                      superseded={superseded}
                    />
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}