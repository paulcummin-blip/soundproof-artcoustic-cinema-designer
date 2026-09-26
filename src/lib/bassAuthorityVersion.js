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
export const BASS_ANALYSIS_CONTRACT_VERSION = 22;
export const COMPLETED_BASS_CACHE_VERSION = 14; // v14: compact graph authority persists the canonical correction curve required by the production graph gate.
export const RP22_BASS_METRIC_SCHEMA_VERSION = 21; // v21: P19 is RSP-only (max|smoothedRspResponse − T(f)|). Per-seat P19 removed from RP22 authority — no per-seat P19 grades, no Primary/Secondary/Project P19 floors, no P19 FAIL seats. p19TargetIdentity corrected to "target-curve". Older completed authority is rejected and regenerated.