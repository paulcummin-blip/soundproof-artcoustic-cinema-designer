/**
 * ProjectLibraryReportsSection
 * ---------------------------
 * The active project's Generated Reports, per design version.
 *
 * The tab opens with the readiness banner — the one line answer to "can I go to
 * Proposal now?" — read from the same authority the Proposal Centre gates
 * generation with. Each version below it then states its own readiness line, so
 * a project that is not ready names the version and the report that holds it up.
 *
 * Each design version lists, in two clearly separated groups:
 *
 *   Current files   the documents that represent this version NOW, as primary
 *                   cards. The version's report is one of them: ONE row per
 *                   report type, always shown in one of the three dealer-facing
 *                   states — Current, Update needed or Not generated. The state
 *                   comes from the same readiness authority the banner reads, so
 *                   a row can never say Current while the banner says that report
 *                   needs updating. A Current report offers Open and Export PDF
 *                   and nothing else; a report that needs updating offers Open
 *                   saved report and Create updated report. Every row's action
 *                   carries the version of the section it stands in, so a Level 4
 *                   row acts on Level 4 and never on another version. Beside the
 *                   report sit the version's other current files — the Current
 *                   Speaker Design schedule that is exported with the report —
 *                   each offering Open and Download.
 *
 *   Archived        every issued PDF the design has moved past, below the current
 *                   files and deliberately quieter: "Archived — older than
 *                   current design" or "Archived issued PDF". An earlier export
 *                   of the same version and type stays in storage but is not
 *                   listed. An archived file is fixed history: it is only ever
 *                   opened or downloaded, and it is never presented as the source
 *                   a proposal reads.
 *
 * A current file is a file that still matches the version as it stands. A file of
 * the report's own type is not listed as a second current card while the report's
 * own row is above it — the row IS the current report, and its export produces
 * that PDF. It appears below, as history, once the design moves past it.
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
import LibraryProposalReadinessBanner from './LibraryProposalReadinessBanner';
import VersionReadinessLine from './VersionReadinessLine';
import VersionCollisionNotice from '@/components/versions/VersionCollisionNotice';
import useLibraryProposalReadiness from './useLibraryProposalReadiness';
import {
  ARCHIVED_PDFS_EMPTY,
  ARCHIVED_PDFS_HEADING,
  ARCHIVED_PDFS_HELPER,
  CURRENT_FILES_HEADING,
  CURRENT_FILES_HELPER,
  EXPORT_DESIGN_CHANGED_NOTE,
  LIVE_REPORT_STATE_LABEL,
  LIBRARY_SOURCE_STATE,
  currentFileExplanation,
  liveReportNote,
  resolveExportLiveState,
  resolveLiveReportState,
  selectLatestExports,
} from './librarySourceStatus';

/** The ONE report every version states a current row for: the Project Report. */
const REPORT_TYPES = [PROPOSAL_SOURCE_REPORT.PROJECT];

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
  collisions = [],
}) {
  const navigate = useNavigate();

  // The Library's readiness verdict: read from the SAME authority the Proposal
  // Centre gates generation with, never a second opinion derived here.
  const readiness = useLibraryProposalReadiness({ projectId, versions });
  const readinessByVersion = new Map(
    (readiness.checklist || []).map((entry) => [entry.versionId, entry]),
  );
  // The raw readiness rows behind that verdict: every report row reads its own
  // state from the same cells the banner summarises.
  const readinessRowByVersion = new Map(
    (readiness.rows || []).map((row) => [row.versionId, row]),
  );

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

  /** The places the readiness banner sends the designer. */
  const openProposalCentre = () => navigate('/ProposalCentre');
  const createProposal = () => navigate('/ProposalCentre?create=1');

  /** "View reports": the version sections below the banner, from the top. */
  const viewReports = () => {
    const first = document.querySelector('[data-library-version]');
    if (first) first.scrollIntoView({ block: 'start' });
  };

  /**
   * The banner's one unblocking action, aimed at the exact version and report it
   * named — the same route a row's own action takes, so the two can never point
   * at different places. An engineering action opens the version's design.
   */
  const runReadinessAction = (action) => {
    if (!action) return;
    if (action.kind === 'room-designer') {
      navigate('/RoomDesigner');
      return;
    }
    openVersionReport(action.reportType, action.versionId, action.kind === 'update'
      ? { [REPORT_UPDATE_PARAM]: '1' }
      : null);
  };

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
      <LibraryProposalReadinessBanner
        readiness={readiness}
        onCreateProposal={createProposal}
        onViewProposalCentre={openProposalCentre}
        onViewReports={viewReports}
        onPrimaryAction={runReadinessAction}
      />

      {/* A version slot holding two unresolvable records is stated here: both are
          kept and listed below, and the slot is left for the designer to review. */}
      <VersionCollisionNotice collisions={collisions} className="mt-6" />

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

        // Each issued PDF judged against the version as it stands now: a file the
        // design still matches is a CURRENT file, anything else is archived.
        const judged = issued.map(({ record, superseded }) => ({
          record,
          superseded,
          state: resolveExportLiveState({
            record,
            version,
            liveReport: liveByType.get(record.document_type) || null,
            superseded,
          }),
        }));
        const isCurrent = ({ state }) => (
          state.state === LIBRARY_SOURCE_STATE.CURRENT
          || state.state === LIBRARY_SOURCE_STATE.SAME_AS_CURRENT
        );

        // The report types whose current state is already stated by a live row in
        // this section. A current PDF of one of those is the report itself, so it
        // is not listed twice — the row above IS the current report.
        const statedByLiveRow = new Set(
          REPORT_TYPES.filter((reportType) => liveByType.get(reportType)),
        );

        const currentFiles = judged
          .filter((entry) => isCurrent(entry) && !statedByLiveRow.has(entry.record.document_type));
        const archivedFiles = judged.filter((entry) => !isCurrent(entry));

        return (
          <section key={version.id} data-library-version={version.id}>
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#A79E8C] mb-2">Design version</div>
              <h2 className="text-xl text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
                {version.version_name || `Version ${version.version_number}`}
              </h2>
              <VersionReadinessLine
                line={readinessByVersion.get(version.id)?.line}
                ready={readinessByVersion.get(version.id)?.ready === true}
              />
            </div>

            <SectionHeading>{CURRENT_FILES_HEADING}</SectionHeading>
            <p
              className="text-xs text-[#8A8477] mb-3 max-w-3xl leading-relaxed"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              {CURRENT_FILES_HELPER}
            </p>
            <div className="flex flex-col">
              {REPORT_TYPES.map((reportType) => {
                const report = liveByType.get(reportType) || null;
                // The row's state IS the version's readiness cell for this
                // report type — the same evidence the banner reads.
                const cell = readinessRowByVersion.get(version.id)?.cells?.[reportType] || null;
                const hasReport = !!report;
                const state = resolveLiveReportState({ cell, hasReport });
                return (
                  <LiveReportRow
                    key={reportType}
                    reportLabel={reportTypeLabel(reportType)}
                    versionText={versionNameById.get(version.id) || null}
                    generatedAt={report?.generatedAt}
                    generatedBy={report?.generatedBy}
                    statusState={state}
                    statusLabel={LIVE_REPORT_STATE_LABEL[state] || null}
                    note={liveReportNote({ cell, hasReport })}
                    explanation={currentFileExplanation(reportType)}
                    hasReport={hasReport}
                    onOpen={() => openVersionReport(reportType, version.id)}
                    onOpenSaved={() => openVersionReport(reportType, version.id)}
                    onCreateUpdated={() => updateVersionReport(reportType, version.id)}
                    onExportPdf={() => exportVersionReport(reportType, version.id)}
                    onGenerate={() => openVersionReport(reportType, version.id)}
                  />
                );
              })}

              {/* The version's other current files, beside the report: the
                  Current Speaker Design schedule that is exported with the
                  report, and any other file the design still matches. Primary
                  cards, on the version they belong to. */}
              {currentFiles.map(({ record, state }) => (
                <ExportedDocumentRow
                  key={record.id}
                  record={record}
                  variant="current"
                  explanation={currentFileExplanation(record.document_type)}
                  versionText={versionNameById.get(version.id) || null}
                  statusState={state.state}
                  statusLabel={state.label}
                />
              ))}
            </div>

            <div className="mt-8">
              <SectionHeading>{ARCHIVED_PDFS_HEADING}</SectionHeading>
              {archivedFiles.length > 0 && (
                <p className="text-xs text-[#8A8477] mb-3 max-w-3xl leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
                  {ARCHIVED_PDFS_HELPER}
                </p>
              )}
              {archivedFiles.length === 0 ? (
                <EmptyNote>{ARCHIVED_PDFS_EMPTY}</EmptyNote>
              ) : (
                archivedFiles.map(({ record, superseded, state }) => (
                  <ExportedDocumentRow
                    key={record.id}
                    record={record}
                    variant="archived"
                    versionText={versionNameById.get(version.id) || null}
                    statusState={state.state}
                    statusLabel={state.label}
                    superseded={superseded}
                    note={state.state === LIBRARY_SOURCE_STATE.SOURCE_CHANGED
                      ? EXPORT_DESIGN_CHANGED_NOTE
                      : null}
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