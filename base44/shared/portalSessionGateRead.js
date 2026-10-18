/**
 * portalSessionGateRead.js (shared)
 * ---------------------------------
 * THE PARTNER PORTAL PILOT GATE — READ AND DECIDED, and nothing else.
 *
 * The iCubed pilot is fail-closed on every server-side authority call. A Base44
 * session, an account membership, a matching email or an editable URL is never
 * enough: the verified Supabase subject and the live portal session must resolve
 * through the unique ExternalAccountLink to this exact account. This module reads
 * what that decision needs and returns the same verdict, with the same reasons, as
 * the gate that has always made it.
 *
 * WHAT IT DOES NOT DO. Once the live session verifies, the existing gate refreshes
 * the PortalIdentity, the Account name and the ExternalAccountLink name on its way
 * out. Those three writes are account bookkeeping: they change nothing about the
 * verdict, which is why they are not here. portalSsoAuthority.js performs them
 * after calling this read-only gate, so its behaviour is unchanged, while a caller
 * that may only read — the ADI editorial action — reaches the same decision having
 * written nothing.
 *
 * Reads only, and the entities client is injected rather than constructed.
 */

import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PILOT_SOUND_PROOF_ACCOUNT_ID,
  PORTAL_SOURCE,
  PORTAL_TARGET,
} from './pilotPortalConstants.js';
import { hasText, uniqueRows } from './portalPrimitives.js';
import { callBridge } from './portalBridgeTransport.js';

/**
 * The pilot account's own external link, read twice from both directions so a
 * duplicate or contradictory mapping is never mistaken for a verified one.
 */
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

/** Whether the live binding still matches the identity this account holds. */
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

/**
 * The pilot gate's verdict, from reads alone.
 *
 * @param {Object} base44 — the server session (used to mint the bridge identity token)
 * @param {Object} base44User — the authenticated login
 * @param {Object} account — the account the login resolved to
 * @param {Object} [options]
 * @param {Object} [options.entities] — the entity-access object the gate reads through
 * @param {string} [options.bridgeUrl] — an override for tests
 * @returns {Promise<{required: boolean, allowed: boolean, reason?: string,
 *   identity?: Object, binding?: Object, mapping?: Object}>} the verdict, and on an
 *   allowed pilot the identity, binding and mapping the caller's bookkeeping needs.
 */
export async function readPilotPortalAccess(base44, base44User, account, {
  entities,
  bridgeUrl,
} = {}) {
  const service = { entities };
  const mapping = await resolvePilotPortalMapping(service, account.id);
  if (!mapping.required) return { required: false, allowed: true };
  if (!mapping.allowed) {
    return { required: true, allowed: false, reason: mapping.reason };
  }
  if (account.status !== 'active') {
    return { required: true, allowed: false, reason: 'PORTAL_ACCOUNT_INACTIVE' };
  }

  try {
    const identities = await uniqueRows(entities.PortalIdentity, {
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

    return { required: true, allowed: true, identity, binding, mapping };
  } catch {
    return { required: true, allowed: false, reason: 'PORTAL_SESSION_REJECTED' };
  }
}