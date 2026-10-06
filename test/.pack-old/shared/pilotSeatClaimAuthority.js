/**
 * Pilot seat claim authority — the iCubed Partner Portal claim path.
 *
 * Approved direction: for dealer access the verified Partner Portal identity
 * is the authority. This path therefore binds the account-administrator seat
 * to the portal-verified user WITHOUT matching the invited seat email to the
 * Portal SSO login email.
 *
 * Every precondition below must hold or the claim fails closed. The path is
 * scoped to the known pilot account, subject and profile, so no other dealer
 * can reach it, and no rule is relaxed for any other account.
 *
 * Preconditions (all required):
 *   1. binding target is SOUND_PROOF
 *   2. account is the known iCubed Sound Proof account, active
 *   3. binding subject/profile match the active ExternalAccountLink
 *   4. exactly one unclaimed dealer-administrator seat exists
 *   5. that seat is pending
 *   6. no conflicting PortalIdentity exists
 *   7. the Base44 user is an authenticated, non-disabled, is_verified record
 *   8. the binding is complete and unexpired
 *
 * Mutations, in order:
 *   1. AccountMembership → user_id, status 'active', accepted_at
 *   2. User              → account_id stamped; dealer_name from the verified
 *                          session name. dealer_account_id is NEVER invented:
 *                          the binding carries no dealer account UUID.
 *   3. AccountUserAudit  → PORTAL_IDENTITY_CLAIMED, recording that the claim
 *                          came from the verified portal identity, not an
 *                          email match.
 *
 * The PortalIdentity itself is written by the launch authority that already
 * owns that contract; this module only asserts that no conflicting identity
 * exists before anything is mutated.
 */

import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from './pilotPortalConstants.js';

const PILOT_ADMIN_MEMBERSHIP_ROLE = 'dealer_admin';
const CLAIM_BASIS = 'verified_partner_portal_identity';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function uniqueRows(entity, query) {
  const rows = await entity.filter(query);
  return Array.isArray(rows) ? rows : [];
}

/** The one pre-created account-administrator seat for a dealer account. */
function isAdministratorSeat(membership) {
  return (
    membership?.is_account_admin === true
    && membership?.membership_role === PILOT_ADMIN_MEMBERSHIP_ROLE
    && (!hasText(membership?.access_level) || membership.access_level === 'FULL_ACCESS')
  );
}

/**
 * Precondition 6, read-only: a conflicting PortalIdentity must not exist.
 * An identity that already matches this binding is not a conflict — it is the
 * same verified identity being re-presented, which the launch authority then
 * refreshes.
 */
export async function assertNoPilotPortalIdentityConflict(service, base44User, binding, accountId) {
  const forUser = await uniqueRows(service.entities.PortalIdentity, {
    base44_user_id: base44User.id,
    target: PORTAL_TARGET,
  });
  if (forUser.length > 1) throw new Error('PORTAL_IDENTITY_AMBIGUOUS');

  const own = forUser[0] || null;
  if (
    own
    && (
      own.external_subject !== binding.user_id
      || own.account_id !== accountId
      || own.partner_profile_id !== binding.profile_id
    )
  ) {
    throw new Error('PORTAL_IDENTITY_CONFLICT');
  }

  const forSubject = await uniqueRows(service.entities.PortalIdentity, {
    external_subject: binding.user_id,
    target: PORTAL_TARGET,
  });
  if (forSubject.some((row) => row?.base44_user_id && row.base44_user_id !== base44User.id)) {
    throw new Error('PORTAL_IDENTITY_CONFLICT');
  }

  return own;
}

/**
 * Claim the iCubed account-administrator seat from the verified launch binding.
 *
 * @param {object} params
 * @param {object} params.service - base44.asServiceRole
 * @param {object} params.base44User - the authenticated session user
 * @param {object} params.binding - the validated Partner Portal binding
 * @param {object} params.link - the active ExternalAccountLink for the subject
 * @returns {Promise<{membership: object, claimed: boolean, previousUserId: string|null}>}
 * @throws {Error} with a specific reason on any failed precondition.
 */
export async function claimPilotPortalAdministratorSeat({ service, base44User, binding, link }) {
  // ── 1, 7. Verified Base44 user ──────────────────────────────────────────
  if (!hasText(base44User?.id)) throw new Error('PORTAL_USER_REQUIRED');

  const userRows = await uniqueRows(service.entities.User, { id: base44User.id });
  if (userRows.length !== 1) throw new Error('PORTAL_USER_UNVERIFIED');
  const user = userRows[0];
  if (user.disabled === true) throw new Error('PORTAL_USER_DISABLED');
  if (user.is_verified !== true) throw new Error('PORTAL_USER_UNVERIFIED');
  const userEmail = normaliseEmail(user.email || base44User.email);
  if (!hasText(userEmail)) throw new Error('PORTAL_USER_EMAIL_REQUIRED');

  // ── 1, 2, 3, 8. Binding, account and link identity ──────────────────────
  if (binding?.target !== PORTAL_TARGET) throw new Error('PORTAL_BINDING_INVALID');
  if (link?.account_id !== PILOT_SOUND_PROOF_ACCOUNT_ID) throw new Error('PILOT_ACCOUNT_NOT_ELIGIBLE');
  if (link?.source_system !== PORTAL_SOURCE || link?.active !== true) {
    throw new Error('PILOT_ACCOUNT_NOT_ELIGIBLE');
  }
  if (
    link?.partner_user_id !== PILOT_EXTERNAL_SUBJECT
    || binding?.user_id !== PILOT_EXTERNAL_SUBJECT
  ) {
    throw new Error('PILOT_SUBJECT_MISMATCH');
  }
  if (binding?.profile_id !== PILOT_PARTNER_PROFILE_ID) throw new Error('PROFILE_MISMATCH');
  if (!hasText(binding?.session_id) || !hasText(binding?.account_name)) {
    throw new Error('PORTAL_BINDING_INVALID');
  }
  const expiresAt = Date.parse(String(binding?.expires_at || ''));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('PORTAL_BINDING_EXPIRED');
  }

  const accounts = await uniqueRows(service.entities.Account, { id: link.account_id });
  if (accounts.length !== 1 || accounts[0]?.status !== 'active') {
    throw new Error('PORTAL_ACCOUNT_INACTIVE');
  }

  // ── 6. No conflicting PortalIdentity ────────────────────────────────────
  await assertNoPilotPortalIdentityConflict(service, base44User, binding, link.account_id);

  // ── 4, 5. Exactly one pending administrator seat ────────────────────────
  const memberships = await uniqueRows(service.entities.AccountMembership, {
    account_id: link.account_id,
  });

  const otherSeatsForUser = memberships.filter(
    (membership) => membership?.user_id === base44User.id,
  );
  if (otherSeatsForUser.some((membership) => membership.status !== 'pending')) {
    throw new Error('PORTAL_MEMBERSHIP_ALREADY_CLAIMED');
  }
  if (otherSeatsForUser.length > 1) throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');

  const pendingAdministratorSeats = memberships.filter(
    (membership) => membership?.status === 'pending' && isAdministratorSeat(membership),
  );
  if (pendingAdministratorSeats.length === 0) {
    // No administrator seat is waiting: the seat still has to be assigned.
    throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
  }
  if (pendingAdministratorSeats.length > 1) throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');

  const seat = pendingAdministratorSeats[0];

  // The seat may already be parked on the invited Base44 user (the invitation
  // stamps user_id when the invited email already had a user record). The
  // verified portal identity is the authority, so a pending, never-activated
  // seat is rebound to the portal user — recorded, never silent.
  const previousUserId =
    hasText(seat.user_id) && seat.user_id !== base44User.id ? seat.user_id : null;
  if (previousUserId) {
    const previousUsers = await uniqueRows(service.entities.User, { id: previousUserId });
    if (previousUsers.length !== 1) throw new Error('PILOT_SEAT_BOUND_USER_MISSING');
    if (previousUsers[0]?.role === 'admin') {
      throw new Error('PILOT_SEAT_BOUND_TO_PLATFORM_ADMIN');
    }
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const membership = await service.entities.AccountMembership.update(seat.id, {
    user_id: base44User.id,
    status: 'active',
    accepted_at: seat.accepted_at || now,
    full_name: seat.full_name || user.full_name || null,
  });

  const verifiedDealerName = hasText(binding.account_name) ? binding.account_name.trim() : null;
  const userPatch = {};
  if (user.account_id !== link.account_id) userPatch.account_id = link.account_id;
  if (verifiedDealerName && user.dealer_name !== verifiedDealerName) {
    userPatch.dealer_name = verifiedDealerName;
  }
  if (Object.keys(userPatch).length > 0) {
    await service.entities.User.update(user.id, userPatch);
  }

  await service.entities.AccountUserAudit.create({
    account_id: link.account_id,
    actor_user_id: String(base44User.id),
    actor_email: userEmail,
    action: 'PORTAL_IDENTITY_CLAIMED',
    target_user_id: base44User.id,
    target_email: userEmail,
    before_access_level: null,
    after_access_level: hasText(seat.access_level) ? seat.access_level : 'FULL_ACCESS',
    occurred_at: now,
    details: {
      claim_basis: CLAIM_BASIS,
      email_match_used: false,
      membership_id: seat.id,
      seat_invited_email: normaliseEmail(seat.email) || null,
      previous_user_id: previousUserId,
      portal_subject: binding.user_id,
      portal_profile_id: binding.profile_id,
      portal_session_id: binding.session_id,
      binding_expires_at: binding.expires_at,
      portal_account_name: verifiedDealerName,
      account_id_stamped: userPatch.account_id === link.account_id,
      dealer_name_stamped: Boolean(userPatch.dealer_name),
      dealer_account_id_stamped: false,
      dealer_account_id_reason: 'The verified binding carries no Partner Portal dealer account UUID.',
    },
  });

  return { membership, claimed: true, previousUserId };
}