/**
 * ReportReadinessGate
 * -------------------
 * Step 3 (Versions) readiness block.
 *
 * States, per report, whether the selected version has a current Visual and
 * Technical Report, and the one action that produces it. Next stays disabled
 * until both read Current.
 *
 * The action is never withdrawn and its label never varies: every state shows
 * "Generate <Report>", and the status text says whether the report is current,
 * missing, stale, checking or unavailable.
 *
 * Presentation only: every value comes from proposalReportReadinessGate.
 */

import React from 'react';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  PROPOSAL_REPORT_GATE_TITLE,
  PROPOSAL_REPORT_GATE_READY_COPY,
} from '@/components/proposal/sourceAuthority/proposalReportReadinessGate';
import { PROPOSAL_REPORT_UI_STATE } from '@/components/proposal/sourceAuthority/proposalReportActions';

const STATE_COLOUR = {
  [PROPOSAL_REPORT_UI_STATE.CURRENT]: '#213428',
  [PROPOSAL_REPORT_UI_STATE.STALE]: '#7A5A10',
  [PROPOSAL_REPORT_UI_STATE.FAILED]: '#7A2E10',
  [PROPOSAL_REPORT_UI_STATE.MISSING]: '#7A2E10',
  [PROPOSAL_REPORT_UI_STATE.CHECKING]: '#8A8477',
  [PROPOSAL_REPORT_UI_STATE.GENERATING]: '#7A5A10',
  [PROPOSAL_REPORT_UI_STATE.UNRESOLVED]: '#7A5A10',
};

function RowIcon({ row, colour }) {
  if (row.current) return <Check className="w-4 h-4 shrink-0" style={{ color: colour }} />;
  if (row.uiState === PROPOSAL_REPORT_UI_STATE.CHECKING || row.uiState === PROPOSAL_REPORT_UI_STATE.GENERATING) {
    return <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: colour }} />;
  }
  return <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: colour }} />;
}

function ReportAction({ row }) {
  if (!row.actionLabel) return null;

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

function ReadinessRow({ row }) {
  const colour = STATE_COLOUR[row.uiState] || '#3E4349';
  return (
    <div className="py-2.5 border-b border-[#EAE8E3]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex items-center gap-2 text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
          <RowIcon row={row} colour={colour} />
          {row.label}
        </span>
        <span className="text-right">
          <span
            className="text-[11px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: colour, fontFamily: REPORT_FONT_BODY }}
          >
            {row.status}
          </span>
          {row.reason && (
            <span className="block text-[11px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
              {row.reason}
            </span>
          )}
        </span>
      </div>
      <ReportAction row={row} />
    </div>
  );
}

export default function ReportReadinessGate({ gate, className = '' }) {
  if (!gate?.available) return null;

  return (
    <section className={`mt-6 border border-[#DCDBD6] bg-white p-5 ${className}`}>
      <h3
        className="text-[12px] uppercase tracking-[0.16em] text-[#1B1A1A] mb-3"
        style={{ fontFamily: REPORT_FONT_HEADING }}
      >
        {PROPOSAL_REPORT_GATE_TITLE}
      </h3>

      {gate.checking && (
        <p className="text-sm text-[#8A8477] mb-3" style={{ fontFamily: REPORT_FONT_BODY }}>
          Checking the current reports…
        </p>
      )}

      {(gate.rows || []).map((row) => <ReadinessRow key={row.key} row={row} />)}

      {!gate.ready && gate.message && (
        <div className="mt-4 pt-4 border-t border-[#EAE8E3]">
          <p role="alert" className="text-sm font-semibold text-[#7A2E10]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {gate.message}
          </p>
          {gate.detail && (
            <p className="text-sm text-[#625143] leading-relaxed mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
              {gate.detail}
            </p>
          )}
        </div>
      )}

      {gate.ready && (
        <p className="mt-3 text-[11px] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {PROPOSAL_REPORT_GATE_READY_COPY}
        </p>
      )}
    </section>
  );
}