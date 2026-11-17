/**
 * standardAssetFilename
 * ---------------------
 * Maps a stored ProjectAssetExport record to the standard Sound Proof filename,
 * so existing stored PDFs are presented and downloaded under the standard name
 * without modifying their underlying storage records.
 *
 * Standard format:
 *   Sound Proof <Document Type> - <Project Name> - <Client Name> - <Project Reference> - <Version Name>.pdf
 *
 * Empty optional segments are omitted (never "undefined", "null" or bare
 * hyphens), and a segment identical to the one before it is written once. The
 * underlying record's stored file_uri/file_url and filename are untouched: this
 * is a presentation/download naming authority only, never a storage authority.
 */
import {
  buildReportPdfFilename,
  buildProposalReportTitle,
  REPORT_PDF_TYPE,
} from '@/components/report/reportPdfTitle';

/** Report-family document types → their filename token. */
const REPORT_TOKEN_BY_TYPE = {
  technical: REPORT_PDF_TYPE.TECHNICAL,
  speaker_design: REPORT_PDF_TYPE.SPEAKER_DESIGN,
  project: REPORT_PDF_TYPE.PROJECT_REPORT,
};

/** Proposal-family document types → the proposal_type the writer expects. */
const PROPOSAL_TYPE_BY_DOC_TYPE = {
  proposal: 'single',
  comparison: 'comparison',
  system_design_summary: 'system_summary',
};

/** Resolve the single design-version id a report record belongs to, if any. */
function resolveReportVersionId(record) {
  const selected = Array.isArray(record?.selected_version_ids) ? record.selected_version_ids : [];
  return record?.version_id || (selected.length === 1 ? selected[0] : null) || null;
}

/**
 * Build the standard .pdf filename for one stored export record.
 *
 * @param {Object} record - a ProjectAssetExport record (document_type, version_id, selected_version_ids)
 * @param {{ name?: string, client_name?: string, project_reference?: string } | null} project
 * @param {Map<string, string>} versionNameById - version id → saved version name
 * @returns {string} a .pdf filename, falling back to the stored filename when the
 *   document type or project name cannot be resolved
 */
export function standardFilenameForExportRecord(record, project, versionNameById) {
  const docType = record?.document_type;
  const projectName = project?.name || null;
  const clientName = project?.client_name ?? null;
  const projectReference = project?.project_reference ?? null;

  // Proposal-family documents are versioned by their selected versions.
  if (PROPOSAL_TYPE_BY_DOC_TYPE[docType] && projectName) {
    const selected = Array.isArray(record?.selected_version_ids) ? record.selected_version_ids : [];
    const versionNames = selected
      .map((id) => (versionNameById ? versionNameById.get(id) : undefined))
      .filter(Boolean);
    const title = buildProposalReportTitle(projectName, PROPOSAL_TYPE_BY_DOC_TYPE[docType], {
      clientName,
      projectReference,
      versionNames,
    });
    return `${title}.pdf`;
  }

  const token = REPORT_TOKEN_BY_TYPE[docType];
  if (token && projectName) {
    const versionId = resolveReportVersionId(record);
    const versionName = versionId ? (versionNameById ? versionNameById.get(versionId) : undefined) : null;
    const version = versionName ? { name: versionName } : null;
    return buildReportPdfFilename(token, projectName, version, { clientName, projectReference });
  }

  // Unknown / legacy types keep their stored filename rather than being renamed.
  return record?.filename || 'document.pdf';
}

export default standardFilenameForExportRecord;