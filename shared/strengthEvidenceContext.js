/**
 * strengthEvidenceContext.js (repo-root `shared/` — thin re-export)
 * ----------------------------------------------------------------
 * The canonical saved-report-evidence strength context lives in
 * base44/shared/strengthEvidenceContext.js and is the ONLY implementation. This
 * file exists only so a root `shared/` import path resolves to it.
 */

export * from '../base44/shared/strengthEvidenceContext.js';
export { default } from '../base44/shared/strengthEvidenceContext.js';