const PORTAL_SOURCE = 'ARTCOUSTIC_PARTNER_PORTAL';
const PORTAL_TARGET = 'SOUND_PROOF';
const PILOT_EXTERNAL_SUBJECT = 'b9d453e8-3386-4294-bd99-7ad2d80120b2';
const BRIDGE_URL = 'https://jzwuhrmbshfyybxbeckf.supabase.co/functions/v1/soundproof-launch-service';

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

async function providerIdToken(base44, base44UserId) {
  const response = await base44.asServiceRole.sso.getIdToken(base44UserId);
  return providerTokenValue(response);
}

async function callBridge(base44, base44UserId, body) {
  const token = await providerIdToken(base44, base44UserId);
  const response = await fetch(BRIDGE_URL, {
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

export async function resolvePilotPortalMapping(service, accountId) {
  const accountLinks = await uniqueRows(service.entities.ExternalAccountLink, {
    account_id: accountId,
    source_system: PORTAL_SOURCE,
    active: true,
  });

  const pilotLinks = accountLinks.filter(
    (link) => link?.partner_user_id === PILOT_EXTERNAL_SUBJECT,
  );
  if (pilotLinks.length === 0) {
    return { required: false, allowed: true, link: null };
  }
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
    && binding?.profile_id === identity.partner_profile_id
    && identity.external_subject === PILOT_EXTERNAL_SUBJECT
    && identity.account_id === mapping.link.account_id
    && hasText(binding?.account_name)
    && hasText(binding?.expires_at)
    && Date.parse(binding.expires_at) > Date.now()
  );
}

export async function consumePilotPortalLaunch(base44, base44User, launchPass) {
  const service = base44.asServiceRole;
  const binding = await callBridge(base44, base44User.id, {
    action: 'consume',
    launch_pass: launchPass,
    target: PORTAL_TARGET,
  });

  if (
    binding?.target !== PORTAL_TARGET
    || binding?.user_id !== PILOT_EXTERNAL_SUBJECT
    || !hasText(binding?.session_id)
    || !hasText(binding?.profile_id)
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

  const memberships = await uniqueRows(service.entities.AccountMembership, {
    account_id: link.account_id,
    user_id: base44User.id,
  });
  const membership = memberships.length === 1 ? memberships[0] : null;
  if (
    !membership
    || !['pending', 'active'].includes(membership.status)
    || membership.is_account_admin !== true
    || membership.access_level !== 'FULL_ACCESS'
  ) {
    throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
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

export async function validatePilotPortalAccessIfRequired(base44, base44User, account) {
  const service = base44.asServiceRole;
  const mapping = await resolvePilotPortalMapping(service, account.id);
  if (!mapping.required) return { required: false, allowed: true };
  if (!mapping.allowed) return mapping;

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
    });
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
  PORTAL_SOURCE,
  PORTAL_TARGET,
};
