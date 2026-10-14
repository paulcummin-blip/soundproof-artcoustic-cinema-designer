/**
 * narrativePriorityAuthority.js (repo-root `shared/` — thin re-export)
 * -------------------------------------------------------------------
 * The ONE narrative priority authority lives in
 * base44/shared/narrativePriorityAuthority.js and is the ONLY implementation of it.
 * This file exists only so a root `shared/` import path resolves to that same
 * implementation. There is no second classification anywhere.
 */

export * from '../base44/shared/narrativePriorityAuthority.js';
export { default } from '../base44/shared/narrativePriorityAuthority.js';