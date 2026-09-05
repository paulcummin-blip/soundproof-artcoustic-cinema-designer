/**
 * bassAuthorityVersion.js
 * -----------------------
 * Canonical instance-authority version for the completed-bass-authority
 * persistence/hydration contract.
 *
 * Single source of truth — imported by:
 *   - subwooferInstanceMigration.js (re-exports for app consumers)
 *   - completedBassResultPersistence.js (resolver + adapter)
 *   - bassAnalysisContract.js (contract version)
 *   - completedBassResultStore.js (store)
 *   - p14TargetCache.js (target cache)
 *   - bassOptimiserWorkerProtocol.js (metric schema version)
 *
 * This module lives inside the frontend src/ tree so Vite/browser imports
 * resolve without requesting /base44/shared/... (which the preview sandbox
 * forbids with 403). The dependency-free base44/shared/bassAuthorityVersion.js
 * re-exports from here so bare-Node regression tests and backend functions
 * can still import the shared path.
 */

export const INSTANCE_AUTHORITY_VERSION = 4;
export const BASS_ANALYSIS_CONTRACT_VERSION = 14;
export const COMPLETED_BASS_CACHE_VERSION = 5;
export const RP22_BASS_METRIC_SCHEMA_VERSION = 11;