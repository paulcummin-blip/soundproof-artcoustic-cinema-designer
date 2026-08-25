/**
 * bassAuthorityVersion.js
 * -----------------------
 * Canonical instance-authority version for the completed-bass-authority
 * persistence/hydration contract.
 *
 * Single source of truth — imported by:
 *   - subwooferInstanceMigration.js (re-exports for app consumers)
 *   - completedBassResultPersistence.js (resolver + adapter)
 *
 * Kept dependency-free so the persistence adapter/resolver is importable from
 * bare-Node regression tests (no application path alias required).
 */
export const INSTANCE_AUTHORITY_VERSION = 3;
export const BASS_ANALYSIS_CONTRACT_VERSION = 13;
export const COMPLETED_BASS_CACHE_VERSION = 4;
export const RP22_BASS_METRIC_SCHEMA_VERSION = 7;