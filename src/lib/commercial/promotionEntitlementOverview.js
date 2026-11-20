// Promotion entitlement overview — pure, read-only helpers for the admin
// Account Access & Credits page.
//
// Derives per-account promotion status, expiry and historical periods from
// the existing Promotion and PromotionUsage authorities. Never writes, never
// creates a parallel entitlement system, never alters ledger entries.
//
// Deterministic promotion selection: when multiple UNLIMITED_PRO_PROJECTS
// promotions match an account at the same time, the one with the earliest
// starts_at wins (stable, predictable for admins).

import {
  matchesTarget,
  deriveDisplayStatus,
  isoToEndDisplayDate,
} from "@/components/admin/promotions/promotionStatus";

const EXPIRES_SOON_DAYS = 14;
const INTRODUCTORY_DURATION_MONTHS = 3;

// ----------------------------------------------------------------- indexing

/**
 * Build a Map of account_id → all Promotion records targeting that account
 * (current + historical, any status). Sorted by starts_at descending.
 *
 * @param {Array} promotions - all Promotion records
 * @param {Array} accounts - all Account records
 * @returns {Map<string, Array>} account_id → Promotion[]
 */
export function buildPromotionsByAccount(promotions, accounts) {
  const map = new Map();
  if (!Array.isArray(promotions) || !Array.isArray(accounts)) return map;
  for (const account of accounts) {
    const matched = [];
    for (const promo of promotions) {
      if (matchesTarget(promo, account)) matched.push(promo);
    }
    matched.sort((a, b) =>
      String(b?.starts_at || "").localeCompare(String(a?.starts_at || "")
    ));
    if (matched.length > 0) map.set(account.id, matched);
  }
  return map;
}

/**
 * Build a nested Map of account_id → promotion_id → usage count.
 *
 * @param {Array} usageRecords - all PromotionUsage records
 * @returns {Map<string, Map<string, number>>}
 */
export function buildPromoUsageByAccountAndPromo(usageRecords) {
  const map = new Map();
  if (!Array.isArray(usageRecords)) return map;
  for (const usage of usageRecords) {
    const accountId = usage?.account_id;
    const promotionId = usage?.promotion_id;
    if (!accountId || !promotionId) continue;
    if (!map.has(accountId)) map.set(accountId, new Map());
    const inner = map.get(accountId);
    inner.set(promotionId, (inner.get(promotionId) || 0) + 1);
  }
  return map;
}

// --------------------------------------------------------- effective promotion

/**
 * Resolve the single effective UNLIMITED_PRO_PROJECTS promotion for an account
 * at the given time. Deterministic: among all effective matching promotions,
 * the one with the earliest starts_at wins.
 *
 * @param {Array} promotionsForAccount - Promotion[] targeting this account
 * @param {number} [now] - timestamp override
 * @returns {object|null} The winning Promotion, or null
 */
export function resolveEffectivePromotion(promotionsForAccount, now = Date.now()) {
  if (!Array.isArray(promotionsForAccount)) return null;
  let best = null;
  for (const promo of promotionsForAccount) {
    if (promo?.promotion_type !== "UNLIMITED_PRO_PROJECTS") continue;
    if (deriveDisplayStatus(promo, now) !== "Active") continue;
    if (!best || String(promo.starts_at || "") < String(best.starts_at || "")) {
      best = promo;
    }
  }
  return best;
}

// ---------------------------------------------------------- status derivation

/**
 * Derive a display label and tone for the promotion column.
 *   "Unlimited Active"  — effective UNLIMITED promotion, >14 days remaining
 *   "Expires Soon"      — effective UNLIMITED promotion, ≤14 days remaining
 *   "Expired"           — a promotion targeted this account but is now past
 *   "Scheduled"         — a promotion is scheduled but not yet active
 *   "Cancelled"         — the promotion was cancelled
 *   "None"              — no promotion targets this account
 *
 * @param {object|null} effectivePromotion - from resolveEffectivePromotion
 * @param {Array} allPromotionsForAccount - all promotions targeting the account
 * @param {number} [now]
 * @returns {{ label: string, tone: string, expiryDisplay: string }}
 */
export function derivePromotionStatus(effectivePromotion, allPromotionsForAccount, now = Date.now()) {
  if (effectivePromotion) {
    const endMs = effectivePromotion.ends_at
      ? new Date(effectivePromotion.ends_at).getTime()
      : NaN;
    const daysRemaining = Number.isFinite(endMs)
      ? Math.ceil((endMs - now) / (1000 * 60 * 60 * 24))
      : null;
    const expiresSoon =
      daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= EXPIRES_SOON_DAYS;
    return {
      label: expiresSoon ? "Expires Soon" : "Unlimited Active",
      tone: expiresSoon ? "warn" : "ok",
      expiryDisplay: isoToEndDisplayDate(effectivePromotion.ends_at),
    };
  }

  // No effective promotion — check for historical / scheduled / cancelled
  if (Array.isArray(allPromotionsForAccount) && allPromotionsForAccount.length > 0) {
    const hasScheduled = allPromotionsForAccount.some(
      (p) => deriveDisplayStatus(p, now) === "Scheduled"
    );
    if (hasScheduled) {
      return { label: "Scheduled", tone: "info", expiryDisplay: "—" };
    }
    const hasExpired = allPromotionsForAccount.some(
      (p) => deriveDisplayStatus(p, now) === "Expired"
    );
    if (hasExpired) {
      return { label: "Expired", tone: "muted", expiryDisplay: "—" };
    }
    const hasCancelled = allPromotionsForAccount.some(
      (p) => deriveDisplayStatus(p, now) === "Cancelled"
    );
    if (hasCancelled) {
      return { label: "Cancelled", tone: "muted", expiryDisplay: "—" };
    }
  }

  return { label: "None", tone: "muted", expiryDisplay: "—" };
}

// ---------------------------------------------------------- project counting

/**
 * Count total promotional projects for an account across ALL promotions
 * (current + historical). Each PromotionUsage record is one project.
 *
 * @param {Map<string, Map<string, number>>} promoUsageMap - from buildPromoUsageByAccountAndPromo
 * @param {string} accountId
 * @returns {number}
 */
export function countPromoProjectsForAccount(promoUsageMap, accountId) {
  const inner = promoUsageMap?.get(accountId);
  if (!inner) return 0;
  let total = 0;
  for (const count of inner.values()) total += count;
  return total;
}

/**
 * Count capacity-consumed project creations from the ledger.
 * Each PROJECT_ACTIVATION entry (delta = -1) represents one project created
 * via capacity consumption. This count survives project deletion.
 *
 * @param {Array} ledgerEntries - CapacityLedger records for one account
 * @returns {number}
 */
export function countCapacityProjectCreations(ledgerEntries) {
  if (!Array.isArray(ledgerEntries)) return 0;
  let count = 0;
  for (const entry of ledgerEntries) {
    if (entry?.transaction_type === "PROJECT_ACTIVATION") count += 1;
  }
  return count;
}

/**
 * Total projects created with reliable historical evidence.
 * = capacity-consumed creations (PROJECT_ACTIVATION entries)
 *   + promotional creations (PromotionUsage records)
 *
 * This is independent of whether the Project records still exist.
 *
 * @param {Array} ledgerEntries - CapacityLedger records for one account
 * @param {number} promoProjectsTotal - total promotional projects
 * @returns {number}
 */
export function countProjectsCreatedTotal(ledgerEntries, promoProjectsTotal) {
  return countCapacityProjectCreations(ledgerEntries) + (promoProjectsTotal || 0);
}

// --------------------------------------------------- introductory promotion

/**
 * Derive introductory unlimited promotion readiness for an account.
 *
 * The introductory promotion is three months of unlimited project creation
 * from the first verified activation (Account.first_activated_at).
 *
 * This is PREPARATION ONLY — it never grants a promotion. It derives a
 * display label so the admin can see which accounts would be eligible and
 * when the introductory window would start/end.
 *
 * If first_activated_at is null (unknown), the readiness is "unknown" — never
 * inferred.
 *
 * @param {object} account - Account record
 * @param {object|null} effectivePromotion - current effective UNLIMITED promotion
 * @returns {{ state: string, windowStart: string|null, windowEnd: string|null, label: string }}
 */
export function deriveIntroductoryReadiness(account, effectivePromotion) {
  const firstActivated = account?.first_activated_at || null;

  if (!firstActivated) {
    return {
      state: "unknown",
      windowStart: null,
      windowEnd: null,
      label: "Activation date unknown — introductory promotion cannot be inferred",
    };
  }

  const startDate = new Date(firstActivated);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + INTRODUCTORY_DURATION_MONTHS);
  const now = Date.now();

  const windowStart = startDate.toISOString();
  const windowEnd = endDate.toISOString();
  const nowTime = now;

  if (effectivePromotion) {
    return {
      state: "active",
      windowStart,
      windowEnd,
      label: "Introductory unlimited active — credits are not consumed",
    };
  }

  if (nowTime >= endDate.getTime()) {
    return {
      state: "elapsed",
      windowStart,
      windowEnd,
      label: "Introductory window elapsed",
    };
  }

  return {
    state: "eligible",
    windowStart,
    windowEnd,
    label: "Eligible for introductory unlimited promotion",
  };
}

/**
 * Format an ISO date for compact display in the admin drawer.
 * @param {string|null} iso
 * @returns {string}
 */
export function formatPromotionDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}