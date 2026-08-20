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
 * bare-Node regression tests (no @/ alias required).
 */
export const INSTANCE_AUTHORITY_VERSION = 1;