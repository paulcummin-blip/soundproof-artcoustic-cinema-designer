/**
 * Core Dealer Identity association logic — the single implementation shared
 * by both call sites:
 *
 *   1. consumePortalLaunch — required before claiming membership or writing
 *      PortalIdentity data for a verified ****** launch.
 *   2. associateDealerIdentity — invoked on every app mount by the
 *      PartnerPortalIdentityProvider.
 *   3. createProfessionalProject — revalidates the live provider token before
 *      every dealer project creation, even when stored dealer fields exist.
 *
 * First launch (user has no stored dealer_account_id):
 *   - Resolve dealer identity from the ****** Dealer Identity Service
 *   - Store the immutable dealer_account_id and dealer_name on the User record
 *   - Never overwrite automatically afterwards
 *
 * Future logins (user has a stored dealer_account_id):
 *   - Resolve dealer identity
 *   - Validate that the stored dealer_account_id matches the resolved identity
 *   - If mismatch: fail closed (DEALER_IDENTITY_MISMATCH) — do not silently relink
 *
 * Users without a ****** SSO token (e.g. central admins, email/password
 * users) receive NO_PORTAL_TOKEN — this is expected, not an error.
 */

import { providerAccessToken } from './portalSsoAuthority.js';
import { resolvePartnerPortalDealerIdentity } from './partnerPortalIdentityClient.js';

const EXPECTED_IDENTITY_ENDPOINT =
  '******';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function identityEndpointUrl() {
  const raw = globalThis.Deno?.env?.get?.('PARTNER_PORTAL_DEALER_IDENTITY_URL');
  if (!hasText(raw)) throw new Error('DEALER_IDENTITY_URL_UNAVAILABLE');
  let endpoint;
  try {
    endpoint = new URL(raw.trim());
  } catch {
    throw new Error('DEALER_IDENTITY_URL_INVALID');
  }
  // Never send a provider token to a different project, path or URL query.
  // A mismatch is reported as a fixed code; the configured value stays secret.
  if (endpoint.toString() !== EXPECTED_IDENTITY_ENDPOINT) {
    throw new Error('DEALER_IDENTITY_URL_TARGET_MISMATCH');
  }
  return EXPECTED_IDENTITY_ENDPOINT;
}

/**
 * Associate (or validate) the authenticated user's Dealer Identity.
 *
 * @param {object} base44 - The base44 client (from createClientFromRequest).
 * @param {string} userId - The authenticated user's Base44 ID.
 * @returns {Promise<{resolved: boolean, identity?: object, association?: string, reason?: string}>}
 */
export async function associateDealerIdentityCore(base44, userId) {
  // Obtain the authenticated ****** access token via SSO.
  let accessToken;
  try {
    accessToken = await providerAccessToken(base44, userId);
  } catch (error) {
    return {
      resolved: false,
      reason: error?.message === 'PROVIDER_ACCESS_TOKEN_NOT_JWT'
        ? 'PROVIDER_ACCESS_TOKEN_NOT_JWT'
        : 'NO_PORTAL_TOKEN',
    };
  }

  // Resolve dealer identity from the ****** Dealer Identity Service.
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
/**
 * Project creation after the existing account authority has accepted the user.
 * The company's canonical server-owned link supplies identity; the caller's
 * request body, email domain and display name are never identity evidence.
 * Portal launch/association callers keep their existing live-SSO implementation.
 */
export async function associateMemberDealerIdentityCore(base44, userId, accessContext) {
  const deny = reason => ({ resolved: false, reason });
  if (!accessContext?.allowed || !accessContext?.capabilities?.soundProof
    || accessContext.user?.id !== userId || !accessContext.account?.id
    || accessContext.membership?.status !== 'active') return deny('MEMBERSHIP_NOT_AUTHORISED');
  const service = base44.asServiceRole;
  const users = await service.entities.User.filter({ id: userId });
  if (users.length !== 1) return deny('USER_IDENTITY_UNRESOLVED');
  const user = users[0];
  const accountId = accessContext.account.id;
  if (user.is_verified !== true || user.disabled === true || user.account_id !== accountId) {
    return deny('MEMBERSHIP_IDENTITY_MISMATCH');
  }
  const seats = await service.entities.AccountMembership.filter({ account_id: accountId, user_id: userId });
  if (seats.length !== 1 || seats[0].id !== accessContext.membership.id
    || seats[0].status !== 'active') return deny('MEMBERSHIP_NOT_AUTHORISED');
  const accounts = await service.entities.Account.filter({ id: accountId });
  const account = accounts.length === 1 ? accounts[0] : null;
  const expiry = account?.soundproof_access_expires_at;
  if (!account || account.status !== 'active'
    || (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()))) {
    return deny('ACCOUNT_ACCESS_UNAVAILABLE');
  }

  const links = await service.entities.ExternalAccountLink.filter({
    account_id: accountId, source_system: 'ARTCOUSTIC_PARTNER_PORTAL', active: true,
  });
  // Existing Portal users on accounts without a company mapping retain
  // their original SSO resolution path. A present but conflicting or
  // incomplete mapping must be reviewed and cannot fall back to SSO.
  if (links.length === 0 && hasText(user.dealer_account_id)) {
    return associateDealerIdentityCore(base44, userId);
  }
  const canonical = links.filter(link => link.active === true
    && hasText(link.partner_user_id));
  if (canonical.length !== 1) return deny(canonical.length ? 'DEALER_LINK_AMBIGUOUS' : 'DEALER_LINK_NOT_FOUND');
  const link = canonical[0];
  // Same legacy UUID convention used by verified Portal activation. A trading
  // number must never be promoted to an organisation identity.
  const dealerId = String(link.portal_dealer_account_id || link.external_account_number || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealerId)) {
    return deny('DEALER_LINK_UNRESOLVED');
  }
  const reverseLinks = await service.entities.ExternalAccountLink.filter({
    source_system: 'ARTCOUSTIC_PARTNER_PORTAL', active: true,
    $or: [{ portal_dealer_account_id: dealerId }, { external_account_number: dealerId }],
  });
  if (reverseLinks.some(row => row.account_id !== accountId)) return deny('DEALER_LINK_AMBIGUOUS');
  const stored = String(user.dealer_account_id || '').trim();
  if (stored && stored !== dealerId) return deny('DEALER_IDENTITY_MISMATCH');
  const dealerName = account.name;
  return {
    resolved: true, association: 'MEMBERSHIP_VERIFIED',
    identity: { dealer_account_id: dealerId, dealer_name: dealerName },
  };
}

