/**
 * Promotion display status derivation and Europe/London date handling.
 *
 * Stored status enum: DRAFT, ACTIVE, CANCELLED
 * Derived display status: Draft, Scheduled, Active, Expired, Cancelled
 *
 * Date handling:
 * - Admin enters dates in Europe/London context.
 * - End date is inclusive (31 Dec 2026) → stored as exclusive (1 Jan 2027 00:00 London).
 * - Display shows the inclusive end date ("Ends 31 Dec 2026").
 */

/** Derive the human-facing display status from stored status + dates. */
export function deriveDisplayStatus(promo, now = Date.now()) {
  if (!promo) return "—";
  if (promo.status === "CANCELLED") return "Cancelled";
  if (promo.status === "DRAFT") return "Draft";
  // status === "ACTIVE"
  const startMs = promo.starts_at ? new Date(promo.starts_at).getTime() : NaN;
  const endMs = promo.ends_at ? new Date(promo.ends_at).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "Draft";
  if (now < startMs) return "Scheduled";
  if (now >= endMs) return "Expired";
  return "Active";
}

/** True only when the promotion is currently within its effective window. */
export function isEffective(promo, now = Date.now()) {
  return deriveDisplayStatus(promo, now) === "Active";
}

/** True when the promotion is Active or Scheduled (usable or即将 usable). */
export function isLiveOrScheduled(promo, now = Date.now()) {
  const s = deriveDisplayStatus(promo, now);
  return s === "Active" || s === "Scheduled";
}

// ── Europe/London date conversion ──

/** Convert a YYYY-MM-DD date input string to ISO at London midnight. */
function dateInputToLondonIso(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  // Determine London timezone offset for this date by checking
  // what London hour corresponds to UTC noon.
  const test = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const londonHourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).format(test);
  const londonHour = parseInt(londonHourStr === "24" ? "00" : londonHourStr, 10);
  const offsetHours = londonHour - 12; // BST: London noon = 13:00, offset = +1
  const offsetMs = offsetHours * 3600000;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs).toISOString();
}

/** Start date input (YYYY-MM-DD) → ISO at London midnight. */
export function startDateInputToIso(dateStr) {
  return dateInputToLondonIso(dateStr);
}

/** End date input (inclusive YYYY-MM-DD) → ISO at London midnight NEXT day (exclusive). */
export function endDateInputToIso(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const next = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return dateInputToLondonIso(next);
}

/** ISO → date input string (YYYY-MM-DD) in London timezone. */
function isoToDateInput(isoStr) {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

export function isoToStartDateInput(isoStr) {
  return isoToDateInput(isoStr);
}

/** End ISO (exclusive) → inclusive end date input (subtract 1 day in London). */
export function isoToEndDateInput(isoStr) {
  if (!isoStr) return "";
  const date = new Date(isoStr);
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

/** ISO → display string (DD Mon YYYY) in London timezone. */
export function isoToDisplayDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit", month: "short", year: "numeric",
  });
}

/** End ISO (exclusive) → inclusive end display date (subtract 1 day). */
export function isoToEndDisplayDate(isoStr) {
  if (!isoStr) return "—";
  const date = new Date(isoStr);
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit", month: "short", year: "numeric",
  });
}

/** Format a date range: "17 Aug 2026 – 31 Dec 2026". */
export function formatDateRange(startIso, endIso) {
  return `${isoToDisplayDate(startIso)} – ${isoToEndDisplayDate(endIso)}`;
}

/** Format "Ends 31 Dec 2026" from exclusive end ISO. */
export function formatEndsLabel(endIso) {
  return `Ends ${isoToEndDisplayDate(endIso)}`;
}

// ── Label mappings (avoid raw enum values in UI) ──

export const DEALER_GROUP_LABELS = {
  PREMIUM_PARTNER: "Premium Partners",
  RICHER_SOUNDS: "Richer Sounds",
  OTHER_DEALER: "Other Dealers",
  INTERNATIONAL: "International",
  INTERNAL: "Internal",
  PROFESSIONAL: "Professional",
};

export const DEALER_GROUP_OPTIONS = [
  { value: "PREMIUM_PARTNER", label: "Premium Partners" },
  { value: "RICHER_SOUNDS", label: "Richer Sounds" },
  { value: "OTHER_DEALER", label: "Other Dealers" },
  { value: "INTERNATIONAL", label: "International" },
  { value: "INTERNAL", label: "Internal" },
  { value: "PROFESSIONAL", label: "Professional" },
];

export const TARGET_SCOPE_LABELS = {
  ALL_DEALER_GROUP: "Dealer Group",
  SINGLE_ACCOUNT: "Single Account",
  DISTRIBUTOR_DOWNSTREAM: "Distributor Downstream",
};

export const PROMOTION_TYPE_LABELS = {
  UNLIMITED_PRO_PROJECTS: "Unlimited Professional Projects",
  DISCOUNT_PERCENT: "Discount Percent",
  BONUS_PROJECTS: "Bonus Projects",
};

/**
 * Test whether an account matches a promotion's target scope.
 * (Frontend mirror of the backend promotionAuthority.matchesTarget.)
 */
export function matchesTarget(promotion, account) {
  if (!promotion || !account) return false;
  switch (promotion.target_scope) {
    case "ALL_DEALER_GROUP":
      return promotion.target_dealer_group != null &&
        account.dealer_group === promotion.target_dealer_group;
    case "SINGLE_ACCOUNT":
      return promotion.target_account_id != null &&
        account.id === promotion.target_account_id;
    case "DISTRIBUTOR_DOWNSTREAM":
      return promotion.target_distributor_id != null &&
        account.parent_account_id === promotion.target_distributor_id;
    default:
      return false;
  }
}

// ── Eligible accounts ──

/**
 * Get the list of accounts eligible for a promotion.
 * For ALL_DEALER_GROUP: accounts matching target_dealer_group, excluding
 *   admin/internal/test accounts.
 * For SINGLE_ACCOUNT: the single target account.
 */
export function getEligibleAccounts(accounts, promotion) {
  if (!accounts || !promotion) return [];
  if (promotion.target_scope === "ALL_DEALER_GROUP") {
    return accounts.filter(
      (a) =>
        a.dealer_group === promotion.target_dealer_group &&
        a.account_type !== "admin" &&
        a.account_type !== "internal" &&
        !(a.name || "").toUpperCase().includes("TEST")
    );
  }
  if (promotion.target_scope === "SINGLE_ACCOUNT") {
    return accounts.filter((a) => a.id === promotion.target_account_id);
  }
  return [];
}

/**
 * Build a compact one-line summary for a promotion, suitable for dropdown
 * option labels in the template selector.
 * Format: "Unlimited Professional Projects — Premium Partners — 17 Aug 2026 – 31 Dec 2026 (Active)"
 *
 * @param {object} promo - Promotion record
 * @param {Array} [allAccounts] - Account[] for resolving single-account target names
 * @returns {string}
 */
export function buildPromotionSummary(promo, allAccounts) {
  if (!promo) return "";
  const typeLabel = PROMOTION_TYPE_LABELS[promo.promotion_type] || promo.promotion_type || "Promotion";
  let targetLabel = "—";
  if (promo.target_scope === "ALL_DEALER_GROUP") {
    targetLabel = DEALER_GROUP_LABELS[promo.target_dealer_group] || promo.target_dealer_group || "—";
  } else if (promo.target_scope === "SINGLE_ACCOUNT") {
    const acct = allAccounts?.find((a) => a.id === promo.target_account_id);
    targetLabel = acct?.name || "Single Account";
  } else if (promo.target_scope === "DISTRIBUTOR_DOWNSTREAM") {
    targetLabel = "Distributor Downstream";
  }
  const dateRange = formatDateRange(promo.starts_at, promo.ends_at);
  const status = deriveDisplayStatus(promo);
  return `${typeLabel} — ${targetLabel} — ${dateRange} (${status})`;
}

/**
 * Canonical mapping between Commercial Control Centre group keys (camelCase)
 * and Account.dealer_group / Promotion.target_dealer_group enum values.
 *
 * This is the SINGLE shared mapping — all group-key comparisons must go
 * through here, never ad-hoc string comparisons.
 */
export const GROUP_KEY_TO_DEALER_GROUP = {
  premiumPartners: "PREMIUM_PARTNER",
  richerSounds: "RICHER_SOUNDS",
  otherDealers: "OTHER_DEALER",
  distributors: "INTERNATIONAL",
  internal: "INTERNAL",
  professional: "PROFESSIONAL",
};

const DEALER_GROUP_TO_GROUP_KEY = Object.fromEntries(
  Object.entries(GROUP_KEY_TO_DEALER_GROUP).map(([k, v]) => [v, k])
);

/**
 * Determine if a promotion belongs to a given dealer group section.
 * Used to place promotions under the correct group heading.
 *
 * Uses the canonical GROUP_KEY_TO_DEALER_GROUP mapping so that
 * Promotion.target_dealer_group (e.g. "PREMIUM_PARTNER") is correctly
 * compared against the Control Centre groupKey (e.g. "premiumPartners").
 */
export function promotionBelongsToGroup(promotion, groupKey, allAccounts) {
  if (!promotion) return false;
  if (promotion.target_scope === "ALL_DEALER_GROUP") {
    return promotion.target_dealer_group === GROUP_KEY_TO_DEALER_GROUP[groupKey];
  }
  if (promotion.target_scope === "SINGLE_ACCOUNT") {
    const target = allAccounts?.find((a) => a.id === promotion.target_account_id);
    if (!target) return false;
    const mapped = DEALER_GROUP_TO_GROUP_KEY[target.dealer_group];
    if (mapped) return groupKey === mapped;
    if (target.account_type === "distributor") return groupKey === "distributors";
    if (target.account_type === "professional") return groupKey === "professional";
    return groupKey === "internal";
  }
  return false;
}