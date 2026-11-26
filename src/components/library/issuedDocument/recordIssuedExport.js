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
import { reportUploadReceiptApi } from './reportUploadReceipt';
import { saveIssuedArtifact, boundedExportRead } from './issuedExportDurability';
import { resolveIssuedDocumentUrl } from './issuedDocumentActions';
import { base44 } from '@/api/base44Client';
import { captureCompositionToPdf, captureStylesMarkup } from '@/components/library/compositionCapture';
import { createCaptureTelemetry, recordExportTiming } from '@/components/library/capturePerformanceTelemetry';
import { notifyIssuedExportStored } from '@/components/library/issuedExportSignal';
import { assertPdfArtifact } from '@/components/library/pdfArtifactAuthority';
import ExportStorageFailureActions from './ExportStorageFailureActions';
import PreviewIncompleteNotice from './PreviewIncompleteNotice';
import { ISSUED_DOCUMENT_COMPOSITION, issuedDocumentLabel } from './issuedDocumentTypes';
import { showLibraryNotice } from './libraryNoticeStore';
import {
  STORED_NOTICE_STATE,
  STORED_NOTICE_STAYS_MS,
  resolveStoredNotice,
} from './libraryStoredNoticeAuthority';
import {
  clearPendingExport,
  holdPendingExport,
  pendingExportKey,
  peekPendingExport,
  updatePendingExport,
} from './pendingIssuedExportStore';
import { writeExportStorageDiagnostic } from './exportStorageDiagnosticLog';
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
async function captureIssuedDocument({ identity, snapshot, onProgress, telemetry = null, captureMode = 'batched' }) {
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
    captured = await captureCompositionToPdf({ ...snapshot, onProgress, telemetry, captureMode });
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
    // How the stored copy's pages were rendered, and what its page preview is.
    // Recorded with the document; neither one decides whether it exists.
    rendering: captured.rendering || null,
    previewStatus: captured.previewStatus || null,
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
async function verifyStoredPdf(fileUri, expectedBlob) {
  const url = await resolveIssuedDocumentUrl({ file_uri: fileUri });
  if (!url) throw new Error('The saved PDF could not be opened for verification. Retry storage.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('The saved PDF could not be read from storage. Retry storage.');
  const actual = await response.blob();
  await assertPdfArtifact(actual);
  if (expectedBlob) {
    if (actual.size !== expectedBlob.size) throw new Error('The stored PDF size differs from the captured report.');
    const [a, b] = await Promise.all([actual.arrayBuffer(), expectedBlob.arrayBuffer()]);
    const [ah, bh] = await Promise.all([crypto.subtle.digest('SHA-256', a), crypto.subtle.digest('SHA-256', b)]);
    if (new Uint8Array(ah).some((value, index) => value !== new Uint8Array(bh)[index])) {
      throw new Error('The stored PDF bytes differ from the captured report.');
    }
  }
}

async function persistHeldPdf(pendingKey, onProgress, telemetry = null) {
  const entry = peekPendingExport(pendingKey);
  if (!entry) throw new Error(RETRY_UNAVAILABLE_REASON);
  const update = patch => updatePendingExport(pendingKey, patch);
  const receiptApi = entry.issued?.documentType === 'project' && entry.issued?.uploadOperationId
    ? reportUploadReceiptApi({ entry, update, invoke: body => base44.functions.invoke('manageMonitoredOperation', body) })
    : null;
  return saveIssuedArtifact({
    entry, onProgress, verifyFile: verifyStoredPdf,
    update: patch => updatePendingExport(pendingKey, patch),
    api: {
      upload: (blob, filename) => uploadIssuedPdf({ blob, filename }),
      find: query => base44.entities.ProjectAssetExport.filter(query, { limit: 2 }),
      create: row => base44.entities.ProjectAssetExport.create(row),
      ...receiptApi,
    },
    telemetry,
  });
}

const awaitedSaves = new Map();
export function storeIssuedDocument(parameters) {
  const key = exportAttemptKey(parameters.identity);
  if (awaitedSaves.has(key)) return awaitedSaves.get(key);
  const promise = storeIssuedDocumentOnce(parameters).finally(() => awaitedSaves.delete(key));
  awaitedSaves.set(key, promise);
  return promise;
}

/**
 * Capture, store and record one issued document.
 *
 * The attempt is held while it is in flight, so a failure at either the storage
 * or the record step can be retried against the same PDF and the same identity.
 *
 * @returns {Promise<{record: Object, pendingKey: string}>}
 */
async function storeIssuedDocumentOnce({ identity, snapshot, onProgress }) {
  const telemetry = createCaptureTelemetry();
  const previousKey = pendingExportKey({ projectId: identity?.projectId, documentType: identity?.documentType, filename: normalizeFilename(identity?.filename) });
  const previous = peekPendingExport(previousKey);
  if (previous?.blob || previous?.fileUri || previous?.uploadOperation || previous?.uploadStarted) {
    const resolved = typeof identity.resolveSource === 'function' ? await boundedExportRead(identity.resolveSource, 'Report identity') : {};
    const nextIdentity = { ...identity, ...resolved };
    const sameSource = ['versionId', 'selectedVersionIds', 'sourceRecordId', 'sourceFingerprints'].every(key => JSON.stringify(previous.issued?.[key] ?? null) === JSON.stringify(nextIdentity[key] ?? null));
    if (sameSource && previous.compositionHtml === snapshot?.nodeHtml) {
      const record = await persistHeldPdf(previousKey, onProgress, telemetry);
      notifyIssuedExportStored(record.project_id);
      recordExportTiming(telemetry.summary({ documentType: identity?.documentType, filename: previous?.filename || normalizeFilename(identity?.filename), status: 'reused' }));
      return { record, pendingKey: previousKey };
    }
    throw new Error('A previous export needs reconciliation. Use Retry storage before starting another export.');
  }
  const pendingKey = holdPendingExport({
    identity,
    filename: normalizeFilename(identity?.filename),
    retryExport: identity?.retryExport || null,
  });

  updatePendingExport(pendingKey, { compositionHtml: snapshot?.nodeHtml });
  const { issued, filename, blob, pageCount, captureDiagnostics, rendering, previewStatus } = await boundedExportRead(() => captureIssuedDocument({ identity, snapshot, onProgress, telemetry, captureMode: 'batched' }), 'Report capture', 130000);
  updatePendingExport(pendingKey, { issued, filename, blob, pageCount, captureDiagnostics, rendering, previewStatus });

  // THE PDF IS VERIFIED BEFORE IT IS STORED — and only the PDF. A document exists
  // once valid bytes exist: a page preview, a thumbnail, a canvas or a raster is
  // not part of that question, and its absence never blocks the upload.
  try {
    await assertPdfArtifact(blob);
  } catch (error) {
    recordExportTiming(telemetry.summary({ documentType: issued?.documentType, filename, status: 'capture_failed' }));
    throw new ExportStorageError({
      stage: EXPORT_STORAGE_STAGE.CAPTURE,
      reasonCode: 'invalid_pdf_artifact',
      reason: EXPORT_STORAGE_REASON.CAPTURE_FAILED,
      detail: error?.message ? String(error.message) : null,
      cause: error,
    });
  }

  try {
    const record = await persistHeldPdf(pendingKey, onProgress, telemetry);
    notifyIssuedExportStored(record?.project_id || issued.projectId);
    recordExportTiming(telemetry.summary({ documentType: issued?.documentType, filename, pageCount, status: 'complete' }));
    return { record, pendingKey };
  } catch (error) {
    recordExportTiming(telemetry.summary({ documentType: issued?.documentType, filename, pageCount, status: 'storage_failed' }));
    throw error;
  }
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
  const label = `${issuedDocumentLabel(record?.document_type || issued?.documentType)} · ${record?.filename || ''}`;
  // THE DOCUMENT IS STORED EITHER WAY — that is what this notice reports. What
  // can be missing is its page preview, and a missing preview is stated as
  // exactly that. It is never presented as a failed document: the PDF opens and
  // downloads from the Library as it is, so it is toned as informative and left
  // on screen until the designer dismisses it. A full success, which asks nothing
  // of anyone, takes itself away.
  const notice = resolveStoredNotice(record);
  showLibraryNotice({
    title: notice.title,
    description: notice.state === STORED_NOTICE_STATE.PREVIEW_INCOMPLETE
      ? React.createElement(PreviewIncompleteNotice, { label, summary: notice.previewSentence })
      : label,
    className: notice.tone,
    duration: notice.duration,
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
    // A failure the designer can act on stays until they act on it or dismiss it.
    duration: STORED_NOTICE_STAYS_MS,
  });

  let handle = null;
  handle = showLibraryNotice({
    ...notice,
    // Dismissing the notice clears the record of it, so a retry that fails again
    // is still reported — the dedupe only covers notices still on screen.
    onDismiss: () => failureNoticesShown.delete(noticeKey),
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
}

/**
 * Has a copy of THIS attempt already landed? Compared within the attempt's own
 * document, version and filename, and only against rows written since the
 * attempt started — an older export of the same document is a different copy,
 * not this one.
 */
const retriesInFlight = new Map();
export function retryIssuedExportStorage(pendingKey, { onProgress } = {}) {
  if (retriesInFlight.has(pendingKey)) return retriesInFlight.get(pendingKey);
  const promise = retryHeld(pendingKey, onProgress).finally(() => retriesInFlight.delete(pendingKey));
  retriesInFlight.set(pendingKey, promise);
  return promise;
}

async function retryHeld(pendingKey, onProgress) {
  const entry = peekPendingExport(pendingKey);
  if (!entry) return { ok: false, reason: RETRY_UNAVAILABLE_REASON };
  try {
    const record = await persistHeldPdf(pendingKey, onProgress);
    clearPendingExport(pendingKey);
    announceStored(entry.issued, record);
    return { ok: true, record, filename: record.filename };
  } catch (error) {
    return { ok: false, reason: error?.detail || error?.message || exportStorageReason(asExportStorageError(error)) };
  }
}

export default recordIssuedExportInBackground;
