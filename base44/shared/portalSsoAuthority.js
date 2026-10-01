import {
  BRIDGE_URL_SECRET,
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from './pilotPortalConstants.js';
import {
  PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES,
  recordPortalLaunchDiagnostic,
} from './portalLaunchDiagnostics.js';
import { claimPilotPortalAdministratorSeat } from './pilotSeatClaimAuthority.js';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function providerTokenValue(response) {
  const candidate = (value, depth = 0) => {
    if (depth > 4) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== trimmed) return candidate(parsed, depth + 1);
      } catch {
        return trimmed;
      }
      return trimmed;
    }
    if (value && typeof value === 'object') {
      return candidate(
        value.id_token
        ?? value.idToken
        ?? value.token
        ?? value.value
        ?? value.data?.id_token
        ?? value.data?.idToken
        ?? value.data?.token
        ?? value.data?.value
        ?? value.data,
        depth + 1,
      );
    }
    return null;
  };

  let token = candidate(response);
  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  if (!hasText(token)) throw new Error('PROVIDER_TOKEN_UNAVAILABLE');
  return token;
}

export async function providerIdToken(base44, base44UserId) {
  const response = await base44.asServiceRole.sso.getIdToken(base44UserId);
  return providerTokenValue(response);
}

function providerAccessTokenValue(response) {
  const candidate = response?.access_token
    ?? response?.accessToken
    ?? response?.data?.access_token
    ?? response?.data?.accessToken
    ?? response?.data
    ?? response;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('PROVIDER_ACCESS_TOKEN_UNAVAILABLE');
  }
  const token = candidate.trim();
  return token.startsWith('Bearer ') ? token.slice(7) : token;
}

export async function providerAccessToken(base44, base44UserId) {
  const response = await base44.asServiceRole.sso.getAccessToken(base44UserId);
  return providerAccessTokenValue(response);
}

function configuredBridgeUrl(override) {
  const raw = hasText(override)
    ? override
    : globalThis.Deno?.env?.get?.(BRIDGE_URL_SECRET);
  if (!hasText(raw)) throw new Error('PORTAL_BRIDGE_URL_UNAVAILABLE');

  let endpoint;
  try {
    endpoint = new URL(raw.trim());
  } catch {
    throw new Error('PORTAL_BRIDGE_URL_INVALID');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('PORTAL_BRIDGE_URL_INVALID');
  }
  return endpoint.toString();
}

async function callBridge(base44, base44UserId, body, bridgeUrl) {
  const token = await providerIdToken(base44, base44UserId);
  const response = await fetch(configuredBridgeUrl(bridgeUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload?.binding) {
    throw new Error('PORTAL_SESSION_REJECTED');
  }
  return payload.binding;
}

async function uniqueRows(entity, query) {
  const rows = await entity.filter(query);
  return Array.isArray(rows) ? rows : [];
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isPortalAdministratorMembership(membership) {
  return (
    membership?.is_account_admin === true
    && membership?.membership_role === 'dealer_admin'
    && membership?.access_level === 'FULL_ACCESS'
  );
}

async function resolveOrClaimPortalAdministratorMembership(
  service,
  base44User,
  accountId,
) {
  const accountMemberships = await uniqueRows(
    service.entities.AccountMembership,
    { account_id: accountId },
  );

  const linked = accountMemberships.filter(
    (membership) => membership?.user_id === base44User.id,
  );
  if (linked.length > 1) throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');
  if (linked.length === 1) {
    const membership = linked[0];
    if (
      !['pending', 'active'].includes(membership.status)
      || !isPortalAdministratorMembership(membership)
    ) {
      throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
    }
    return { membership, claimed: false };
  }

  const email = normaliseEmail(base44User?.email);
  if (!hasText(email)) throw new Error('PORTAL_MEMBERSHIP_EMAIL_REQUIRED');

  const membershipsForEmail = await uniqueRows(
    service.entities.AccountMembership,
    { email },
  );
  if (membershipsForEmail.some(
    (membership) => membership?.user_id && membership.user_id !== base44User.id,
  )) {
    throw new Error('PORTAL_MEMBERSHIP_ALREADY_CLAIMED');
  }
  if (membershipsForEmail.some(
    (membership) => membership?.account_id !== accountId,
  )) {
    throw new Error('PORTAL_MEMBERSHIP_ACCOUNT_MISMATCH');
  }

  const unclaimedAdministrators = accountMemberships.filter(
    (membership) =>
      membership?.status === 'pending'
      && !membership?.user_id
      && isPortalAdministratorMembership(membership),
  );
  if (unclaimedAdministrators.length > 1) {
    throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');
  }

  const candidates = unclaimedAdministrators.filter(
    (membership) => normaliseEmail(membership?.email) === email,
  );
  if (candidates.length !== 1) {
    if (unclaimedAdministrators.length === 1) {
      await recordPortalLaunchDiagnostic(service, {
        event: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
        reason: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
        base44User,
        accountId,
        membershipId: unclaimedAdministrators[0]?.id || null,
        details: {
          seat_email: normaliseEmail(unclaimedAdministrators[0]?.email) || null,
          base44_user_email: email,
          claim_route: 'invited_email_match',
        },
      });
      throw new Error('PORTAL_MEMBERSHIP_EMAIL_MISMATCH');
    }
    throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
  }

  const membership = await service.entities.AccountMembership.update(
    candidates[0].id,
    { user_id: base44User.id },
  );
  return { membership, claimed: true };
}

export async function resolvePilotPortalMapping(service, accountId) {
  if (accountId !== PILOT_SOUND_PROOF_ACCOUNT_ID) {
    return { required: false, allowed: true, link: null };
  }

  const accountLinks = await uniqueRows(service.entities.ExternalAccountLink, {
    account_id: accountId,
    source_system: PORTAL_SOURCE,
    active: true,
  });

  const pilotLinks = accountLinks.filter(
    (link) => link?.partner_user_id === PILOT_EXTERNAL_SUBJECT,
  );
  if (pilotLinks.length !== 1) {
    return { required: true, allowed: false, reason: 'PORTAL_MAPPING_AMBIGUOUS' };
  }

  const identityLinks = await uniqueRows(service.entities.ExternalAccountLink, {
    source_system: PORTAL_SOURCE,
    partner_user_id: PILOT_EXTERNAL_SUBJECT,
    active: true,
  });
  if (
    identityLinks.length !== 1
    || identityLinks[0]?.id !== pilotLinks[0]?.id
    || identityLinks[0]?.account_id !== accountId
  ) {
    return { required: true, allowed: false, reason: 'PORTAL_MAPPING_AMBIGUOUS' };
  }

  return { required: true, allowed: true, link: pilotLinks[0] };
}

function bindingMatches(binding, identity, mapping) {
  return (
    binding?.target === PORTAL_TARGET
    && binding?.user_id === PILOT_EXTERNAL_SUBJECT
    && binding?.session_id === identity.portal_session_id
    && binding?.profile_id === PILOT_PARTNER_PROFILE_ID
    && identity.partner_profile_id === PILOT_PARTNER_PROFILE_ID
    && identity.external_subject === PILOT_EXTERNAL_SUBJECT
    && identity.account_id === mapping.link.account_id
    && hasText(binding?.account_name)
    && hasText(binding?.expires_at)
    && Date.parse(binding.expires_at) > Date.now()
  );
}

export async function consumePilotPortalLaunch(base44, base44User, launchPass, {
  bridgeUrl,
  associateDealerIdentity,
} = {}) {
  const service = base44.asServiceRole;
  const binding = await callBridge(base44, base44User.id, {
    action: 'consume',
    launch_pass: launchPass,
    target: PORTAL_TARGET,
  }, bridgeUrl);

  // A binding that identifies a different Partner Portal profile is its own
  // durable event, recorded before the launch is rejected.
  if (hasText(binding?.profile_id) && binding.profile_id !== PILOT_PARTNER_PROFILE_ID) {
    await recordPortalLaunchDiagnostic(service, {
      event: 'PROFILE_MISMATCH',
      reason: 'PORTAL_BINDING_INVALID',
      base44User,
      binding,
      details: {
        expected_profile_id: PILOT_PARTNER_PROFILE_ID,
        received_profile_id: binding.profile_id,
      },
    });
  }

  if (
    binding?.target !== PORTAL_TARGET
    || binding?.user_id !== PILOT_EXTERNAL_SUBJECT
    || !hasText(binding?.session_id)
    || binding?.profile_id !== PILOT_PARTNER_PROFILE_ID
    || !hasText(binding?.account_name)
    || !hasText(binding?.expires_at)
    || Date.parse(binding.expires_at) <= Date.now()
  ) {
    throw new Error('PORTAL_BINDING_INVALID');
  }

  const identityLinks = await uniqueRows(service.entities.ExternalAccountLink, {
    source_system: PORTAL_SOURCE,
    partner_user_id: binding.user_id,
    active: true,
  });
  if (identityLinks.length !== 1) throw new Error('PORTAL_MAPPING_AMBIGUOUS');
  const link = identityLinks[0];

  const accounts = await uniqueRows(service.entities.Account, { id: link.account_id });
  if (accounts.length !== 1 || accounts[0]?.status !== 'active') {
    throw new Error('PORTAL_ACCOUNT_INACTIVE');
  }

  // Require the dealer identity association attempt before claiming a
  // membership or writing derived PortalIdentity data. The callback is a
  // server-only dependency, never a client-supplied identity.
  if (typeof associateDealerIdentity !== 'function') {
    throw new Error('DEALER_ASSOCIATION_REQUIRED');
  }
  const association = await associateDealerIdentity();

  // The iCubed pilot's authority is the verified launch binding consumed and
  // validated above: the Partner Portal bridge has already checked the portal
  // subject, profile, live session and expiry server-side. The pilot therefore
  // claims its seat from that binding, never from the invited seat email —
  // whether or not the access-token-backed Dealer Identity resolve answers.
  const pilotLaunchContext =
    binding.target === PORTAL_TARGET
    && binding.user_id === PILOT_EXTERNAL_SUBJECT
    && binding.profile_id === PILOT_PARTNER_PROFILE_ID
    && link.account_id === PILOT_SOUND_PROOF_ACCOUNT_ID;

  // A stored dealer identity that disagrees with the live portal identity is a
  // security failure everywhere — including the pilot. Never silently relink.
  if (association?.reason === 'DEALER_IDENTITY_MISMATCH') {
    await recordPortalLaunchDiagnostic(service, {
      event: 'DEALER_IDENTITY_MISMATCH',
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: 'DEALER_IDENTITY_MISMATCH',
      base44User,
      binding,
      accountId: link.account_id,
      details: {
        stored_dealer_account_id: association?.stored_dealer_account_id || null,
        resolved_dealer_account_id: association?.resolved_dealer_account_id || null,
      },
    });
    throw new Error('DEALER_IDENTITY_MISMATCH');
  }

  if (association?.resolved !== true) {
    const associationReason = String(association?.reason || 'DEALER_IDENTITY_UNRESOLVED');
    await recordPortalLaunchDiagnostic(service, {
      event: associationReason === 'NO_PORTAL_TOKEN' ? 'NO_PORTAL_TOKEN' : associationReason,
      outcome: pilotLaunchContext
        ? PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FALLBACK_PILOT_BINDING
        : PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: associationReason,
      base44User,
      binding,
      accountId: link.account_id,
      details: {
        pilot_account: link.account_id === PILOT_SOUND_PROOF_ACCOUNT_ID,
        access_token_available: associationReason !== 'NO_PORTAL_TOKEN',
        claim_route: pilotLaunchContext ? 'verified_binding' : 'blocked',
      },
    });
    if (!pilotLaunchContext) {
      throw new Error(associationReason);
    }
  }

  // Claim the one pre-created dealer-administrator seat. The pilot claims it
  // from the verified portal binding; every other account keeps the existing
  // email-matched rule unchanged. Ambiguous, foreign or already-claimed seats
  // fail closed in both routes.
  let claim;
  try {
    claim = pilotLaunchContext
      ? await claimPilotPortalAdministratorSeat({ service, base44User, binding, link })
      : await resolveOrClaimPortalAdministratorMembership(service, base44User, link.account_id);
  } catch (claimError) {
    await recordPortalLaunchDiagnostic(service, {
      event: 'MEMBERSHIP_CLAIM_FAILED',
      reason: String(claimError?.message || 'MEMBERSHIP_CLAIM_FAILED'),
      base44User,
      binding,
      accountId: link.account_id,
      details: {
        claim_route: pilotLaunchContext ? 'verified_binding' : 'invited_email_match',
      },
    });
    throw claimError;
  }

  if (claim?.claimed) {
    await recordPortalLaunchDiagnostic(service, {
      event: 'MEMBERSHIP_CLAIMED',
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
      base44User,
      binding,
      accountId: link.account_id,
      membershipId: claim.membership?.id || null,
      details: {
        claim_route: pilotLaunchContext ? 'verified_binding' : 'invited_email_match',
        email_match_used: !pilotLaunchContext,
        previous_user_id: claim.previousUserId || null,
      },
    });
  }

  const identities = await uniqueRows(service.entities.PortalIdentity, {
    base44_user_id: base44User.id,
    target: PORTAL_TARGET,
  });
  if (identities.length > 1) throw new Error('PORTAL_IDENTITY_AMBIGUOUS');
  const existing = identities[0] || null;
  if (
    existing
    && (
      existing.external_subject !== binding.user_id
      || existing.account_id !== link.account_id
      || existing.partner_profile_id !== binding.profile_id
    )
  ) {
    throw new Error('PORTAL_IDENTITY_CONFLICT');
  }

  const data = {
    base44_user_id: base44User.id,
    external_subject: binding.user_id,
    portal_session_id: binding.session_id,
    partner_profile_id: binding.profile_id,
    account_id: link.account_id,
    account_name: binding.account_name,
    access_mode: 'PORTAL_SSO',
    target: PORTAL_TARGET,
    binding_expires_at: binding.expires_at,
    last_verified_at: new Date().toISOString(),
  };
  const identity = existing
    ? await service.entities.PortalIdentity.update(existing.id, data)
    : await service.entities.PortalIdentity.create(data);

  await recordPortalLaunchDiagnostic(service, {
    event: 'PORTAL_IDENTITY_CREATED',
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    binding,
    accountId: identity.account_id,
    membershipId: claim?.membership?.id || null,
    details: {
      operation: existing ? 'updated' : 'created',
      identity_id: identity.id,
      identity_authority: 'verified_launch_binding',
    },
  });

  if (accounts[0].name !== binding.account_name) {
    await service.entities.Account.update(accounts[0].id, { name: binding.account_name });
  }
  if (link.external_account_name !== binding.account_name) {
    await service.entities.ExternalAccountLink.update(link.id, {
      external_account_name: binding.account_name,
    });
  }

  return {
    ok: true,
    account_id: identity.account_id,
    account_name: binding.account_name,
  };
}

export async function validatePilotPortalAccessIfRequired(base44, base44User, account, {
  bridgeUrl,
} = {}) {
  const service = base44.asServiceRole;
  const mapping = await resolvePilotPortalMapping(service, account.id);
  if (!mapping.required) return { required: false, allowed: true };
  if (!mapping.allowed) return mapping;
  if (account.status !== 'active') {
    return { required: true, allowed: false, reason: 'PORTAL_ACCOUNT_INACTIVE' };
  }

  try {
    const identities = await uniqueRows(service.entities.PortalIdentity, {
      base44_user_id: base44User.id,
      target: PORTAL_TARGET,
    });
    if (identities.length !== 1) {
      return { required: true, allowed: false, reason: 'PORTAL_IDENTITY_NOT_BOUND' };
    }
    const identity = identities[0];

    const binding = await callBridge(base44, base44User.id, {
      action: 'validate_session',
      portal_session_id: identity.portal_session_id,
      target: PORTAL_TARGET,
    }, bridgeUrl);
    if (!bindingMatches(binding, identity, mapping)) {
      return { required: true, allowed: false, reason: 'PORTAL_SESSION_REJECTED' };
    }

    const verifiedAt = new Date().toISOString();
    await service.entities.PortalIdentity.update(identity.id, {
      account_name: binding.account_name,
      binding_expires_at: binding.expires_at,
      last_verified_at: verifiedAt,
    });
    if (account.name !== binding.account_name) {
      await service.entities.Account.update(account.id, { name: binding.account_name });
      account.name = binding.account_name;
    }
    if (mapping.link.external_account_name !== binding.account_name) {
      await service.entities.ExternalAccountLink.update(mapping.link.id, {
        external_account_name: binding.account_name,
      });
    }

    return { required: true, allowed: true };
  } catch {
    return { required: true, allowed: false, reason: 'PORTAL_SESSION_REJECTED' };
  }
}

export {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
};