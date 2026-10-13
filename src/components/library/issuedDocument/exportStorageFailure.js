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
  RECORD_INVALID: 'The Project Library record was rejected as invalid by storage.',
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

/**
 * What kind of rejection came back. Read from the status and the message the
 * backend actually returned — never assumed, and never from what the record
 * happened to contain. "Unclassified" is an honest answer.
 */
export const STORAGE_FAILURE_CLASSIFICATION = Object.freeze({
  PERMISSION: 'permission',
  SCHEMA_VALIDATION: 'schema_validation',
  DUPLICATE: 'duplicate',
  NETWORK: 'network',
  STORAGE: 'storage',
  UNKNOWN: 'unknown',
});

export const STORAGE_FAILURE_CLASSIFICATION_LABEL = Object.freeze({
  [STORAGE_FAILURE_CLASSIFICATION.PERMISSION]: 'Permission rejection',
  [STORAGE_FAILURE_CLASSIFICATION.SCHEMA_VALIDATION]: 'Schema / validation rejection',
  [STORAGE_FAILURE_CLASSIFICATION.DUPLICATE]: 'Duplicate / conflict rejection',
  [STORAGE_FAILURE_CLASSIFICATION.NETWORK]: 'Network or timeout failure',
  [STORAGE_FAILURE_CLASSIFICATION.STORAGE]: 'Storage service rejection',
  [STORAGE_FAILURE_CLASSIFICATION.UNKNOWN]: 'Unclassified backend rejection',
});

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
    // Diagnostics only. None of it decides anything about the failure, the
    // retry, or whether a Library record is written.
    operation = null,
    classification = STORAGE_FAILURE_CLASSIFICATION.UNKNOWN,
    backendCode = null,
    backendMessage = null,
    attemptKind = 'initial',
    facts = null,
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
    this.operation = operation;
    this.classification = classification;
    // The exact rejection: the code the backend returned, and its own message
    // in full. Kept verbatim so a failure can be read back, not paraphrased.
    this.backendCode = backendCode;
    this.backendMessage = backendMessage;
    this.attemptKind = attemptKind;
    this.facts = facts && typeof facts === 'object' ? facts : null;
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

/**
 * The code the backend rejected with, as the SDK surfaced it: a status, or a
 * code the response carried. Never invented — null when nothing reported one.
 */
export function backendErrorCode(error) {
  const code = error?.code
    ?? error?.errorCode
    ?? error?.response?.data?.code
    ?? error?.response?.data?.error
    ?? error?.data?.code
    ?? error?.data?.error;
  if (code !== null && code !== undefined && String(code).trim() !== '') return String(code);
  const status = statusOf(error);
  return status ? String(status) : null;
}

/** The backend's own message, in full and unedited. Null when none came back. */
export function backendErrorMessage(error) {
  if (!error) return null;
  const message = error?.response?.data?.message
    ?? error?.response?.data?.error
    ?? error?.data?.message
    ?? error?.error_message
    ?? error?.message
    ?? (typeof error === 'string' ? error : null);
  if (message === null || message === undefined || String(message).trim() === '') return null;
  return String(message);
}

/** Classify a failed file upload: too large, refused, timed out, unreachable. */
export function classifyUploadFailure(error) {
  const status = statusOf(error);
  const text = textOf(error);

  if (status === 413 || /too large|payload too large|exceeds|maximum size|file size/.test(text)) {
    return {
      reasonCode: 'upload_too_large',
      reason: EXPORT_STORAGE_REASON.UPLOAD_TOO_LARGE,
      classification: STORAGE_FAILURE_CLASSIFICATION.STORAGE,
    };
  }
  if (status === 401 || status === 403 || /permission|denied|unauthor|forbidden/.test(text)) {
    return {
      reasonCode: 'upload_permission',
      reason: EXPORT_STORAGE_REASON.UPLOAD_PERMISSION,
      classification: STORAGE_FAILURE_CLASSIFICATION.PERMISSION,
    };
  }
  if (status === 408 || status === 504 || /timed?\s?out|timeout|aborted|abort/.test(text)) {
    return {
      reasonCode: 'upload_timeout',
      reason: EXPORT_STORAGE_REASON.UPLOAD_TIMEOUT,
      classification: STORAGE_FAILURE_CLASSIFICATION.NETWORK,
    };
  }
  if (/failed to fetch|networkerror|network error|econnreset|enotfound|offline/.test(text)) {
    return {
      reasonCode: 'upload_unreachable',
      reason: EXPORT_STORAGE_REASON.UPLOAD_UNREACHABLE,
      classification: STORAGE_FAILURE_CLASSIFICATION.NETWORK,
    };
  }
  return {
    reasonCode: 'upload_failed',
    reason: EXPORT_STORAGE_REASON.UPLOAD_FAILED,
    classification: STORAGE_FAILURE_CLASSIFICATION.STORAGE,
  };
}

/**
 * Classify a failed Project Library row insert from the rejection itself: a
 * conflict, a permission rejection, an invalid record, or nothing recognisable.
 * The class is stated, never assumed — a rejection that names nothing is
 * reported as unclassified rather than blamed on a field.
 */
export function classifyRecordFailure(error) {
  const status = statusOf(error);
  const text = textOf(error);

  if (status === 409 || /duplicate|already exists|conflict/.test(text)) {
    return {
      reasonCode: 'record_duplicate',
      reason: EXPORT_STORAGE_REASON.RECORD_DUPLICATE,
      classification: STORAGE_FAILURE_CLASSIFICATION.DUPLICATE,
    };
  }
  if (status === 401 || status === 403 || /permission|denied|unauthor|forbidden|not allowed/.test(text)) {
    return {
      reasonCode: 'record_permission',
      reason: EXPORT_STORAGE_REASON.RECORD_PERMISSION,
      classification: STORAGE_FAILURE_CLASSIFICATION.PERMISSION,
    };
  }
  if (status === 400 || status === 422 || /invalid|validation|schema|required|must be|malformed|unexpected field/.test(text)) {
    return {
      reasonCode: 'record_schema',
      reason: EXPORT_STORAGE_REASON.RECORD_INVALID,
      classification: STORAGE_FAILURE_CLASSIFICATION.SCHEMA_VALIDATION,
    };
  }
  return {
    reasonCode: 'record_failed',
    reason: EXPORT_STORAGE_REASON.RECORD_FAILED,
    classification: STORAGE_FAILURE_CLASSIFICATION.UNKNOWN,
  };
}

/**
 * The failure of the Project Library record step, with everything the technical
 * detail needs to state the rejection exactly: the operation that was attempted,
 * the code and message the backend returned, the class of rejection, and what
 * the attempt had already achieved — the private upload had landed and returned
 * a path; no asset record exists.
 *
 * Pure and side-effect free: it builds the failure, and nothing else.
 */
export function buildAssetRecordFailure({ error, issued = {}, fileUri = null, attemptKind = 'initial' } = {}) {
  const classified = classifyRecordFailure(error);
  const supplied = issued?.accountId;
  const accountIdEmpty = supplied === null
    || supplied === undefined
    || String(supplied).trim() === '';
  const message = backendErrorMessage(error);

  return new ExportStorageError({
    stage: EXPORT_STORAGE_STAGE.ASSET_RECORD,
    operation: 'ProjectAssetExport.create',
    reasonCode: classified.reasonCode,
    reason: classified.reason,
    classification: classified.classification,
    detail: message ? message.slice(0, 400) : null,
    backendCode: backendErrorCode(error),
    backendMessage: message,
    storagePath: fileUri,
    partial: 'file_without_row',
    attemptKind,
    cause: error,
    facts: {
      account_id_supplied: accountIdEmpty ? null : String(supplied),
      account_id_empty: accountIdEmpty,
      private_upload_succeeded: !!fileUri,
      file_uri_returned: !!fileUri,
      asset_record_created: false,
    },
  });
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
  // Left unstated, the failure's own partial state is what gets reported. The
  // default must be empty for that fallback to work: a non-empty default here
  // would overwrite the real state with a value that says nothing was achieved.
  partial = null,
  exportId = null,
  // What the capture itself had to sanitise (a degenerate gradient, a
  // non-finite colour stop), when it had anything to sanitise.
  captureDiagnostics = null,
  occurredAt = new Date(),
} = {}) {
  const identified = asExportStorageError(failure);
  const facts = identified.facts || {};
  const flag = (value, fallback = null) => (typeof value === 'boolean' ? value : fallback);
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
    // The technical detail of the rejection. Recorded so the failure can be read
    // back exactly instead of reproduced; nothing here is used to decide whether
    // the attempt is retried, stored or reported again.
    operation: identified.operation || null,
    classification: identified.classification || STORAGE_FAILURE_CLASSIFICATION.UNKNOWN,
    classification_label: STORAGE_FAILURE_CLASSIFICATION_LABEL[identified.classification]
      || STORAGE_FAILURE_CLASSIFICATION_LABEL[STORAGE_FAILURE_CLASSIFICATION.UNKNOWN],
    backend_error_code: identified.backendCode || null,
    backend_error_message: identified.backendMessage || identified.cause?.message || null,
    account_id_supplied: facts.account_id_supplied ?? null,
    account_id_empty: flag(facts.account_id_empty),
    private_upload_succeeded: flag(facts.private_upload_succeeded),
    file_uri_returned: flag(facts.file_uri_returned),
    asset_record_created: flag(facts.asset_record_created, false),
    attempt_kind: identified.attemptKind || 'initial',
    reason_code: identified.reasonCode,
    reason: exportStorageReason(identified),
    error_message: identified.detail || identified.cause?.message || null,
    capture_diagnostics: captureDiagnostics || identified.cause?.captureDiagnostics || null,
    partial: partial || identified.partial || 'none',
    occurred_at: (occurredAt instanceof Date ? occurredAt : new Date(occurredAt)).toISOString(),
  };
}

export default exportStorageReason;