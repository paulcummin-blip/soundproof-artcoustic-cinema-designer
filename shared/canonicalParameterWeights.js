/**
 * canonicalParameterWeights.js (repo-root `shared/` — thin re-export)
 * ------------------------------------------------------------------
 * The ONE canonical importance table lives in
 * base44/shared/canonicalParameterWeights.js. This file exists only so a root
 * `shared/` import path resolves to that same implementation. There is no table
 * here and nothing may add one.
 */

export * from '../base44/shared/canonicalParameterWeights.js';
export { default } from '../base44/shared/canonicalParameterWeights.js';