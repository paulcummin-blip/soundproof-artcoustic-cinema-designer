/**
 * ProposalRenameDialog
 * --------------------
 * Renames a saved proposal's title. The proposal's content, revision link and
 * source state are untouched.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function ProposalRenameDialog({ open, proposal, saving = false, onCancel, onSubmit }) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) setTitle(proposal?.title || '');
  }, [open, proposal?.id, proposal?.title]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent className="bg-white border-[#DCDBD6]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: REPORT_FONT_BODY }}>Rename proposal</DialogTitle>
        </DialogHeader>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Proposal title"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && title.trim()) onSubmit?.(title.trim());
          }}
        />

        <DialogFooter className="gap-2">
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
            disabled={saving || !title.trim()}
            onClick={() => onSubmit?.(title.trim())}
            className="px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
            style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}