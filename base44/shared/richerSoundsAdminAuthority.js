/**
 * richerSoundsAdminAuthority.js (shared)
 * -------------------------------------
 * Server-side authority and read assembly for Richer Sounds delegated
 * administration. Imported by the readRicherSoundsAdmin,
 * transferRicherSoundsCredits and manageRicherSoundsOnboarding backend
 * functions.
 *
 * No new authentication system. Authority is resolved from the existing
 * resolveAccountAccess context plus a dynamic identification of the Custom
 * Install - 93 master account (the RICHER_SOUNDS account whose active Partner
 * Portal link carries trading number "93" with a stamped
 * portal_dealer_account_id). The richerSoundsAdmin capability is injected by
 * resolveAccountAccess for active members of that account.
 *
 * All cross-branch reads go through the service role and are filtered to
 * accounts with dealer_group = RICHER_SOUNDS. Branch isolation for normal
 * dealer users is unchanged: they never reach this authority.
 */

import { resolveAccountAccess } from './accountAccessAuthority.js';

export const RICHER_SOUNDS_DEALER_GROUP = 'RICHER_SOUNDS';
export const RICHER_SOUNDS_MASTER_TRADING_NUMBER = '93';
export const PORTAL_SOURCE_SYSTEM = 'ARTCOUSTIC_PARTNER_PORTAL';

const OCCUPIED_STATUSES = new Set(['pending', 'active']);

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function uuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

/**
 * Resolve the Custom Install - 93 master account dynamically.
 * Returns { account, link, accountId } or null. Uses one batched $in query for
 * accounts and one for portal links, not per-account calls.
 */
export async function resolveRicherSoundsMasterAccount(service) {
  const accounts = await service.entities.Account.filter(
    { dealer_group: RICHER_SOUNDS_DEALER_GROUP },
    'name',
    200,
  );
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const accountIds = accounts.map((a) => a.id);
  const links = await fetchAll(
    service,
    'ExternalAccountLink',
    { account_id: { $in: accountIds }, source_system: PORTAL_SOURCE_SYSTEM },
    'created_date',
    500,
  );
  const linksByAccount = groupByAccount(links);
  for (const account of accounts) {
    const accountLinks = linksByAccount.get(account.id) || [];
    const masterLink = accountLinks.find((link) =>
      link?.active !== false
      && String(link?.external_account_number || '').trim() === RICHER_SOUNDS_MASTER_TRADING_NUMBER
      && Boolean(String(link?.portal_dealer_account_id || '').trim()),
    );
    if (masterLink) {
      return { account, link: masterLink, accountId: account.id };
    }
  }
  return null;
}

/**
 * Resolve the delegated-admin context for the authenticated user.
 *
 * Returns:
 *   { allowed: true, isMasterAdmin, actorUser, actorAccountId, masterAccountId, masterAccount }
 *   { allowed: false, reason }
 *
 * Master admins (Paul) are allowed globally. Active members of the 93 account
 * are allowed via the richerSoundsAdmin capability. Everyone else is rejected.
 */
export async function resolveRicherSoundsAdminContext(base44, sessionUser) {
  if (!sessionUser?.id) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }
  const context = await resolveAccountAccess(base44, sessionUser);
  const service = base44.asServiceRole;
  const master = await resolveRicherSoundsMasterAccount(service);

  if (context.isMasterAdmin) {
    return {
      allowed: true,
      isMasterAdmin: true,
      actorUser: context.user,
      actorAccountId: context.user?.account_id || null,
      masterAccountId: master?.accountId || null,
      masterAccount: master?.account || null,
    };
  }

  if (!context.allowed) {
    return { allowed: false, reason: context.reason || 'FORBIDDEN' };
  }

  if (context.capabilities?.richerSoundsAdmin !== true) {
    return { allowed: false, reason: 'NOT_RICHER_SOUNDS_ADMIN' };
  }

  // The richerSoundsAdmin capability is set only for the 93 master account's
  // active members, so context.account is 93. Confirm against the resolved
  // master to defend against any future flag drift.
  if (master && context.account?.id && master.accountId !== context.account.id) {
    return { allowed: false, reason: 'MASTER_ACCOUNT_MISMATCH' };
  }

  return {
    allowed: true,
    isMasterAdmin: false,
    actorUser: context.user,
    actorAccountId: context.account?.id || null,
    masterAccountId: master?.accountId || context.account?.id || null,
    masterAccount: master?.account || context.account || null,
  };
}

// --------------------------------------------------------------- access state

function soundproofEligibilityState(account) {
  const isEligible = account?.soundproof_eligible === true;
  return { label: isEligible ? 'Approved' : 'Not Approved', tone: isEligible ? 'ok' : 'muted' };
}

function soundproofActivationState(account, members) {
  if (account?.status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  const expiry = account?.soundproof_access_expires_at;
  if (expiry && (account?.status === 'active' || account?.status === 'trial')) {
    if (new Date(expiry).getTime() < Date.now()) return { label: 'Expired', tone: 'warn' };
  }
  if (account?.status === 'inactive') return { label: 'Not Activated', tone: 'muted' };
  const occupied = occupiedMembers(members);
  if (occupied.length === 0) return { label: 'Not Activated', tone: 'muted' };
  const hasActiveMember = occupied.some((m) => (m.status || 'pending') === 'active');
  if (!hasActiveMember) return { label: 'Invitation Pending', tone: 'warn' };
  return { label: 'Active', tone: 'ok' };
}

function occupiedMembers(members) {
  return (Array.isArray(members) ? members : []).filter((m) =>
    OCCUPIED_STATUSES.has(m?.status || 'pending'),
  );
}

function primaryMember(members) {
  const occupied = occupiedMembers(members);
  return occupied.find((m) => m.is_account_admin === true) || occupied[0] || null;
}

function daysUntilExpiry(account) {
  const expiry = account?.soundproof_access_expires_at;
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function buildActivationPill(account, members) {
  const base = soundproofActivationState(account, members);
  if (base.label === 'Active') {
    const days = daysUntilExpiry(account);
    if (days === null) return base;
    return { label: `${base.label} · ${days}d left`, tone: days <= 14 ? 'warn' : base.tone };
  }
  return base;
}

function resolveLastActivity(projects, audits, lastAccessAt) {
  let best = null;
  for (const project of Array.isArray(projects) ? projects : []) {
    for (const key of ['updated_date', 'created_date']) {
      const v = project?.[key];
      if (!v) continue;
      const ms = new Date(v).getTime();
      if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
    }
  }
  const useful = new Set([
    'USER_LOGIN_RECORDED', 'INVITATION_ACCEPTED', 'SOUNDPROOF_ENABLE',
    'SOUNDPROOF_RENEWED', 'ACCESS_CHANGED', 'INVITED', 'INVITATION_RESENT',
  ]);
  for (const audit of Array.isArray(audits) ? audits : []) {
    if (!useful.has(audit?.action)) continue;
    const v = audit?.occurred_at;
    if (!v) continue;
    const ms = new Date(v).getTime();
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  if (lastAccessAt) {
    const ms = new Date(lastAccessAt).getTime();
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  return best;
}

function sumAvailable(entries) {
  let total = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const delta = Number(entry?.delta);
    if (Number.isFinite(delta)) total += delta;
  }
  return total;
}

function buildCreditDetail(entries) {
  let available = 0;
  let used = 0;
  let rewarded = 0;
  let purchased = 0;
  let manual = 0;
  let promotional = 0;
  let trial = 0;
  let internal = 0;
  let distributor = 0;
  let rsTransferred = 0;
  let reversed = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const delta = Number.isFinite(Number(entry?.delta)) ? Number(entry.delta) : 0;
    const type = entry?.transaction_type;
    if (type === 'REVERSAL') { reversed += delta; continue; }
    available += delta;
    if (type === 'PROJECT_ACTIVATION') used += Math.abs(delta);
    else if (type === 'UK_TURNOVER_REWARD') rewarded += delta;
    else if (type === 'PURCHASED') purchased += delta;
    else if (type === 'ADMIN_GRANT') manual += delta;
    else if (type === 'PROMOTIONAL') promotional += delta;
    else if (type === 'TRIAL') trial += delta;
    else if (type === 'INTERNAL') internal += delta;
    else if (type === 'DISTRIBUTOR_ALLOCATION' || type === 'DISTRIBUTOR_RECLAIM') distributor += delta;
    else if (type === 'RICHER_SOUNDS_TRANSFER') rsTransferred += delta;
  }
  return {
    available, used, rewarded, purchased, manual, promotional,
    trial, internal, distributor, rsTransferred, reversed,
  };
}

function mappingStatusForAccount(accountId, links, masterAccountId) {
  if (accountId === masterAccountId) return 'verified';
  const active = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);
  const verified = active.find((l) =>
    l?.source_system === PORTAL_SOURCE_SYSTEM
    && Boolean(String(l?.portal_dealer_account_id || '').trim())
    && !uuidLike(String(l?.external_account_number || '')),
  );
  return verified ? 'verified' : 'unresolved';
}

function tradingNumberForAccount(links, isMaster) {
  if (isMaster) return RICHER_SOUNDS_MASTER_TRADING_NUMBER;
  const active = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);
  const link = active.find((l) =>
    l?.source_system === PORTAL_SOURCE_SYSTEM
    && Boolean(String(l?.portal_dealer_account_id || '').trim())
    && !uuidLike(String(l?.external_account_number || '')),
  );
  return link ? String(link.external_account_number).trim() : null;
}

/**
 * Paginate an entity filter call (page form) until all matching records are
 * gathered. Bounds the total to maxRecords to protect memory and rate limits.
 */
async function fetchAll(service, entityName, query, sort, maxRecords = 2000) {
  const records = [];
  let cursor = undefined;
  for (let page = 0; page < 20; page += 1) {
    const options = { sort, limit: 500 };
    if (cursor) options.cursor = cursor;
    const result = await service.entities[entityName].filter(query, options);
    const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
    records.push(...items);
    if (!result?.has_more || records.length >= maxRecords) break;
    cursor = result.next_cursor;
  }
  return records;
}

function groupByAccount(records) {
  const map = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = record?.account_id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(record);
  }
  return map;
}

/**
 * Assemble the full read payload for the Richer Sounds admin page.
 * Reads only RICHER_SOUNDS accounts and their related records, via service
 * role. Uses batched $in queries (one per entity type, paginated) rather than
 * per-account calls, so a 53-account estate costs ~7 entity reads not ~320.
 */
export async function assembleRicherSoundsAdminData(service, masterAccountId) {
  const accounts = await service.entities.Account.filter(
    { dealer_group: RICHER_SOUNDS_DEALER_GROUP },
    'name',
    200,
  );
  const accountList = Array.isArray(accounts) ? accounts : [];
  const accountIds = accountList.map((a) => a.id);
  if (accountIds.length === 0) {
    return { masterAccount: null, accounts: [], transfers: [], activity: [], unresolvedMappingCount: 0 };
  }

  const inQuery = { account_id: { $in: accountIds } };
  // The User entity does not support batched filter, and the RS page draws its
  // user list from AccountMembership, so users are not fetched here.
  const [
    membershipsAll, linksAll, projectsAll, auditsAll, ledgerAll, transfersAll,
  ] = await Promise.all([
    fetchAll(service, 'AccountMembership', inQuery, 'created_date', 1000),
    fetchAll(service, 'ExternalAccountLink', inQuery, 'created_date', 500),
    fetchAll(service, 'Project', inQuery, 'updated_date', 1000),
    fetchAll(service, 'AccountUserAudit', inQuery, 'occurred_at', 1500),
    fetchAll(service, 'CapacityLedger', inQuery, 'created_date', 3000),
    fetchAll(service, 'CreditTransfer', { direction: 'forward' }, 'created_date', 500),
  ]);

  const membersByAccount = groupByAccount(membershipsAll);
  const linksByAccount = groupByAccount(linksAll);
  const projectsByAccount = groupByAccount(projectsAll);
  const auditsByAccount = groupByAccount(auditsAll);
  const ledgerByAccount = groupByAccount(ledgerAll);

  const rows = [];
  for (let i = 0; i < accountList.length; i += 1) {
    const account = accountList[i];
    const members = membersByAccount.get(account.id) || [];
    const links = linksByAccount.get(account.id) || [];
    const projects = projectsByAccount.get(account.id) || [];
    const audits = auditsByAccount.get(account.id) || [];
    const ledger = ledgerByAccount.get(account.id) || [];
    const isMaster = account.id === masterAccountId;
    const admin = primaryMember(members);
    const mappingStatus = mappingStatusForAccount(account.id, links, masterAccountId);
    rows.push({
      account,
      isMaster,
      tradingNumber: tradingNumberForAccount(links, isMaster),
      portalDealerAccountId: links.find((l) => l?.active !== false && l?.portal_dealer_account_id)?.portal_dealer_account_id || null,
      portalUserId: links.find((l) => l?.active !== false && l?.partner_user_id)?.partner_user_id || null,
      mappingStatus,
      eligibilityState: soundproofEligibilityState(account),
      activationState: soundproofActivationState(account, members),
      activationPill: buildActivationPill(account, members),
      seatsUsed: occupiedMembers(members).length,
      seatsMaximum: 5,
      credits: buildCreditDetail(ledger),
      projectCount: projects.length,
      lastActivity: resolveLastActivity(projects, audits, account.last_access_at || null),
      primaryEmail: admin?.email || account.contact_email || null,
      members: members.map((m) => ({
        id: m.id,
        email: normaliseEmail(m.email),
        full_name: m.full_name || null,
        is_account_admin: m.is_account_admin === true,
        status: m.status || 'pending',
        access_level: m.access_level || 'FULL_ACCESS',
      })),
      projects: projects.map((p) => ({
        id: p.id, name: p.name, client_name: p.client_name || null,
        project_status: p.project_status || null, lifecycle_status: p.lifecycle_status || null,
        updated_date: p.updated_date || p.created_date || null,
        commercial_tier: p.commercial_tier || null, commercial_source: p.commercial_source || null,
      })),
      audits: audits.slice(0, 12).map((a) => ({
        action: a.action, occurred_at: a.occurred_at,
        actor_email: a.actor_email || null, target_email: a.target_email || null,
      })),
    });
  }

  rows.sort((a, b) => {
    if (a.isMaster && !b.isMaster) return -1;
    if (!a.isMaster && b.isMaster) return 1;
    return String(a.account.name || '').localeCompare(String(b.account.name || ''));
  });

  const transfers = (Array.isArray(transfersAll) ? transfersAll : []).map((t) => ({
    transfer_id: t.transfer_id,
    direction: t.direction,
    source_account_id: t.source_account_id,
    source_account_name: t.source_account_name,
    destination_account_id: t.destination_account_id,
    destination_account_name: t.destination_account_name,
    amount: t.amount,
    actor_email: t.actor_email,
    actor_is_master_admin: t.actor_is_master_admin === true,
    created_at: t.created_at,
    completed_at: t.completed_at || null,
    state: t.state,
    note: t.note || null,
    reversal_of: t.reversal_of || null,
  }));

  // Activity feed: recent audited events + transfers across Richer Sounds.
  const activity = [];
  for (const row of rows) {
    for (const audit of row.audits) {
      activity.push({
        occurred_at: audit.occurred_at,
        account_name: row.account.name,
        action: auditActionLabel(audit.action),
        detail: audit.target_email ? `to ${audit.target_email}` : '',
        sort: new Date(audit.occurred_at).getTime() || 0,
      });
    }
  }
  for (const t of transfers) {
    activity.push({
      occurred_at: t.created_at,
      account_name: t.source_account_name,
      action: 'credit transferred',
      detail: `${t.amount} to ${t.destination_account_name}`,
      sort: new Date(t.created_at).getTime() || 0,
    });
  }
  // Project creations from ledger PROJECT_ACTIVATION entries.
  for (let i = 0; i < accountList.length; i += 1) {
    const ledger = ledgerByAccount.get(accountList[i].id) || [];
    for (const entry of ledger) {
      if (entry?.transaction_type === 'PROJECT_ACTIVATION') {
        activity.push({
          occurred_at: entry.created_date,
          account_name: accountList[i].name,
          action: 'credit used',
          detail: 'Project activation',
          sort: new Date(entry.created_date || entry.created_at).getTime() || 0,
        });
      }
    }
  }
  activity.sort((a, b) => b.sort - a.sort);

  const masterRow = rows.find((r) => r.isMaster) || null;
  return {
    masterAccount: masterRow,
    accounts: rows,
    transfers,
    activity: activity.slice(0, 50),
    unresolvedMappingCount: rows.filter((r) => !r.isMaster && r.mappingStatus === 'unresolved').length,
  };
}

function auditActionLabel(action) {
  const map = {
    SOUNDPROOF_ENABLE: 'account activated',
    SOUNDPROOF_SUSPEND: 'account suspended',
    SOUNDPROOF_RESTORE: 'account restored',
    SOUNDPROOF_ELIGIBILITY_SET: 'eligibility set',
    SOUNDPROOF_RENEWED: 'access renewed',
    INVITED: 'user invited',
    INVITATION_RESENT: 'invitation resent',
    INVITATION_ACCEPTED: 'invitation accepted',
    USER_LOGIN_RECORDED: 'user login',
    ACCESS_CHANGED: 'access changed',
    PORTAL_IDENTITY_CLAIMED: 'portal identity claimed',
    SOUNDPROOF_TERM_STARTED: 'access term started',
  };
  return map[action] || action || 'event';
}