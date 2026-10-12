/**
 * ProposalSelectionBar
 * --------------------
 * The Proposal Library's multi-select actions, shown only while something is
 * selected: how many proposals are selected, Select All (the proposals currently
 * displayed, and only those), Cancel Selection, and Delete Selected.
 *
 * Presentation only — selection and deletion are owned by the library tab.
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalSelectionBar({
  count = 0,
  busy = false,
  onSelectAll,
  onCancel,
  onDelete,
}) {
  if (!count) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 mb-8 px-4 py-3 border border-[#DCDBD6] bg-white"
      data-proposal-selection-bar="true"
    >
      <div className="flex flex-wrap items-center gap-5" style={{ fontFamily: REPORT_FONT_BODY }}>
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#213428]">
          {count} selected
        </span>
        {onSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] uppercase tracking-[0.14em] text-[#625143] hover:text-[#213428] transition-colors"
          >
            Select All
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] uppercase tracking-[0.14em] text-[#8A8477] hover:text-[#213428] transition-colors"
          >
            Cancel Selection
          </button>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {busy ? 'Checking…' : 'Delete Selected'}
        </button>
      )}
    </div>
  );
}