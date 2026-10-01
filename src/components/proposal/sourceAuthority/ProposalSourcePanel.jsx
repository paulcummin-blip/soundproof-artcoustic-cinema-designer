/**
 * ProposalSourcePanel
 * -------------------
 * "Proposal Source Data" — the status of the reports a proposal is built from.
 *
 * Shows the Visual Report and Technical Report source status, the project
 * version the proposal would be built from, and when those reports were
 * generated. When either report is not current, the panel states the rule and
 * offers the action that fixes it.
 *
 * Presentation only: the status comes from proposalSourceAuthority, and the
 * actions simply open the report that has to be generated or regenerated.
 */

import React from 'react';
import {
  PROPOSAL_SOURCE_STATE,
  PROPOSAL_SOURCE_TITLE,
  buildReportActionUrl,
} from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

const STATE_COLOUR = {
  [PROPOSAL_SOURCE_STATE.CURRENT]: '#213428',
  [PROPOSAL_SOURCE_STATE.STALE]: '#7A5A10',
  [PROPOSAL_SOURCE_STATE.FAILED]: '#7A2E10',
  [PROPOSAL_SOURCE_STATE.MISSING]: '#7A2E10',
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

function StatusRow({ report }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-[#EAE8E3]">
      <span className="text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {report.label}
      </span>
      <span className="text-right">
        <span
          className="text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: STATE_COLOUR[report.state] || '#3E4349', fontFamily: REPORT_FONT_BODY }}
        >
          {report.status}
        </span>
        {report.reason && (
          <span className="block text-[11px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
            {report.reason}
          </span>
        )}
      </span>
    </div>
  );
}

export default function ProposalSourcePanel({ status, loading = false, className = '' }) {
  if (!status) return null;

  const visual = status.reports?.visual;
  const technical = status.reports?.technical;

  return (
    <section className={`border border-[#DCDBD6] bg-white p-6 ${className}`}>
      <h3
        className="text-[13px] uppercase tracking-[0.16em] text-[#1B1A1A] mb-4"
        style={{ fontFamily: REPORT_FONT_HEADING }}
      >
        {PROPOSAL_SOURCE_TITLE}
      </h3>

      {loading && (
        <p className="text-sm text-[#8A8477] mb-3" style={{ fontFamily: REPORT_FONT_BODY }}>
          Checking the current reports…
        </p>
      )}

      {visual && <StatusRow report={visual} />}
      {technical && <StatusRow report={technical} />}

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
          <div className="flex flex-wrap gap-3 mt-4">
            {(status.blockers || []).map((blocker) => (
              <a
                key={blocker.key}
                href={buildReportActionUrl({
                  route: blocker.route,
                  projectId: status.projectId,
                  versionId: status.versionId,
                })}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
              >
                {blocker.action}
              </a>
            ))}
          </div>
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