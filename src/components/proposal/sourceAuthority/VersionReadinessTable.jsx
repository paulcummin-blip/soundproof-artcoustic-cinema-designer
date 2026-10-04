/**
 * VersionReadinessTable
 * ---------------------
 * The shared per-version readiness table, shown on Steps 3 and 5 of the
 * proposal wizard from ONE readiness result — never with per-step logic.
 *
 * One row per selected version: version name, Visual Report, Technical Report,
 * Engineering Authority and the blocking reason. A blocked version keeps the
 * action that fixes it ("Generate <Report>"), so the designer can produce the
 * missing report from this screen.
 *
 * Presentation only: every value comes from proposalReadinessAuthority.
 */

import React from 'react';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { withProposalContext } from '@/components/report/proposalReportContext';
import {
  READINESS_COLUMNS,
  READINESS_SOURCE,
  READINESS_STATE,
  PROPOSAL_READINESS_READY_COPY,
  PROPOSAL_READINESS_TITLE,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';
import {
  PROPOSAL_REPORT_UI_STATE,
  buildReportActionRow,
} from '@/components/proposal/sourceAuthority/proposalReportActions';
import { PROPOSAL_SOURCE_STATE } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';

const STATE_COLOUR = {
  [READINESS_STATE.CURRENT]: '#213428',
  [READINESS_STATE.STALE]: '#7A5A10',
  [READINESS_STATE.INCOMPLETE]: '#7A5A10',
  [READINESS_STATE.UNAVAILABLE]: '#7A2E10',
  [READINESS_STATE.MISSING]: '#7A2E10',
  [READINESS_STATE.CHECKING]: '#8A8477',
};

/** Readiness state → the source state the shared report action reads. */
const SOURCE_STATE = {
  [READINESS_STATE.CURRENT]: PROPOSAL_SOURCE_STATE.CURRENT,
  [READINESS_STATE.STALE]: PROPOSAL_SOURCE_STATE.STALE,
  [READINESS_STATE.MISSING]: PROPOSAL_SOURCE_STATE.MISSING,
  [READINESS_STATE.INCOMPLETE]: PROPOSAL_SOURCE_STATE.MISSING,
  [READINESS_STATE.UNAVAILABLE]: PROPOSAL_SOURCE_STATE.FAILED,
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
  if (cell.current) return <Check className="w-3.5 h-3.5 shrink-0" style={{ color: colour }} />;
  if (cell.checking) return <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: colour }} />;
  return <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: colour }} />;
}

function ReadinessCell({ cell }) {
  const colour = STATE_COLOUR[cell.state] || '#3E4349';
  return (
    <div className="flex items-center gap-1.5">
      <CellIcon cell={cell} colour={colour} />
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold"
        style={{ color: colour, fontFamily: REPORT_FONT_BODY }}
      >
        {cell.status}
      </span>
    </div>
  );
}

/** The report whose generation would clear one blocker. */
function BlockerAction({ row, blocker, projectId }) {
  const actionRow = buildReportActionRow({
    reportKey: blocker.source,
    report: {
      report: blocker.source,
      label: blocker.label,
      state: SOURCE_STATE[blocker.state],
    },
    checking: false,
    projectId,
    versionId: row.versionId,
  });
  if (actionRow.uiState === PROPOSAL_REPORT_UI_STATE.UNRESOLVED) return null;

  return (
    <a
      href={withProposalContext(actionRow.actionUrl)}
      className="inline-block mt-2 mr-2 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
      style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
    >
      {actionRow.actionLabel}
    </a>
  );
}

function VersionRow({ row, projectId }) {
  const blocked = !row.ready && !row.checking;

  return (
    <div className="py-4 border-b border-[#EAE8E3]" data-readiness-version={row.versionId}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-3 md:items-center">
        <span
          className="text-sm text-[#1B1A1A] truncate"
          style={{ fontFamily: REPORT_FONT_BODY }}
          title={row.versionName}
        >
          {row.versionName}
        </span>
        {READINESS_COLUMNS.map((column) => (
          <div key={column.key}>
            <span className="block md:hidden text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1">
              {column.label}
            </span>
            <ReadinessCell cell={row.cells[column.key]} />
          </div>
        ))}
      </div>

      {blocked && row.blockingSentence && (
        <p className="text-[12px] text-[#7A2E10] mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
          {row.blockingSentence}
        </p>
      )}

      {!blocked && !row.checking && formatGeneratedAt(row.visual.generatedAt || row.technical.generatedAt) && (
        <p className="text-[11px] text-[#8A8477] mt-1.5" style={{ fontFamily: REPORT_FONT_BODY }}>
          Reports generated: {formatGeneratedAt(row.visual.generatedAt || row.technical.generatedAt)}
        </p>
      )}

      {blocked && (
        <div className="mt-1">
          {row.blockers
            .filter((blocker) => blocker.source === READINESS_SOURCE.VISUAL
              || blocker.source === READINESS_SOURCE.TECHNICAL)
            .map((blocker) => (
              <BlockerAction
                key={`${row.versionId}-${blocker.source}`}
                row={row}
                blocker={blocker}
                projectId={projectId}
              />
            ))}
        </div>
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
          Checking each selected version’s current reports…
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