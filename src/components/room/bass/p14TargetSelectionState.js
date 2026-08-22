// Shared P14 target selection state.
//
// When no P14 target is genuinely selected (basis or level is null), no bass
// optimisation runs and no target cache is generated. The UI must present this
// as a neutral "Select Bass Target" state — never as "Calculating…", "NOT
// VERIFIED", "FAIL", or "UNCALCULATED" (which imply a calculation is running
// or has failed).
//
// This is a pure presentation helper. It does NOT change bass maths, optimiser
// logic, target cache, fingerprints, or authority versioning. It only gives
// every presentation surface one shared boolean so the app speaks with one
// voice about the unselected state.

/**
 * Resolve the P14 target selection state from the app's splConfig or the
 * authoritative.requested calibration config.
 *
 * @param {object} splConfig - appState.splConfig or authoritative.requested
 * @returns {{ noP14TargetSelected: boolean, targetKey: string|null, basis: string|null, level: number|null }}
 */
export function resolveP14TargetSelectionState(splConfig) {
  const basis = splConfig?.selectedP14TargetBasis === "recommended" ? "recommended"
    : splConfig?.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;
  const rawLevel = splConfig?.selectedP14Level;
  // Explicit null guard: Number(null) === 0, which Number.isFinite accepts.
  // A null/undefined/0/NaN level must remain null — never coerced to L1.
  const level = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const noP14TargetSelected = !basis || !level;
  const targetKey = noP14TargetSelected ? null : `${basis}-L${level}`;
  return { noP14TargetSelected, targetKey, basis, level };
}

/**
 * Normalise a raw P14 level value to either a valid integer 1–4 or null.
 *
 * CRITICAL: Number(null) === 0 and Number.isFinite(0) === true, so a naive
 * `Number.isFinite(Number(value))` check coerces null → 0 → "valid". This
 * helper applies an explicit null guard BEFORE numeric coercion so that
 * null/undefined/0/NaN all remain null — never coerced to L1.
 *
 * Use this on every AppState initialization, hydration, and reset path
 * for selectedP14Level.
 */
export function normaliseP14Level(rawLevel) {
  if (rawLevel == null) return null;
  const n = Number(rawLevel);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(4, Math.round(n)));
}