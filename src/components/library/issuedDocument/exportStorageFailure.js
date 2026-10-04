/**
 * exportStorageFailure.js
 * -----------------------
 * Identifies WHERE an issued-document storage attempt failed, and states the
 * real reason to the designer.
 *
 * PDF export and Project Library storage are two separate outcomes. The export
 * prints from a window the app owns; the Library copy is captured and uploaded
 * afterwards, in the background. When that second outcome fails, the designer is
 * told which step failed and what it said — never a generic "export again" that
 * cannot address the failure.
 *
 * Pure: no DOM, no network, no React. The caller supplies whatever it caught.
 */

export const EXPORT_STORAGE_STAGE = Object.freeze({
  IDENTITY: 'identity',
  COMPOSITION: 'composition',
  CAPTURE: 'capture',
  STORAGE_UPLOAD: 'storage_upload',
  ASSET_RECORD: 'asset_record',
  UNKNOWN: 'unknown',
});

/** The step, said plainly. Used in the diagnostic log and in the toast. */
export const EXPORT_STORAGE_STAGE_LABEL = Object.freeze({
  identity: 'Export identity',
  composition: 'Print composition',
  capture: 'PDF capture',
  storage_upload: 'File upload',
  asset_record: 'Project Library record',
  unknown: 'Unknown step',
});

export const EXPORT_STORAGE_REASON = Object.freeze({
  MISSING_IDENTITY: 'Project/version id was missing.',
  COMPOSITION_UNAVAILABLE: 'The print composition was not available to capture.',
  CAPTURE_FAILED: 'The exported PDF could not be captured page-for-page.',
  UPLOAD_FAILED: 'Storage upload failed.',
  UPLOAD_TOO_LARGE: 'The exported PDF is too large to store.',
  UPLOAD_TIMEOUT: 'The upload timed out.',
  UPLOAD_UNREACHABLE: 'The storage service could not be reached.',
  UPLOAD_PERMISSION: 'Permission denied while storing the export.',
  RECORD_FAILED: 'Project Library asset record could not be created.',
  RECORD_PERMISSION: 'Permission denied while creating the Project Library record.',
  RECORD_DUPLICATE: 'An export for this version already exists.',
  UNKNOWN: 'Storage failed for an unknown reason. Check the export log.',
});

/** How a retry can proceed, and what the button offering it says. */
export const RETRY_LABEL = Object.freeze({
  store_blob: 'Retry storing in Project Library',
  regenerate: 'Retry export and store',
});

export const RETRY_UNAVAILABLE_REASON =
  'This export is no longer held, so it cannot be stored. Export the document again to store a copy.';

export class ExportStorageError extends Error {
  constructor({
    stage = EXPORT_STORAGE_STAGE.UNKNOWN,
    reason = EXPORT_STORAGE_REASON.UNKNOWN,
    reasonCode = 'unknown',
    detail = null,
    storagePath = null,
    partial = 'none',
    cause = null,
    exportId = null,
  } = {}) {
    super(reason);
    this.name = 'ExportStorageError';
    this.stage = stage;
    this.reason = reason;
    this.reasonCode = reasonCode;
    this.detail = detail;
    this.storagePath = storagePath;
    this.partial = partial;
    this.exportId = exportId;
    this.cause = cause;
  }
}

export function isExportStorageError(error) {
  return error instanceof ExportStorageError;
}

/** Whatever was thrown, read as an identified storage failure. */
export function asExportStorageError(error) {
  if (isExportStorageError(error)) return error;
  const detail = error ? String(error.message || error).slice(0, 400) : null;
  return new ExportStorageError({
    stage: EXPORT_STORAGE_STAGE.UNKNOWN,
    reasonCode: 'unknown',
    reason: EXPORT_STORAGE_REASON.UNKNOWN,
    detail,
    cause: error || null,
  });
}

/** HTTP status off whatever the SDK threw, when it carries one. */
function statusOf(error) {
  const candidate = error?.status
    ?? error?.statusCode
    ?? error?.response?.status
    ?? error?.cause?.status;
  const status = Number(candidate);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function textOf(error) {
  if (!error) return '';
  return String(error.message || error).toLowerCase();
}

/** Classify a failed file upload: too large, refused, timed out, unreachable. */
export function classifyUploadFailure(error) {
  const status = statusOf(error);
  const text = textOf(error);

  if (status === 413 || /too large|payload too large|exceeds|maximum size|file size/.test(text)) {
    return { reasonCode: 'upload_too_large', reason: EXPORT_STORAGE_REASON.UPLOAD_TOO_LARGE };
  }
  if (status === 401 || status === 403 || /permission|denied|unauthor|forbidden/.test(text)) {
    return { reasonCode: 'upload_permission', reason: EXPORT_STORAGE_REASON.UPLOAD_PERMISSION };
  }
  if (status === 408 || status === 504 || /timed?\s?out|timeout|aborted|abort/.test(text)) {
    return { reasonCode: 'upload_timeout', reason: EXPORT_STORAGE_REASON.UPLOAD_TIMEOUT };
  }
  if (/failed to fetch|networkerror|network error|econnreset|enotfound|offline/.test(text)) {
    return { reasonCode: 'upload_unreachable', reason: EXPORT_STORAGE_REASON.UPLOAD_UNREACHABLE };
  }
  return { reasonCode: 'upload_failed', reason: EXPORT_STORAGE_REASON.UPLOAD_FAILED };
}

/** Classify a failed Project Library row insert. */
export function classifyRecordFailure(error) {
  const status = statusOf(error);
  const text = textOf(error);

  if (status === 409 || /duplicate|already exists|conflict/.test(text)) {
    return { reasonCode: 'record_duplicate', reason: EXPORT_STORAGE_REASON.RECORD_DUPLICATE };
  }
  if (status === 401 || status === 403 || /permission|denied|unauthor|forbidden/.test(text)) {
    return { reasonCode: 'record_permission', reason: EXPORT_STORAGE_REASON.RECORD_PERMISSION };
  }
  return { reasonCode: 'record_failed', reason: EXPORT_STORAGE_REASON.RECORD_FAILED };
}

/**
 * The line the designer reads under "storage failed".
 * A capture failure states its own precise sentence ("Page 3 does not fit the
 * printed page area."); everything else states the classified reason.
 */
export function exportStorageReason(failure) {
  const identified = asExportStorageError(failure);
  if (identified.stage === EXPORT_STORAGE_STAGE.CAPTURE && identified.detail) {
    return identified.detail;
  }
  return identified.reason || EXPORT_STORAGE_REASON.UNKNOWN;
}

/**
 * Which retry can actually address this failure.
 * - store_blob: the captured PDF is still held — store that exact file, no
 *   regeneration and no second download.
 * - regenerate: nothing is held, but the export can be run again.
 * - none: there is no way to retry from here.
 */
export function resolveRetryMode({ blobAvailable, canRegenerate }) {
  if (blobAvailable) return 'store_blob';
  if (canRegenerate) return 'regenerate';
  return 'none';
}

export function retryLabelFor(mode) {
  return mode === 'regenerate' ? RETRY_LABEL.regenerate : RETRY_LABEL.store_blob;
}

/**
 * The structured record of one failed storage attempt. Never carries file
 * contents, and never anything the designer did not already know.
 */
export function buildExportStorageDiagnostic({
  failure,
  identity = {},
  filename = null,
  storagePath = null,
  partial = 'none',
  exportId = null,
  occurredAt = new Date(),
} = {}) {
  const identified = asExportStorageError(failure);
  return {
    event: 'issued_export_storage_failed',
    project_id: identity.projectId || null,
    version_id: identity.versionId || null,
    selected_version_ids: Array.isArray(identity.selectedVersionIds) ? identity.selectedVersionIds : [],
    report_type: identity.documentType || null,
    filename: filename || identity.filename || null,
    export_id: exportId || identified.exportId || null,
    storage_path: storagePath || identified.storagePath || null,
    stage_failed: identified.stage,
    stage_label: EXPORT_STORAGE_STAGE_LABEL[identified.stage] || EXPORT_STORAGE_STAGE_LABEL.unknown,
    reason_code: identified.reasonCode,
    reason: exportStorageReason(identified),
    error_message: identified.detail || identified.cause?.message || null,
    partial: partial || identified.partial || 'none',
    occurred_at: (occurredAt instanceof Date ? occurredAt : new Date(occurredAt)).toISOString(),
  };
}

export default exportStorageReason;