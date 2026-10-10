/**
 * strengthImportance.js (src/shared — thin re-export / import adapter)
 * -------------------------------------------------------------------
 * The canonical strength-importance authority lives in
 * base44/shared/strengthImportance.js, reached from the frontend through the
 * root `shared/` re-export (frontend code cannot import base44/ directly). This
 * file exists so the frontend has one obvious adapter path; it holds no copy.
 */

export * from '../../shared/strengthImportance.js';
export { default } from '../../shared/strengthImportance.js';