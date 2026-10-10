/**
 * strengthStoryEvidence.js (src/shared — thin re-export / import adapter)
 * ----------------------------------------------------------------------
 * The ONE canonical evidence reads live in
 * base44/shared/strengthStoryEvidence.js, reached from the frontend through the
 * root `shared/` re-export (frontend code cannot import base44/ directly). This
 * file exists so the frontend has one obvious adapter path; it holds no copy.
 */

export * from '../../shared/strengthStoryEvidence.js';
export { default } from '../../shared/strengthStoryEvidence.js';