// Licensing plan defaults — infrastructure only, not enforced anywhere.
// Used purely to display/prefill the plan-based allowance in admin UI.
export const PLAN_ALLOWANCE_DEFAULTS = {
  Free: 2,
  Standard: 5,
  Professional: 12,
  Enterprise: 30,
  Internal: 999999,
};

export function getEffectiveAllowance(user) {
  const override = user?.license_override_allowance;
  if (override !== null && override !== undefined && override !== "") return Number(override);
  const planAllowance = user?.license_active_project_allowance;
  if (Number.isFinite(Number(planAllowance))) return Number(planAllowance);
  return PLAN_ALLOWANCE_DEFAULTS[user?.license_account_type] ?? PLAN_ALLOWANCE_DEFAULTS.Free;
}