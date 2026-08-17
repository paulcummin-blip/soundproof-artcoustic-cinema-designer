// Commercial overview helpers for the Sound Proof Commercial Control Centre.
//
// All values are derived from existing entities — no mutable balance fields,
// no denormalisation onto Account. These helpers aggregate pre-fetched arrays
// so the admin UI can render 25+ accounts with minimal API calls.

import { aggregateCapacityBreakdown } from "./capacityService";

/**
 * Aggregate TurnoverRecord entries for one account + calendar year.
 * Returns the eligible_turnover_gbp (GBP), or null if no record exists.
 *
 * @param {Array} records - TurnoverRecord array (pre-filtered or full list).
 * @param {string} accountId
 * @param {number} calendarYear
 * @returns {number|null}
 */
export function aggregateTurnoverForYear(records, accountId, calendarYear) {
  if (!Array.isArray(records) || !accountId || !calendarYear) return null;
  let best = null;
  for (const r of records) {
    if (r?.account_id !== accountId) continue;
    if (Number(r?.calendar_year) !== Number(calendarYear)) continue;
    if (r?.source_system && r.source_system !== "ARTCOUSTIC_PARTNER_PORTAL") continue;
    const val = Number(r?.eligible_turnover_gbp);
    if (!Number.isFinite(val)) continue;
    if (best === null || val > best) best = val;
  }
  return best;
}

/**
 * Build a Map of account_id → turnover (GBP) for a given year.
 */
export function buildTurnoverMap(records, calendarYear) {
  const map = new Map();
  if (!Array.isArray(records)) return map;
  for (const r of records) {
    if (Number(r?.calendar_year) !== Number(calendarYear)) continue;
    if (r?.source_system && r.source_system !== "ARTCOUSTIC_PARTNER_PORTAL") continue;
    const val = Number(r?.eligible_turnover_gbp);
    if (!Number.isFinite(val)) continue;
    const existing = map.get(r.account_id);
    if (existing === undefined || val > existing) {
      map.set(r.account_id, val);
    }
  }
  return map;
}

/**
 * Build a Map of account_id → { count, lastActivity } from a Project array.
 * count = number of projects for that account.
 * lastActivity = MAX(updated_date) across those projects.
 */
export function buildProjectActivityMap(projects) {
  const map = new Map();
  if (!Array.isArray(projects)) return map;
  for (const p of projects) {
    const aid = p?.account_id;
    if (!aid) continue;
    const entry = map.get(aid) || { count: 0, lastActivity: null };
    entry.count += 1;
    const updated = p?.updated_date;
    if (updated && (!entry.lastActivity || updated > entry.lastActivity)) {
      entry.lastActivity = updated;
    }
    map.set(aid, entry);
  }
  return map;
}

/**
 * Compute the most recent meaningful activity for an account.
 * Returns MAX(Account.last_access_at, latest Project.updated_date) or null.
 * Caller displays "—" when null is returned — do not fabricate dates
 * merely because the Account was bootstrapped.
 */
export function computeLastActivity(projectMapEntry, account) {
  const projectLast = projectMapEntry?.lastActivity || null;
  const accountLast = account?.last_access_at || null;
  if (!projectLast && !accountLast) return null;
  if (!projectLast) return accountLast;
  if (!accountLast) return projectLast;
  try {
    return new Date(projectLast).getTime() >= new Date(accountLast).getTime()
      ? projectLast : accountLast;
  } catch {
    return projectLast || accountLast || null;
  }
}

/**
 * Build a Map of account_id → aggregated CapacityLedger breakdown.
 */
export function buildCapacityBreakdownMap(ledgerEntries) {
  const map = new Map();
  if (!Array.isArray(ledgerEntries)) return map;
  // Group entries by account_id first
  const byAccount = new Map();
  for (const e of ledgerEntries) {
    const aid = e?.account_id;
    if (!aid) continue;
    if (!byAccount.has(aid)) byAccount.set(aid, []);
    byAccount.get(aid).push(e);
  }
  // Aggregate each account's entries
  for (const [aid, entries] of byAccount) {
    map.set(aid, aggregateCapacityBreakdown(entries));
  }
  return map;
}

/**
 * Group accounts by dealer_group for the Commercial Control Centre.
 *
 * Returns:
 * {
 *   premiumPartners: Account[],
 *   richerSounds: Account[],
 *   otherDealers: Account[],
 *   distributors: Account[],
 *   internalTest: Account[],
 * }
 */
export function groupAccountsByCommercialSection(accounts) {
  const groups = {
    premiumPartners: [],
    richerSounds: [],
    otherDealers: [],
    distributors: [],
    internalTest: [],
  };
  if (!Array.isArray(accounts)) return groups;
  for (const a of accounts) {
    const dg = a?.dealer_group;
    const type = a?.account_type;
    if (dg === "PREMIUM_PARTNER") {
      groups.premiumPartners.push(a);
    } else if (dg === "RICHER_SOUNDS") {
      groups.richerSounds.push(a);
    } else if (dg === "OTHER_DEALER") {
      groups.otherDealers.push(a);
    } else if (dg === "INTERNATIONAL" || type === "distributor") {
      groups.distributors.push(a);
    } else if (dg === "INTERNAL" || type === "admin" || type === "internal") {
      groups.internalTest.push(a);
    } else if (type === "dealer" && !dg) {
      // Ungrouped dealer accounts (e.g. test accounts) go to Internal/Test
      groups.internalTest.push(a);
    } else {
      groups.internalTest.push(a);
    }
  }
  return groups;
}

/**
 * Format a GBP value for display. Returns "—" for null/undefined.
 * @param {number|null} value
 * @returns {string}
 */
export function formatGBP(value) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return "—";
  }
}