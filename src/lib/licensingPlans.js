// =============================================================================
// LEGACY LICENCE FIELDS — NON-AUTHORITATIVE (Stage B1)
// =============================================================================
// The fields below (license_active_project_allowance, license_override_allowance,
// license_credit_balance, license_account_type) are LEGACY. They remain in the
// User entity for backward compatibility but are NOT the commercial authority.
//
// The canonical commercial authority is the CapacityLedger entity.
// See: src/lib/commercial/capacityService.js → getAvailableProfessionalProjects()
//
// Do not build new enforcement logic on these legacy fields.
// =============================================================================

// Licensing plan defaults — infrastructure only, not enforced anywhere.
// Used purely to display/prefill the plan-based allowance in admin UI.
export const PLAN_ALLOWANCE_DEFAULTS = {
  Free: 2,
  Standard: 5,
  Professional: 12,
  Enterprise: 30,
  Internal: 999999,
};

// LEGACY: retained for backward compatibility with existing admin UI.
// New commercial logic should use capacityService.getAvailableProfessionalProjects().
export function getEffectiveAllowance(user) {
  const override = user?.license_override_allowance;
  if (override !== null && override !== undefined && override !== "") return Number(override);
  const planAllowance = user?.license_active_project_allowance;
  if (Number.isFinite(Number(planAllowance))) return Number(planAllowance);
  return PLAN_ALLOWANCE_DEFAULTS[user?.license_account_type] ?? PLAN_ALLOWANCE_DEFAULTS.Free;
}