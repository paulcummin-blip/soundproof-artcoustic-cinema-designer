/**
 * proposalExportMode.js
 * ---------------------
 * The one decision boundary between the two ways the proposal document reaches
 * the printer.
 *
 *   'export'  — the issued document. It passes the complete-document gate first,
 *               and the composition that prints is also stored in the Project
 *               Library as the issued copy.
 *
 *   'preview' — a genuinely read-only look at the SAME print document, so the
 *               designer can inspect the real A4 composition before deciding to
 *               issue or export it. Nothing is stored, no issued-export record is
 *               created, no proposal status or history changes, no section is
 *               written and no text is regenerated.
 *
 * The hook asks these questions HERE rather than relying on the order of the
 * statements around them, so the non-issuing guarantee is testable on its own.
 *
 * Pure: no React, no SDK, no side effects.
 */

export const EXPORT_MODE = 'export';
export const PREVIEW_MODE = 'preview';

/** Whether this mode must pass the complete-document issue gate before printing. */
export function requiresIssueGate(mode) {
  return mode !== PREVIEW_MODE;
}

/**
 * Whether the composition that prints is also stored as the issued document in
 * the Project Library. A preview never is, whatever it was handed.
 */
export function shouldRecordIssuedExport({ mode = EXPORT_MODE, issuedDocument = null } = {}) {
  if (mode === PREVIEW_MODE) return false;
  return Boolean(issuedDocument?.documentType);
}

/** The server action this mode asks the read-only edit layer for. */
export function readLayerAction(mode) {
  return mode === PREVIEW_MODE ? PREVIEW_MODE : EXPORT_MODE;
}

export default shouldRecordIssuedExport;