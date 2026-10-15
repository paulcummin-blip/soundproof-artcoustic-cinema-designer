/**
 * recordIssuedExport.js
 * ---------------------
 * Stores an exported PDF as a fixed Project Library asset — and, when that
 * storage fails, says exactly which step failed and what it said.
 *
 * Rules this module exists to hold:
 *   - Only an explicit export stores anything. Background generation and
 *     a read-only pass never reach here.
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
import { captureCompositionToPdf, captureStylesMarkup } from '@/components/library/compositionCapture';
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
import { buildIssuedDocumentRow } from './issuedDocumentRowPayload';
import { resolveIssuedDocumentAccountId } from './issuedDocumentOwnership';
import { readProjectOwnership } from './projectOwnershipRead';
import { isProjectLibraryRecordFailure } from './projectLibraryStorageDiagnostics';
import {
  EXPORT_STORAGE_REASON,
  EXPORT_STORAGE_STAGE,
  ExportStorageError,
  RETRY_UNAVAILABLE_REASON,
  asExportStorageError,
  backendErrorCode,
  backendErrorMessage,
  buildAssetRecordFailure,
  buildExportStorageDiagnostic,
  buildStorageNotice,
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
 * One export action, one notification.
 *
 * A single export can reach the print path more than once: each of the Technical
 * Report's drawing captures falls back to printing, and every entry to
 * printTechnicalReport issues its own storage attempt. Two identical attempts
 * must not become two identical toasts, and must not store the same export
 * twice — so both are keyed on the export's own identity: the project, the
 * version, the document type, the filename and the step that failed.
 */
const FAILURE_NOTICE_WINDOW_MS = RETRY_TOAST_MS;
const attemptsInFlight = new Set();
const failureNoticesShown = new Map();

/** The identity one export attempt is deduped under. */
function exportAttemptKey(identity = {}) {
  const versions = Array.isArray(identity.selectedVersionIds) && identity.selectedVersionIds.length > 0
    ? identity.selectedVersionIds.join(',')
    : (identity.versionId || '');
  return [
    identity.projectId || '',
    identity.documentType || '',
    versions,
    normalizeFilename(identity.filename),
  ].join('|');
}

/** The identity one failure notice is deduped under, including the step. */
function failureNoticeKey(identity = {}, stage) {
  return `${exportAttemptKey(identity)}|${stage || EXPORT_STORAGE_STAGE.UNKNOWN}`;
}

/**
 * Clone the print composition the export prints, synchronously, at click time —
 * before any export state clears the composition from the page.
 *
 * @returns {{nodeHtml: string, pageSelector: string, bodyClass: string, pageFrame: Object|null}|null}
 */
export function snapshotIssuedComposition(documentType, completedNode = null) {
  const composition = ISSUED_DOCUMENT_COMPOSITION[documentType];
  if (!composition || typeof document === 'undefined') return null;
  const node = completedNode || document.querySelector(composition.nodeSelector);
  if (!node) return null;
  if (node.matches('.proposal-print-portal') && node.dataset.browserComposed !== 'true') {
    throw new Error('Proposal storage must snapshot the completed browser print composition.');
  }
  return {
    styles: captureStylesMarkup(node.ownerDocument),
    compositionInventory: node.dataset.compositionInventory ? JSON.parse(node.dataset.compositionInventory) : null,
    // A literal "</script" inside stored rich text would end the capture document early.
    nodeHtml: String(node.outerHTML || '').replace(/<\/script/gi, '<\\/script'),
    pageSelector: composition.pageSelector,
    bodyClass: composition.bodyClass,
    // The paper this composition prints on. A proposal pack paints the whole A4
    // sheet itself; a report page frame is the printable content area inside the
    // 12mm page margin its stylesheet declares.
    pageFrame: composition.pageFrame || null,
    // A content-driven composition names the composer that pages it — the same
    // one the printed PDF uses, so the stored copy is paged identically.
    pageComposer: composition.pageComposer || null,
    // Page allocation has already finished in the browser compositor. Capture never repaginates.
    paginate: false,
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

  // The owning account is the project's own, taken from the canonical project
  // ownership authority when the export did not already state it. An admin-owned
  // or internal project legitimately has none: that is reported as "none" and
  // the record is stored without the field — an account is never invented, and
  // the authenticated user's id is never substituted for one.
  issued.accountId = await resolveIssuedDocumentAccountId({
    projectId: issued.projectId,
    accountId: issued.accountId,
    readProject: readProjectOwnership,
  });

  let captured;
  try {
    captured = await captureCompositionToPdf(snapshot);
  } catch (error) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.CAPTURE,
      reasonCode: error?.captureDiagnostics?.operation || 'capture_failed',
      reason: EXPORT_STORAGE_REASON.CAPTURE_FAILED,
      detail: error?.message ? String(error.message) : null,
      cause: error,
    });
  }

  return {
    issued,
    filename,
    blob: captured.blob,
    pageCount: captured.pageCount,
    // Whatever the capture had to sanitise travels with the attempt, so a
    // failure can name the exact element that produced a degenerate gradient.
    captureDiagnostics: captured.captureDiagnostics || null,
  };
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
      operation: 'UploadPrivateFile',
      reasonCode: classified.reasonCode,
      reason: classified.reason,
      classification: classified.classification,
      detail: error?.message ? String(error.message).slice(0, 400) : null,
      backendCode: backendErrorCode(error),
      backendMessage: backendErrorMessage(error),
      cause: error,
      facts: { private_upload_succeeded: false, file_uri_returned: false, asset_record_created: false },
    });
  }
  if (!result?.file_uri) {
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.STORAGE_UPLOAD,
      operation: 'UploadPrivateFile',
      reasonCode: 'upload_no_path',
      reason: EXPORT_STORAGE_REASON.UPLOAD_FAILED,
      detail: 'Storage accepted the upload but returned no file path.',
      facts: { private_upload_succeeded: true, file_uri_returned: false, asset_record_created: false },
    });
  }
  return { file_uri: result.file_uri };
}

/**
 * @throws {ExportStorageError} stage asset_record — the file is already stored
 * at this point, so the failure records that a stored file has no Library row.
 */
async function insertIssuedRow({ issued, filename, pageCount, fileUri, attemptKind = 'initial' }) {
  try {
    // The record is built by the one payload authority: the project's own
    // ownership account when it has one, and the field omitted — never sent as
    // null — when an admin-owned project has no owning account.
    return await base44.entities.ProjectAssetExport.create(buildIssuedDocumentRow({
      issued,
      filename,
      pageCount,
      fileUri,
    }));
  } catch (error) {
    // The rejection is kept exactly as it came back — its code, its message and
    // the class of rejection — alongside what the attempt had already achieved.
    // Nothing about the attempt changes: the file stays uploaded, no record
    // exists, and the diagnostic is what makes the rejection readable.
    throw buildAssetRecordFailure({ error, issued, fileUri, attemptKind });
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
export async function storeIssuedDocument({ identity, snapshot, attemptKind = 'initial' }) {
  const pendingKey = holdPendingExport({
    identity,
    filename: normalizeFilename(identity?.filename),
    retryExport: identity?.retryExport || null,
  });

  const { issued, filename, blob, pageCount, captureDiagnostics } = await captureIssuedDocument({ identity, snapshot });
  updatePendingExport(pendingKey, { issued, filename, blob, pageCount, captureDiagnostics });

  const stored = await uploadIssuedPdf({ blob, filename });
  // The uploaded file's own path is held with the attempt, so a failure at the
  // record step is retried against THIS file instead of uploading a second copy
  // of the same PDF.
  updatePendingExport(pendingKey, { fileUri: stored.file_uri });
  const record = await insertIssuedRow({ issued, filename, pageCount, fileUri: stored.file_uri, attemptKind });

  return { record, pendingKey };
}

/**
 * Record an issued document in the background, after the export has already
 * been triggered. Never throws: a failure is reported to the designer, with the
 * exact step that failed and the reason it gave, and no Library asset is
 * created.
 */
export function recordIssuedExportInBackground({ identity, snapshot }) {
  const attemptKey = exportAttemptKey(identity);
  // The same export action can arrive here twice. One action stores one copy,
  // and reports once: the second entry is the same document, not a second one.
  if (attemptsInFlight.has(attemptKey)) return false;
  attemptsInFlight.add(attemptKey);

  void (async () => {
    const pendingKey = pendingExportKey({ projectId: identity?.projectId, documentType: identity?.documentType, filename: normalizeFilename(identity?.filename) });
    try {
      const { record } = await storeIssuedDocument({ identity, snapshot });
      clearPendingExport(pendingKey);
      announceStored(identity, record);
    } catch (error) {
      reportStorageFailure({ failure: error, pendingKey, identity });
    } finally {
      attemptsInFlight.delete(attemptKey);
    }
  })();

  return true;
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

  // The same failure, for the same export and the same step, is reported once.
  // A second entry for one export action — the Technical Report's drawing
  // captures each fall back to printing — stays silent instead of stacking an
  // identical red toast on top of the first.
  const noticeKey = failureNoticeKey({ ...issued, filename }, identified.stage);
  const shownAt = failureNoticesShown.get(noticeKey);
  if (shownAt && Date.now() - shownAt < FAILURE_NOTICE_WINDOW_MS) return;
  if (failureNoticesShown.size > 20) failureNoticesShown.clear();
  failureNoticesShown.set(noticeKey, Date.now());

  // The structured record of THIS attempt is written once, and is what the
  // technical detail reads back. It outlives the notice: the Project Library
  // keeps it for the session, so dismissing the toast never discards the
  // evidence of why storage failed.
  const diagnostic = writeExportStorageDiagnostic(buildExportStorageDiagnostic({
    failure: identified,
    identity: { ...issued, filename },
    filename,
    storagePath: identified.storagePath,
    partial: identified.partial,
    captureDiagnostics: held?.captureDiagnostics || null,
  }));

  const retryMode = resolveRetryMode({
    blobAvailable: !!held?.blob,
    canRegenerate: typeof held?.retryExport === 'function',
  });

  // Nothing can be retried from here — say so plainly rather than offering a
  // button that cannot help.
  const retryLabel = retryMode === 'none' ? null : retryLabelFor(retryMode);

  // The notice carries the actions that can address the failure, and the
  // technical detail when the Project Library record step is what failed — or when
  // a PDF capture recorded WHY a sheet stopped storage, so those measurements are
  // readable in the same disclosure instead of only in the console.
  const captureMeasurements = diagnostic?.capture_diagnostics?.pageFit || null;
  const offerActions = !!retryLabel || isProjectLibraryRecordFailure(diagnostic) || !!captureMeasurements;

  // The notice is compact: what did not land, the plain reason, and the actions.
  // The technical diagnostic is never in the notice body — it stays behind the
  // collapsed disclosure inside those actions.
  const notice = buildStorageNotice({
    // A document exported alongside another one names the outcome in its own
    // words — "Project Report saved, but Speaker Design PDF could not be
    // created." — so the designer knows exactly what did and did not land.
    title: issued.storageFailureTitle || STORAGE_FAILURE_MESSAGE,
    reason: exportStorageReason(identified),
    duration: RETRY_TOAST_MS,
  });

  let handle = null;
  handle = toast({
    ...notice,
    ...(offerActions
      ? {
          action: React.createElement(ExportStorageFailureActions, {
            pendingKey,
            retryLabel,
            projectId: issued.projectId || null,
            // Technical detail travels with the notice for a master admin only,
            // and only for the Project Library record step it exists to explain,
            // plus a capture failure that recorded its own measurements.
            diagnostic: (isProjectLibraryRecordFailure(diagnostic) || !!captureMeasurements) ? diagnostic : null,
            onSuccess: () => handle?.dismiss?.(),
          }),
        }
      : {}),
  });

  // Dismissing the notice clears the record of it, so a retry that fails again
  // is still reported — the dedupe only covers notices still on screen.
  const dismiss = handle?.dismiss;
  if (typeof dismiss === 'function') {
    handle.dismiss = () => {
      failureNoticesShown.delete(noticeKey);
      return dismiss();
    };
  }
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
    // When only the Library record step failed, the PDF is already stored
    // privately: that exact file is reused, so the retry records the document
    // that was issued instead of uploading a duplicate of it.
    const fileUri = entry.fileUri
      || (await uploadIssuedPdf({ blob: entry.blob, filename: entry.filename })).file_uri;
    const record = await insertIssuedRow({
      issued: entry.issued,
      filename: entry.filename,
      pageCount: entry.pageCount,
      fileUri,
      attemptKind: 'retry',
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