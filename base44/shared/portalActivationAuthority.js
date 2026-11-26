/**
 * portalActivationAuthority.js (shared)
 * -------------------------------------
 * The Portal-first Sound Proof activation, renewal and status authority.
 *
 * This module is the single implementation of the secure server-to-server
 * contract between the Artcoustic Partner Portal (Lovable) and Sound Proof.
 * It is used by the portalSoundProofAccess and readSoundProofAccessStatus
 * backend functions, and its term-start hook is called from
 * accountAccessAuthority.js on the first verified user claim.
 *
 * SECURITY MODEL
 * - The caller (Lovable) authenticates with a bearer token matching the
 *   PORTAL_ACTIVATION_SHARED_SECRET secret. No client-supplied account id,
 *   email, permission or identity is trusted beyond that token.
 * - The grant carries a unique request id (jti), expiry (exp), purpose,
 *   portal user/profile ids and the dealer account id. The dealer is resolved
 *   through the unique active ExternalAccountLink, never from a name or email.
 * - Replay protection: a subject-scoped jti is reserved in the append-only audit
 *   under the existing account lock, before membership, renewal or email writes.
 * - The 90-day term starts ONLY on the first verified user claim, inside
 *   accountAccessAuthority.js. Eligibility, invitation creation and email
 *   delivery never start the term.
 *
 * The existing Account, AccountMembership, AccountUserAudit and User
 * authorities are the sole access system. This module adds no second one.
 */

import { secrets } from 'base44:runtime';
import {
  ACCESS_LEVELS,
  MAX_ACCOUNT_SEATS,
  ACTIVE_SEAT_STATUSES,
  ADMIN_MEMBERSHIP_ROLES,
  normaliseEmail,
} from './accountAccessRules.js';
import { PORTAL_SOURCE, PORTAL_TARGET } from './pilotPortalConstants.js';
import { acquireCreationLock, releaseCreationLock } from './projectCreationLock.js';

const MAX_GRANT_LIFETIME_MS = 5 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const SHARED_SECRET_NAME = 'PORTAL_ACTIVATION_SHARED_SECRET';

/**
 * Verifies the bearer token against the shared secret.
 * Returns the token string on success, null on failure.
 */
export function verifyActivationBearerToken(req) {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  const expected = secrets.get(SHARED_SECRET_NAME);
  if (!expected || token !== expected) return null;
  return token;
}

/**
 * Validates and normalises an activation grant from the Portal request body.
 * Returns { ok, grant, error }.
 */
export function validateActivationGrant(body) {
  const grant = body?.grant;
  if (!grant || typeof grant !== 'object') {
    return { ok: false, error: 'GRANT_MISSING' };
  }

  const purpose = String(grant.purpose || '').toLowerCase();
  if (purpose !== 'activate' && purpose !== 'renew') {
    return { ok: false, error: 'GRANT_PURPOSE_INVALID' };
  }

  const jti = String(grant.jti || '').trim();
  if (!jti || jti.length > 200) {
    return { ok: false, error: 'GRANT_JTI_INVALID' };
  }

  const expRaw = Number(grant.exp);
  if (!Number.isFinite(expRaw) || expRaw <= 0) {
    return { ok: false, error: 'GRANT_EXP_INVALID' };
  }
  // exp is a Unix timestamp in seconds (JWT convention).
  const expMs = expRaw * 1000;
  if (expMs <= Date.now()) {
    return { ok: false, error: 'GRANT_EXPIRED' };
  }

  if (expMs > Date.now() + MAX_GRANT_LIFETIME_MS) {
    return { ok: false, error: 'GRANT_LIFETIME_EXCEEDED' };
  }

  const target = String(grant.target || '').toUpperCase();
  if (target !== PORTAL_TARGET) {
    return { ok: false, error: 'GRANT_TARGET_INVALID' };
  }

  const dealerAccountId = String(grant.dealer_account_id || '').trim();
  if (!dealerAccountId) {
    return { ok: false, error: 'GRANT_DEALER_ACCOUNT_ID_MISSING' };
  }

  const portalUserId = String(grant.portal_user_id || '').trim();
  if (!portalUserId) {
    return { ok: false, error: 'GRANT_PORTAL_USER_ID_MISSING' };
  }

  // Scope the nonce to the canonical Portal subject. With one canonical link,
  // the same request id cannot race under locks belonging to different accounts.
  if (!jti.startsWith(portalUserId + ':') || jti.length <= portalUserId.length + 1) {
    return { ok: false, error: 'GRANT_JTI_SUBJECT_MISMATCH' };
  }
  const tradingAccountNumber = String(grant.trading_account_number || '').trim() || null;

  const portalProfileId = String(grant.portal_profile_id || '').trim() || null;

  const result = {
    ok: true,
    grant: {
      purpose,
      jti,
      exp: expMs,
      target,
      dealer_account_id: dealerAccountId,
      trading_account_number: tradingAccountNumber,
      portal_user_id: portalUserId,
      portal_profile_id: portalProfileId,
    },
  };

  if (purpose === 'activate') {
    const adminEmail = normaliseEmail(grant.admin_email);
    if (!adminEmail || !adminEmail.includes('@')) {
      return { ok: false, error: 'GRANT_ADMIN_EMAIL_INVALID' };
    }
    result.grant.admin_email = adminEmail;
    result.grant.admin_full_name = String(grant.admin_full_name || '').trim().slice(0, 120) || null;
  }

  return result;
}

/**
 * Resolves the Sound Proof Account from a verified Portal dealer account id
 * through the unique active ExternalAccountLink. Rejects ambiguous, missing
 * or mismatched mappings.
 */
export async function resolveDealerAccountFromGrant(service, grant) {
  const links = await service.entities.ExternalAccountLink.filter({
    source_system: PORTAL_SOURCE,
    partner_user_id: grant.portal_user_id,
    active: true,
  });
  const activeLinks = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);

  if (activeLinks.length === 0) {
    return { ok: false, error: 'DEALER_LINK_NOT_FOUND' };
  }
  if (activeLinks.length > 1) {
    return { ok: false, error: 'DEALER_LINK_AMBIGUOUS' };
  }

  const link = activeLinks[0];
  // Verify the immutable Portal Dealer Account UUID against the link's
  // portal_dealer_account_id. For legacy imported links where the UUID was
  // stored in external_account_number, accept that as a fallback.
  const linkDealerId = String(link.portal_dealer_account_id || '').trim()
    || String(link.external_account_number || '').trim();
  if (!linkDealerId || linkDealerId !== grant.dealer_account_id) {
    return { ok: false, error: 'DEALER_IDENTITY_MISMATCH' };
  }
  // If the grant supplies a trading-account number, verify it against the
  // link's external_account_number (the commercial trading reference).
  if (grant.trading_account_number
    && String(link.external_account_number || '') !== grant.trading_account_number) {
    return { ok: false, error: 'TRADING_ACCOUNT_MISMATCH' };
  }
  const accountId = String(link.account_id || '').trim();
  if (!accountId) {
    return { ok: false, error: 'DEALER_LINK_UNRESOLVED' };
  }

  const accounts = await service.entities.Account.filter({ id: accountId });
  const account = (Array.isArray(accounts) && accounts.length > 0) ? accounts[0] : null;
  if (!account) {
    return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
  }

  return { ok: true, account, link };
}

/**
 * Reuses the existing per-account conditional lock. No timeout takeover.
 * A write with an unknown outcome deliberately retains the lock for review.
 */
async function withActivationLock(service, accountId, work) {
  const lock = await acquireCreationLock(service, accountId);
  if (!lock.acquired) return { ok: false, error: 'ACCOUNT_OPERATION_BUSY' };
  let release = true;
  // Marked by the protected callback immediately before its first write. A
  // failure before any write is a read or validation failure that never
  // started a write, so the lock is safe to release. A failure after a write
  // was attempted may have committed without a confirmed outcome, so the
  // lock is retained for review.
  let writeStarted = false;
  const ctx = { markWriteStarted: () => { writeStarted = true; } };
  try {
    const rows = await service.entities.Account.filter({ id: accountId });
    if (!Array.isArray(rows) || rows.length !== 1) return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
    return await work(rows[0], ctx);
  } catch (error) {
    if (writeStarted) release = false;
    throw error;
  } finally {
    if (release) await releaseCreationLock(service, accountId, lock.token);
  }
}

async function grantAudits(service, jti) {
  const matches = [];
  const seen = new Set();
  for (let skip = 0; ; skip += 500) {
    const page = await service.entities.AccountUserAudit.filter({ actor_user_id: 'portal' }, 'created_date', 500, skip);
    if (!Array.isArray(page)) throw new Error('ACTIVATION_AUDIT_UNAVAILABLE');
    for (const row of page) {
      if (!row.id || seen.has(row.id)) throw new Error('ACTIVATION_AUDIT_INCOMPLETE');
      seen.add(row.id);
      if (row.details?.portal_activation_request_id === jti) matches.push(row);
    }
    if (page.length < 500) return matches;
  }
}

function grantBinding(grant) {
  return {
    portal_activation_request_id: grant.jti,
    purpose: grant.purpose,
    portal_user_id: grant.portal_user_id,
    portal_profile_id: grant.portal_profile_id || null,
    dealer_account_id: grant.dealer_account_id,
    trading_account_number: grant.trading_account_number || null,
    admin_email: grant.admin_email || null,
  };
}

function sameGrant(details, grant) {
  return Object.entries(grantBinding(grant)).every(([key, value]) => details?.[key] === value);
}

async function recordGrant(service, account, grant, details) {
  return service.entities.AccountUserAudit.create({
    account_id: account.id,
    actor_user_id: 'portal',
    actor_email: 'portal:' + grant.portal_user_id,
    action: grant.purpose === 'renew' ? 'SOUNDPROOF_RENEWED' : 'PORTAL_ACTIVATION_REQUESTED',
    target_email: grant.admin_email || account.contact_email || '',
    occurred_at: new Date().toISOString(),
    details: { ...grantBinding(grant), ...details },
  });
}

async function checkGrantUnderLock(service, account, grant) {
  if (!Number.isFinite(grant.exp) || grant.exp <= Date.now()) return 'GRANT_EXPIRED';
  if (grant.exp > Date.now() + MAX_GRANT_LIFETIME_MS) return 'GRANT_LIFETIME_EXCEEDED';
  const resolution = await resolveDealerAccountFromGrant(service, grant);
  if (!resolution.ok) return resolution.error;
  if (resolution.account.id !== account.id) return 'DEALER_IDENTITY_MISMATCH';
  if (account.status === 'suspended') return 'ACCOUNT_SUSPENDED';
  if (account.soundproof_eligible !== true) return 'ACCOUNT_NOT_ELIGIBLE';
  return null;
}

export async function findExistingPortalActivation(service, jti) {
  const rows = await service.entities.AccountMembership.filter({ portal_activation_request_id: jti });
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('ACTIVATION_MEMBERSHIP_AMBIGUOUS');
  return rows[0] || null; // Removed/suspended seats still consume a grant.
}

export async function findExistingAdminSeat(service, accountId) {
  const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  return memberships.find(m => ACTIVE_SEAT_STATUSES.has(m.status || 'active')
    && (m.is_account_admin === true || ADMIN_MEMBERSHIP_ROLES.has(m.membership_role))) || null;
}

export async function createPortalActivation(service, base44, { grant, account }) {
  return withActivationLock(service, account.id, async (current, ctx) => {
    const error = await checkGrantUnderLock(service, current, grant);
    if (error) return { ok: false, error };
    const audits = await grantAudits(service, grant.jti);
    if (audits.some(a => a.account_id !== current.id || !sameGrant(a.details, grant))) return { ok: false, error: 'GRANT_REPLAY_MISMATCH' };
    const existing = await findExistingPortalActivation(service, grant.jti);
    if (existing) {
      if (existing.account_id !== current.id || normaliseEmail(existing.email) !== grant.admin_email
        || !audits.length) return { ok: false, error: 'GRANT_REPLAY_MISMATCH' };
      if (!ACTIVE_SEAT_STATUSES.has(existing.status)) return { ok: false, error: 'GRANT_ALREADY_USED' };
      return { ok: true, status: existing.status === 'active' ? 'claimed' : 'invitation_pending',
        membership: existing, replay: true, invitation_sent: false };
    }
    // A reserved request is never re-executed after a partial/unknown write.
    if (audits.length) return { ok: false, error: 'ACTIVATION_REQUIRES_REVIEW' };
    if (current.status !== 'inactive' || current.first_activated_at || current.soundproof_access_expires_at) {
      return { ok: false, error: 'ACCOUNT_ALREADY_ACTIVATED' };
    }
    const memberships = await service.entities.AccountMembership.filter({ account_id: current.id });
    const occupied = memberships.filter(m => ACTIVE_SEAT_STATUSES.has(m.status || 'active'));
    if (occupied.some(m => m.is_account_admin || ADMIN_MEMBERSHIP_ROLES.has(m.membership_role))) {
      return { ok: false, error: 'ADMIN_SEAT_ALREADY_OCCUPIED' };
    }
    if (occupied.length >= MAX_ACCOUNT_SEATS) return { ok: false, error: 'SEAT_LIMIT_REACHED' };
    const emailSeats = await service.entities.AccountMembership.filter({ email: grant.admin_email });
    if (emailSeats.some(m => ACTIVE_SEAT_STATUSES.has(m.status || 'active'))) {
      return { ok: false, error: 'EMAIL_ALREADY_ADDED' };
    }
    const users = await service.entities.User.filter({ email: grant.admin_email });
    if (users.length > 1 || users.some(u => u.role === 'admin' || u.disabled === true
      || (u.account_id && u.account_id !== current.id))) {
      return { ok: false, error: 'ADMIN_IDENTITY_CONFLICT' };
    }

    // Durable reservation precedes all side effects, including native email.
    ctx.markWriteStarted();
    await recordGrant(service, current, grant, { phase: 'reserved' });
    const membership = await service.entities.AccountMembership.create({
      email: grant.admin_email, full_name: grant.admin_full_name || null,
      account_id: current.id, membership_role: 'dealer_admin',
      access_level: ACCESS_LEVELS.FULL_ACCESS, is_account_admin: true, status: 'pending',
      invited_by_email: 'portal@artcoustic-partner-portal',
      invited_at: new Date().toISOString(), portal_activation_request_id: grant.jti,
    });
    let invitationSent = false;
    let invitationError = null;
    try {
      const response = await base44.asServiceRole.functions.invoke('sendAccountUserInvitation', { email: grant.admin_email, account_id: current.id, invitation_type: 'initial' });
      const payload = response?.data || response || {};
      if (payload.sent !== true) throw new Error('INVITATION_FAILED');
      invitationSent = true;
    } catch {
      // Do not auto-resend on replay: delivery may have succeeded before timeout.
      invitationError = 'INVITATION_DELIVERY_UNCONFIRMED';
    }
    await recordGrant(service, current, grant, {
      phase: 'completed', membership_id: membership.id, invitation_sent: invitationSent,
      invitation_error: invitationError,
    });
    return { ok: true, status: 'invitation_pending', membership,
      invitation_sent: invitationSent, invitation_error: invitationError };
  });
}

export async function renewPortalAccess(service, { grant, account }) {
  return withActivationLock(service, account.id, async (current, ctx) => {
    const error = await checkGrantUnderLock(service, current, grant);
    if (error) return { ok: false, error };
    const audits = await grantAudits(service, grant.jti);
    if (audits.some(a => a.account_id !== current.id || !sameGrant(a.details, grant))) return { ok: false, error: 'GRANT_REPLAY_MISMATCH' };
    if (await findExistingPortalActivation(service, grant.jti)) return { ok: false, error: 'GRANT_ALREADY_USED' };
    if (audits.length) {
      const completed = audits.find(a => a.details.phase === 'completed');
      return completed
        ? { ok: true, status: 'renewed', expires_at: current.soundproof_access_expires_at, replay: true }
        : { ok: false, error: 'RENEWAL_REQUIRES_REVIEW' };
    }
    if (!current.soundproof_access_expires_at
      || !['active', 'inactive'].includes(current.status)) {
      return { ok: false, error: 'ACCOUNT_NOT_YET_ACTIVATED' };
    }
    const previousExpiry = current.soundproof_access_expires_at;
    const expiryMs = Date.parse(previousExpiry);
    if (!Number.isFinite(expiryMs)) return { ok: false, error: 'ACCOUNT_EXPIRY_INVALID' };
    const expiresAt = new Date(Math.max(expiryMs, Date.now()) + NINETY_DAYS_MS).toISOString();
    ctx.markWriteStarted();
    await recordGrant(service, current, grant, { phase: 'reserved',
      previous_expires_at: previousExpiry, new_expires_at: expiresAt });
    const updated = await service.entities.Account.updateMany({
      id: current.id, status: current.status, soundproof_access_expires_at: previousExpiry,
    }, { $set: { soundproof_access_expires_at: expiresAt, status: 'active' } });
    if (updated?.updated !== 1) throw new Error('RENEWAL_REQUIRES_REVIEW');
    // Access flags are projected by the membership authority on next authorised
    // access. Never re-enable removed/suspended or price-list-only users here.
    await recordGrant(service, current, grant, { phase: 'completed',
      previous_expires_at: previousExpiry, new_expires_at: expiresAt });
    return { ok: true, status: 'renewed', expires_at: expiresAt };
  });
}

/**
 * Read-only status for the Portal. Returns eligibility, activation status,
 * expiry and days remaining. The Portal does not maintain an independent
 * access decision.
 */
export async function readSoundProofAccessStatus(service, { dealerAccountId }) {
  // The immutable Portal Dealer Account ID (UUID) is the organisation identity.
  // It is resolved through portal_dealer_account_id on the canonical active
  // Portal link (partner_user_id set), never by dealer name, email or
  // trading-account number alone. Legacy directory-imported links carry the
  // UUID in external_account_number; the fallback preserves them. A link
  // without partner_user_id is a secondary reference and must not be used.
  let links = await service.entities.ExternalAccountLink.filter({
    source_system: PORTAL_SOURCE,
    portal_dealer_account_id: dealerAccountId,
    active: true,
  });
  let activeLinks = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);
  if (activeLinks.length === 0) {
    links = await service.entities.ExternalAccountLink.filter({
      source_system: PORTAL_SOURCE,
      external_account_number: dealerAccountId,
      active: true,
    });
    activeLinks = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);
  }
  if (activeLinks.length === 0) {
    return { ok: false, error: 'DEALER_LINK_NOT_FOUND' };
  }
  if (activeLinks.length > 1) {
    return { ok: false, error: 'DEALER_LINK_AMBIGUOUS' };
  }

  const link = activeLinks[0];
  // The canonical Portal identity mapping requires partner_user_id to be set.
  // A link without partner_user_id is not the verified organisation identity.
  if (!link.partner_user_id) {
    return { ok: false, error: 'DEALER_LINK_NOT_CANONICAL' };
  }

  const accountId = String(link.account_id || '').trim();
  if (!accountId) {
    return { ok: false, error: 'DEALER_LINK_UNRESOLVED' };
  }

  const accounts = await service.entities.Account.filter({ id: accountId });
  const account = (Array.isArray(accounts) && accounts.length > 0) ? accounts[0] : null;
  if (!account) {
    return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
  }

  const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  const occupied = (Array.isArray(memberships) ? memberships : []).filter((m) =>
    ACTIVE_SEAT_STATUSES.has(m?.status || 'active'),
  );
  const hasAdmin = occupied.some((m) =>
    m?.is_account_admin === true || ADMIN_MEMBERSHIP_ROLES.has(m?.membership_role),
  );
  const portalOriginated = occupied.find((m) => m?.portal_activation_request_id);

  let activationStatus = 'not_activated';
  if (account.status === 'suspended') {
    activationStatus = 'suspended';
  } else if (portalOriginated?.status === 'active' && account.status === 'active') {
    activationStatus = 'active';
  } else if (portalOriginated?.status === 'pending' || (hasAdmin && account.status === 'inactive')) {
    activationStatus = 'invitation_pending';
  } else if (account.status === 'active' && account.soundproof_access_expires_at) {
    activationStatus = 'active';
  }

  const expiresAt = account.soundproof_access_expires_at || null;
  let daysRemaining = null;
  if (expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    daysRemaining = Number.isFinite(ms) ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : null;
  }

  return {
    ok: true,
    account_id: accountId,
    account_name: account.name,
    eligible: account.soundproof_eligible === true,
    activation_status: activationStatus,
    account_status: account.status,
    expires_at: expiresAt,
    days_remaining: daysRemaining,
    seats_occupied: occupied.length,
    seats_remaining: Math.max(0, MAX_ACCOUNT_SEATS - occupied.length),
    has_admin: hasAdmin,
    portal_originated: Boolean(portalOriginated),
  };
}

/**
 * Term-start hook, called from accountAccessAuthority.js when a Portal-
 * originated first-admin pending membership is claimed by the verified user.
 * Activates the account and starts the 90-day term. Returns the new expiry.
 */
export async function startSoundProofTermOnFirstClaim(service, { accountId, user, membership }) {
  if (user?.is_verified !== true || user.disabled === true || !user.id
    || (user.account_id && user.account_id !== accountId)) throw new Error('VERIFIED_CLAIM_REQUIRED');
  const result = await withActivationLock(service, accountId, async (account, ctx) => {
    const [members, users] = await Promise.all([
      service.entities.AccountMembership.filter({ id: membership?.id, account_id: accountId }),
      service.entities.User.filter({ id: user.id }),
    ]);
    const seat = members.length === 1 ? members[0] : null;
    const claimant = users.length === 1 ? users[0] : null;
    if (!claimant?.is_verified || claimant.disabled === true
      || (claimant.account_id && claimant.account_id !== accountId)
      || !seat?.portal_activation_request_id || seat.membership_role !== 'dealer_admin'
      || !ACTIVE_SEAT_STATUSES.has(seat.status)
      || (seat.user_id && seat.user_id !== claimant.id)
      || normaliseEmail(seat.email) !== normaliseEmail(claimant.email)) {
      return { ok: false, error: 'VERIFIED_CLAIM_REQUIRED' };
    }
    if (account.status === 'suspended' || account.soundproof_eligible !== true) return { ok: false, error: 'ACCOUNT_NOT_ELIGIBLE' };
    const grantAuditsForProof = await grantAudits(service, seat.portal_activation_request_id);
    // grantAudits is scoped to portal-actor audits (the Portal grant trail used
    // for replay protection). A master-admin email correction is recorded as an
    // INVITATION_EMAIL_CORRECTED audit whose actor is the admin, not 'portal',
    // so it is not returned by grantAudits. Fetch those correction audits
    // separately, scoped to this account and linked to this exact membership
    // and activation request, and include them in the proof search. grantAudits
    // and the portal-scoped replay protection are unchanged.
    const correctionRows = await service.entities.AccountUserAudit.filter({
      account_id: accountId, action: 'INVITATION_EMAIL_CORRECTED',
    });
    const correctionAudits = (Array.isArray(correctionRows) ? correctionRows : []).filter((a) =>
      a.details?.portal_activation_request_id === seat.portal_activation_request_id
      && a.details?.membership_id === seat.id);
    const proofAudits = grantAuditsForProof.concat(correctionAudits);
    // The activation proof recognises the latest authorised email for this
    // membership: the original Portal activation request OR a master-admin
    // email correction (INVITATION_EMAIL_CORRECTED) linked to this exact
    // membership and activation request. Historical (superseded) emails never
    // satisfy the proof, so a corrected invitation is the only one that can
    // start the term.
    const claimantEmail = normaliseEmail(claimant.email);
    const proofFound = proofAudits.some((a) => a.account_id === accountId && (
      (a.action === 'PORTAL_ACTIVATION_REQUESTED'
        && a.details?.purpose === 'activate'
        && normaliseEmail(a.details?.admin_email) === claimantEmail)
      || (a.action === 'INVITATION_EMAIL_CORRECTED'
        && a.details?.membership_id === seat.id
        && normaliseEmail(a.details?.admin_email) === claimantEmail)
    ));
    if (!proofFound) return { ok: false, error: 'ACTIVATION_PROOF_MISSING' };
    // A repeated claim never restarts or extends a term.
    if (account.first_activated_at && account.soundproof_access_expires_at && account.status === 'active') {
      return { ok: true, expires_at: account.soundproof_access_expires_at };
    }
    if (account.status !== 'inactive' || account.first_activated_at || account.soundproof_access_expires_at
      || seat.status !== 'pending') return { ok: false, error: 'ACTIVATION_STATE_CONFLICT' };
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.parse(now) + NINETY_DAYS_MS).toISOString();
    // Term, status and first timestamp change together, once, on the account.
    ctx.markWriteStarted();
    const updated = await service.entities.Account.updateMany({
      id: accountId, status: 'inactive', soundproof_eligible: true,
      first_activated_at: null, soundproof_access_expires_at: null,
    }, { $set: { status: 'active', first_activated_at: now, soundproof_access_expires_at: expiresAt } });
    if (updated?.updated !== 1) throw new Error('ACTIVATION_STATE_CONFLICT');
    await service.entities.AccountUserAudit.create({
      account_id: accountId, actor_user_id: claimant.id, actor_email: normaliseEmail(claimant.email),
      action: 'SOUNDPROOF_TERM_STARTED', target_email: normaliseEmail(claimant.email), occurred_at: now,
      details: { portal_activation_request_id: seat.portal_activation_request_id,
        membership_id: seat.id, expires_at: expiresAt },
    });
    return { ok: true, expires_at: expiresAt };
  });
  if (!result.ok) throw new Error(result.error);
  return result.expires_at;
}

export { NINETY_DAYS_MS, SHARED_SECRET_NAME };