/**
 * DocumentDownloadButton
 * ----------------------
 * The canonical "Download PDF" pill shared across every issued-document
 * surface. It retrieves the EXISTING stored PDF only (never regenerates,
 * captures or uploads) and turns from muted terracotta to Sound Proof brand
 * green the instant the retrieval succeeds, swapping the download icon for a
 * tick. The label stays "Download PDF" in both states and both states remain
 * fully clickable so the user can download the same document again.
 *
 * The green state is sourced from the shared per-user, per-record download
 * store (useDocumentDownloadStatus), so it persists across refresh and
 * navigation and is consistent no matter which surface initiated the download.
 * It resets to terracotta for a replacement PDF (new record id) and never turns
 * green on a failed retrieval.
 *
 * Renders nothing when no stored PDF record id is available.
 */
import React, { useState } from 'react';
import { Download, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocumentDownloadStatus } from './useDocumentDownloadStatus';

const TERRACOTTA = '#A66B5E';
const BRAND_GREEN = '#213428';

export default function DocumentDownloadButton({
  userId,
  recordId,
  onDownload,
  disabled = false,
  label = 'Download PDF',
  className = 'h-7 px-3 text-[11px] font-medium border-0 flex-1 min-w-0',
  onError = null,
}) {
  const { downloaded: storeDownloaded, markDownloaded } = useDocumentDownloadStatus(userId, recordId);
  const [downloading, setDownloading] = useState(false);
  const [localDownloaded, setLocalDownloaded] = useState(false);

  if (!recordId) return null;

  const isDownloaded = !downloading && (localDownloaded || storeDownloaded);

  const handleClick = async () => {
    if (downloading || disabled) return;
    setDownloading(true);
    try {
      await onDownload();
      markDownloaded();
      setLocalDownloaded(true);
    } catch (error) {
      // A failed download never turns the button green.
      if (onError) onError(error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      className={className}
      style={{ background: isDownloaded ? BRAND_GREEN : TERRACOTTA, color: '#FFFFFF' }}
      onClick={handleClick}
      disabled={downloading || disabled}
      title={isDownloaded ? 'Download again' : 'Download PDF'}
    >
      {downloading ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : isDownloaded ? (
        <CheckCircle2 className="w-3 h-3 mr-1" />
      ) : (
        <Download className="w-3 h-3 mr-1" />
      )}
      {label}
    </Button>
  );
}