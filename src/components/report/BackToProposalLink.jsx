/**
 * BackToProposalLink
 * ------------------
 * The contextual route back from a report to the proposal workflow.
 *
 * Renders only when the report URL carries the proposal context (from=proposal),
 * so a report opened from the project flow shows its normal navigation alone.
 * The destination is always an in-app proposal path — Proposal Centre, the
 * proposal it came from, or an explicit safe return path.
 *
 * App navigation only: the caller passes the print-hiding class its page uses
 * ('screen-only' on the Technical Report, 'client-report-screen-only' on the
 * Visual Report), so the link never reaches an exported PDF.
 */

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  BACK_TO_PROPOSAL_LABEL,
  readProposalContext,
  resolveProposalReturnUrl,
} from '@/components/report/proposalReportContext';

const LINK_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif",
  fontSize: 13,
  backgroundColor: '#213428',
  border: '1px solid #213428',
  borderRadius: 6,
  color: '#FFFFFF',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export default function BackToProposalLink({ className = '', style = null }) {
  const [searchParams] = useSearchParams();
  const context = readProposalContext(searchParams);

  if (!context.active) return null;

  return (
    <Link
      to={resolveProposalReturnUrl(context)}
      className={className}
      style={style ? { ...LINK_STYLE, ...style } : LINK_STYLE}
      data-proposal-return={context.proposalId ? 'proposal' : 'centre'}
    >
      <ArrowLeft style={{ width: 16, height: 16, color: '#FFFFFF', flexShrink: 0 }} />
      {BACK_TO_PROPOSAL_LABEL}
    </Link>
  );
}