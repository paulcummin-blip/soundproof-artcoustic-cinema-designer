/**
 * issuedDocumentActions.js
 * ------------------------
 * Open and Download for a stored issued document.
 *
 * Issued documents are read-only: there is no delete and no overwrite here.
 * A privately stored file is signed for a short window at click time.
 */

import { base44 } from '@/api/base44Client';

const NO_FILE_MESSAGE = 'This document is no longer available in storage.';

/** A short-lived URL for the stored file, or null when there is none. */
export async function resolveIssuedDocumentUrl(record, { expiresIn = 300 } = {}) {
  if (!record) return null;
  if (record.file_uri) {
    const result = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: record.file_uri,
      expires_in: expiresIn,
    });
    return result?.signed_url || null;
  }
  return record.file_url || null;
}

/** Open the issued document in a new tab. */
export async function openIssuedDocument(record) {
  const url = await resolveIssuedDocumentUrl(record);
  if (!url) throw new Error(NO_FILE_MESSAGE);
  window.open(url, '_blank', 'noopener');
}

/** Download the issued document under the exact filename it was exported with. */
export async function downloadIssuedDocument(record) {
  const url = await resolveIssuedDocumentUrl(record);
  if (!url) throw new Error(NO_FILE_MESSAGE);

  const response = await fetch(url);
  if (!response.ok) throw new Error(NO_FILE_MESSAGE);
  const objectUrl = URL.createObjectURL(await response.blob());

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = record.filename || 'document.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}