/**
 * reportVisualContext.js (src/shared — thin re-export / import adapter)
 * ---------------------------------------------------------------------
 * The Project Library visual context lives in
 * base44/shared/reportDesignIntent/reportVisualContext.js, reached from the
 * frontend through the root `shared/` re-export (frontend code cannot import
 * base44/ directly). This file exists so the frontend has one obvious adapter
 * path; it holds no copy.
 */

export * from '../../shared/reportDesignIntent/reportVisualContext.js';
export { default } from '../../shared/reportDesignIntent/reportVisualContext.js';