/**
 * Core Dealer Identity association logic — the single implementation shared
 * by both call sites:
 *
 *   1. consumePortalLaunch  — invoked immediately after a successful Partner
 *      Portal launch (membership claimed, PortalIdentity created).
 *   2. associateDealerIdentity — invoked on every app mount by the
 *      PartnerPortalIdentityProvider.
 *
 * First launch (user has no stored dealer_account_id):
 *   - Resolve dealer identity from the Partner Portal Dealer Identity Service
 *   - Store the immutable dealer_account_id and dealer_name on the User record
 *   - Never overwrite automatically afterwards
 *
 * Future logins (user has a stored dealer_account_id):
 *   - Resolve dealer identity
 *   - Validate that the stored dealer_account_id matches the resolved identity
 *   - If mismatch: fail closed (DEALER_IDENTITY_MISMATCH) — do not silently relink
 *
 * Users without a Partner Portal SSO token (e.g. central admins, email/password
 * users) receive NO_PORTAL_TOKEN — this is expected, not an error.
 */

import { providerAccessToken } from './portalSsoAuthority.js';
import { resolvePartnerPortalDealerIdentity } from './partnerPortalIdentityClient.js';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function identityEndpointUrl() {
  const raw = globalThis.Deno?.env?.get?.('PARTNER_PORTAL_DEALER_IDENTITY_URL');
  if (!hasText(raw)) throw new Error('DEALER_IDENTITY_URL_UNAVAILABLE');
  return raw.trim();
}

/**
 * Associate (or validate) the authenticated user's Dealer Identity.
 *
 * @param {object} base44 - The base44 client (from createClientFromRequest).
 * @param {string} userId - The authenticated user's Base44 ID.
 * @returns {Promise<{resolved: boolean, identity?: object, association?: string, reason?: string}>}
 */
export async function associateDealerIdentityCore(base44, userId) {
  // Obtain the authenticated Partner Portal access token via SSO.
  let accessToken;
  try {
    accessToken = await providerAccessToken(base44, userId);
  } catch {
    return { resolved: false, reason: 'NO_PORTAL_TOKEN' };
  }

  // Resolve dealer identity from the Partner Portal Dealer Identity Service.
  let identity;
  try {
    identity = await resolvePartnerPortalDealerIdentity({
      url: identityEndpointUrl(),
      accessToken,
    });
  } catch (error) {
    return {
      resolved: false,
      reason: String(error?.message || error || 'RESOLUTION_FAILED'),
    };
  }

  // Get the authoritative user record (service role bypasses RLS).
  const userRecords = await base44.asServiceRole.entities.User.filter({ id: userId });
  const authoritativeUser =
    Array.isArray(userRecords) && userRecords.length > 0 ? userRecords[0] : null;
  const storedDealerAccountId = authoritativeUser?.dealer_account_id || null;

  if (!storedDealerAccountId) {
    // First launch: store the immutable Dealer Account ID and dealer name.
    await base44.asServiceRole.entities.User.update(userId, {
      dealer_account_id: identity.dealer_account_id,
      dealer_name: identity.dealer_name,
    });
    return {
      resolved: true,
      identity,
      association: 'NEWLY_LINKED',
    };
  }

  // Future login: validate that the stored Dealer Account ID matches.
  if (storedDealerAccountId !== identity.dealer_account_id) {
    // Mismatch — fail closed. Do not silently relink.
    return {
      resolved: false,
      reason: 'DEALER_IDENTITY_MISMATCH',
      stored_dealer_account_id: storedDealerAccountId,
      resolved_dealer_account_id: identity.dealer_account_id,
    };
  }

  // Match — identity validated.
  return {
    resolved: true,
    identity,
    association: 'VALIDATED',
  };
}