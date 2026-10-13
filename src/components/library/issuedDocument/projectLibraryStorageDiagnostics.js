/**
 * projectLibraryStorageDiagnostics.js
 * -----------------------------------
 * The technical detail of a failed Project Library storage attempt, stated to
 * the master admin in the same words the backend used.
 *
 * Where the designer reads "Project Library storage failed" and the reason it
 * gives, this reads the attempt back: which operation failed, the code and the
 * message the backend returned, what class of rejection it was, which project,
 * version and document it belonged to, what account id was supplied, whether the
 * private upload had already succeeded, and whether the attempt was an initial
 * attempt or a retry.
 *
 * Rules this module holds:
 *   - The rejection is reported, never interpreted: the code and the message are
 *     the ones the backend returned. A rejection that names nothing is reported
 *     as unclassified rather than blamed on a field.
 *   - The account id is compared against the authenticated user's account only
 *     when both are actually available. Anything else is stated as not
 *     available, which is an answer, not a gap.
 *   - No private file path, upload token or secret is ever put on screen or on
 *     the clipboard: the diagnostic says whether a path came back, never what it
 *     was.
 *   - Master admins only. A dealer sees the designer-facing reason and nothing
 *     technical.
 *
 * Pure: rows in, rows out. No reads, no writes, no records.
 */

import { isMasterAdmin } from '@/lib/accountAccess';
import { EXPORT_STORAGE_STAGE, EXPORT_STORAGE_STAGE_LABEL } from './exportStorageFailure';

/** The heading the master admin sees. */
export const PROJECT_LIBRARY_STORAGE_DETAIL_TITLE = 'TECHNICAL DETAIL — PROJECT LIBRARY STORAGE';
/** The Project Library's own section heading for the session's failures. */
export const PROJECT_LIBRARY_STORAGE_SESSION_LABEL = 'Project Library storage diagnostics';

export const STORAGE_DIAGNOSTIC_NOT_AVAILABLE = 'Not available';
export const STORAGE_DIAGNOSTIC_NONE_REPORTED = 'None reported';
const STORAGE_DIAGNOSTIC_NOT_REACHED = 'Not reached';

/** The step ProjectAssetExport.create belongs to. */
export const PROJECT_LIBRARY_RECORD_STAGE = EXPORT_STORAGE_STAGE.ASSET_RECORD;

/**
 * Is this failure the Project Library record step — the one this technical
 * detail exists for?
 */
export function isProjectLibraryRecordFailure(diagnostic) {
  return diagnostic?.stage_failed === PROJECT_LIBRARY_RECORD_STAGE;
}

/** Who may see technical detail. Master admins only. */
export function canViewStorageTechnicalDetail(user) {
  return isMasterAdmin(user);
}

/** Yes / No / not reached, stated as an answer rather than a blank. */
function yesNo(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return STORAGE_DIAGNOSTIC_NOT_REACHED;
}

/**
 * Was the supplied account id the authenticated user's own account?
 * Answered only when both are available; otherwise said to be unavailable.
 */
export function resolveAccountIdComparison(diagnostic, authAccountId) {
  const supplied = diagnostic?.account_id_supplied ?? null;
  if (!authAccountId) {
    return 'Not available — no authenticated account in this session';
  }
  if (!supplied || diagnostic?.account_id_empty === true) {
    return 'No account ID was supplied, so there is nothing to compare';
  }
  return String(supplied) === String(authAccountId)
    ? "Matches the authenticated user's account"
    : "Does not match the authenticated user's account";
}

/**
 * The rows the technical detail shows, in the order they are read.
 *
 * @param {Object} parameters
 * @param {Object} parameters.diagnostic the record written by the failure path.
 * @param {string|null} [parameters.authAccountId] the authenticated user's account.
 * @param {string|null} [parameters.authRole] the authenticated user's role.
 */
export function buildStorageTechnicalDetail({ diagnostic, authAccountId = null, authRole = null } = {}) {
  const record = diagnostic || {};
  const labels = EXPORT_STORAGE_STAGE_LABEL;

  return [
    {
      key: 'operation',
      label: 'Failed operation',
      value: record.operation || labels[record.stage_failed] || labels.unknown,
    },
    {
      key: 'backend_code',
      label: 'Backend error code',
      value: record.backend_error_code || STORAGE_DIAGNOSTIC_NONE_REPORTED,
    },
    {
      key: 'backend_message',
      label: 'Exact backend error message',
      value: record.backend_error_message || record.error_message || STORAGE_DIAGNOSTIC_NONE_REPORTED,
    },
    {
      key: 'classification',
      label: 'Failure classification',
      value: `${record.classification_label || 'Unclassified backend rejection'}${record.reason_code ? ` (${record.reason_code})` : ''}`,
    },
    { key: 'project', label: 'Project ID', value: record.project_id || STORAGE_DIAGNOSTIC_NOT_AVAILABLE },
    { key: 'version', label: 'Version ID', value: record.version_id || STORAGE_DIAGNOSTIC_NOT_AVAILABLE },
    { key: 'document', label: 'Document type', value: record.report_type || STORAGE_DIAGNOSTIC_NOT_AVAILABLE },
    {
      key: 'account_supplied',
      label: 'Account ID supplied',
      value: record.account_id_supplied || STORAGE_DIAGNOSTIC_NONE_REPORTED,
    },
    {
      key: 'account_empty',
      label: 'Account ID null or empty',
      value: record.account_id_empty === true
        ? 'Yes — no account ID was supplied'
        : (record.account_id_empty === false ? 'No' : STORAGE_DIAGNOSTIC_NOT_REACHED),
    },
    {
      key: 'account_match',
      label: "Account ID matches authenticated user's account",
      value: resolveAccountIdComparison(record, authAccountId),
    },
    { key: 'auth_role', label: 'Authentication role', value: authRole || STORAGE_DIAGNOSTIC_NOT_AVAILABLE },
    {
      key: 'upload',
      label: 'Private upload succeeded',
      value: yesNo(record.private_upload_succeeded),
    },
    {
      key: 'file_uri',
      label: 'File path returned',
      // Stated, never shown: the path itself is not a diagnostic the reader needs.
      value: record.file_uri_returned === true
        ? 'Yes — path returned (not shown)'
        : yesNo(record.file_uri_returned),
    },
    {
      key: 'asset_record',
      label: 'Asset record created',
      value: record.asset_record_created === true ? 'Yes' : 'No',
    },
    {
      key: 'attempt',
      label: 'Attempt',
      value: record.attempt_kind === 'retry' ? 'Retry' : 'Initial attempt',
    },
    {
      key: 'reason',
      label: 'Reported reason',
      value: record.reason || STORAGE_DIAGNOSTIC_NONE_REPORTED,
    },
    { key: 'occurred_at', label: 'Occurred at', value: record.occurred_at || STORAGE_DIAGNOSTIC_NOT_AVAILABLE },
  ];
}

/** One line naming the failure, for a list of session failures. */
export function storageDiagnosticSummary(diagnostic) {
  if (!diagnostic) return '';
  const parts = [
    diagnostic.filename || diagnostic.report_type || 'Export',
    diagnostic.operation || EXPORT_STORAGE_STAGE_LABEL[diagnostic.stage_failed] || 'Storage',
    diagnostic.classification_label || null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * The diagnostic as plain text for COPY DIAGNOSTICS — the same rows the panel
 * shows, and nothing that is not on screen.
 */
export function formatStorageDiagnosticsText({ diagnostic, detail, authAccountId = null, authRole = null } = {}) {
  const rows = Array.isArray(detail) && detail.length > 0
    ? detail
    : buildStorageTechnicalDetail({ diagnostic, authAccountId, authRole });
  const lines = [PROJECT_LIBRARY_STORAGE_DETAIL_TITLE, ''];
  rows.forEach((row) => {
    lines.push(`${row.label}: ${row.value}`);
  });
  lines.push('');
  lines.push('Private file paths, upload tokens and secrets are not included.');
  return lines.join('\n');
}

export default buildStorageTechnicalDetail;