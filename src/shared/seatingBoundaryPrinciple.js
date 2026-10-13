/**
 * seatingBoundaryPrinciple.js (src/shared — thin re-export / import adapter)
 * --------------------------------------------------------------------------
 * The P1 seating-boundary design principle, its geometry reader and its
 * explanation builder live in base44/shared/seatingBoundaryPrinciple.js, reached
 * from the frontend through the root `shared/` re-export (frontend code cannot
 * import base44/ directly). This file exists so the frontend has one obvious
 * adapter path; it holds no copy.
 */

export * from '../../shared/seatingBoundaryPrinciple.js';
export { default } from '../../shared/seatingBoundaryPrinciple.js';