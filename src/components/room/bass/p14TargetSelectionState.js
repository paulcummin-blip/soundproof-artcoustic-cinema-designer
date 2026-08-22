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
  const level = Number.isFinite(Number(splConfig?.selectedP14Level))
    ? Math.max(1, Math.min(4, Number(splConfig.selectedP14Level)))
    : null;
  const noP14TargetSelected = !basis || !level;
  const targetKey = noP14TargetSelected ? null : `${basis}-L${level}`;
  return { noP14TargetSelected, targetKey, basis, level };
}