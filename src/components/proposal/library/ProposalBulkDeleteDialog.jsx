/**
 * ProposalBulkDeleteDialog
 * ------------------------
 * One confirmation for a bulk deletion of proposals, and the report of what
 * happened.
 *
 * The list it shows is the SERVER's answer to a dry run: the proposals that would
 * be deleted, and the proposals that would be kept because they have been issued
 * (an issued document was exported from them, or they are already issued). A
 * protected proposal is never deleted automatically and is never archived — it is
 * named here so the designer knows exactly what is being kept and why.
 *
 * Presentation only — the deletion itself is owned by the library tab.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

function ProposalList({ entries }) {
  return (
    <ul className="space-y-1 mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
      {entries.map((entry) => (
        <li key={entry.id} className="text-[13px] text-[#3E4349] leading-snug">
          <span className="text-[#1B1A1A]">{entry.title || 'Untitled Proposal'}</span>
          {entry.reason ? <span className="text-[#8A8477]"> — {entry.reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default function ProposalBulkDeleteDialog({
  open,
  plan = null,
  outcome = null,
  deleting = false,
  error = null,
  onCancel,
  onConfirm,
}) {
  const deletable = plan?.deletable || [];
  const refused = plan?.refused || [];
  const count = deletable.length;
  const noun = count === 1 ? 'proposal' : 'proposals';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent className="bg-white border-[#DCDBD6] max-w-lg" data-proposal-bulk-delete-dialog="true">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: REPORT_FONT_BODY }}>
            {outcome ? 'Deletion result' : `Delete ${count} ${noun}?`}
          </DialogTitle>
        </DialogHeader>

        {outcome ? (
          <div className="space-y-4">
            {outcome.deleted?.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#213428]">
                  Deleted {outcome.deleted.length} {outcome.deleted.length === 1 ? 'proposal' : 'proposals'}
                </div>
                <ProposalList entries={outcome.deleted} />
              </div>
            )}
            {outcome.notDeleted?.length > 0 && (
              <div className="border-t border-[#E5E1D8] pt-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A2E10]">
                  Not deleted ({outcome.notDeleted.length})
                </div>
                <ProposalList entries={outcome.notDeleted} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 text-sm text-[#3E4349] leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
              <p>These proposals and their associated generation history will be permanently deleted.</p>
              <p>Your projects, designs and Project Reports will not be affected.</p>
            </div>

            {refused.length > 0 && (
              <div className="border-t border-[#E5E1D8] pt-4">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#7A2E10]">
                  Issued proposals are kept ({refused.length})
                </div>
                <p className="text-[12px] text-[#8A8477] leading-snug mt-1" style={{ fontFamily: REPORT_FONT_BODY }}>
                  These are not deleted and are not archived. Delete them separately if that is what you intend.
                </p>
                <ProposalList entries={refused} />
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-[#7A2E10] leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          {outcome ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
              style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[#625143] hover:text-[#1B1A1A] transition-colors"
                style={{ fontFamily: REPORT_FONT_BODY }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || count === 0}
                onClick={onConfirm}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
              >
                {deleting ? 'Deleting…' : `Delete ${count} ${count === 1 ? 'Proposal' : 'Proposals'}`}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}