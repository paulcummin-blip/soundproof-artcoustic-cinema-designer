/**
 * projectReportIdentity.js
 * ------------------------
 * THE identity of the consolidated Project Report.
 *
 * The Project Report is its own document: one name, one report type, one issued
 * document type, one cover title and one filename token, stated from this module
 * so the cover, the masthead, the browser title, the exported filename, the saved
 * report snapshot and the Project Library's issued-document record can never
 * disagree with each other.
 *
 * It is never the legacy "visual" report type: `LEGACY_VISUAL_REPORT_TYPE` exists
 * only so a caller can recognise and refuse the old identity — nothing in the app
 * may present the Project Report as a Visual Report.
 *
 * Pure module: no React, no DOM.
 */

import { REPORT_SNAPSHOT_TYPE } from '@/components/report/reportSnapshotAuthority';
import { ISSUED_DOCUMENT_TYPE } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { REPORT_PDF_TYPE } from '@/components/report/reportPdfTitle';

/** The document's name, everywhere it is stated. */
export const PROJECT_REPORT_TITLE = 'Project Report';

/** The saved report snapshot type this document writes. */
export const PROJECT_REPORT_SNAPSHOT_TYPE = REPORT_SNAPSHOT_TYPE.PROJECT;

/** The issued-document type Project Library stores it under. */
export const PROJECT_REPORT_DOCUMENT_TYPE = ISSUED_DOCUMENT_TYPE.PROJECT;

/** The filename token this document's PDF carries. */
export const PROJECT_REPORT_FILENAME_TOKEN = REPORT_PDF_TYPE.PROJECT_REPORT;

/** The report type this document must never be presented as. */
export const LEGACY_VISUAL_REPORT_TYPE = REPORT_SNAPSHOT_TYPE.VISUAL;

/** True when a report/snapshot type states this document's own identity. */
export function isProjectReportType(reportType) {
  return reportType === PROJECT_REPORT_SNAPSHOT_TYPE;
}

/** True when a type is the legacy Visual Report identity. */
export function isLegacyVisualReportType(reportType) {
  return reportType === LEGACY_VISUAL_REPORT_TYPE;
}