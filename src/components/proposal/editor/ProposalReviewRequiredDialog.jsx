/**
 * ProposalReviewRequiredDialog
 * ----------------------------
 * Why Export Proposal PDF did not export.
 *
 * The proposal carries generated copy that nobody has approved yet, so the issue
 * gate holds the document back. That is a deliberate product rule, not a fault,
 * and the click has to say so: which rule, and exactly which sections still need
 * approval — never a click that appears to do nothing.
 *
 * "Review Copy" takes the designer to the first section that needs it. The
 * document itself stays available as a read-only preview, because inspecting the
 * real document before it is fit to issue is what the preview is for.
 *
 * Presentation only: it renders the review state the server resolved and decides
 * nothing, and it never reaches the printer or the Project Library itself.
 *
 * Props:
 * - open: whether the dialog is shown
 * - review: the resolved review state
 * - onReviewCopy: open the first section that needs approval
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

export default function ProposalReviewRequiredDialog({
  open = false,
  review = null,
  onReviewCopy,
  onCancel,
}) {
  const items = review?.copy?.items || [];
  const navigable = items.some((item) => item.target_section_type);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent
        className="bg-white border-[#DCDBD6] max-w-xl"
        data-proposal-review-dialog="true"
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
            This proposal still contains generated copy that has not been approved.
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 && (
          <div
            style={{
              border: '1px solid #DCDBD6',
              borderRadius: 8,
              overflow: 'hidden',
              margin: '4px 0 2px',
            }}
          >
            {items.map((item, index) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '10px 14px',
                  borderTop: index === 0 ? 'none' : '1px solid #DCDBD6',
                  background: index % 2 === 0 ? '#FFFFFF' : '#FAF9F7',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: '#1B1A1A' }}>
                    {item.label}
                  </div>
                  {item.reason && (
                    <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: '#8A8477', marginTop: 2 }}>
                      {item.reason}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#8B4A2B',
                    backgroundColor: '#F6E7E1',
                    border: '1px solid #E4C9BC',
                    borderRadius: 4,
                    padding: '3px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Needs review
                </span>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: '#8A8477', margin: '4px 0 0', lineHeight: 1.6 }}>
          Preview Document stays available while the copy is under review. Export unlocks
          once every section above has been approved.
        </p>

        <DialogFooter style={{ gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={SECONDARY_BUTTON} data-review-cancel="true">
            Cancel
          </button>
          <button
            type="button"
            onClick={onReviewCopy}
            disabled={!navigable}
            style={{ ...PRIMARY_BUTTON, opacity: navigable ? 1 : 0.5, cursor: navigable ? 'pointer' : 'not-allowed' }}
            data-review-copy="true"
          >
            Review Copy
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}