// coordinatedCandidateTargetAuthority.js
// ---------------------------------------------------------------------------
// Resolve the authoritative P14 operating target the SAME way the optimiser
// orchestrator does, so the developer coordinated-candidate bridge inherits the
// currently open project's target rather than a fixture constant.
//
// This mirrors the resolution in optimiseWorkflowOrchestrator.js (the normal
// authoritative calculation path) exactly, with one deliberate difference: the
// dB figure is NEVER defaulted to 117 here. When the project has not selected a
// P14 target, `resolved` is false and the caller must reject explicitly rather
// than substitute a fixture default during acceptance testing.
//
// Pure and dependency-free so it is unit-testable without the bass SDK chain.
// ---------------------------------------------------------------------------

// Explicit null guard BEFORE numeric coercion: Number(null) === 0 and
// Number.isFinite(0) === true, so a naive check coerces null → 0 → "valid".
// null/undefined/NaN must remain unresolved so the acceptance bridge rejects
// rather than grading against a phantom 0 dB target.
const hasNum = (v) => v != null && Number.isFinite(Number(v));

/**
 * Resolve the authoritative P14 operating target from the shared bass results.
 *
 * @param {object} [opts]
 * @param {object} [opts.requested] — shared.authoritative.requested
 * @param {object} [opts.completedBassAuthority] — shared.completedBassAuthority
 * @returns {{ p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis, resolved }}
 */
export function resolveAuthoritativeP14Target({ requested = null, completedBassAuthority = null } = {}) {
  const req = requested || {};
  const authority = completedBassAuthority || {};

  const p14TargetBasis = req.p14TargetBasis || authority.p14TargetBasis || "minimum";
  const p14TargetLevel =
    req.requestedLevel || req.selectedP14Level || req.p14TargetLevel
    || req.selectedP14TargetLevel || authority.p14TargetLevel || 2;
  // The dB figure is the crux: the orchestrator falls back to 117, but the
  // acceptance bridge must NOT. An unresolved dB yields resolved=false so the
  // caller rejects explicitly.
  const p14TargetDbRaw = req.selectedP14TargetDb ?? authority.p14TargetDb ?? null;
  const p14TargetDb = hasNum(p14TargetDbRaw) ? Number(p14TargetDbRaw) : null;
  const p18TargetBasis = req.p18TargetBasis || req.selectedP18TargetBasis || authority.p18TargetBasis || "minimum";

  return {
    p14TargetBasis,
    p14TargetLevel: hasNum(p14TargetLevel) ? Number(p14TargetLevel) : 2,
    p14TargetDb,
    p18TargetBasis,
    resolved: p14TargetDb !== null,
  };
}