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
import { buildTurnoverSnapshotMap } from "./commercialOverview";
import {
  resolveEffectivePromotion,
  derivePromotionStatus,
  countPromoProjectsForAccount,
  countProjectsCreatedTotal,
} from "./promotionEntitlementOverview";
import {
  resolveRicherSoundsMasterAccountId,
  rsApprovalState,
  isRicherSoundsCentralAdministrator,
} from "./rsApproval";

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
  promotion: "all",
  activity: "all",
  followUp: "all",
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

// --------------------------------------------------------------- access state

/**
 * Combined access label for table, summary and filter use.
 * Mirrors the logic that lived in AccountAccessTable so the page-level
 * summary and the activity filter see the same "Active / Not Activated /
 * Suspended" picture the table shows.
 */
export function combinedAccessState(account, members) {
  if (account?.status === "suspended") return { label: "Suspended", tone: "danger" };
  if (account?.status === "inactive") return { label: "Not Activated", tone: "muted" };
  const occupied = occupiedMembers(members);
  if (occupied.length === 0) return { label: "Not Activated", tone: "muted" };
  const pendingOnly = occupied.every((m) => (m.status || "pending") === "pending");
  if (pendingOnly) return { label: "Not Activated", tone: "warn" };
  return { label: "Active", tone: "ok" };
}

/**
 * Sound Proof eligibility for the account-access table.
 * Derived solely from the existing Account.soundproof_eligible flag set by
 * manageSoundProofAccess. "Approved" = admin has approved the dealer to join
 * Sound Proof; "Not Approved" = not yet approved. Eligibility never starts the
 * 90-day term, activates the account, or sends an invitation.
 */
export function soundproofEligibilityState(account) {
  const isEligible = account?.soundproof_eligible === true;
  return {
    label: isEligible ? "Approved" : "Not Approved",
    tone: isEligible ? "ok" : "muted",
  };
}

/**
 * Sound Proof activation state for the account-access table. A finer-grained
 * view than combinedAccessState: distinguishes Invitation Pending (invited but
 * no acceptance yet) and Expired (past access expiry) from Not Activated and
 * Active, so an approved-but-not-activated dealer reads distinctly from one
 * that is already live. Uses only existing Account fields and membership
 * status — no new database flags.
 */
export function soundproofActivationState(account, members) {
  if (account?.status === "suspended") return { label: "Suspended", tone: "danger" };
  const expiry = account?.soundproof_access_expires_at;
  if (expiry && (account?.status === "active" || account?.status === "trial")) {
    if (new Date(expiry).getTime() < Date.now()) return { label: "Expired", tone: "warn" };
  }
  if (account?.status === "inactive") return { label: "Not Activated", tone: "muted" };
  // status active or trial, not expired — distinguish by membership state.
  const occupied = occupiedMembers(members);
  if (occupied.length === 0) return { label: "Not Activated", tone: "muted" };
  const hasActiveMember = occupied.some((m) => (m.status || "pending") === "active");
  if (!hasActiveMember) return { label: "Invitation Pending", tone: "warn" };
  return { label: "Active", tone: "ok" };
}

// ---------------------------------------------------------------- access timing

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The date eligibility was granted in its current eligible state, read from the
 * existing SOUNDPROOF_ELIGIBILITY_SET audit trail. No historical date is ever
 * invented: if no audit record exists, this returns null and the surface shows
 * "Not Started". Only audited eligibility grants produce a countdown.
 */
export function eligibilityGrantedAt(audits, currentlyEligible) {
  if (!currentlyEligible) return null;
  const eligAudits = (Array.isArray(audits) ? audits : [])
    .filter((a) => a?.action === "SOUNDPROOF_ELIGIBILITY_SET")
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const granted = eligAudits.find(
    (a) => a?.after_access_level === "eligible" || a?.details?.new_eligible === true
  );
  return granted?.occurred_at || null;
}

/**
 * Whole days remaining until the access expiry, for activated dealers.
 * Returns null when there is no expiry. May be negative once the term has
 * passed (the activation state already reads "Expired" in that case).
 */
export function daysUntilExpiry(account) {
  const expiry = account?.soundproof_access_expires_at;
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / MS_PER_DAY);
}

/**
 * Whole days since eligibility was granted, for approved dealers who have not
 * yet activated. Returns null when no audited grant date exists (the surface
 * shows no counter — a historical date is never invented), and null for
 * dealers who are already active, suspended or expired.
 */
export function daysAwaitingActivation({ activationLabel, eligible, grantedAt }) {
  if (!eligible) return null;
  if (!["Not Activated", "Invitation Pending"].includes(activationLabel)) return null;
  if (!grantedAt) return null;
  const ms = Date.now() - new Date(grantedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * The most recent audit occurrence_at for a given action, or null. Used to
 * date the current suspension from the SOUNDPROOF_SUSPEND audit trail. A
 * historical date is never invented: no audit means no counter.
 */
export function mostRecentAuditDate(audits, action) {
  const matches = (Array.isArray(audits) ? audits : [])
    .filter((a) => a?.action === action)
    .map((a) => a?.occurred_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return matches[0] || null;
}

function wholeDaysSince(date) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Activation pill with the relevant countdown baked into the label, for the
 * account-access table. Keeps eligibility as a separate pill.
 *   Active             → "Active · Xd left" (warn within 14 days)
 *   Not Activated      → "Not Activated · Xd waiting" (only when approved)
 *   Invitation Pending → "Invitation Pending · Xd waiting"
 *   Expired            → "Expired · Xd ago"
 *   Suspended          → "Suspended · Xd suspended" (when a suspension audit exists)
 * No historical date is ever invented: where no audited date exists the pill
 * shows the base state alone.
 */
export function buildActivationPill(account, members, audits) {
  const base = soundproofActivationState(account, members);
  const label = base.label;
  const tone = base.tone;

  if (label === "Active") {
    const days = daysUntilExpiry(account);
    if (days === null) return { label, tone };
    return { label: `${label} · ${days}d left`, tone: days <= 14 ? "warn" : tone };
  }
  if (label === "Expired") {
    const ago = wholeDaysSince(account?.soundproof_access_expires_at);
    return ago !== null ? { label: `${label} · ${ago}d ago`, tone } : { label, tone };
  }
  if (label === "Suspended") {
    const suspendedAt = mostRecentAuditDate(audits, "SOUNDPROOF_SUSPEND");
    const ago = wholeDaysSince(suspendedAt);
    return ago !== null ? { label: `${label} · ${ago}d suspended`, tone } : { label, tone };
  }
  if (label === "Not Activated" || label === "Invitation Pending") {
    const eligible = account?.soundproof_eligible === true;
    if (!eligible) return { label, tone };
    const grantedAt = eligibilityGrantedAt(audits, true);
    const days = daysAwaitingActivation({ activationLabel: label, eligible, grantedAt });
    return days !== null
      ? { label: `${label} · ${days}d waiting`, tone }
      : { label, tone };
  }
  return { label, tone };
}

/**
 * Last reliable account activity — the latest of project creates/updates,
 * account-use audit events and the account's last_access_at. A turnover sync
 * timestamp is deliberately never used: it is not genuine account activity.
 */
export function resolveLastActivity(projects, audits, lastAccessAt) {
  let best = null;
  for (const project of Array.isArray(projects) ? projects : []) {
    for (const key of ["updated_date", "created_date"]) {
      const v = project?.[key];
      if (!v) continue;
      const ms = new Date(v).getTime();
      if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
    }
  }
  const USEFUL_AUDIT_ACTIONS = new Set([
    "USER_LOGIN_RECORDED",
    "INVITATION_ACCEPTED",
    "SOUNDPROOF_ENABLE",
    "SOUNDPROOF_RENEWED",
    "ACCESS_CHANGED",
    "INVITED",
    "INVITATION_RESENT",
  ]);
  for (const audit of Array.isArray(audits) ? audits : []) {
    if (!USEFUL_AUDIT_ACTIONS.has(audit?.action)) continue;
    const v = audit?.occurred_at;
    if (!v) continue;
    const ms = new Date(v).getTime();
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  if (lastAccessAt) {
    const ms = new Date(lastAccessAt).getTime();
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  return best; // ms epoch, or null
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
  turnoverSnapshotMap,
  promoByAccount,
  promotionsByAccount,
  promoUsageByAccountAndPromo,
}) {
  // RS-01: resolve the Custom Install - 93 master account once from the
  // fetched accounts + active Partner Portal links, so every row's RS
  // approval state and central-administrator exemption share one identity.
  const rsMasterAccountId = resolveRicherSoundsMasterAccountId(accounts, linksByAccount);

  const rows = [];
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const members = membersByAccount?.get(account.id) || [];
    const users = usersByAccount?.get(account.id) || [];
    const portalIdentities = portalIdentitiesByAccount?.get(account.id) || [];
    const links = linksByAccount?.get(account.id) || [];
    const projects = projectsByAccount?.get(account.id) || [];
    const ledgerEntries = ledgerByAccount?.get(account.id) || [];
    const admin = primaryMember(members);

    const allPromotionsForAccount = promotionsByAccount?.get(account.id) || [];
    const effectivePromotion = resolveEffectivePromotion(allPromotionsForAccount);
    const promoUsageByPromo = promoUsageByAccountAndPromo?.get(account.id) || new Map();
    const promoProjectsTotal = countPromoProjectsForAccount(
      promoUsageByAccountAndPromo, account.id
    );
    const promoStatus = derivePromotionStatus(
      effectivePromotion, allPromotionsForAccount
    );

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
      promotion: {
        effective: effectivePromotion,
        status: promoStatus.label,
        tone: promoStatus.tone,
        expiryDisplay: promoStatus.expiryDisplay,
        all: allPromotionsForAccount,
      },
      promoUsageByPromo,
      promoProjectsTotal,
      projectsCreatedTotal: countProjectsCreatedTotal(ledgerEntries, promoProjectsTotal),
      turnover: (() => {
        const snap = turnoverSnapshotMap?.get(account.id);
        if (snap) return snap.value;
        return turnoverMap?.get(account.id) ?? null;
      })(),
      turnoverSourceUpdatedAt: (() => {
        const snap = turnoverSnapshotMap?.get(account.id);
        return snap ? snap.source_last_updated : null;
      })(),
      turnoverTimestampKnown: (() => {
        const snap = turnoverSnapshotMap?.get(account.id);
        return snap ? snap.timestamp_known : null;
      })(),
      lastLogin: account.last_access_at || null,
      lastActivity: resolveLastActivity(projects, auditsByAccount?.get(account.id) || [], account.last_access_at || null),
      accessState: combinedAccessState(account, members),
      eligibilityState: soundproofEligibilityState(account),
      activationState: soundproofActivationState(account, members),
      activationPill: buildActivationPill(account, members, auditsByAccount?.get(account.id) || []),
      rsMasterAccountId,
      isRsCentralAdmin: isRicherSoundsCentralAdministrator(account.id, rsMasterAccountId),
      rsApprovalState: rsApprovalState(account, rsMasterAccountId),
      daysRemaining: daysUntilExpiry(account),
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
  const promotion = filters?.promotion || "all";
  const activity = filters?.activity || "all";
  const followUp = filters?.followUp || "all";

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (group !== "all" && row.group !== group) return false;
    if (status !== "all" && (row.account.status || "") !== status) return false;

    // Follow-up quick-filter — surfaces dealers needing attention across the
    // eligibility/activation lifecycle. Uses the base activation label (without
    // the countdown) so the filter is stable regardless of the pill counter.
    const activationLabel = row.activationState?.label || "";
    if (followUp === "approved_awaiting") {
      if (!(row.eligibilityState?.label === "Approved" && activationLabel === "Not Activated")) return false;
    } else if (followUp === "invitation_pending") {
      if (activationLabel !== "Invitation Pending") return false;
    } else if (followUp === "expiring_14") {
      if (!(activationLabel === "Active" && row.daysRemaining !== null && row.daysRemaining >= 0 && row.daysRemaining <= 14)) return false;
    } else if (followUp === "expired") {
      if (activationLabel !== "Expired") return false;
    } else if (followUp === "suspended") {
      if (activationLabel !== "Suspended") return false;
    }

    if (credits === "available" && !(row.credits.available > 0)) return false;
    if (credits === "none" && row.credits.available > 0) return false;
    if (credits === "used" && !(row.credits.used > 0)) return false;

    if (users === "has" && row.seatsUsed === 0) return false;
    if (users === "none" && row.seatsUsed > 0) return false;

    if (projects === "has" && row.projectCount === 0) return false;
    if (projects === "none" && row.projectCount > 0) return false;

    if (promotion === "active" && row.promotion?.status !== "Unlimited Active" && row.promotion?.status !== "Expires Soon") return false;
    if (promotion === "expires_soon" && row.promotion?.status !== "Expires Soon") return false;
    if (promotion === "none" && row.promotion?.status !== "None") return false;

    // Activity quick-filter — a single dimension over the same derived row data.
    if (activity === "active" && row.accessState?.label !== "Active") return false;
    if (activity === "not_activated" && row.accessState?.label !== "Not Activated") return false;
    if (activity === "credits_no_projects" && !(row.credits.available > 0 && row.projectCount === 0)) return false;
    if (activity === "has_projects" && !(row.projectCount > 0)) return false;
    if (activity === "unlimited_promo" && row.promotion?.status !== "Unlimited Active" && row.promotion?.status !== "Expires Soon") return false;

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

// ---------------------------------------------------------------- summary

/**
 * Concise top-summary indicators over the full (unfiltered) row set.
 * Each count is derived from the same row fields the table and filters use,
 * so the indicators never diverge from the visible rows.
 */
export function buildAccessSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let activeAccess = 0;
  let unusedCreditsNoProjects = 0;
  let withProjectActivity = 0;
  let activeUnlimitedPromo = 0;
  for (const row of list) {
    if (row.accessState?.label === "Active") activeAccess += 1;
    if (row.credits?.available > 0 && row.projectCount === 0) unusedCreditsNoProjects += 1;
    if (row.projectCount > 0) withProjectActivity += 1;
    if (row.promotion?.status === "Unlimited Active" || row.promotion?.status === "Expires Soon") {
      activeUnlimitedPromo += 1;
    }
  }
  return { total: list.length, activeAccess, unusedCreditsNoProjects, withProjectActivity, activeUnlimitedPromo };
}