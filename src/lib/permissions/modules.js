// Central registry of all modules that can be permission-gated.
// Adding a new module in the future = add one key here + one row in permissionManifest.js.

export const MODULES = {
  PROJECTS: "projects",
  ROOM_DESIGNER: "room_designer",
  BASS_SIMULATION: "bass_simulation",
  SPL_CALCULATOR: "spl_calculator",
  RP22_REPORTS: "rp22_reports",
  RP23_REPORTS: "rp23_reports",
  MEASURED_DATASETS: "measured_datasets",
  PRODUCTS: "products",
  ADMIN_DASHBOARD: "admin_dashboard",
  SYSTEM_HEALTH: "system_health",
  USER_MANAGEMENT: "user_management",
  COMPANY_MANAGEMENT: "company_management",
  AUDIT_LOG: "audit_log",
  PRICING: "pricing",
};

export const ALL_MODULES = Object.values(MODULES);