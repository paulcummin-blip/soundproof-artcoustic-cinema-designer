/**
 * VersionReadinessTable
 * ---------------------
 * The shared per-version readiness table, shown on Steps 3 and 5 of the
 * proposal wizard from ONE readiness result — never with per-step logic.
 *
 * ONE report requirement: the Project Report. Each selected version states its
 * canonical Project Report's own readiness — Current, Update needed, Not
 * generated or Incomplete — and, when it is not Current, the one action that
 * fixes it (Create Project Report, or Create Updated Report).
 *
 * No other report has a column, a button or a requirement here: the Project
 * Report is the only report a proposal is gated on.
 *
 * Presentation only: every value comes from proposalReadinessAuthority.
 */

import React from 'react';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { withProposalContext } from '@/components/report/proposalReportContext';
import {
  READINESS_REPORT_LABEL,
  READINESS_STATE,
  PROPOSAL_READINESS_READY_COPY,
  PROPOSAL_READINESS_TITLE,
  buildProjectReportAction,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';

const STATE_COLOUR = {
  [READINESS_STATE.CURRENT]: '#213428',
  [READINESS_STATE.STALE]: '#7A5A10',
  [READINESS_STATE.INCOMPLETE]: '#7A5A10',
  [READINESS_STATE.UNAVAILABLE]: '#7A2E10',
  [READINESS_STATE.MISSING]: '#7A2E10',
  [READINESS_STATE.CHECKING]: '#8A8477',
};

function formatGeneratedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CellIcon({ cell, colour }) {
  if (cell?.current) return <Check className="w-3.5 h-3.5 shrink-0" style={{ color: colour }} />;
  if (cell?.checking) return <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: colour }} />;
  return <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: colour }} />;
}

function ReadinessCell({ cell }) {
  const colour = STATE_COLOUR[cell?.state] || '#3E4349';
  return (
    <span className="flex items-center gap-1.5">
      <CellIcon cell={cell} colour={colour} />
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold"
        style={{ color: colour, fontFamily: REPORT_FONT_BODY }}
      >
        {cell?.status}
      </span>
    </span>
  );
}

function VersionRow({ row, projectId }) {
  const cell = row.project || row.cells?.project || null;
  const blocked = !!cell && !cell.current && !cell.checking;
  const action = blocked
    ? buildProjectReportAction({ state: cell.state, projectId, versionId: row.versionId })
    : null;

  return (
    <div className="py-4 border-b border-[#EAE8E3]" data-readiness-version={row.versionId}>
      <div
        className="text-sm font-semibold text-[#1B1A1A] truncate"
        style={{ fontFamily: REPORT_FONT_BODY }}
        title={row.versionName}
      >
        {row.versionName}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span
          className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {READINESS_REPORT_LABEL}
        </span>
        <ReadinessCell cell={cell} />
      </div>

      {blocked && (
        <p className="text-[12px] text-[#7A2E10] mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
          {row.blockingSentence}
        </p>
      )}

      {action && (
        <a
          href={withProposalContext(action.url)}
          className="inline-block mt-2 mr-2 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          {action.label}
        </a>
      )}

      {cell?.current && formatGeneratedAt(cell.generatedAt) && (
        <p className="text-[11px] text-[#8A8477] mt-1.5" style={{ fontFamily: REPORT_FONT_BODY }}>
          Generated {formatGeneratedAt(cell.generatedAt)}
        </p>
      )}
    </div>
  );
}

export default function VersionReadinessTable({ gate, projectId = null, className = '', onRetry = null }) {
  if (!gate?.available) return null;

  return (
    <section className={`mt-6 border border-[#DCDBD6] bg-white p-5 ${className}`} data-version-readiness-table>
      <h3
        className="text-[12px] uppercase tracking-[0.16em] text-[#1B1A1A] mb-3"
        style={{ fontFamily: REPORT_FONT_HEADING }}
      >
        {PROPOSAL_READINESS_TITLE}
      </h3>

      {gate.checking && (
        <p className="text-sm text-[#8A8477] mb-3" style={{ fontFamily: REPORT_FONT_BODY }}>
          Checking each selected version’s Project Report…
        </p>
      )}

      {(gate.rows || []).map((row) => (
        <VersionRow key={row.versionId} row={row} projectId={projectId} />
      ))}

      {!gate.checking && !gate.ready && gate.message && (
        <div className="mt-4 pt-4 border-t border-[#EAE8E3]">
          <p role="alert" className="text-sm font-semibold text-[#7A2E10]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {gate.message}
          </p>
          {gate.detail && (
            <p className="text-sm text-[#625143] leading-relaxed mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
              {gate.detail}
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white"
              style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
            >
              Retry saved engineering read
            </button>
          )}
        </div>
      )}

      {gate.ready && (
        <p className="mt-3 text-[11px] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {PROPOSAL_READINESS_READY_COPY}
        </p>
      )}

      {!gate.checking && !gate.versionCountValid && (
        <p className="mt-3 text-[11px] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
          Select the number of versions this report type requires to see its readiness.
        </p>
      )}
    </section>
  );
}