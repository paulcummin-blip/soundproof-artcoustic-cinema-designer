export const ACCESS_LEVELS = Object.freeze({
  FULL_ACCESS: 'FULL_ACCESS',
  SOUND_PROOF_ONLY: 'SOUND_PROOF_ONLY',
  PRICE_LIST_ONLY: 'PRICE_LIST_ONLY',
});

export const MAX_ACCOUNT_SEATS = 5;

const ADMIN_MEMBERSHIP_ROLES = new Set(['dealer_admin', 'distributor_admin', 'internal_admin']);
const ACTIVE_SEAT_STATUSES = new Set(['active', 'pending']);

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normaliseAccessLevel(value, fallback = ACCESS_LEVELS.FULL_ACCESS) {
  const candidate = String(value || '').trim().toUpperCase();
  return Object.values(ACCESS_LEVELS).includes(candidate) ? candidate : fallback;
}

export function legacyAppRoleForAccess(accessLevel, isAccountAdmin = false) {
  if (isAccountAdmin) return 'Administrator';
  if (accessLevel === ACCESS_LEVELS.FULL_ACCESS) return 'Designer Pro';
  if (accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY) return 'Designer Lite';
  return 'Viewer';
}

export function buildCapabilities({ isMasterAdmin, isAccountAdmin, accessLevel }) {
  if (isMasterAdmin) {
    return {
      soundProof: true,
      priceList: true,
      commercial: true,
      manageUsers: true,
      masterAdmin: true,
    };
  }

  return {
    soundProof:
      accessLevel === ACCESS_LEVELS.FULL_ACCESS
      || accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY,
    priceList:
      accessLevel === ACCESS_LEVELS.FULL_ACCESS
      || accessLevel === ACCESS_LEVELS.PRICE_LIST_ONLY,
    commercial: accessLevel === ACCESS_LEVELS.FULL_ACCESS,
    manageUsers: isAccountAdmin === true,
    masterAdmin: false,
  };
}

export async function appendAccountUserAudit(service, {
  accountId,
  actor,
  action,
  target,
  beforeAccessLevel = null,
  afterAccessLevel = null,
  details = null,
}) {
  return service.entities.AccountUserAudit.create({
    account_id: accountId,
    actor_user_id: String(actor?.id || 'system'),
    actor_email: normaliseEmail(actor?.email) || 'system',
    action,
    target_user_id: target?.id || target?.user_id || null,
    target_email: normaliseEmail(target?.email),
    before_access_level: beforeAccessLevel,
    after_access_level: afterAccessLevel,
    occurred_at: new Date().toISOString(),
    details,
  });
}

async function getSingle(service, entityName, query) {
  const rows = await service.entities[entityName].filter(query);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function publicUser(authoritativeUser) {
  return {
    id: authoritativeUser.id,
    email: authoritativeUser.email,
    full_name: authoritativeUser.full_name || null,
    role: authoritativeUser.role,
    territory: authoritativeUser.territory || 'UK',
    account_id: authoritativeUser.account_id || null,
    account_role: authoritativeUser.account_role || 'account_user',
    access_level: authoritativeUser.access_level || ACCESS_LEVELS.FULL_ACCESS,
    app_role: authoritativeUser.app_role || null,
  };
}

/**
 * Resolves account identity only from the authenticated session and the
 * service-role User/AccountMembership records. No client-supplied account id
 * or permission is trusted.
 */
export async function resolveAccountAccess(base44, sessionUser, {
  bootstrapLegacyMembership = true,
} = {}) {
  if (!sessionUser?.id) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const service = base44.asServiceRole;
  const authoritativeUser = await getSingle(service, 'User', { id: sessionUser.id });
  if (!authoritativeUser) {
    return { allowed: false, reason: 'USER_NOT_FOUND' };
  }

  if (authoritativeUser.role === 'admin') {
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
        ...publicUser(authoritativeUser),
        access_level: accessLevel,
        account_role: 'admin',
        app_role: 'Super Admin',
      },
      account: null,
      membership: null,
    };
  }

  if (authoritativeUser.disabled === true) {
    return { allowed: false, reason: 'USER_DISABLED' };
  }

  const email = normaliseEmail(authoritativeUser.email);
  let accountId = String(authoritativeUser.account_id || '').trim();
  let invitationMembership = null;

  // A newly invited Base44 user does not yet carry custom User fields. Resolve
  // exactly one pending/active membership by normalised email, then bind the
  // authoritative User record on first login. Cross-account duplicate pending
  // seats are blocked by manageAccountUsers, and ambiguity fails closed here.
  if (!accountId && email) {
    const invitationRows = await service.entities.AccountMembership.filter({ email });
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

  const account = await getSingle(service, 'Account', { id: accountId });
  if (!account) {
    return { allowed: false, reason: 'ACCOUNT_NOT_FOUND' };
  }
  if (account.status === 'suspended') {
    return { allowed: false, reason: 'ACCOUNT_SUSPENDED', account };
  }

  if (!authoritativeUser.account_id && invitationMembership) {
    await service.entities.User.update(authoritativeUser.id, { account_id: accountId });
    authoritativeUser.account_id = accountId;
  }

  const accountMemberships = await service.entities.AccountMembership.filter({ account_id: accountId });
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
    membership = await service.entities.AccountMembership.create({
      user_id: authoritativeUser.id,
      email,
      full_name: authoritativeUser.full_name || null,
      account_id: accountId,
      membership_role: shouldBootstrapAdmin ? 'dealer_admin' : 'full_access',
      access_level: ACCESS_LEVELS.FULL_ACCESS,
      is_account_admin: shouldBootstrapAdmin,
      status: 'active',
      accepted_at: new Date().toISOString(),
    });
    if (shouldBootstrapAdmin) {
      await appendAccountUserAudit(service, {
        accountId,
        actor: authoritativeUser,
        action: 'LEGACY_ADMIN_BOOTSTRAPPED',
        target: authoritativeUser,
        afterAccessLevel: ACCESS_LEVELS.FULL_ACCESS,
        details: { source: 'legacy-user-without-membership' },
      });
    }
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
    membership = await service.entities.AccountMembership.update(membership.id, membershipPatch);
  }

  const userPatch = {};
  if (authoritativeUser.account_role !== (isAccountAdmin ? 'admin' : 'account_user')) {
    userPatch.account_role = isAccountAdmin ? 'admin' : 'account_user';
  }
  if (authoritativeUser.access_level !== accessLevel) userPatch.access_level = accessLevel;
  const appRole = legacyAppRoleForAccess(accessLevel, isAccountAdmin);
  if (authoritativeUser.app_role !== appRole) userPatch.app_role = appRole;
  if (Object.keys(userPatch).length > 0) {
    await service.entities.User.update(authoritativeUser.id, userPatch);
    Object.assign(authoritativeUser, userPatch);
  }

  if (membershipWasPending) {
    await appendAccountUserAudit(service, {
      accountId,
      actor: authoritativeUser,
      action: 'INVITATION_ACCEPTED',
      target: authoritativeUser,
      afterAccessLevel: accessLevel,
    });
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

export function assertCapability(context, capability) {
  if (!context?.allowed || context?.capabilities?.[capability] !== true) {
    const error = new Error('FORBIDDEN');
    error.code = 'FORBIDDEN';
    throw error;
  }
}
