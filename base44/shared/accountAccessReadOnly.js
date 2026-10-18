/**
 * accountAccessReadOnly.js (shared)
 * ---------------------------------
 * THE ADI EDITORIAL ACTION'S AUTHORISATION PATH: the same account access decision,
 * reached by READING ALONE.
 *
 * WHAT IT ANSWERS: one question, and only one — is this authenticated login
 * authorised for this account, with which capabilities? It is the same question the
 * shared resolver answers, and it is answered by the same rules, imported from
 * accountAccessRules.js rather than restated, so the two can never drift apart.
 *
 * WHAT IT DOES NOT DO: the shared resolver keeps the account's books as it resolves.
 * It stamps the login's account, normalises and activates the seat, may bootstrap a
 * legacy membership, writes the account/portal names and records audit rows. None of
 * that changes the verdict — every value those writes persist is computed from the
 * records this path already reads — so here they are mirrored in memory and not
 * persisted. The ADI action therefore reaches the identical allow/deny, the identical
 * access level and the identical capabilities having written nothing at all.
 *
 * The one case worth naming is the legacy bootstrap: where a login has an account but
 * no seat record, the shared resolver creates the seat and allows. A read-only path
 * cannot create it, so the seat it WOULD have created — the same fields, from the same
 * conditions — is mirrored here and the decision is identical. Nothing is persisted;
 * the login's next call through the shared resolver bootstraps exactly as before.
 *
 * Reads only, and the entities it reads through are injected.
 */

import {
  ACCESS_LEVELS,
  ACTIVE_SEAT_STATUSES,
  ADMIN_MEMBERSHIP_ROLES,
  buildCapabilities,
  getSingleFrom,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
  publicUser,
} from './accountAccessRules.js';
import { readPilotPortalAccess } from './portalSessionGateRead.js';

/**
 * THE READS THIS PATH MAY MAKE, entity by entity. Nothing else is on the door:
 * the client handed to the resolver cannot create, cannot modify and cannot remove
 * a record, because no such method exists on it.
 */
export const ACCOUNT_READ_SURFACE = Object.freeze({
  User: Object.freeze(['filter', 'get']),
  AccountMembership: Object.freeze(['filter']),
  Account: Object.freeze(['filter']),
  PortalIdentity: Object.freeze(['filter']),
  ExternalAccountLink: Object.freeze(['filter']),
});

/**
 * The door itself: every read on the surface, forwarded unchanged, and no write.
 *
 * @param {Object} entities — an entity-access object (e.g. a service-role client's)
 * @returns {Object} read-only access to the five entities this path reads
 */
export function readOnlyAccountEntities(entities) {
  const door = {};
  for (const [name, methods] of Object.entries(ACCOUNT_READ_SURFACE)) {
    const entity = entities?.[name];
    if (!entity) continue;
    door[name] = methods.reduce((allowed, method) => {
      if (typeof entity[method] === 'function') {
        allowed[method] = (...args) => entity[method](...args);
      }
      return allowed;
    }, {});
  }
  return door;
}

/**
 * Resolve account access for one login, by reads alone.
 *
 * The decision, its reasons, the access level and the capabilities are exactly those
 * of the shared resolver. Nothing is persisted: no seat is created, no seat or login
 * is stamped, no account or portal name is written and no audit row is recorded.
 *
 * @param {Object} input
 * @param {Object} input.base44 — the server session (used to mint the portal bridge token)
 * @param {Object} input.entities — the read-only door, from readOnlyAccountEntities()
 * @param {Object} input.sessionUser — the authenticated login from the session
 * @param {string} [input.bridgeUrl] — portal bridge override, for tests
 * @param {boolean} [input.bootstrapLegacyMembership] — mirror the shared resolver's
 *   legacy bootstrap rule (default true); it is mirrored in memory, never written
 * @returns {Promise<Object>} the access context, or a denial with its reason
 */
export async function resolveAccountAccessReadOnly({
  base44,
  entities,
  sessionUser,
  bridgeUrl = undefined,
  bootstrapLegacyMembership = true,
} = {}) {
  if (!sessionUser?.id) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const authoritativeUser = await getSingleFrom(entities, 'User', { id: sessionUser.id });

  // Platform administration is resolved FIRST, from the authenticated Base44 session
  // role (and the authoritative record when it is readable), exactly as the shared
  // resolver resolves it, so an administrator is never denied by a dealer-side
  // requirement and never depends on an account linkage, a seat or a portal launch.
  if (sessionUser.role === 'admin' || authoritativeUser?.role === 'admin') {
    const accessLevel = ACCESS_LEVELS.FULL_ACCESS;
    return {
      allowed: true,
      reason: null,
      isMasterAdmin: true,
      isAccountAdmin: false,
      accessLevel,
      capabilities: buildCapabilities({
        isMasterAdmin: true,
        isAccountAdmin: false,
        accessLevel,
      }),
      user: {
        ...publicUser(authoritativeUser || sessionUser),
        access_level: accessLevel,
        account_role: 'admin',
        app_role: 'Super Admin',
      },
      account: null,
      membership: null,
    };
  }

  if (!authoritativeUser) {
    return { allowed: false, reason: 'USER_NOT_FOUND' };
  }

  if (authoritativeUser.disabled === true) {
    return { allowed: false, reason: 'USER_DISABLED' };
  }

  const email = normaliseEmail(authoritativeUser.email);
  let accountId = String(authoritativeUser.account_id || '').trim();
  let invitationMembership = null;

  // The administrator-assigned Base44 user-id seat, read first: the production SSO
  // path, where a verified external identity never receives account authority from
  // its email, dealer name, URL or account parameter.
  if (!accountId) {
    const assignedRows = await entities.AccountMembership.filter({
      user_id: authoritativeUser.id,
    });
    const eligibleAssignments = (assignedRows || []).filter((item) =>
      item.status === 'pending' || item.status === 'active'
    );
    if (eligibleAssignments.length === 1) {
      invitationMembership = eligibleAssignments[0];
      accountId = String(invitationMembership.account_id || '').trim();
    } else if (eligibleAssignments.length > 1) {
      return { allowed: false, reason: 'MEMBERSHIP_AMBIGUOUS' };
    }
  }

  // The legacy invitation path, for non-portal accounts only; a pilot account is
  // additionally subject to the verified portal gate below.
  if (!accountId && email) {
    const invitationRows = await entities.AccountMembership.filter({ email });
    const eligibleInvitations = (invitationRows || []).filter((item) =>
      item.status === 'pending' || item.status === 'active'
    );
    if (eligibleInvitations.length === 1) {
      invitationMembership = eligibleInvitations[0];
      accountId = String(invitationMembership.account_id || '').trim();
    }
  }

  if (!accountId) {
    return { allowed: false, reason: 'ACCOUNT_NOT_LINKED' };
  }

  const account = await getSingleFrom(entities, 'Account', { id: accountId });
  if (!account) {
    return { allowed: false, reason: 'ACCOUNT_NOT_FOUND' };
  }
  if (account.status === 'suspended') {
    return { allowed: false, reason: 'ACCOUNT_SUSPENDED', account };
  }

  // The same pilot gate, read and decided by portalSessionGateRead.js.
  const portalAccess = await readPilotPortalAccess(base44, authoritativeUser, account, {
    entities,
    bridgeUrl,
  });
  if (portalAccess.required && !portalAccess.allowed) {
    return {
      allowed: false,
      reason: portalAccess.reason || 'PORTAL_SSO_REQUIRED',
      account,
    };
  }

  // The shared resolver stamps the login's account here when an invitation bound it.
  // The account is the one just resolved, so this path carries it in memory only.
  if (!authoritativeUser.account_id && invitationMembership) {
    authoritativeUser.account_id = accountId;
  }

  const accountMemberships = await entities.AccountMembership.filter({ account_id: accountId });
  const allMemberships = Array.isArray(accountMemberships) ? accountMemberships : [];
  let membership = allMemberships.find((item) =>
    item?.user_id === authoritativeUser.id
    || (normaliseEmail(item?.email) && normaliseEmail(item.email) === email)
  ) || invitationMembership || null;

  const occupiedMemberships = allMemberships.filter((item) => ACTIVE_SEAT_STATUSES.has(item?.status || 'active'));
  const existingAdmin = occupiedMemberships.find((item) =>
    item?.is_account_admin === true || ADMIN_MEMBERSHIP_ROLES.has(item?.membership_role)
  );

  if (!membership && bootstrapLegacyMembership) {
    const shouldBootstrapAdmin =
      authoritativeUser.account_role === 'admin'
      || !existingAdmin && occupiedMemberships.length === 0;
    // ── THE ONE CASE WHERE THE SHARED RESOLVER WOULD WRITE A RECORD FIRST ──
    // The seat it would create is mirrored here — the same fields, from the same
    // conditions — so the decision below is the identical one. Nothing is persisted:
    // the seat is not created, the administrator bootstrap is not audited, and the
    // login's next call through the shared resolver performs both exactly as before.
    membership = {
      id: null,
      user_id: authoritativeUser.id,
      email,
      full_name: authoritativeUser.full_name || null,
      account_id: accountId,
      membership_role: shouldBootstrapAdmin ? 'dealer_admin' : 'full_access',
      access_level: ACCESS_LEVELS.FULL_ACCESS,
      is_account_admin: shouldBootstrapAdmin,
      status: 'active',
      accepted_at: new Date().toISOString(),
    };
  }

  if (!membership) {
    return { allowed: false, reason: 'MEMBERSHIP_NOT_FOUND', account };
  }
  if (membership.status === 'removed' || membership.status === 'suspended') {
    return { allowed: false, reason: 'MEMBERSHIP_INACTIVE', account };
  }

  const legacySoleMembership =
    !existingAdmin
    && occupiedMemberships.length === 1
    && (
      !membership.access_level
      || membership.membership_role === 'designer'
      || membership.membership_role === 'viewer'
    )
    && (membership.user_id === authoritativeUser.id || normaliseEmail(membership.email) === email);

  const isAccountAdmin =
    membership.is_account_admin === true
    || ADMIN_MEMBERSHIP_ROLES.has(membership.membership_role)
    || authoritativeUser.account_role === 'admin'
    || legacySoleMembership;

  const accessLevel = isAccountAdmin
    ? ACCESS_LEVELS.FULL_ACCESS
    : normaliseAccessLevel(
        membership.access_level || authoritativeUser.access_level,
        ACCESS_LEVELS.FULL_ACCESS,
      );

  // ── THE SEAT AND THE LOGIN, MIRRORED RATHER THAN STAMPED ──
  // The shared resolver writes these normalisations back as it resolves. They are the
  // values it just derived above, so applying them in memory reaches the identical
  // context — and persists nothing about a login merely asking whether it may edit
  // wording.
  const now = new Date().toISOString();
  const membershipWasPending = membership.status === 'pending';
  const membershipPatch = {};
  if (membership.user_id !== authoritativeUser.id) membershipPatch.user_id = authoritativeUser.id;
  if (normaliseEmail(membership.email) !== email) membershipPatch.email = email;
  if ((membership.full_name || null) !== (authoritativeUser.full_name || null)) {
    membershipPatch.full_name = authoritativeUser.full_name || null;
  }
  if (membership.status !== 'active') membershipPatch.status = 'active';
  if (membershipWasPending && !membership.accepted_at) membershipPatch.accepted_at = now;
  if (membership.access_level !== accessLevel) membershipPatch.access_level = accessLevel;
  if (membership.is_account_admin !== isAccountAdmin) membershipPatch.is_account_admin = isAccountAdmin;
  const desiredMembershipRole = isAccountAdmin
    ? 'dealer_admin'
    : accessLevel === ACCESS_LEVELS.FULL_ACCESS
      ? 'full_access'
      : accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY
        ? 'sound_proof_only'
        : 'price_list_only';
  if (membership.membership_role !== desiredMembershipRole) {
    membershipPatch.membership_role = desiredMembershipRole;
  }

  if (Object.keys(membershipPatch).length > 0) {
    membership = { ...membership, ...membershipPatch };
  }

  const userPatch = {};
  if (authoritativeUser.account_role !== (isAccountAdmin ? 'admin' : 'account_user')) {
    userPatch.account_role = isAccountAdmin ? 'admin' : 'account_user';
  }
  if (authoritativeUser.access_level !== accessLevel) userPatch.access_level = accessLevel;
  const appRole = legacyAppRoleForAccess(accessLevel, isAccountAdmin);
  if (authoritativeUser.app_role !== appRole) userPatch.app_role = appRole;
  if (Object.keys(userPatch).length > 0) {
    Object.assign(authoritativeUser, userPatch);
  }

  return {
    allowed: true,
    reason: null,
    isMasterAdmin: false,
    isAccountAdmin,
    accessLevel,
    capabilities: buildCapabilities({
      isMasterAdmin: false,
      isAccountAdmin,
      accessLevel,
    }),
    user: {
      ...publicUser(authoritativeUser),
      account_id: accountId,
      account_role: isAccountAdmin ? 'admin' : 'account_user',
      access_level: accessLevel,
      app_role: appRole,
    },
    account: {
      id: account.id,
      name: account.name,
      account_type: account.account_type,
      status: account.status,
      territory: account.territory || authoritativeUser.territory || 'UK',
    },
    membership: {
      id: membership.id,
      status: membership.status,
      is_account_admin: isAccountAdmin,
      access_level: accessLevel,
    },
  };
}

export default resolveAccountAccessReadOnly;