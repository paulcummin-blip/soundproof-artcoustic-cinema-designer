/**
 * ProposalApprovalRequiredDialog
 * ------------------------------
 * Why Export Proposal PDF did not export: the document's generated copy has not
 * all been approved yet.
 *
 * This is a deliberate product rule rather than a fault — a proposal may be
 * generated and validated and still not be fit to send to a client until someone
 * has read each generated section and approved its wording. So the click has to
 * say so, list every generated section with its own state, and offer the way to
 * the first one that still needs reading. It is never silent, and there is no
 * "approve all": the point of the gate is that each section is read.
 *
 * Presentation only. The approval state is resolved on the server and read here
 * as given; no approval is given, inferred or reset by this dialog.
 *
 * Props:
 * - open: whether the dialog is shown
 * - approval: the resolved approval state
 * - onReviewNext: open the first section still awaiting approval
 * - onCancel: close
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import {
  APPROVAL_STATUS,
  approvalChipStyle,
  approvalLabel,
} from '@/components/proposal/editor/sectionApprovalPresentation';

const PRIMARY_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 18px',
  fontFamily: FONT_BODY,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  backgroundColor: '#213428',
  border: '1px solid #213428',
  borderRadius: 6,
  cursor: 'pointer',
};

const SECONDARY_BUTTON = {
  ...PRIMARY_BUTTON,
  color: '#625143',
  backgroundColor: '#FFFFFF',
  border: '1px solid #DCDBD6',
};

export default function ProposalApprovalRequiredDialog({
  open = false,
  approval = null,
  onReviewNext,
  onCancel,
}) {
  // Every generated section, in document order, with its own state: what is
  // approved and what is not has to be readable at a glance from here.
  const rows = (approval?.sections || []).filter((row) => row.requires_approval);
  const awaiting = rows.filter((row) => row.status !== APPROVAL_STATUS.APPROVED);
  const navigable = awaiting.some((row) => row.section_type);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent
        className="bg-white border-[#DCDBD6] max-w-xl"
        data-proposal-approval-dialog="true"
      >
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: FONT_HEADING,
              fontSize: 15,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#213428',
            }}
          >
            Review required before export
          </DialogTitle>
          <DialogDescription
            style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#625143', lineHeight: 1.6, marginTop: 6 }}
          >
            This proposal still contains sections that have not been approved.
          </DialogDescription>
        </DialogHeader>

        {rows.length > 0 && (
          <div
            style={{ border: '1px solid #DCDBD6', borderRadius: 8, overflow: 'hidden', margin: '4px 0 2px' }}
          >
            {rows.map((row, index) => {
              const status = row.status || APPROVAL_STATUS.NEEDS_REVIEW;
              const chip = approvalChipStyle(status);
              return (
                <div
                  key={row.section_id || row.section_type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '10px 14px',
                    borderTop: index === 0 ? 'none' : '1px solid #DCDBD6',
                    background: index % 2 === 0 ? '#FFFFFF' : '#FAF9F7',
                  }}
                >
                  <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#1B1A1A', minWidth: 0 }}>
                    {row.title || row.section_type}
                  </div>
                  <span
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      borderRadius: 4,
                      padding: '3px 8px',
                      whiteSpace: 'nowrap',
                      ...(chip || {}),
                    }}
                  >
                    {approvalLabel(status)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: '#8A8477', margin: '4px 0 0', lineHeight: 1.6 }}>
          The PDF is created only when every section above has been approved and the
          evidence check has passed.
        </p>

        <DialogFooter style={{ gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={SECONDARY_BUTTON} data-approval-cancel="true">
            Cancel
          </button>
          <button
            type="button"
            onClick={onReviewNext}
            disabled={!navigable}
            style={{ ...PRIMARY_BUTTON, opacity: navigable ? 1 : 0.5, cursor: navigable ? 'pointer' : 'not-allowed' }}
            data-approval-review-next="true"
          >
            Review next section
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}