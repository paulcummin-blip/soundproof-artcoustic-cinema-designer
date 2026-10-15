/**
 * ProposalCopyReviewSummary
 * -------------------------
 * The Proposal Editor's two status lines, kept apart on purpose:
 *
 *   EVIDENCE CHECK   whether the document's own material holds — the frozen
 *                    writing contract, the saved engineering evidence and the
 *                    snapshot it names. Nobody approves this; it either holds or
 *                    it does not.
 *
 *   COPY REVIEW      how much generated copy still needs reading and approval
 *                    before the document is fit to issue.
 *
 * Unapproved wording is never presented as an engineering failure, and an
 * engineering failure is never presented as merely unapproved wording, so a
 * designer always knows which of the two they are looking at.
 *
 * It renders the review state the server resolved and decides nothing: no rule,
 * no validation and no gate is evaluated here.
 *
 * Props:
 * - review: the resolved review state, or null while it is being read
 */

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { approvalCountSentence } from '@/components/proposal/editor/sectionApprovalPresentation';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';

const COLOURS = {
  passed: '#213428',
  attention: '#8B4A2B',
  label: '#625143',
  muted: '#8A8477',
};

const LABEL = {
  fontFamily: FONT_BODY,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: COLOURS.label,
  width: 128,
  flexShrink: 0,
};

const VALUE = {
  fontFamily: FONT_BODY,
  fontSize: 12,
  lineHeight: 1.5,
};

function Line({ label, ok, children }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...VALUE, color: ok ? COLOURS.passed : COLOURS.attention, display: 'flex', gap: 6 }}>
        <Icon style={{ width: 13, height: 13, marginTop: 2, flexShrink: 0 }} />
        <span>{children}</span>
      </span>
    </div>
  );
}

export default function ProposalCopyReviewSummary({ review = null, approval = null, style = null }) {
  if (!review?.checked) return null;

  const awaiting = review.copy?.awaiting || 0;
  const evidenceBlockers = review.evidence?.blockers || [];
  const evidencePassed = review.evidence?.passed !== false;

  // The copy line is the designer's own approval count wherever the document has
  // generated copy to approve: how many sections they have actually read and
  // approved, out of the sections that carry generated wording. Where there is
  // nothing generated to approve, the line falls back to what the document check
  // already reported.
  const approvalSentence = approvalCountSentence(approval);
  const copyOk = approval ? approval.all_approved === true : awaiting === 0;
  const copyLine = approval
    ? (approvalSentence || 'All copy approved')
    : (awaiting === 0
      ? 'All copy approved'
      : `${awaiting} ${awaiting === 1 ? 'section' : 'sections'} awaiting approval`);

  return (
    <div
      data-proposal-review-summary="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 0 0',
        ...(style || {}),
      }}
    >
      <Line label="Evidence Check" ok={evidencePassed}>
        {evidencePassed
          ? 'Passed'
          : (evidenceBlockers[0] || 'This document’s saved evidence could not be checked.')}
      </Line>

      <Line label="Copy Review" ok={copyOk}>
        {copyLine}
      </Line>
    </div>
  );
}