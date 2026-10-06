import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from './pilotPortalConstants.js';
import {
  PORTAL_LAUNCH_DIAGNOSTIC_EVENTS,
  PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES,
  recordPortalLaunchDiagnostic,
} from './portalLaunchDiagnostics.js';
import { claimPilotPortalAdministratorSeat } from './pilotSeatClaimAuthority.js';
import { hasText, normaliseEmail, uniqueRows } from './portalPrimitives.js';
import { callBridge, providerAccessToken, providerIdToken } from './portalBridgeTransport.js';
import { bindingGateFailure as classifyBindingGateFailure } from './portalBindingGate.js';
import {
  resolveOrClaimPortalAdministratorMembership as resolveAccountAdministratorMembership,
} from './portalMembershipClaim.js';

// Provider tokens and the bridge call now live in portalBridgeTransport.js, the
// binding gate in portalBindingGate.js, and the email-matched seat claim in
// portalMembershipClaim.js. They are re-exported here so every existing
// importer keeps one stable entry point and no import path changes.
export { providerAccessToken, providerIdToken };

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
  const expectedPilot = {
    expectedSubject: PILOT_EXTERNAL_SUBJECT,
    expectedProfileId: PILOT_PARTNER_PROFILE_ID,
  };

  // The launch pass has been consumed by the time this function runs, so the
  // trail starts here: a launch that never records anything after this point
  // means it did not reach this app environment at all.
  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.LAUNCH_STARTED,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    launchPass,
    ...expectedPilot,
    details: { stage: 'launch_started', binding_present: false },
  });

  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.BRIDGE_CONSUME_ATTEMPTED,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    launchPass,
    ...expectedPilot,
    details: { stage: 'bridge_consume' },
  });

  let binding;
  try {
    binding = await callBridge(base44, base44User.id, {
      action: 'consume',
      launch_pass: launchPass,
      target: PORTAL_TARGET,
    }, bridgeUrl);
  } catch (bridgeError) {
    // The binding never arrived, so there is no binding identity to record —
    // the bridge envelope itself is what this environment rejected.
    const bridgeReason = String(bridgeError?.message || 'PORTAL_SESSION_REJECTED');
    await recordPortalLaunchDiagnostic(service, {
      event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.BRIDGE_RESPONSE_INVALID,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: bridgeReason,
      base44User,
      launchPass,
      ...expectedPilot,
      failureReason: bridgeReason,
      details: { stage: 'bridge_consume', binding_present: false },
    });
    throw bridgeError;
  }

  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.BRIDGE_CONSUME_RETURNED,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    binding,
    launchPass,
    ...expectedPilot,
    details: {
      stage: 'bridge_consume',
      binding_present: true,
      binding_target: hasText(binding?.target) ? binding.target : null,
      binding_session_present: hasText(binding?.session_id),
      binding_account_name_present: hasText(binding?.account_name),
      binding_expires_at: hasText(binding?.expires_at) ? binding.expires_at : null,
    },
  });

  // A binding that identifies a different Partner Portal profile is its own
  // durable event, recorded before the launch is rejected.
  if (hasText(binding?.profile_id) && binding.profile_id !== PILOT_PARTNER_PROFILE_ID) {
    await recordPortalLaunchDiagnostic(service, {
      event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PROFILE_MISMATCH,
      reason: 'PORTAL_BINDING_INVALID',
      base44User,
      binding,
      launchPass,
      ...expectedPilot,
      failureReason: 'PROFILE_MISMATCH',
      details: {
        expected_profile_id: PILOT_PARTNER_PROFILE_ID,
        received_profile_id: binding.profile_id,
        stage: 'binding_gate',
      },
    });
  }

  const bindingFailure = classifyBindingGateFailure(binding);
  if (bindingFailure) {
    await recordPortalLaunchDiagnostic(service, {
      event: bindingFailure.event,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: bindingFailure.reason,
      base44User,
      binding,
      launchPass,
      ...expectedPilot,
      failureReason: bindingFailure.reason,
      details: { stage: 'binding_gate', ...(bindingFailure.details || {}) },
    });
    throw new Error(bindingFailure.reason);
  }

  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PILOT_BINDING_VERIFIED,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    binding,
    launchPass,
    ...expectedPilot,
    details: {
      stage: 'binding_gate',
      binding_target: binding.target,
      binding_expires_at: binding.expires_at,
    },
  });

  const identityLinks = await uniqueRows(service.entities.ExternalAccountLink, {
    source_system: PORTAL_SOURCE,
    partner_user_id: binding.user_id,
    active: true,
  });
  if (identityLinks.length !== 1) {
    const ambiguous = identityLinks.length > 1;
    const linkReason = ambiguous ? 'PORTAL_MAPPING_AMBIGUOUS' : 'PORTAL_EXTERNAL_LINK_NOT_FOUND';
    await recordPortalLaunchDiagnostic(service, {
      event: ambiguous
        ? PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.EXTERNAL_LINK_AMBIGUOUS
        : PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.EXTERNAL_LINK_NOT_FOUND,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: linkReason,
      base44User,
      binding,
      launchPass,
      ...expectedPilot,
      externalLinkCount: identityLinks.length,
      failureReason: linkReason,
      details: {
        stage: 'external_link_lookup',
        external_link_count: identityLinks.length,
        cause: ambiguous ? 'External dealer link ambiguous' : 'No external dealer link for this subject',
      },
    });
    throw new Error(linkReason);
  }
  const link = identityLinks[0];

  const accounts = await uniqueRows(service.entities.Account, { id: link.account_id });
  if (accounts.length !== 1 || accounts[0]?.status !== 'active') {
    await recordPortalLaunchDiagnostic(service, {
      event: 'PORTAL_ACCOUNT_INACTIVE',
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: 'PORTAL_ACCOUNT_INACTIVE',
      base44User,
      binding,
      launchPass,
      ...expectedPilot,
      accountId: link.account_id,
      externalLinkCount: identityLinks.length,
      failureReason: 'PORTAL_ACCOUNT_INACTIVE',
      details: {
        stage: 'account_lookup',
        account_count: accounts.length,
        account_status: accounts[0]?.status || null,
      },
    });
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
      launchPass,
      ...expectedPilot,
      externalLinkCount: identityLinks.length,
      failureReason: 'DEALER_IDENTITY_MISMATCH',
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
      launchPass,
      ...expectedPilot,
      externalLinkCount: identityLinks.length,
      failureReason: associationReason,
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
  // The seat state the claim will act on, read before the attempt: a claim
  // that fails closed can then be read against the seats it failed on.
  let pendingAdminSeatCount = null;
  if (pilotLaunchContext) {
    const seatRows = await uniqueRows(service.entities.AccountMembership, {
      account_id: link.account_id,
    });
    pendingAdminSeatCount = seatRows.filter(
      (membership) => membership?.status === 'pending' && membership?.is_account_admin === true,
    ).length;
  }

  let claim;
  try {
    if (pilotLaunchContext) {
      await recordPortalLaunchDiagnostic(service, {
        event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PILOT_CLAIM_ATTEMPTED,
        outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
        base44User,
        binding,
        accountId: link.account_id,
        launchPass,
        ...expectedPilot,
        externalLinkCount: identityLinks.length,
        pendingAdminSeatCount,
        details: {
          stage: 'seat_claim',
          claim_route: 'verified_binding',
          email_match_used: false,
        },
      });
    }
    claim = pilotLaunchContext
      ? await claimPilotPortalAdministratorSeat({ service, base44User, binding, link })
      : await resolveAccountAdministratorMembership(service, base44User, link.account_id);
  } catch (claimError) {
    const claimReason = String(claimError?.message || 'MEMBERSHIP_CLAIM_FAILED');
    await recordPortalLaunchDiagnostic(service, {
      event: pilotLaunchContext
        ? PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PILOT_CLAIM_FAILED
        : PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.MEMBERSHIP_CLAIM_FAILED,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: claimReason,
      base44User,
      binding,
      accountId: link.account_id,
      launchPass,
      ...expectedPilot,
      externalLinkCount: identityLinks.length,
      pendingAdminSeatCount,
      failureReason: claimReason,
      details: {
        stage: 'seat_claim',
        claim_route: pilotLaunchContext ? 'verified_binding' : 'invited_email_match',
      },
    });
    throw claimError;
  }

  if (claim?.claimed) {
    await recordPortalLaunchDiagnostic(service, {
      event: pilotLaunchContext
        ? PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PILOT_CLAIM_SUCCEEDED
        : PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.MEMBERSHIP_CLAIMED,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
      base44User,
      binding,
      accountId: link.account_id,
      membershipId: claim.membership?.id || null,
      launchPass,
      ...expectedPilot,
      externalLinkCount: identityLinks.length,
      pendingAdminSeatCount,
      details: {
        stage: 'seat_claim',
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
  if (identities.length > 1) {
    await recordPortalLaunchDiagnostic(service, {
      event: 'PORTAL_IDENTITY_AMBIGUOUS',
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: 'PORTAL_IDENTITY_AMBIGUOUS',
      base44User,
      binding,
      accountId: link.account_id,
      launchPass,
      ...expectedPilot,
      failureReason: 'PORTAL_IDENTITY_AMBIGUOUS',
      details: { stage: 'portal_identity', identity_count: identities.length },
    });
    throw new Error('PORTAL_IDENTITY_AMBIGUOUS');
  }
  const existing = identities[0] || null;
  if (
    existing
    && (
      existing.external_subject !== binding.user_id
      || existing.account_id !== link.account_id
      || existing.partner_profile_id !== binding.profile_id
    )
  ) {
    await recordPortalLaunchDiagnostic(service, {
      event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PORTAL_IDENTITY_CONFLICT,
      outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
      reason: 'PORTAL_IDENTITY_CONFLICT',
      base44User,
      binding,
      accountId: link.account_id,
      launchPass,
      ...expectedPilot,
      failureReason: 'PORTAL_IDENTITY_CONFLICT',
      details: {
        stage: 'portal_identity',
        stored_external_subject: existing.external_subject || null,
        stored_account_id: existing.account_id || null,
        stored_profile_id: existing.partner_profile_id || null,
      },
    });
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
  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.PORTAL_IDENTITY_CREATE_ATTEMPTED,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    binding,
    accountId: link.account_id,
    membershipId: claim?.membership?.id || null,
    launchPass,
    ...expectedPilot,
    details: { stage: 'portal_identity', operation: existing ? 'update' : 'create' },
  });
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
    launchPass,
    ...expectedPilot,
    details: {
      stage: 'portal_identity',
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

  await recordPortalLaunchDiagnostic(service, {
    event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.LAUNCH_COMPLETE,
    outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.SUCCESS,
    base44User,
    binding,
    accountId: identity.account_id,
    membershipId: claim?.membership?.id || null,
    launchPass,
    ...expectedPilot,
    externalLinkCount: identityLinks.length,
    pendingAdminSeatCount,
    details: {
      stage: 'launch_complete',
      claim_route: pilotLaunchContext ? 'verified_binding' : 'invited_email_match',
      seat_claimed: claim?.claimed === true,
    },
  });

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