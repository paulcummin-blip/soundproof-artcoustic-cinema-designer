/**
 * bassAuthorityVersion.js
 * -----------------------
 * Canonical instance-authority version for the completed-bass-authority
 * persistence/hydration contract.
 *
 * Re-exports from the frontend-safe canonical location (src/lib/bassAuthorityVersion.js)
 * so bare-Node regression tests and backend functions can import this shared
 * path without pulling in @/-aliased modules.
 *
 * Frontend/browser modules MUST import @/lib/bassAuthorityVersion directly —
 * importing from /base44/shared/... causes a 403 in the preview sandbox.
 */
export {
  INSTANCE_AUTHORITY_VERSION,
  BASS_ANALYSIS_CONTRACT_VERSION,
  COMPLETED_BASS_CACHE_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "../../src/lib/bassAuthorityVersion.js";