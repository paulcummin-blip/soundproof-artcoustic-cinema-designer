/**
 * issuedDocumentRowPayload.js
 * ---------------------------
 * The exact record an issued document is stored as in Project Library.
 *
 * WHERE THE OWNING ACCOUNT COMES FROM
 *   `account_id` is the parent project's own ownership identity — the account
 *   the project belongs to. It is copied from the project (never invented, and
 *   never the authenticated user's id), and it is what keeps one dealer's
 *   Project Library invisible to another.
 *
 * WHY IT MAY BE ABSENT
 *   An admin-owned or internal project legitimately has no owning account. The
 *   field is then OMITTED from the record rather than sent as null: storage
 *   validates `account_id` as a string, and null is rejected as an invalid
 *   string, which is what stopped issued exports being stored at all. Such a
 *   record is created under the admin branch of the entity's own permission
 *   model, and it is not readable by any dealer account.
 *
 * Pure: no DOM, no network, no client. The caller supplies the identity.
 */

/** The account id as a stored value, or null when nothing usable is stated. */
export function normaliseAccountId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Build the ProjectAssetExport record for one issued document.
 *
 * @param {Object} parameters
 * @param {Object} parameters.issued     the resolved export identity
 * @param {string} parameters.filename   the export's own filename, with .pdf
 * @param {number|null} [parameters.pageCount]
 * @param {string|null} [parameters.fileUri] the privately stored PDF's path
 * @param {string|Date} [parameters.exportedAt]
 * @returns {Object} the record, ready for ProjectAssetExport.create
 */
export function buildIssuedDocumentRow({
  issued = {},
  filename,
  pageCount = null,
  fileUri = null,
  exportedAt = null,
} = {}) {
  const accountId = normaliseAccountId(issued.accountId);
  const at = exportedAt
    ? (exportedAt instanceof Date ? exportedAt : new Date(exportedAt)).toISOString()
    : new Date().toISOString();

  const row = {
    project_id: issued.projectId || null,
    document_type: issued.documentType || null,
    title: issued.title || '',
    filename,
    version_id: issued.versionId || null,
    selected_version_ids: Array.isArray(issued.selectedVersionIds) ? issued.selectedVersionIds : [],
    source_record_id: issued.sourceRecordId || null,
    file_uri: fileUri,
    exported_at: at,
    exported_by: issued.exportedBy || null,
    source_fingerprints: issued.sourceFingerprints || {},
    source_status_at_export: issued.sourceStatusAtExport || 'current',
    page_count: pageCount,
    superseded_by_id: null,
  };

  // Stated only when the project has an owning account. Absent is the honest
  // record for an admin-owned project; null is not an accepted value.
  if (accountId) row.account_id = accountId;

  return row;
}

export default buildIssuedDocumentRow;