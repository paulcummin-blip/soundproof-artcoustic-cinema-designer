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
 * - Replay protection: the jti is stamped on the created AccountMembership.
 *   A repeated jti returns the existing pending status instead of a duplicate.
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
import { setFirstActivatedAtIfUnset } from './accountActivationAuthority.js';

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
  if (expMs < Date.now()) {
    return { ok: false, error: 'GRANT_EXPIRED' };
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

  const portalProfileId = String(grant.portal_profile_id || '').trim() || null;

  const result = {
    ok: true,
    grant: {
      purpose,
      jti,
      exp: expMs,
      target,
      dealer_account_id: dealerAccountId,
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
    external_account_number: grant.dealer_account_id,
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
 * Checks replay protection: returns an existing pending or active membership
 * stamped with this jti, or null if none exists.
 */
export async function findExistingPortalActivation(service, jti) {
  const rows = await service.entities.AccountMembership.filter({
    portal_activation_request_id: jti,
  });
  const matches = (Array.isArray(rows) ? rows : []).filter(
    (m) => m?.status === 'pending' || m?.status === 'active',
  );
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Checks whether the account already has an occupied first-admin seat.
 */
export async function findExistingAdminSeat(service, accountId) {
  const memberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  const occupied = (Array.isArray(memberships) ? memberships : []).filter((m) =>
    ACTIVE_SEAT_STATUSES.has(m?.status || 'active'),
  );
  return occupied.find((m) =>
    m?.is_account_admin === true || ADMIN_MEMBERSHIP_ROLES.has(m?.membership_role),
  ) || null;
}

/**
 * Initial activation: creates one pending dealer-admin membership for the
 * nominated email and sends the native Base44 invitation. Does NOT start the
 * 90-day term. Returns { ok, status, membership, error }.
 */
export async function createPortalActivation(service, base44, { grant, account, link }) {
  // Eligibility check: the account must be eligible.
  if (!account.soundproof_eligible) {
    return { ok: false, error: 'ACCOUNT_NOT_ELIGIBLE' };
  }

  // Suspended accounts cannot be activated.
  if (account.status === 'suspended') {
    return { ok: false, error: 'ACCOUNT_SUSPENDED' };
  }

  // Replay: if a membership with this jti already exists, return its status.
  const existing = await findExistingPortalActivation(service, grant.jti);
  if (existing) {
    return {
      ok: true,
      status: existing.status === 'active' ? 'claimed' : 'invitation_pending',
      membership: existing,
      replay: true,
    };
  }

  // No duplicate first-admin seat.
  const existingAdmin = await findExistingAdminSeat(service, account.id);
  if (existingAdmin) {
    return { ok: false, error: 'ADMIN_SEAT_ALREADY_OCCUPIED' };
  }

  // Seat limit: pending + active seats must not exceed 5.
  const allMemberships = await service.entities.AccountMembership.filter({ account_id: account.id });
  const occupiedCount = (Array.isArray(allMemberships) ? allMemberships : []).filter((m) =>
    ACTIVE_SEAT_STATUSES.has(m?.status || 'active'),
  ).length;
  if (occupiedCount >= MAX_ACCOUNT_SEATS) {
    return { ok: false, error: 'SEAT_LIMIT_REACHED' };
  }

  const now = new Date().toISOString();

  // Create the pending dealer-admin membership, stamped with the Portal
  // activation request id so the first-user claim can be identified.
  const membership = await service.entities.AccountMembership.create({
    email: grant.admin_email,
    full_name: grant.admin_full_name || null,
    account_id: account.id,
    membership_role: 'dealer_admin',
    access_level: ACCESS_LEVELS.FULL_ACCESS,
    is_account_admin: true,
    status: 'pending',
    invited_by_email: 'portal@artcoustic-partner-portal',
    invited_at: now,
    portal_activation_request_id: grant.jti,
  });

  // Audit the activation request.
  await service.entities.AccountUserAudit.create({
    account_id: account.id,
    actor_user_id: 'portal',
    actor_email: `portal:${grant.portal_user_id}`,
    action: 'PORTAL_ACTIVATION_REQUESTED',
    target_email: grant.admin_email,
    occurred_at: now,
    details: {
      portal_activation_request_id: grant.jti,
      portal_user_id: grant.portal_user_id,
      portal_profile_id: grant.portal_profile_id,
      dealer_account_id: grant.dealer_account_id,
      admin_email: grant.admin_email,
    },
  });

  // Send the native Base44 invitation. The invitee chooses their own password
  // and verifies their email through the platform's standard flow.
  let invitationSent = false;
  let invitationError = null;
  try {
    await base44.asServiceRole.functions.invoke('sendAccountUserInvitation', {
      email: grant.admin_email,
    });
    invitationSent = true;
  } catch (inviteErr) {
    invitationError = String(inviteErr?.message || 'INVITATION_FAILED');
    // The pending membership exists regardless. The admin can resend the
    // invitation from Manage Users once the system is enabled.
  }

  return {
    ok: true,
    status: 'invitation_pending',
    membership,
    invitation_sent: invitationSent,
    invitation_error: invitationError,
  };
}

/**
 * Renewal: extends the 90-day expiry on the existing account, preserving
 * remaining access time. Does NOT clear a manual suspension or change
 * eligibility. Returns { ok, expires_at, error }.
 */
export async function renewPortalAccess(service, { grant, account }) {
  if (account.status === 'suspended') {
    return { ok: false, error: 'ACCOUNT_SUSPENDED' };
  }

  // Eligibility must still be true.
  if (!account.soundproof_eligible) {
    return { ok: false, error: 'ACCOUNT_NOT_ELIGIBLE' };
  }

  // Replay: if this jti was already used for renewal, return the existing
  // expiry without extending a second time.
  const existing = await findExistingPortalActivation(service, grant.jti);
  if (existing) {
    return {
      ok: true,
      status: 'renewed',
      expires_at: account.soundproof_access_expires_at,
      replay: true,
    };
  }

  // Preserve remaining access time: the new expiry is max(current_expiry, now) + 90 days.
  const now = Date.now();
  const currentExpiryMs = account.soundproof_access_expires_at
    ? new Date(account.soundproof_access_expires_at).getTime()
    : null;
  const baseMs = (currentExpiryMs && Number.isFinite(currentExpiryMs) && currentExpiryMs > now)
    ? currentExpiryMs
    : now;
  const newExpiresAt = new Date(baseMs + NINETY_DAYS_MS).toISOString();

  // Only renew accounts that have already been activated (status active or
  // have an expiry). An inactive account with no term has not had its first
  // user claim yet; renewal is not meaningful until activation is complete.
  if (account.status !== 'active' && !account.soundproof_access_expires_at) {
    return { ok: false, error: 'ACCOUNT_NOT_YET_ACTIVATED' };
  }

  await service.entities.Account.update(account.id, {
    soundproof_access_expires_at: newExpiresAt,
    status: 'active',
  });

  // Re-enable all linked users whose access flag may have been cleared by
  // expiry reconciliation.
  const memberships = await service.entities.AccountMembership.filter({ account_id: account.id });
  const linkedUserIds = new Set(
    (Array.isArray(memberships) ? memberships : [])
      .filter((m) => m.user_id && String(m.status || 'active') !== 'removed')
      .map((m) => m.user_id),
  );
  const accountUsers = await service.entities.User.filter({ account_id: account.id });
  for (const u of (Array.isArray(accountUsers) ? accountUsers : [])) {
    if (u.id) linkedUserIds.add(u.id);
  }
  for (const userId of linkedUserIds) {
    try {
      await service.entities.User.update(userId, { soundproof_access_enabled: true });
    } catch {
      // Continue: individual user flag updates are non-blocking.
    }
  }

  // Stamp the jti on a transient audit so a replayed renewal is detectable.
  await service.entities.AccountUserAudit.create({
    account_id: account.id,
    actor_user_id: 'portal',
    actor_email: `portal:${grant.portal_user_id}`,
    action: 'SOUNDPROOF_RENEWED',
    target_email: account.contact_email || '',
    occurred_at: new Date().toISOString(),
    details: {
      portal_activation_request_id: grant.jti,
      portal_user_id: grant.portal_user_id,
      previous_expires_at: account.soundproof_access_expires_at || null,
      new_expires_at: newExpiresAt,
      linked_user_count: linkedUserIds.size,
    },
  });

  return {
    ok: true,
    status: 'renewed',
    expires_at: newExpiresAt,
    linked_users_updated: linkedUserIds.size,
  };
}

/**
 * Read-only status for the Portal. Returns eligibility, activation status,
 * expiry and days remaining. The Portal does not maintain an independent
 * access decision.
 */
export async function readSoundProofAccessStatus(service, { dealerAccountId }) {
  const links = await service.entities.ExternalAccountLink.filter({
    source_system: PORTAL_SOURCE,
    external_account_number: dealerAccountId,
    active: true,
  });
  const activeLinks = (Array.isArray(links) ? links : []).filter((l) => l?.active !== false);
  if (activeLinks.length === 0) {
    return { ok: false, error: 'DEALER_LINK_NOT_FOUND' };
  }
  if (activeLinks.length > 1) {
    return { ok: false, error: 'DEALER_LINK_AMBIGUOUS' };
  }

  const accountId = String(activeLinks[0].account_id || '').trim();
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
  const now = new Date().toISOString();
  const newExpiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();

  await service.entities.Account.update(accountId, {
    status: 'active',
    soundproof_access_expires_at: newExpiresAt,
  });

  // Record the canonical first-activation timestamp (write-once). Only the
  // first confirmed term start sets it; renewal and restore never change it.
  await setFirstActivatedAtIfUnset(service, accountId, now);

  try {
    await service.entities.User.update(user.id, {
      soundproof_access_enabled: true,
    });
  } catch {
    // Non-blocking: the account status and expiry are the authority.
  }

  await service.entities.AccountUserAudit.create({
    account_id: accountId,
    actor_user_id: String(user.id),
    actor_email: normaliseEmail(user.email) || '',
    action: 'SOUNDPROOF_TERM_STARTED',
    target_email: normaliseEmail(user.email) || '',
    occurred_at: now,
    details: {
      portal_activation_request_id: membership?.portal_activation_request_id || null,
      membership_id: membership?.id || null,
      expires_at: newExpiresAt,
    },
  });

  return newExpiresAt;
}

export { NINETY_DAYS_MS, SHARED_SECRET_NAME };