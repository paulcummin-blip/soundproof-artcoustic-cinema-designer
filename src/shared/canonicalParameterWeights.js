/**
 * canonicalParameterWeights.js (src/shared — thin re-export / import adapter)
 * --------------------------------------------------------------------------
 * The ONE canonical importance table lives in
 * base44/shared/canonicalParameterWeights.js, reached from the frontend through
 * the root `shared/` re-export (frontend code cannot import base44/ directly).
 * There is no table here and nothing may add one.
 */

export * from '../../shared/canonicalParameterWeights.js';
export { default } from '../../shared/canonicalParameterWeights.js';