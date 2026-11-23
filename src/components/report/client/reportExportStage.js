/**
 * reportExportStage.js
 * --------------------
 * Maps the Technical Report export's real lifecycle stages to the four
 * user-facing progress steps shown on the generation screen.
 *
 * This is a pure translator. It reads the raw `{ stage }` value the export
 * pipeline already emits (see useClientReportPdfExport →
 * storeProjectReportPublication → compositionCapture / issuedExportDurability)
 * and the publication status, and returns which step is active. It never
 * invents a percentage, a timer or a stage that the pipeline did not produce.
 *
 * Pipeline stage vocabulary (only those that reach the progress store):
 *   readiness   — print document, fonts and logo preparation  → Preparing report
 *   capture     — page rasterisation                          → Creating PDF
 *   assemble    — PDF assembly                                → Creating PDF
 *   upload      — upload to private storage                    → Saving to Project Library
 *   reconcile   — saved asset record check                     → Saving to Project Library
 *   verify_file — stored PDF verification                      → Saving to Project Library
 *   record      — Documents & Assets record creation           → Saving to Project Library
 *   complete    — PDF and asset record verified                → Report ready (only once
 *                  publication.status === 'complete', which is set AFTER verification)
 *
 * The "Report ready" step is gated on publication.status === 'complete' rather
 * than the raw 'complete' progress stage, so the browser print dialog opening
 * early can never produce a false completion state.
 */

export const REPORT_EXPORT_STEPS = Object.freeze([
  'Preparing report',
  'Creating PDF',
  'Saving to Project Library',
  'Report ready',
]);

const STAGE_TO_STEP = {
  readiness: 0,
  capture: 1,
  assemble: 1,
  upload: 2,
  reconcile: 2,
  verify_file: 2,
  record: 2,
};

/**
 * Resolve the active step and overall status from the live export state.
 *
 * @param {Object} params
 * @param {{ stage?: string }|null} params.progress  — latest progress snapshot
 * @param {string} params.publicationStatus          — idle|storing|complete|incomplete
 * @returns {{ activeStep: number, status: 'preparing'|'creating'|'saving'|'ready'|'failed' }}
 */
export function resolveReportExportStage({ progress, publicationStatus }) {
  if (publicationStatus === 'complete') {
    return { activeStep: 3, status: 'ready' };
  }
  if (publicationStatus === 'incomplete') {
    // A storage failure happens during the Saving step; the step is shown as
    // active-but-failed rather than completed.
    return { activeStep: 2, status: 'failed' };
  }
  const stage = progress?.stage || 'readiness';
  const step = STAGE_TO_STEP[stage] ?? 0;
  const statusByStep = ['preparing', 'creating', 'saving'];
  return { activeStep: step, status: statusByStep[step] || 'preparing' };
}