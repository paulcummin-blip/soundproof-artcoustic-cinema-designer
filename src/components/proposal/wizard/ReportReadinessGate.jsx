/**
 * ReportReadinessGate
 * -------------------
 * Step 3 (Versions) readiness block.
 *
 * States, per report, whether the selected version has a current Visual and
 * Technical Report, and — when it does not — the one action that fixes it. Next
 * stays disabled until both read Current.
 *
 * Presentation only: every value comes from proposalReportReadinessGate.
 */

import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { PROPOSAL_SOURCE_STATE } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import { PROPOSAL_REPORT_GATE_TITLE } from '@/components/proposal/sourceAuthority/proposalReportReadinessGate';

const STATE_COLOUR = {
  [PROPOSAL_SOURCE_STATE.CURRENT]: '#213428',
  [PROPOSAL_SOURCE_STATE.STALE]: '#7A5A10',
  [PROPOSAL_SOURCE_STATE.FAILED]: '#7A2E10',
  [PROPOSAL_SOURCE_STATE.MISSING]: '#7A2E10',
};

function ReadinessRow({ row }) {
  const colour = STATE_COLOUR[row.state] || '#3E4349';
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#EAE8E3]">
      <span className="flex items-center gap-2 text-sm text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {row.current
          ? <Check className="w-4 h-4 shrink-0" style={{ color: colour }} />
          : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: colour }} />}
        {row.label}
      </span>
      <span className="text-right">
        <span
          className="text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: colour, fontFamily: REPORT_FONT_BODY }}
        >
          {row.status}
        </span>
        {!row.current && row.reason && (
          <span className="block text-[11px] text-[#8A8477] mt-0.5" style={{ fontFamily: REPORT_FONT_BODY }}>
            {row.reason}
          </span>
        )}
      </span>
    </div>
  );
}

export default function ReportReadinessGate({ gate, className = '' }) {
  if (!gate?.available) return null;

  const actions = (gate.rows || []).filter((row) => row.actionLabel && row.actionUrl);

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
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4">
              {actions.map((row) => (
                <a
                  key={row.key}
                  href={row.actionUrl}
                  className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
                  style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
                >
                  {row.actionLabel}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {gate.ready && (
        <p className="mt-3 text-[11px] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
          Both reports are current for this version. The proposal will be built from them.
        </p>
      )}
    </section>
  );
}