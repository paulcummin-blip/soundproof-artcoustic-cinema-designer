/**
 * useIssuedDocumentDownload
 * -------------------------
 * Downloads a stored issued PDF AND records the per-user, per-document
 * download status in the shared store, so every "Download PDF" button across
 * Documents & Assets, Project Assets and the Technical Report page turns
 * brand green after a successful retrieval — regardless of which surface
 * initiated the download.
 *
 * The status is marked ONLY after `downloadIssuedDocument` resolves; a failed
 * retrieval never marks the document downloaded (the error re-throws so the
 * caller can show its own failure UI).
 */
import { useCallback } from 'react';
import { downloadIssuedDocument } from '@/components/library/issuedDocument/issuedDocumentActions';
import { markDocumentDownloaded } from './downloadStatusStore';

export function useIssuedDocumentDownload(userId) {
  const download = useCallback(async (record) => {
    if (!record) return;
    await downloadIssuedDocument(record);
    if (record.id) markDocumentDownloaded(userId, record.id);
  }, [userId]);
  return { download };
}