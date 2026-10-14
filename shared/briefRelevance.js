/**
 * briefRelevance.js (repo-root `shared/` — thin re-export)
 * --------------------------------------------------------
 * The ONE brief relevance authority lives in base44/shared/briefRelevance.js and
 * is the ONLY implementation of it. This file exists only so a root `shared/`
 * import path resolves to that same implementation.
 */

export * from '../base44/shared/briefRelevance.js';
export { default } from '../base44/shared/briefRelevance.js';