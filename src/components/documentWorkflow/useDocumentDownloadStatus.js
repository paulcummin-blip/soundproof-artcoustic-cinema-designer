/**
 * useDocumentDownloadStatus
 * ---------------------------
 * React hook wrapping downloadStatusStore with useSyncExternalStore so the
 * Download PDF button re-renders immediately when a download is marked
 * complete (or when another tab marks the same document).
 */
import { useSyncExternalStore } from 'react';
import { subscribeDownloadStatus, isDocumentDownloaded, markDocumentDownloaded } from './downloadStatusStore';

export function useDocumentDownloadStatus(userId, recordId) {
  const downloaded = useSyncExternalStore(
    subscribeDownloadStatus,
    () => isDocumentDownloaded(userId, recordId),
    () => false,
  );
  return {
    downloaded,
    markDownloaded: () => markDocumentDownloaded(userId, recordId),
  };
}