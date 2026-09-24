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
export const BASS_ANALYSIS_CONTRACT_VERSION = 21;
export const COMPLETED_BASS_CACHE_VERSION = 14; // v14: compact graph authority persists the canonical correction curve required by the production graph gate.
export const RP22_BASS_METRIC_SCHEMA_VERSION = 20; // v20: published P19 uses stored Reference EQ. The calibrated RSP and Reference EQ must have identical curve authority; every seat is compared directly with that reference. Older completed authority is rejected and regenerated.