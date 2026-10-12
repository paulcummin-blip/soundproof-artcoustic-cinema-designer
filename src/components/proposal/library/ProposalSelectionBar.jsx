/**
 * ProposalSelectionBar
 * --------------------
 * The Proposal Library's multi-select toolbar, above the proposal cards and
 * always on screen: how many proposals are selected, Select All Visible (the
 * proposals currently displayed, and only those), Clear Selection, and Delete
 * Selected — which stays visible and disabled while nothing is selected.
 *
 * Presentation only — selection and deletion are owned by the library tab.
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalSelectionBar({
  count = 0,
  visibleCount = 0,
  busy = false,
  onSelectAll,
  onCancel,
  onDelete,
}) {
  const nothingSelected = count === 0;
  const noun = count === 1 ? 'proposal' : 'proposals';

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 mb-8 px-4 py-3 border border-[#DCDBD6] bg-white"
      data-proposal-selection-bar="true"
    >
      <div className="flex flex-wrap items-center gap-5" style={{ fontFamily: REPORT_FONT_BODY }}>
        <span
          className="text-[11px] uppercase tracking-[0.14em] text-[#213428]"
          aria-live="polite"
          data-proposal-selection-count={count}
        >
          {count} selected
        </span>
        {onSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            disabled={visibleCount === 0}
            className="text-[11px] uppercase tracking-[0.14em] text-[#625143] hover:text-[#213428] disabled:opacity-40 disabled:hover:text-[#625143] transition-colors"
          >
            Select All Visible
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={nothingSelected}
            className="text-[11px] uppercase tracking-[0.14em] text-[#8A8477] hover:text-[#213428] disabled:opacity-40 disabled:hover:text-[#8A8477] transition-colors"
          >
            Clear Selection
          </button>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy || nothingSelected}
          title={nothingSelected ? 'Select at least one proposal to delete.' : `Delete ${count} selected ${noun}`}
          className="flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40 disabled:hover:bg-[#213428] transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {busy ? 'Checking…' : 'Delete Selected'}
        </button>
      )}
    </div>
  );
}