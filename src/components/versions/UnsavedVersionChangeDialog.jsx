// src/components/versions/UnsavedVersionChangeDialog.jsx
//
// The safety question asked before another design version is opened while the
// open version still holds unsaved changes. Three answers, no more:
//   Save and open · Open without saving · Cancel
//
// Presentation only: the caller owns the save, the switch and any error text.

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { versionSwitchQuestion } from '@/components/versions/versionSwitchSafety';

export default function UnsavedVersionChangeDialog({
  open = false,
  versionName = null,
  busy = false,
  error = null,
  onCancel,
  onSaveAndOpen,
  onOpenWithoutSaving,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel?.();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            {versionSwitchQuestion(versionName)}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            className="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
            style={{ background: '#FDF5F5', color: '#B23A3A' }}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onOpenWithoutSaving} disabled={busy}>
            Open without saving
          </Button>
          <Button
            onClick={onSaveAndOpen}
            disabled={busy}
            className="font-semibold hover:brightness-110"
            style={{ background: '#213428', color: '#FFFFFF' }}
          >
            {busy ? 'Saving…' : 'Save and open'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}