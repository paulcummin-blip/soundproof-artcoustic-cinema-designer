/**
 * ProposalSourceStateBadge
 * ------------------------
 * A saved proposal's source state: Current / Source changed / Missing source.
 * Presentation only.
 */

import React from 'react';
import { Check, AlertTriangle, CircleSlash } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  PROPOSAL_LIBRARY_SOURCE_LABEL,
  PROPOSAL_LIBRARY_SOURCE_STATE,
} from './proposalSourceState';

const STATE_STYLE = {
  [PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT]: { colour: '#213428', Icon: Check },
  [PROPOSAL_LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: { colour: '#7A5A10', Icon: AlertTriangle },
  [PROPOSAL_LIBRARY_SOURCE_STATE.MISSING_SOURCE]: { colour: '#7A2E10', Icon: CircleSlash },
};

export default function ProposalSourceStateBadge({ sourceState, className = '' }) {
  const state = sourceState?.state || PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT;
  const style = STATE_STYLE[state] || STATE_STYLE[PROPOSAL_LIBRARY_SOURCE_STATE.CURRENT];
  const { Icon } = style;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      data-proposal-source-state={state}
      title={sourceState?.reason || undefined}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: style.colour }} />
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold"
        style={{ color: style.colour, fontFamily: REPORT_FONT_BODY }}
      >
        {PROPOSAL_LIBRARY_SOURCE_LABEL[state]}
      </span>
    </span>
  );
}