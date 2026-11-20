// Promotion grant authority — pure helpers for the unified Manage Promotions
// admin dialog.
//
// Two promotion types:
//   1. Add Free Credits  → BONUS_PROJECTS promotion + PROMOTIONAL ledger entries
//   2. Unlimited Projects → UNLIMITED_PRO_PROJECTS promotion (no ledger writes)
//
// Idempotency: each BONUS_PROJECTS grant uses a stable idempotency key
//   promo_grant:{promotion_id}:{account_id}
// so retries never double-credit. Unlimited Projects uses the Promotion
// record's own identity — overlapping periods resolve deterministically
// (latest uninterrupted expiry is shown in the display).
//
// This module never writes to the database — it builds the records the
// dialog commits. It never activates dealer login access, never alters
// existing balances, and never infers missing data.

import {
  startDateInputToIso,
  endDateInputToIso,
} from "@/components/admin/promotions/promotionStatus";

// ---------------------------------------------------------- recipient types

export const RECIPIENT_TYPES = [
  { key: "single", label: "One selected dealer" },
  { key: "partners", label: "All Partner Accounts" },
  { key: "active_trade", label: "All Active Trade Accounts" },
  { key: "richer_sounds", label: "All Richer Sounds Accounts" },
  { key: "all", label: "All accounts" },
];

export const PROMO_TYPES = [
  { key: "free_credits", label: "Add Free Credits", hint: "Adds credits to each recipient's ledger" },
  { key: "unlimited_projects", label: "Unlimited Projects", hint: "Unlimited new projects during the period — no credits consumed" },
];

// ------------------------------------------------------ recipient resolution

/**
 * Resolve the list of recipient accounts for a selection.
 * @param {Array} accounts - all Account records
 * @param {{ type: string, accountId?: string }} selection
 * @returns {Array} Account records
 */
export function resolveRecipients(accounts, selection) {
  if (!Array.isArray(accounts)) return [];
  switch (selection?.type) {
    case "single":
      return accounts.filter((a) => a.id === selection.accountId);
    case "partners":
      return accounts.filter((a) => a.dealer_group === "PREMIUM_PARTNER");
    case "active_trade":
      return accounts.filter((a) => a.dealer_group === "OTHER_DEALER");
    case "richer_sounds":
      return accounts.filter((a) => a.dealer_group === "RICHER_SOUNDS");
    case "all":
      return accounts.filter(
        (a) => a.account_type !== "admin" && a.account_type !== "internal"
      );
    default:
      return [];
  }
}

/**
 * Map a recipient selection to Promotion target_scope + target fields.
 * @param {{ type: string, accountId?: string }} selection
 * @returns {{ target_scope: string, target_dealer_group: string|null, target_account_id: string|null }|null}
 */
export function buildPromotionTarget(selection) {
  switch (selection?.type) {
    case "single":
      return {
        target_scope: "SINGLE_ACCOUNT",
        target_account_id: selection.accountId || null,
        target_dealer_group: null,
      };
    case "partners":
      return {
        target_scope: "ALL_DEALER_GROUP",
        target_dealer_group: "PREMIUM_PARTNER",
        target_account_id: null,
      };
    case "active_trade":
      return {
        target_scope: "ALL_DEALER_GROUP",
        target_dealer_group: "OTHER_DEALER",
        target_account_id: null,
      };
    case "richer_sounds":
      return {
        target_scope: "ALL_DEALER_GROUP",
        target_dealer_group: "RICHER_SOUNDS",
        target_account_id: null,
      };
    case "all":
      return {
        target_scope: "ALL_ACCOUNTS",
        target_dealer_group: null,
        target_account_id: null,
      };
    default:
      return null;
  }
}

function recipientLabel(selection, accounts) {
  switch (selection?.type) {
    case "single":
      return accounts?.find((a) => a.id === selection.accountId)?.name || "Selected dealer";
    case "partners": return "All Partner Accounts";
    case "active_trade": return "All Active Trade Accounts";
    case "richer_sounds": return "All Richer Sounds Accounts";
    case "all": return "All Accounts";
    default: return "—";
  }
}

// --------------------------------------------------------- promotion records

/**
 * Build a Promotion record for Add Free Credits (BONUS_PROJECTS).
 * The promotion window is 24 hours — the credits persist in the ledger
 * forever; the Promotion record is the audit/grant identity.
 */
export function buildBonusPromotion({ selection, creditsPerAccount, accounts, actor, now = new Date() }) {
  const target = buildPromotionTarget(selection);
  if (!target) return null;
  const label = recipientLabel(selection, accounts);
  const dateStr = now.toISOString().slice(0, 10);
  const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    name: `Free Credits — ${label} — ${dateStr}`,
    headline: `${creditsPerAccount} free Professional Project credits`,
    message: `${creditsPerAccount} credits added to each eligible account by ${actor?.email || "admin"}.`,
    promotion_type: "BONUS_PROJECTS",
    ...target,
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "ACTIVE",
    bonus_projects: Number(creditsPerAccount) || 0,
  };
}

/**
 * Build a Promotion record for Unlimited Projects (UNLIMITED_PRO_PROJECTS).
 * Start and end dates are in YYYY-MM-DD London-timezone input format.
 */
export function buildUnlimitedPromotion({ selection, startDateInput, endDateInput, accounts, actor }) {
  const target = buildPromotionTarget(selection);
  if (!target) return null;
  const startsAt = startDateInputToIso(startDateInput);
  const endsAt = endDateInputToIso(endDateInput);
  if (!startsAt || !endsAt) return null;
  const label = recipientLabel(selection, accounts);
  const dateStr = new Date().toISOString().slice(0, 10);
  return {
    name: `Unlimited Projects — ${label} — ${dateStr}`,
    headline: "Unlimited Professional Projects",
    message: `Unlimited project creation between ${startDateInput} and ${endDateInput}. Existing credits are not consumed.`,
    promotion_type: "UNLIMITED_PRO_PROJECTS",
    ...target,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "ACTIVE",
  };
}

// ----------------------------------------------------------- ledger entries

/**
 * Build a CapacityLedger entry for a promotional credit grant.
 * Uses a stable idempotency key so retries never double-credit.
 */
export function buildPromotionalLedgerEntry({ accountId, promotionId, credits, actor, now = new Date() }) {
  return {
    account_id: accountId,
    transaction_type: "PROMOTIONAL",
    delta: Number(credits) || 0,
    idempotency_key: `promo_grant:${promotionId}:${accountId}`,
    source_system: "ADMIN_PANEL",
    reason: `Promotional credit grant (${credits} credit${Number(credits) !== 1 ? "s" : ""})`,
    source_ref: {
      promotion_id: promotionId,
      granted_by_user_id: actor?.id || null,
      granted_by_email: actor?.email || null,
      granted_at: now.toISOString(),
    },
  };
}

/**
 * Check whether a promotional grant already exists for a (promotionId, accountId).
 * Checks against already-loaded ledger entries — no API call needed.
 */
export function hasExistingPromoGrant(ledgerEntries, promotionId, accountId) {
  const key = `promo_grant:${promotionId}:${accountId}`;
  return Array.isArray(ledgerEntries) && ledgerEntries.some((e) => e?.idempotency_key === key);
}

/**
 * Filter recipients that already have a grant for the given promotion.
 * Returns { newRecipients, alreadyGranted }.
 */
export function partitionExistingGrants(recipients, ledgerEntries, promotionId) {
  const newRecipients = [];
  const alreadyGranted = [];
  for (const account of recipients) {
    if (hasExistingPromoGrant(ledgerEntries, promotionId, account.id)) {
      alreadyGranted.push(account);
    } else {
      newRecipients.push(account);
    }
  }
  return { newRecipients, alreadyGranted };
}