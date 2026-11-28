import { recordSystemIncident } from './systemHealth/incidentRecorder.js';
import { startSoundProofTermOnFirstClaim } from './portalActivationAuthority.js';
import { sendWelcomeEmail } from './invitationEmail/sendWelcomeEmail.js';
import {
  ACCESS_LEVELS,
  ACTIVE_SEAT_STATUSES,
  ADMIN_MEMBERSHIP_ROLES,
  MAX_ACCOUNT_SEATS,
  buildCapabilities,
  getSingle,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
  publicUser,
} from './accountAccessRules.js';

// THE PURE DECISION RULES AND THE READ HELPERS live in accountAccessRules.js, so a
// caller that must resolve access with READS ALONE can share the identical rules
// without importing this module's persistence. They are re-exported here unchanged,
// so every existing importer keeps the names it already used and there is still one
// implementation of each rule.
export {
  ACCESS_LEVELS,
  MAX_ACCOUNT_SEATS,
  buildCapabilities,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
};

// normaliseEmail, normaliseAccessLevel and legacyAppRoleForAccess live in
// accountAccessRules.js, and are re-exported at the top of this module.

// buildCapabilities lives in accountAccessRules.js, and is re-exported above.

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

// getSingle and publicUser live in accountAccessRules.js, so a read-only resolver
// reads the same records and describes a login the same way.

/**
 * Resolves account identity only from the authenticated session and the
 * service-role User/AccountMembership records. No client-supplied account id
 * or permission is trusted.
 */
export async function resolveAccountAccess(base44, sessionUser, {
  bootstrapLegacyMembership = true,
  onStage = () => {},
} = {}) {
  if (!sessionUser?.id) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const service = base44.asServiceRole;
  onStage('authoritative_user_read');
  const authoritativeUser = await getSingle(service, 'User', { id: sessionUser.id });

  // Platform administration is resolved FIRST, from the authenticated Base44
  // session role (and the authoritative record when it is readable), so an
  // administrator can never be denied by any dealer-side requirement below.
  // An administrator is not an account member: direct access must not depend on
  // a Sound Proof account linkage, an AccountMembership, a dealer_account_id or
  // a ****** / PortalIdentity launch. Evaluating this before the record
  // read means a User-read miss can no longer turn an admin into USER_NOT_FOUND,
  // and every dealer rejection (ACCOUNT_NOT_LINKED, MEMBERSHIP_*, the iCubed
  // portal gate) is reached only by non-admin sessions.
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

  // A verified platform login is required before an invitation can confer access.
  if (authoritativeUser.is_verified !== true) {
    return { allowed: false, reason: 'EMAIL_NOT_VERIFIED' };
  }

  const email = normaliseEmail(authoritativeUser.email);
  let accountId = String(authoritativeUser.account_id || '').trim();
  let invitationMembership = null;

  // Prefer an administrator-assigned Base44 user-id membership. This is the
  // production SSO path: a verified external identity never receives account
  // authority from its email, dealer name, URL or account parameter.
  if (!accountId) {
    const assignedRows = await service.entities.AccountMembership.filter({
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

  // Preserve the legacy invitation path for non-portal accounts only. Portal
  // pilot accounts are additionally subject to the verified OIDC/session gate
  // below before any membership or User record is activated.
  if (!accountId && email) {
    const invitationRows = await service.entities.AccountMembership.filter({ email });
    const eligibleInvitations = (invitationRows || []).filter((item) =>
      item.status === 'pending' && !item.user_id
    );
    if (eligibleInvitations.length === 1) {
      invitationMembership = eligibleInvitations[0];
      accountId = String(invitationMembership.account_id || '').trim();
    } else if (eligibleInvitations.length > 1) {
      return { allowed: false, reason: 'MEMBERSHIP_AMBIGUOUS' };
    }
  }

  if (!accountId) {
    return { allowed: false, reason: 'ACCOUNT_NOT_LINKED' };
  }

  onStage('account_lookup');
  const account = await getSingle(service, 'Account', { id: accountId });
  if (!account) {
    return { allowed: false, reason: 'ACCOUNT_NOT_FOUND' };
  }
  if (account.status === 'suspended') {
    return denyAccountAccess(base44, authoritativeUser, account, 'ACCOUNT_SUSPENDED');
  }

  // An inactive account has NOT been explicitly enabled by an administrator.
  // Login, invitation acceptance, legacy linking and Portal SSO must never
  // auto-enable it. Only the manageSoundProofAccess backend function (called
  // by an administrator) may set an account to active.
  //
  // The ONE exception is a Portal-originated first-admin invitation: a pending
  // dealer-admin membership stamped with portal_activation_request_id may be
  // claimed by its invited user even when the account is still inactive. The
  // claim activates the account and starts the 90-day term. This is the only
  // path that auto-activates an inactive account, and it requires the verified
  // user to control the exact invited email address.
  if (account.status === 'inactive') {
    const isPortalFirstAdminClaim =
      invitationMembership?.portal_activation_request_id
      && invitationMembership?.membership_role === 'dealer_admin'
      && invitationMembership?.status === 'pending';
    if (!isPortalFirstAdminClaim) {
      return denyAccountAccess(base44, authoritativeUser, account, 'ACCOUNT_NOT_ACTIVATED');
    }
    // Fall through to membership claim, which will start the term.
  }

  // 90-day Sound Proof access expiry. Applies only to dealer accounts that
  // have an explicit expiry set (administrator activation starts the term).
  // Null = no term set; the account is not subject to the 90-day expiry.
  // Separate from suspension: renewal may extend this date but never clears a
  // manual suspension.
  //
  // TEMPORARY DISABLE (2026-11-16): enforcement of the 90-day expiry is paused
  // until the authenticated Lovable renewal mechanism is implemented and
  // tested. The stored expiry dates are preserved on every account record and
  // untouched; only the access-blocking check below is bypassed. Explicit
  // administrative suspension (account.status === 'suspended') remains enforced
  // by the earlier check above. Re-enable by setting the flag to true once
  // renewal is live.
  // 90-day Sound Proof access expiry is now enforced. The authenticated
  // Lovable renewal mechanism is implemented (portalSoundProofAccess with
  // purpose "renew"), so the temporary disable is lifted. An expired active
  // account is rejected here; the dealer renews through the ******.
  // Backend operations additionally recheck the user flag via the RLS
  // soundproof_access_enabled condition on protected entities.
  // Note: direct entity RLS checks the flag, not the current time. A
  // scheduled reconciliation flips the flag for expired accounts; there is
  // a small delay between expiry and flag flip (see reconcileExpiry workflow).
  if (
    account.status === 'active'
    && account.soundproof_access_expires_at
  ) {
    const expiresAtMs = new Date(account.soundproof_access_expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return denyAccountAccess(base44, authoritativeUser, account, 'ACCOUNT_EXPIRED');
    }
  }

  // All dealer accounts use the same verified user, account and membership
  // authority. Company identity is separately verified at project creation.

  const accountMemberships = await service.entities.AccountMembership.filter({ account_id: accountId });
  const allMemberships = Array.isArray(accountMemberships) ? accountMemberships : [];
  const boundMemberships = allMemberships.filter((item) => item?.user_id === authoritativeUser.id);
  const emailMemberships = allMemberships.filter((item) => email && normaliseEmail(item?.email) === email);
  if (boundMemberships.length > 1) {
    return { allowed: false, reason: 'MEMBERSHIP_AMBIGUOUS', account };
  }
  if (!boundMemberships.length && emailMemberships.some((item) => item.user_id && item.user_id !== authoritativeUser.id)) {
    return { allowed: false, reason: 'MEMBERSHIP_IDENTITY_MISMATCH', account };
  }
  const unboundInvitations = emailMemberships.filter((item) => !item.user_id && item.status === 'pending');
  if (!boundMemberships.length && unboundInvitations.length > 1) {
    return { allowed: false, reason: 'MEMBERSHIP_AMBIGUOUS', account };
  }
  // A userid binding wins; email can claim only an unbound pending invitation.
  let membership = boundMemberships[0] || unboundInvitations[0] || invitationMembership || null;
  if (!membership && emailMemberships.some((item) => item.status === 'removed' || item.status === 'suspended')) {
    return { allowed: false, reason: 'MEMBERSHIP_INACTIVE', account };
  }

  const occupiedMemberships = allMemberships.filter((item) => ACTIVE_SEAT_STATUSES.has(item?.status || 'active'));
  const existingAdmin = occupiedMemberships.find((item) =>
    item?.is_account_admin === true || ADMIN_MEMBERSHIP_ROLES.has(item?.membership_role)
  );

  if (!membership && bootstrapLegacyMembership) {
    // Legacy empty-account admin bootstrap. This auto-creates an account-admin
    // membership for a user who already had account_id on their User record but
    // no AccountMembership. It must NEVER auto-grant administrator membership to
    // a newly imported dealer account. The guard below restricts it to users who
    // arrived with a PRE-EXISTING account link (authoritativeUser.account_id was
    // already set before this call). A user whose account_id was just resolved
    // from an invitation or email match carries invitationMembership and never
    // reaches this branch. Newly imported directory accounts have no users and
    // no memberships, so no user arrives with their account_id until an explicit
    // administrator assignment creates a membership — which means this bootstrap
    // never fires for them. The iCubed pilot path is separate and unaffected.
    const hadExistingAccountLink = Boolean(String(authoritativeUser.account_id || '').trim());
    const shouldBootstrapAdmin =
      authoritativeUser.account_role === 'admin'
      || (hadExistingAccountLink && !existingAdmin && occupiedMemberships.length === 0);
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

  // Validate and start a Portal term before changing membership/User bindings.
  // This also recovers a claim interrupted after the account write without
  // extending the term or requiring another activation grant.
  if (membership.status === 'pending' && membership.portal_activation_request_id) {
    onStage('first_administrator_claim');
    const expiresAt = await startSoundProofTermOnFirstClaim(service, {
      accountId, user: authoritativeUser, membership,
    });
    account.status = 'active';
    account.soundproof_access_expires_at = expiresAt;
  }

  onStage('user_account_binding');
  if (!authoritativeUser.account_id && invitationMembership) {
    await service.entities.User.update(authoritativeUser.id, { account_id: accountId });
    authoritativeUser.account_id = accountId;
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

  onStage('membership_claim');
  if (Object.keys(membershipPatch).length > 0) {
    membership = await service.entities.AccountMembership.update(membership.id, membershipPatch);
  }

  // A membership/Portal claim may have taken time. Re-read the existing
  // account authority before projecting an enabled flag into RLS.
  const currentAccount = await getSingle(service, 'Account', { id: accountId });
  if (!currentAccount) return { allowed: false, reason: 'ACCOUNT_NOT_FOUND' };
  if (currentAccount.status !== 'active') {
    return denyAccountAccess(base44, authoritativeUser, currentAccount,
      currentAccount.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_NOT_ACTIVATED');
  }
  const currentExpiry = currentAccount.soundproof_access_expires_at
    ? Date.parse(currentAccount.soundproof_access_expires_at) : null;
  if (currentExpiry !== null && Number.isFinite(currentExpiry) && currentExpiry <= Date.now()) {
    return denyAccountAccess(base44, authoritativeUser, currentAccount, 'ACCOUNT_EXPIRED');
  }
  Object.assign(account, currentAccount);
  onStage('user_access_projection');
  const userPatch = {};
  // Project/version RLS uses this server-maintained projection. New seats must
  // receive it only after the current account and membership have passed checks.
  // The inactive first-admin path remains the responsibility of the term hook.
  if (account.status === 'active') {
    const enabled = accessLevel === ACCESS_LEVELS.FULL_ACCESS || accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY;
    if (authoritativeUser.soundproof_access_enabled !== enabled) userPatch.soundproof_access_enabled = enabled;
  }
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

    // One-time personalised welcome email. Sent only on the pending→active
    // transition, after the membership is active, the user is projected and
    // (for Portal first-admin) the 90-day term has started. The atomic claim
    // inside sendWelcomeEmail guarantees at most one welcome per membership
    // across concurrent acceptance requests and repeated logins. Fail-open:
    // a delivery failure is recorded in the audit trail but never blocks
    // successful registration, membership acceptance or account activation.
    try {
      await sendWelcomeEmail(service, base44, {
        account,
        membership,
        user: authoritativeUser,
        isAccountAdmin,
      });
    } catch {
      // Welcome delivery is best-effort and never blocks access.
    }
  }

  // Richer Sounds delegated administration: an active member of the verified
  // Custom Install - 93 master account (the RICHER_SOUNDS account whose active
  // ****** link carries trading number "93" with a stamped
  // portal_dealer_account_id) gains a scoped capability. The check runs only
  // for RICHER_SOUNDS accounts and fails open: any read error leaves the flag
  // false and login is unaffected.
  // RS-01: the richerSoundsAdmin delegated capability is restricted to an
  // active ACCOUNT ADMINISTRATOR (dealer-admin / account-admin) of the Custom
  // Install - 93 master account. Ordinary members of 93 no longer receive
  // delegated-admin access; they keep their normal dealer access. Master
  // admins are admitted independently above. The check runs only for
  // RICHER_SOUNDS accounts and fails open: any read error leaves the flag
  // false and login is unaffected.
  let richerSoundsAdmin = false;
  try {
    if (account?.dealer_group === 'RICHER_SOUNDS' && isAccountAdmin) {
      const rsLinks = await service.entities.ExternalAccountLink.filter({ account_id: accountId });
      richerSoundsAdmin = (Array.isArray(rsLinks) ? rsLinks : []).some((link) =>
        link?.active !== false
        && link?.source_system === 'ARTCOUSTIC_PARTNER_PORTAL'
        && String(link?.external_account_number || '').trim() === '93'
        && Boolean(String(link?.portal_dealer_account_id || '').trim())
      );
    }
  } catch {
    richerSoundsAdmin = false;
  }

  return {
    allowed: true,
    reason: null,
    isMasterAdmin: false,
    isAccountAdmin,
    accessLevel,
    capabilities: {
      ...buildCapabilities({
        isMasterAdmin: false,
        isAccountAdmin,
        accessLevel,
      }),
      richerSoundsAdmin,
    },
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
async function denyAccountAccess(base44, user, account, reason) {
  let enforcementFailure = null;
  if (user.soundproof_access_enabled === true) {
    try {
      await base44.asServiceRole.entities.User.update(user.id, { soundproof_access_enabled: false });
      user.soundproof_access_enabled = false;
    } catch (error) {
      enforcementFailure = error?.message || 'Could not clear the protected access flag.';
      try {
        await recordSystemIncident(base44, {
          component: 'account_access', operation: 'access_denial_reconciliation',
          error_code: 'ACCESS_ENFORCEMENT_INCOMPLETE', severity: 'high',
          account_id: account.id, runtime_environment: 'production',
          diagnostic_summary: 'The account authority denied access but its RLS flag could not be cleared. Reconciliation is required.',
          error_detail: enforcementFailure, stage_failed: 'user_access_flag_reconciliation',
        });
      } catch (incidentError) {
        console.error('[accountAccessAuthority] enforcement and incident recording failed', incidentError?.message);
      }
    }
  }
  return { allowed: false, reason, account, enforcement_failed: Boolean(enforcementFailure) };
}