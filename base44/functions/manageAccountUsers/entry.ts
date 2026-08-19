import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  ACCESS_LEVELS,
  MAX_ACCOUNT_SEATS,
  appendAccountUserAudit,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
  resolveAccountAccess,
} from '../../shared/accountAccessAuthority.js';

const OCCUPIED_STATUSES = new Set(['pending', 'active']);
const ADMIN_ROLES = new Set(['dealer_admin', 'distributor_admin', 'internal_admin']);
const LEGACY_MEMBERSHIP_ROLES = new Set(['designer', 'viewer']);

function errorResponse(code, message, status = 400) {
  return Response.json({ error: code, message }, { status });
}

function accessLabel(level) {
  if (level === ACCESS_LEVELS.SOUND_PROOF_ONLY) return 'Sound Proof Only';
  if (level === ACCESS_LEVELS.PRICE_LIST_ONLY) return 'Price List Only';
  return 'Full Access';
}

function membershipRole(level, isAccountAdmin) {
  if (isAccountAdmin) return 'dealer_admin';
  if (level === ACCESS_LEVELS.SOUND_PROOF_ONLY) return 'sound_proof_only';
  if (level === ACCESS_LEVELS.PRICE_LIST_ONLY) return 'price_list_only';
  return 'full_access';
}

function isMembershipAdmin(membership) {
  return membership?.is_account_admin === true || ADMIN_ROLES.has(membership?.membership_role);
}

function accountAdminMembershipId(memberships) {
  const occupied = (memberships || []).filter((membership) =>
    OCCUPIED_STATUSES.has(membership.status || 'active')
  );
  const explicit = occupied.find(isMembershipAdmin);
  if (explicit) return explicit.id;

  // Existing single-user accounts pre-date account administration. Their sole
  // legacy designer/viewer seat is the primary administrator by definition.
  if (occupied.length === 1 && LEGACY_MEMBERSHIP_ROLES.has(occupied[0]?.membership_role)) {
    return occupied[0].id;
  }
  return null;
}

function memberView(membership, userById, inferredAdminId = null) {
  const linkedUser = membership?.user_id ? userById.get(membership.user_id) : null;
  const accountAdmin = isMembershipAdmin(membership) || membership?.id === inferredAdminId;
  const level = accountAdmin
    ? ACCESS_LEVELS.FULL_ACCESS
    : normaliseAccessLevel(membership?.access_level, ACCESS_LEVELS.FULL_ACCESS);
  return {
    id: membership.id,
    user_id: membership.user_id || linkedUser?.id || null,
    email: normaliseEmail(membership.email || linkedUser?.email),
    full_name: membership.full_name || linkedUser?.full_name || null,
    access_level: level,
    access_label: accountAdmin ? 'Account Admin' : accessLabel(level),
    is_account_admin: accountAdmin,
    status: membership.status || (linkedUser ? 'active' : 'pending'),
    invited_at: membership.invited_at || null,
    accepted_at: membership.accepted_at || null,
    removed_at: membership.removed_at || null,
    is_verified: linkedUser?.is_verified === true,
  };
}

async function resolveTargetAccount(service, context, requestedAccountId) {
  const accountId = context.isMasterAdmin
    ? String(requestedAccountId || '').trim()
    : String(context.user?.account_id || '').trim();

  if (!accountId) return null;
  const accounts = await service.entities.Account.filter({ id: accountId });
  return Array.isArray(accounts) && accounts.length === 1 ? accounts[0] : null;
}

async function loadAccountUsers(service, account) {
  const [memberships, accountUsers, audits] = await Promise.all([
    service.entities.AccountMembership.filter({ account_id: account.id }, '-created_date', 100),
    service.entities.User.filter({ account_id: account.id }, '-created_date', 100),
    service.entities.AccountUserAudit.filter({ account_id: account.id }, '-occurred_at', 100),
  ]);
  const userById = new Map((accountUsers || []).map((user) => [user.id, user]));
  const inferredAdminId = accountAdminMembershipId(memberships || []);
  const members = (memberships || [])
    .map((membership) => memberView(membership, userById, inferredAdminId))
    .sort((a, b) => {
      if (a.is_account_admin !== b.is_account_admin) return a.is_account_admin ? -1 : 1;
      return String(a.email).localeCompare(String(b.email));
    });
  const occupied = members.filter((member) => OCCUPIED_STATUSES.has(member.status));

  return {
    account: {
      id: account.id,
      name: account.name,
      account_type: account.account_type,
      status: account.status,
    },
    members,
    audits: (audits || []).map((audit) => ({
      id: audit.id,
      action: audit.action,
      actor_email: audit.actor_email,
      target_email: audit.target_email,
      before_access_level: audit.before_access_level || null,
      after_access_level: audit.after_access_level || null,
      occurred_at: audit.occurred_at,
      details: audit.details || null,
    })),
    seats: {
      used: occupied.length,
      additional_used: Math.max(0, occupied.length - (occupied.some((m) => m.is_account_admin) ? 1 : 0)),
      maximum: MAX_ACCOUNT_SEATS,
      remaining: Math.max(0, MAX_ACCOUNT_SEATS - occupied.length),
    },
  };
}

async function inviteThroughPlatform(base44, email) {
  const response = await base44.asServiceRole.functions.invoke(
    'sendAccountUserInvitation',
    { email },
  );
  const payload = response?.data || response || {};
  if (payload?.sent !== true) {
    throw new Error(payload?.message || payload?.error || 'INVITATION_SERVICE_UNAVAILABLE');
  }
  return payload;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) return errorResponse('UNAUTHENTICATED', 'Authentication required.', 401);

    const context = await resolveAccountAccess(base44, sessionUser);
    if (!context.allowed) {
      return errorResponse(context.reason || 'FORBIDDEN', 'Account access is not available.', 403);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = String(body.action || 'list');
    const service = base44.asServiceRole;

    if (action === 'list_all') {
      if (!context.isMasterAdmin) {
        return errorResponse('FORBIDDEN', 'Only the Sound Proof master admin can view every account.', 403);
      }
      const [accounts, memberships, users] = await Promise.all([
        service.entities.Account.list('name', 500),
        service.entities.AccountMembership.list('-created_date', 1000),
        service.entities.User.list('-created_date', 1000),
      ]);
      const userById = new Map((users || []).map((user) => [user.id, user]));
      const byAccount = new Map();
      for (const account of (accounts || [])) {
        byAccount.set(account.id, {
          account: {
            id: account.id,
            name: account.name,
            account_type: account.account_type,
            status: account.status,
          },
          members: [],
        });
      }
      for (const membership of (memberships || [])) {
        if (!byAccount.has(membership.account_id)) continue;
        byAccount.get(membership.account_id).members.push(membership);
      }
      const rows = Array.from(byAccount.values()).map((row) => {
        const inferredAdminId = accountAdminMembershipId(row.members);
        row.members = row.members.map((membership) => memberView(membership, userById, inferredAdminId));
        row.members.sort((a, b) => {
          if (a.is_account_admin !== b.is_account_admin) return a.is_account_admin ? -1 : 1;
          return String(a.email).localeCompare(String(b.email));
        });
        row.seats_used = row.members.filter((member) => OCCUPIED_STATUSES.has(member.status)).length;
        return row;
      });
      return Response.json({ accounts: rows, maximum_seats: MAX_ACCOUNT_SEATS });
    }

    if (!context.isMasterAdmin && context.capabilities?.manageUsers !== true) {
      return errorResponse('FORBIDDEN', 'Only the account administrator can manage users.', 403);
    }

    const account = await resolveTargetAccount(service, context, body.account_id);
    if (!account) return errorResponse('ACCOUNT_NOT_FOUND', 'Account not found.', 404);

    if (action === 'list') {
      return Response.json(await loadAccountUsers(service, account));
    }

    const memberships = await service.entities.AccountMembership.filter({ account_id: account.id });
    const allMemberships = Array.isArray(memberships) ? memberships : [];
    const occupied = allMemberships.filter((membership) =>
      OCCUPIED_STATUSES.has(membership.status || 'active')
    );
    const protectedAdminId = accountAdminMembershipId(allMemberships);

    if (action === 'invite') {
      const email = normaliseEmail(body.email);
      if (!email || !email.includes('@')) {
        return errorResponse('INVALID_EMAIL', 'Enter a valid email address.');
      }
      const requestedAccess = normaliseAccessLevel(body.access_level, '');
      if (!requestedAccess) {
        return errorResponse('INVALID_ACCESS_LEVEL', 'Choose Full Access, Sound Proof Only or Price List Only.');
      }

      const makeAccountAdmin = context.isMasterAdmin && body.is_account_admin === true;
      const existingAccountAdmin = occupied.find((membership) => membership.id === protectedAdminId);
      if (makeAccountAdmin && existingAccountAdmin) {
        return errorResponse('ACCOUNT_ADMIN_EXISTS', 'This account already has its primary administrator.', 409);
      }
      if (!makeAccountAdmin && !existingAccountAdmin && context.isMasterAdmin) {
        return errorResponse('ACCOUNT_ADMIN_REQUIRED', 'Create the account administrator before adding the four additional users.', 409);
      }
      if (occupied.length >= MAX_ACCOUNT_SEATS) {
        return errorResponse('SEAT_LIMIT_REACHED', 'This account already has its maximum of five logins.', 409);
      }

      const duplicate = occupied.find((membership) => normaliseEmail(membership.email) === email);
      if (duplicate) {
        return errorResponse('EMAIL_ALREADY_ADDED', 'That email already occupies a seat in this account.', 409);
      }

      const otherMemberships = await service.entities.AccountMembership.filter({ email });
      const activeElsewhere = (otherMemberships || []).find((membership) =>
        membership.account_id !== account.id
        && OCCUPIED_STATUSES.has(membership.status || 'active')
      );
      if (activeElsewhere) {
        return errorResponse(
          'EMAIL_LINKED_TO_ANOTHER_ACCOUNT',
          'That email is already linked to another account. Contact the Sound Proof master admin.',
          409,
        );
      }

      try {
        await inviteThroughPlatform(base44, email);
      } catch (inviteError) {
        return errorResponse(
          'INVITATION_FAILED',
          inviteError?.message === 'INVITATION_SERVICE_UNAVAILABLE'
            ? 'The invitation service is unavailable.'
            : 'The email invitation could not be sent.',
          502,
        );
      }

      const userRows = await service.entities.User.filter({ email });
      const linkedUser = Array.isArray(userRows) && userRows.length > 0 ? userRows[0] : null;
      const accessLevel = makeAccountAdmin ? ACCESS_LEVELS.FULL_ACCESS : requestedAccess;
      const now = new Date().toISOString();
      const removedMembership = allMemberships.find((membership) =>
        normaliseEmail(membership.email) === email && membership.status === 'removed'
      );
      const membershipPayload = {
        user_id: linkedUser?.id || null,
        email,
        full_name: linkedUser?.full_name || null,
        account_id: account.id,
        membership_role: membershipRole(accessLevel, makeAccountAdmin),
        access_level: accessLevel,
        is_account_admin: makeAccountAdmin,
        status: 'pending',
        invited_by_user_id: context.user.id,
        invited_by_email: context.user.email,
        invited_at: now,
        accepted_at: null,
        removed_at: null,
        removed_by_user_id: null,
      };

      const membership = removedMembership
        ? await service.entities.AccountMembership.update(removedMembership.id, membershipPayload)
        : await service.entities.AccountMembership.create(membershipPayload);

      if (linkedUser) {
        await service.entities.User.update(linkedUser.id, {
          account_id: account.id,
          account_role: makeAccountAdmin ? 'admin' : 'account_user',
          access_level: accessLevel,
          app_role: legacyAppRoleForAccess(accessLevel, makeAccountAdmin),
          disabled: false,
        });
      }

      await appendAccountUserAudit(service, {
        accountId: account.id,
        actor: context.user,
        action: 'INVITED',
        target: { id: linkedUser?.id || null, email },
        afterAccessLevel: accessLevel,
        details: {
          is_account_admin: makeAccountAdmin,
          membership_id: membership.id,
        },
      });

      return Response.json(await loadAccountUsers(service, account), { status: 201 });
    }

    const membershipId = String(body.membership_id || '').trim();
    const target = allMemberships.find((membership) => membership.id === membershipId);
    if (!target || target.account_id !== account.id) {
      return errorResponse('MEMBERSHIP_NOT_FOUND', 'User membership not found.', 404);
    }

    if (action === 'change_access') {
      if (isMembershipAdmin(target) || target.id === protectedAdminId) {
        return errorResponse('ACCOUNT_ADMIN_FIXED', 'The primary administrator always has Full Access.', 409);
      }
      if (!OCCUPIED_STATUSES.has(target.status || 'active')) {
        return errorResponse('MEMBERSHIP_INACTIVE', 'Removed or suspended users cannot be changed.', 409);
      }
      const accessLevel = normaliseAccessLevel(body.access_level, '');
      if (!accessLevel) {
        return errorResponse('INVALID_ACCESS_LEVEL', 'Choose a valid access level.');
      }
      const before = normaliseAccessLevel(target.access_level, ACCESS_LEVELS.FULL_ACCESS);
      await service.entities.AccountMembership.update(target.id, {
        access_level: accessLevel,
        membership_role: membershipRole(accessLevel, false),
      });
      if (target.user_id) {
        await service.entities.User.update(target.user_id, {
          access_level: accessLevel,
          app_role: legacyAppRoleForAccess(accessLevel, false),
        });
      }
      await appendAccountUserAudit(service, {
        accountId: account.id,
        actor: context.user,
        action: 'ACCESS_CHANGED',
        target,
        beforeAccessLevel: before,
        afterAccessLevel: accessLevel,
      });
      return Response.json(await loadAccountUsers(service, account));
    }

    if (action === 'resend') {
      if (target.status === 'removed') {
        return errorResponse('MEMBERSHIP_INACTIVE', 'Removed users must be invited again.');
      }
      const email = normaliseEmail(target.email);
      try {
        await inviteThroughPlatform(base44, email);
      } catch {
        return errorResponse('INVITATION_FAILED', 'The invitation could not be resent.', 502);
      }
      await service.entities.AccountMembership.update(target.id, {
        invited_at: new Date().toISOString(),
        invited_by_user_id: context.user.id,
        invited_by_email: context.user.email,
      });
      await appendAccountUserAudit(service, {
        accountId: account.id,
        actor: context.user,
        action: 'INVITATION_RESENT',
        target,
        afterAccessLevel: target.access_level || ACCESS_LEVELS.FULL_ACCESS,
      });
      return Response.json(await loadAccountUsers(service, account));
    }

    if (action === 'remove') {
      if (isMembershipAdmin(target) || target.id === protectedAdminId) {
        return errorResponse('ACCOUNT_ADMIN_FIXED', 'The primary account administrator cannot be removed.', 409);
      }
      if (target.user_id === context.user.id) {
        return errorResponse('CANNOT_REMOVE_SELF', 'You cannot remove your own login.', 409);
      }
      const now = new Date().toISOString();
      await service.entities.AccountMembership.update(target.id, {
        status: 'removed',
        removed_at: now,
        removed_by_user_id: context.user.id,
      });
      if (target.user_id) {
        await service.entities.User.update(target.user_id, {
          disabled: true,
          account_id: '',
          account_role: 'account_user',
        });
      }
      await appendAccountUserAudit(service, {
        accountId: account.id,
        actor: context.user,
        action: 'REMOVED',
        target,
        beforeAccessLevel: normaliseAccessLevel(target.access_level, ACCESS_LEVELS.FULL_ACCESS),
        details: { membership_id: target.id },
      });
      return Response.json(await loadAccountUsers(service, account));
    }

    return errorResponse('UNKNOWN_ACTION', 'Unsupported account-user action.', 400);
  } catch (error) {
    return Response.json({
      error: 'ACCOUNT_USER_MANAGEMENT_FAILED',
      message: error?.message || 'Unable to manage account users.',
    }, { status: 500 });
  }
}
