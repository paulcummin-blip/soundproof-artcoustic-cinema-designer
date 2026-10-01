/**
 * ProposalSourcePanel
 * -------------------
 * "Proposal Source Data" — the status of the reports a proposal is built from.
 *
 * Shows the Visual Report and Technical Report source status, the project
 * version the proposal would be built from, and when those reports were
 * generated. Every report keeps its Generate / Regenerate action on screen
 * unless it has been read as Current, so the designer can always produce the
 * report from this screen — while the status is still being read, after a
 * reload, or when the source comes back unresolved.
 *
 * Presentation only: the status comes from proposalSourceAuthority and the
 * action state from proposalReportActions; the actions simply open the report
 * that has to be generated or regenerated.
 */

import React, { useState } from 'react';
import {
  PROPOSAL_SOURCE_TITLE,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import {
  PROPOSAL_REPORT_UI_STATE,
  generationKey,
  isGenerationPending,
  markGenerationRequested,
  resolveReportActionRows,
} from '@/components/proposal/sourceAuthority/proposalReportActions';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

const STATE_COLOUR = {
  [PROPOSAL_REPORT_UI_STATE.CURRENT]: '#213428',
  [PROPOSAL_REPORT_UI_STATE.STALE]: '#7A5A10',
  [PROPOSAL_REPORT_UI_STATE.FAILED]: '#7A2E10',
  [PROPOSAL_REPORT_UI_STATE.MISSING]: '#7A2E10',
  [PROPOSAL_REPORT_UI_STATE.CHECKING]: '#8A8477',
  [PROPOSAL_REPORT_UI_STATE.GENERATING]: '#7A5A10',
  [PROPOSAL_REPORT_UI_STATE.UNRESOLVED]: '#7A5A10',
};

function formatGeneratedAt(value) {
  if (!value) return 'Not generated yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not generated yet';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReportAction({ row, onRequest }) {
  if (row.actionDisabled) {
    return (
      <span
        className="inline-block mt-2.5 px-4 py-2 text-[11px] uppercase tracking-[0.14em] border border-[#DCDBD6] text-[#8A8477] cursor-default"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        {row.actionLabel}
      </span>
    );
  }

  const quiet = row.actionEmphasis === 'quiet';

  return (
    <a
      href={row.actionUrl}
      onClick={() => onRequest(row.key)}
      className={`inline-block mt-2.5 px-4 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors ${
        quiet
          ? 'border border-[#DCDBD6] text-[#3E4349] hover:border-[#213428] hover:text-[#213428]'
          : 'text-white hover:bg-[#3E4349]'
      }`}
      style={quiet
        ? { fontFamily: REPORT_FONT_BODY }
        : { backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
    >
      {row.actionLabel}
    </a>
  );
}

function ReportRow({ row, onRequest }) {
  return (
    <div className="py-3 border-b border-[#EAE8E3]">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {row.label}
        </span>
        <span className="text-right">
          <span
            className="text-[11px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: STATE_COLOUR[row.uiState] || '#3E4349', fontFamily: REPORT_FONT_BODY }}
          >
            {row.status}
          </span>
          {row.reason && (
            <span className="block text-[11px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
              {row.reason}
            </span>
          )}
          {row.current && (
            <span className="block text-[11px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
              Generated: {formatGeneratedAt(row.generatedAt)}
            </span>
          )}
        </span>
      </div>
      <ReportAction row={row} onRequest={onRequest} />
    </div>
  );
}

export default function ProposalSourcePanel({ status, loading = false, className = '' }) {
  // Bumped when a generation is requested, so the running state renders.
  const [revision, setRevision] = useState(0);

  if (!status) return null;

  const projectId = status.projectId || null;
  const versionId = status.versionId || null;

  // The source is not known yet while the read is in flight, or while the active
  // version is still resolving. That is Checking — never Missing — and it keeps
  // every action on screen.
  const checking = loading || !versionId || !status.state;

  const rows = resolveReportActionRows({
    reports: status.reports || {},
    checking,
    isGenerating: (key) => isGenerationPending(generationKey(projectId, versionId, key)),
    projectId,
    versionId,
    generatedAt: status.reportGeneratedAt || null,
  });

  const handleRequest = (key) => {
    markGenerationRequested(generationKey(projectId, versionId, key));
    setRevision((value) => value + 1);
  };

  return (
    <section
      className={`border border-[#DCDBD6] bg-white p-6 ${className}`}
      data-report-action-revision={revision}
    >
      <h3
        className="text-[13px] uppercase tracking-[0.16em] text-[#1B1A1A] mb-4"
        style={{ fontFamily: REPORT_FONT_HEADING }}
      >
        {PROPOSAL_SOURCE_TITLE}
      </h3>

      {checking && (
        <p className="text-sm text-[#8A8477] mb-3" style={{ fontFamily: REPORT_FONT_BODY }}>
          Checking the current reports…
        </p>
      )}

      {rows.map((row) => (
        <ReportRow key={row.key} row={row} onRequest={handleRequest} />
      ))}

      <div className="flex items-baseline justify-between gap-4 py-2 border-b border-[#EAE8E3]">
        <span className="text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
          Project Version
        </span>
        <span className="text-sm text-[#1B1A1A] text-right" style={{ fontFamily: REPORT_FONT_BODY }}>
          {status.versionName || '—'}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-4 py-2">
        <span className="text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
          Last generated
        </span>
        <span className="text-sm text-[#1B1A1A] text-right" style={{ fontFamily: REPORT_FONT_BODY }}>
          {formatGeneratedAt(status.reportGeneratedAt)}
        </span>
      </div>

      {!status.ready && (
        <div className="mt-5 pt-5 border-t border-[#EAE8E3]">
          <p className="text-sm text-[#7A2E10] leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
            {status.message}
          </p>
        </div>
      )}

      {status.ready && (
        <p className="mt-4 text-[11px] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
          The proposal will be generated from these reports only.
        </p>
      )}
    </section>
  );
}