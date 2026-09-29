// Admin Account Access — pure derivation helpers.
//
// A read-only admin surface over the EXISTING authorities. This module never
// writes to the database and never introduces a second dealer, access or credit
// model. Everything is derived from records that other parts of the platform
// already own:
//   Account, AccountMembership, PortalIdentity, User, ExternalAccountLink,
//   Project, CapacityLedger, TurnoverRecord, AccountUserAudit.
//
// All functions are pure so the page can fetch once and filter locally.

import { aggregateCapacityBreakdown } from "./capacityService";

// Occupied seats — the same rule the account-user authority applies.
export const OCCUPIED_STATUSES = ["pending", "active"];

// Mirrors MAX_ACCOUNT_SEATS in base44/shared/accountAccessAuthority.js.
export const MAX_ACCOUNT_SEATS = 5;

export const ACCESS_GROUPS = [
  { key: "partners", label: "Partner Accounts", description: "Premium Partners" },
  { key: "activeTrade", label: "Active Trade Accounts", description: "UK trade dealers" },
  { key: "richerSounds", label: "Richer Sounds Accounts", description: "Richer Sounds stores" },
  { key: "other", label: "Other Accounts", description: "Internal, professional and distributor accounts" },
];

export const STATUS_TONES = {
  active: "ok",
  inactive: "muted",
  trial: "warn",
  suspended: "danger",
};

export const LEDGER_TYPE_LABELS = {
  TRIAL: "Trial credit",
  PURCHASED: "Purchased",
  UK_TURNOVER_REWARD: "Turnover reward",
  DISTRIBUTOR_ALLOCATION: "Distributor allocation",
  DISTRIBUTOR_RECLAIM: "Distributor reclaim",
  PROMOTIONAL: "Promotional",
  ADMIN_GRANT: "Admin grant",
  INTERNAL: "Internal",
  PROJECT_ACTIVATION: "Project activated",
  REVERSAL: "Reversal",
};

export const EMPTY_FILTERS = {
  search: "",
  group: "all",
  status: "all",
  credits: "all",
  users: "all",
  projects: "all",
};

// ---------------------------------------------------------------- grouping

export function groupKeyForAccount(account) {
  const dealerGroup = account?.dealer_group;
  if (dealerGroup === "PREMIUM_PARTNER") return "partners";
  if (dealerGroup === "RICHER_SOUNDS") return "richerSounds";
  if (dealerGroup === "OTHER_DEALER") return "activeTrade";
  return "other";
}

export function bucketRowsByGroup(rows) {
  const buckets = { partners: [], activeTrade: [], richerSounds: [], other: [] };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!buckets[row.group]) buckets[row.group] = [];
    buckets[row.group].push(row);
  }
  return buckets;
}

// ---------------------------------------------------------------- index maps

function toMapByAccount(records) {
  const map = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const accountId = record?.account_id;
    if (!accountId) continue;
    if (!map.has(accountId)) map.set(accountId, []);
    map.get(accountId).push(record);
  }
  return map;
}

export const buildMembersByAccount = (memberships) => toMapByAccount(memberships);
export const buildLedgerByAccount = (entries) => toMapByAccount(entries);
export const buildProjectsByAccount = (projects) => toMapByAccount(projects);
export const buildAuditsByAccount = (audits) => toMapByAccount(audits);
export const buildPortalIdentitiesByAccount = (identities) => toMapByAccount(identities);

// Users carry their authoritative account_id stamped by the backend.
export function buildUsersByAccount(users) {
  const map = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    if (!user?.account_id) continue;
    if (!map.has(user.account_id)) map.set(user.account_id, []);
    map.get(user.account_id).push(user);
  }
  return map;
}

// Only active external links represent a live Partner Portal relationship.
export function buildLinksByAccount(links) {
  const map = new Map();
  for (const link of Array.isArray(links) ? links : []) {
    if (!link?.account_id) continue;
    if (link.active === false) continue;
    if (!map.has(link.account_id)) map.set(link.account_id, []);
    map.get(link.account_id).push(link);
  }
  return map;
}

// ---------------------------------------------------------------- membership

export function occupiedMembers(members) {
  return (Array.isArray(members) ? members : []).filter((member) =>
    OCCUPIED_STATUSES.includes(member?.status || "pending")
  );
}

export function primaryMember(members) {
  const occupied = occupiedMembers(members);
  return occupied.find((member) => member.is_account_admin === true) || occupied[0] || null;
}

export function resolveSoundProofAccess(account, members) {
  if (account?.status === "suspended") return { label: "Suspended", tone: "danger" };
  const occupied = occupiedMembers(members);
  if (occupied.length === 0) return { label: "No users", tone: "muted" };
  const active = occupied.filter((member) => (member.status || "pending") === "active").length;
  const pending = occupied.length - active;
  if (active === 0) return { label: `Pending invite · ${occupied.length}`, tone: "warn" };
  return {
    label: pending > 0 ? `Active · ${active} (+${pending} pending)` : `Active · ${active} user${active !== 1 ? "s" : ""}`,
    tone: "ok",
  };
}

// ---------------------------------------------------------------- credits

/**
 * Credit picture for one account, derived from the existing CapacityLedger.
 * "available" is the canonical SUM(delta) — the same number every consumer uses.
 */
export function buildCreditDetail(entries) {
  const base = aggregateCapacityBreakdown(entries);
  let reversed = 0;
  let distributor = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const delta = Number(entry?.delta);
    const value = Number.isFinite(delta) ? delta : 0;
    if (entry?.transaction_type === "REVERSAL") reversed += value;
    else if (entry?.transaction_type === "DISTRIBUTOR_ALLOCATION"
      || entry?.transaction_type === "DISTRIBUTOR_RECLAIM") distributor += value;
  }
  return {
    rewarded: base.rewarded,
    purchased: base.purchased,
    manual: base.adminGranted,
    promotional: base.promotional,
    trial: base.trial,
    internal: base.internal,
    distributor,
    used: base.consumed,
    reversed,
    available: base.remaining,
  };
}

/**
 * Build the append-only CapacityLedger entry for an admin credit grant.
 * Pure — the caller performs the write.
 */
export function buildAdminGrantEntry({ accountId, credits, reason, actor }) {
  const amount = Math.round(Number(credits));
  return {
    account_id: accountId,
    transaction_type: "ADMIN_GRANT",
    delta: amount,
    idempotency_key: `admin_grant:${accountId}:${uniqueSuffix()}`,
    source_system: "ADMIN_PANEL",
    reason: String(reason || "").trim(),
    source_ref: {
      granted_by_user_id: actor?.id || null,
      granted_by_email: actor?.email || null,
      granted_at: new Date().toISOString(),
    },
  };
}

function uniqueSuffix() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the time-based suffix
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------- diagnostics

/**
 * Missing relationships are surfaced as states rather than hidden.
 * Tones: warn = needs attention, muted = informational.
 */
export function buildAccountDiagnostics({ members, users, portalIdentities, links, projectCount }) {
  const occupied = occupiedMembers(members);
  const diagnostics = [];

  if (occupied.length === 0) {
    diagnostics.push({ label: "No users", tone: "muted" });
  } else {
    if (occupied.some((member) => (member.status || "pending") === "pending")) {
      diagnostics.push({ label: "Membership pending", tone: "warn" });
    }
    if (occupied.some((member) => !member.user_id)) {
      diagnostics.push({ label: "Base44 user not associated", tone: "warn" });
    }
  }

  const stampedUsers = Array.isArray(users) ? users : [];
  if (stampedUsers.length > 0
    && stampedUsers.every((user) => !user.dealer_account_id && !user.dealer_name)) {
    diagnostics.push({ label: "Dealer fields missing", tone: "warn" });
  }

  if ((Array.isArray(portalIdentities) ? portalIdentities.length : 0) === 0) {
    diagnostics.push({ label: "Portal identity missing", tone: "muted" });
  }
  if ((Array.isArray(links) ? links.length : 0) === 0) {
    diagnostics.push({ label: "No Partner Portal link", tone: "muted" });
  }
  if (!projectCount) diagnostics.push({ label: "No projects yet", tone: "muted" });

  return diagnostics;
}

// ---------------------------------------------------------------- rows

/**
 * Assemble one display row per account from the pre-fetched record sets.
 */
export function buildAccessRows({
  accounts,
  membersByAccount,
  usersByAccount,
  portalIdentitiesByAccount,
  linksByAccount,
  projectsByAccount,
  ledgerByAccount,
  auditsByAccount,
  turnoverMap,
  promoByAccount,
}) {
  const rows = [];
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const members = membersByAccount?.get(account.id) || [];
    const users = usersByAccount?.get(account.id) || [];
    const portalIdentities = portalIdentitiesByAccount?.get(account.id) || [];
    const links = linksByAccount?.get(account.id) || [];
    const projects = projectsByAccount?.get(account.id) || [];
    const ledgerEntries = ledgerByAccount?.get(account.id) || [];
    const admin = primaryMember(members);

    rows.push({
      account,
      group: groupKeyForAccount(account),
      members,
      users,
      portalIdentities,
      links,
      projects,
      audits: auditsByAccount?.get(account.id) || [],
      ledgerEntries,
      seatsUsed: occupiedMembers(members).length,
      seatsMaximum: MAX_ACCOUNT_SEATS,
      turnover: turnoverMap?.get(account.id) ?? null,
      lastLogin: account.last_access_at || null,
      credits: buildCreditDetail(ledgerEntries),
      projectCount: projects.length,
      promoProjects: promoByAccount?.get(account.id) || 0,
      primaryEmail: admin?.email || account.contact_email || null,
      access: resolveSoundProofAccess(account, members),
      diagnostics: buildAccountDiagnostics({
        members,
        users,
        portalIdentities,
        links,
        projectCount: projects.length,
      }),
    });
  }

  rows.sort((a, b) => String(a.account.name || "").localeCompare(String(b.account.name || "")));
  return rows;
}

// ---------------------------------------------------------------- filters

export function applyAccessFilters(rows, filters) {
  const query = String(filters?.search || "").trim().toLowerCase();
  const group = filters?.group || "all";
  const status = filters?.status || "all";
  const credits = filters?.credits || "all";
  const users = filters?.users || "all";
  const projects = filters?.projects || "all";

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (group !== "all" && row.group !== group) return false;
    if (status !== "all" && (row.account.status || "") !== status) return false;

    if (credits === "available" && !(row.credits.available > 0)) return false;
    if (credits === "none" && row.credits.available > 0) return false;
    if (credits === "used" && !(row.credits.used > 0)) return false;

    if (users === "has" && row.seatsUsed === 0) return false;
    if (users === "none" && row.seatsUsed > 0) return false;

    if (projects === "has" && row.projectCount === 0) return false;
    if (projects === "none" && row.projectCount > 0) return false;

    if (query) {
      const memberText = row.members
        .map((member) => `${member.email || ""} ${member.full_name || ""}`)
        .join(" ");
      const haystack = [row.account.name, row.account.contact_email, row.primaryEmail, memberText]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------- formatting

export function formatGBP(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number(value));
  } catch {
    return "—";
  }
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDelta(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount > 0 ? `+${amount}` : String(amount);
}

export function accountTypeLabel(account) {
  const type = account?.account_type;
  if (!type) return "—";
  return type.charAt(0).toUpperCase() + type.slice(1);
}