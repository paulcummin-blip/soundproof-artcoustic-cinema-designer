/**
 * ExportStorageFailureActions.jsx
 * -------------------------------
 * The actions offered when a PDF exported but its Project Library copy could
 * not be stored.
 *
 * Self-contained: it owns its own busy state, calls the retry, and reports back
 * only through its props. It is placed in a toast, which has no context of its
 * own, so nothing here may depend on the export page being mounted.
 *
 * Retry labels come from the failure itself:
 *   - "Retry storing in Project Library" — the captured PDF is still held, so
 *     that exact file is stored again. No regeneration, no second download.
 *   - "Retry export and store" — nothing is held, so the document must be
 *     exported again before it can be stored.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearPendingExport } from './pendingIssuedExportStore';
import { retryIssuedExportStorage } from './recordIssuedExport';

export default function ExportStorageFailureActions({ pendingKey, retryLabel, projectId, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(null);

  // Dismissing the failure toast drops the held PDF: retrying is offered while
  // this row is on screen, and the attempt should not sit in memory afterwards.
  useEffect(() => () => clearPendingExport(pendingKey), [pendingKey]);

  const handleRetry = async () => {
    if (busy) return;
    setBusy(true);
    setReason(null);
    const result = await retryIssuedExportStorage(pendingKey);
    setBusy(false);
    if (result?.ok) {
      if (typeof onSuccess === 'function') onSuccess(result);
      return;
    }
    setReason(result?.reason || 'The retry could not store the export.');
  };

  const libraryHref = projectId
    ? `/ProjectProposalAssets?projectId=${encodeURIComponent(projectId)}`
    : '/ProjectProposalAssets';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetry}
          disabled={busy}
          className="bg-transparent border-current text-current hover:bg-black/10"
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          {busy ? 'Retrying…' : retryLabel}
        </Button>
        <a
          href={libraryHref}
          className="text-xs underline underline-offset-2 text-current"
        >
          Open Project Library
        </a>
      </div>
      {reason && <div className="text-xs text-current">{reason}</div>}
    </div>
  );
}