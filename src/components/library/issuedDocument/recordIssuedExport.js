/**
 * recordIssuedExport.js
 * ---------------------
 * Stores an exported PDF as a fixed Project Library asset — and, when that
 * storage fails, says exactly which step failed and what it said.
 *
 * Rules this module exists to hold:
 *   - Only an explicit export stores anything. Background generation and
 *     previewing never reach here.
 *   - The export itself is never delayed or put at risk. The composition is
 *     cloned synchronously at click time and everything else happens in the
 *     background; if storage fails the designer keeps the exported PDF and is
 *     told the real reason.
 *   - A document that cannot be captured page-for-page is never stored. No
 *     misleading Library asset is created in its place.
 *   - The download and the Library copy are two separate outcomes, reported
 *     separately. "You exported it" is never dressed up as "it was stored", and
 *     a failure is never answered with a generic "export again".
 *   - A failed attempt is retried against its OWN identity — the project, the
 *     version, the selected versions and the source context it was exported
 *     under. A retry never falls back to the active Room Designer version.
 *   - A retry checks for an already-stored copy of that attempt first, so a
 *     storage attempt that actually landed is never stored twice.
 */

import React from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { captureCompositionToPdf } from '@/components/library/compositionCapture';
import { notifyIssuedExportStored } from '@/components/library/issuedExportSignal';
import ExportStorageFailureActions from './ExportStorageFailureActions';
import { ISSUED_DOCUMENT_COMPOSITION, issuedDocumentLabel } from './issuedDocumentTypes';
import {
  clearPendingExport,
  holdPendingExport,
  pendingExportKey,
  peekPendingExport,
  updatePendingExport,
} from './pendingIssuedExportStore';
import { writeExportStorageDiagnostic } from './exportStorageDiagnosticLog';
import {
  EXPORT_STORAGE_REASON,
  EXPORT_STORAGE_STAGE,
  ExportStorageError,
  RETRY_UNAVAILABLE_REASON,
  asExportStorageError,
  buildExportStorageDiagnostic,
  classifyRecordFailure,
  classifyUploadFailure,
  exportStorageReason,
  resolveRetryMode,
  retryLabelFor,
} from './exportStorageFailure';

/** Shown when the PDF downloaded but its Project Library copy could not be stored. */
export const STORAGE_FAILURE_MESSAGE = 'PDF downloaded, but Project Library storage failed.';
/** A failure the designer can act on stays on screen until they act or dismiss it. */
const RETRY_TOAST_MS = 60000;

/**
 * Clone the print composition the export prints, synchronously, at click time —
 * before any export state clears the composition from the page.
 *
 * @returns {{nodeHtml: string, pageSelector: string, bodyClass: string, pageFrame: Object|null}|null}
 */
export function snapshotIssuedComposition(documentType) {
  const composition = ISSUED_DOCUMENT_COMPOSITION[documentType];
  if (!composition || typeof document === 'undefined') return null;
  const node = document.querySelector(composition.nodeSelector);
  if (!node) return null;
  return {
    // A literal "</script" inside stored rich text would end the capture document early.
    nodeHtml: String(node.outerHTML || '').replace(/<\/script/gi, '<\\/script'),
    pageSelector: composition.pageSelector,
    bodyClass: composition.bodyClass,
    // The paper this composition prints on. A proposal pack paints the whole A4
    // sheet itself; a report page frame is the printable content area inside the
    // 12mm page margin its stylesheet declares.
    pageFrame: composition.pageFrame || null,
  };
}

function hasVersionIdentity(issued) {
  if (issued?.versionId) return true;
  return Array.isArray(issued?.selectedVersionIds) && issued.selectedVersionIds.length > 0;
}

function normalizeFilename(filename) {
  const name = filename || 'export.pdf';
  return name.endsWith('.pdf') ? name : `${name}.pdf`;
}

/**
 * Resolve the source identity, take the PDF from the composition the export
 * printed, and state what is being issued.
 * @throws {ExportStorageError} stage identity | composition | capture
 */
async function captureIssuedDocument({ identity, snapshot }) {
  // A caller may resolve its source identity (versions, fingerprints, source
  // state at export) asynchronously — in the background, never on the click.
  const resolved = typeof identity.resolveSource === 'function' ? (await identity.resolveSource()) || {} : {};
  const issued = { ...identity, ...resolved };
  const filename = normalizeFilename(identity.filename);

  if (!issued.projectId || !issued.documentType) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.IDENTITY,
      reasonCode: 'missing_project',
      reason: EXPORT_STORAGE_REASON.MISSING_IDENTITY,
      detail: 'The export carried no project id or document type.',
    });
  }
  // The version is the authority the Library lists the document under. A
  // document with no version to belong to is never stored as if it had one.
  if (!hasVersionIdentity(issued)) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.IDENTITY,
      reasonCode: 'missing_version',
      reason: EXPORT_STORAGE_REASON.MISSING_IDENTITY,
      detail: 'The export resolved no version id.',
    });
  }
  if (!snapshot?.nodeHtml) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.COMPOSITION,
      reasonCode: 'composition_unavailable',
      reason: EXPORT_STORAGE_REASON.COMPOSITION_UNAVAILABLE,
    });
  }

  let captured;
  try {
    captured = await captureCompositionToPdf(snapshot);
  } catch (error) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.CAPTURE,
      reasonCode: 'capture_failed',
      reason: EXPORT_STORAGE_REASON.CAPTURE_FAILED,
      detail: error?.message ? String(error.message) : null,
      cause: error,
    });
  }

  return { issued, filename, blob: captured.blob, pageCount: captured.pageCount };
}

/**
 * The issued document is stored in the app's private files area — it is not
 * world-readable, and Open / Download sign a short-lived URL at click time.
 * @throws {ExportStorageError} stage storage_upload
 */
async function uploadIssuedPdf({ blob, filename }) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  let result;
  try {
    result = await base44.integrations.Core.UploadPrivateFile({ file });
  } catch (error) {
    const classified = classifyUploadFailure(error);
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.STORAGE_UPLOAD,
      reasonCode: classified.reasonCode,
      reason: classified.reason,
      detail: error?.message ? String(error.message).slice(0, 400) : null,
      cause: error,
    });
  }
  if (!result?.file_uri) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.STORAGE_UPLOAD,
      reasonCode: 'upload_no_path',
      reason: EXPORT_STORAGE_REASON.UPLOAD_FAILED,
      detail: 'Storage accepted the upload but returned no file path.',
    });
  }
  return { file_uri: result.file_uri };
}

/**
 * @throws {ExportStorageError} stage asset_record — the file is already stored
 * at this point, so the failure records that a stored file has no Library row.
 */
async function insertIssuedRow({ issued, filename, pageCount, fileUri }) {
  try {
    return await base44.entities.ProjectAssetExport.create({
      project_id: issued.projectId,
      account_id: issued.accountId || null,
      document_type: issued.documentType,
      title: issued.title || '',
      filename,
      version_id: issued.versionId || null,
      selected_version_ids: Array.isArray(issued.selectedVersionIds) ? issued.selectedVersionIds : [],
      source_record_id: issued.sourceRecordId || null,
      file_uri: fileUri,
      exported_at: new Date().toISOString(),
      exported_by: issued.exportedBy || null,
      source_fingerprints: issued.sourceFingerprints || {},
      source_status_at_export: issued.sourceStatusAtExport || 'current',
      page_count: pageCount,
      superseded_by_id: null,
    });
  } catch (error) {
    const classified = classifyRecordFailure(error);
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.ASSET_RECORD,
      reasonCode: classified.reasonCode,
      reason: classified.reason,
      detail: error?.message ? String(error.message).slice(0, 400) : null,
      storagePath: fileUri,
      partial: 'file_without_row',
      cause: error,
    });
  }
}

/**
 * Capture, store and record one issued document.
 *
 * The attempt is held while it is in flight, so a failure at either the storage
 * or the record step can be retried against the same PDF and the same identity.
 *
 * @returns {Promise<{record: Object, pendingKey: string}>}
 */
export async function storeIssuedDocument({ identity, snapshot }) {
  const pendingKey = holdPendingExport({
    identity,
    filename: normalizeFilename(identity?.filename),
    retryExport: identity?.retryExport || null,
  });

  const { issued, filename, blob, pageCount } = await captureIssuedDocument({ identity, snapshot });
  updatePendingExport(pendingKey, { issued, filename, blob, pageCount });

  const stored = await uploadIssuedPdf({ blob, filename });
  const record = await insertIssuedRow({ issued, filename, pageCount, fileUri: stored.file_uri });

  return { record, pendingKey };
}

/**
 * Record an issued document in the background, after the export has already
 * been triggered. Never throws: a failure is reported to the designer, with the
 * exact step that failed and the reason it gave, and no Library asset is
 * created.
 */
export function recordIssuedExportInBackground({ identity, snapshot }) {
  void (async () => {
    const pendingKey = pendingExportKey({ projectId: identity?.projectId, documentType: identity?.documentType, filename: normalizeFilename(identity?.filename) });
    try {
      const { record } = await storeIssuedDocument({ identity, snapshot });
      clearPendingExport(pendingKey);
      announceStored(identity, record);
    } catch (error) {
      reportStorageFailure({ failure: error, pendingKey, identity });
    }
  })();
}

/** Tell an open Project Library the row has landed, and say so. */
function announceStored(issued, record) {
  notifyIssuedExportStored(record?.project_id || issued?.projectId);
  toast({
    title: 'Stored in Project Library',
    description: `${issuedDocumentLabel(record?.document_type || issued?.documentType)} · ${record?.filename || ''}`,
  });
}

/**
 * Report a failed storage attempt: the real reason, the actions that can
 * actually address it, and one structured diagnostic record.
 */
function reportStorageFailure({ failure, pendingKey, identity }) {
  const identified = asExportStorageError(failure);
  const held = peekPendingExport(pendingKey);
  const issued = held?.issued || identity || {};
  const filename = held?.filename || identity?.filename || null;

  writeExportStorageDiagnostic(buildExportStorageDiagnostic({
    failure: identified,
    identity: { ...issued, filename },
    filename,
    storagePath: identified.storagePath,
    partial: identified.partial,
  }));

  const retryMode = resolveRetryMode({
    blobAvailable: !!held?.blob,
    canRegenerate: typeof held?.retryExport === 'function',
  });

  // Nothing can be retried from here — say so plainly rather than offering a
  // button that cannot help.
  const retryLabel = retryMode === 'none' ? null : retryLabelFor(retryMode);

  let handle = null;
  handle = toast({
    title: STORAGE_FAILURE_MESSAGE,
    description: exportStorageReason(identified),
    variant: 'destructive',
    duration: RETRY_TOAST_MS,
    ...(retryLabel
      ? {
          action: React.createElement(ExportStorageFailureActions, {
            pendingKey,
            retryLabel,
            projectId: issued.projectId || null,
            onSuccess: () => handle?.dismiss?.(),
          }),
        }
      : {}),
  });
}

/**
 * Has a copy of THIS attempt already landed? Compared within the attempt's own
 * document, version and filename, and only against rows written since the
 * attempt started — an older export of the same document is a different copy,
 * not this one.
 */
async function findStoredAttempt(entry) {
  const { issued, filename, attemptStartedAt } = entry;
  if (!issued?.projectId || !issued?.documentType || !filename) return null;
  const page = await base44.entities.ProjectAssetExport.filter(
    {
      project_id: issued.projectId,
      document_type: issued.documentType,
      filename,
      version_id: issued.versionId || null,
      exported_at: { $gte: attemptStartedAt },
    },
    { limit: 1, fields: ['id', 'filename', 'document_type', 'project_id'] },
  );
  const items = Array.isArray(page) ? page : page?.items || [];
  return items[0] || null;
}

/**
 * Retry storing a failed attempt in the Project Library.
 *
 * The identity is the one the attempt was exported under, so the stored row can
 * only ever carry the viewed version. The held PDF is stored as it is; when
 * nothing is held the caller's own export action is run again, and the button
 * offering it says so.
 *
 * @returns {Promise<{ok: boolean, reason?: string, alreadyStored?: boolean, regenerated?: boolean, filename?: string}>}
 */
export async function retryIssuedExportStorage(pendingKey) {
  const entry = peekPendingExport(pendingKey);
  if (!entry) return { ok: false, reason: RETRY_UNAVAILABLE_REASON };

  // A previous attempt may have landed after all (the write succeeded and the
  // response did not). That is success — and it is not stored a second time.
  try {
    const existing = await findStoredAttempt(entry);
    if (existing) {
      clearPendingExport(pendingKey);
      announceStored(entry.issued, existing);
      return { ok: true, alreadyStored: true, filename: existing.filename };
    }
  } catch {
    // A probe that cannot read is not a duplicate. Storing is still attempted.
  }

  if (!entry.blob) {
    if (typeof entry.retryExport !== 'function') {
      return { ok: false, reason: RETRY_UNAVAILABLE_REASON };
    }
    // Nothing held: the document is exported again, and that export stores it.
    clearPendingExport(pendingKey);
    entry.retryExport();
    return { ok: true, regenerated: true };
  }

  try {
    const stored = await uploadIssuedPdf({ blob: entry.blob, filename: entry.filename });
    const record = await insertIssuedRow({
      issued: entry.issued,
      filename: entry.filename,
      pageCount: entry.pageCount,
      fileUri: stored.file_uri,
    });
    clearPendingExport(pendingKey);
    announceStored(entry.issued, record);
    return { ok: true, filename: record.filename };
  } catch (error) {
    const identified = asExportStorageError(error);
    writeExportStorageDiagnostic(buildExportStorageDiagnostic({
      failure: identified,
      identity: { ...entry.issued, filename: entry.filename },
      filename: entry.filename,
      storagePath: identified.storagePath,
      partial: identified.partial,
    }));
    return { ok: false, reason: exportStorageReason(identified), stage: identified.stage };
  }
}

export default recordIssuedExportInBackground;