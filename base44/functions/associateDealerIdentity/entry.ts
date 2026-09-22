import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { providerAccessToken } from "../../shared/portalSsoAuthority.js";
import { resolvePartnerPortalDealerIdentity } from "../../shared/partnerPortalIdentityClient.js";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
};

function noStoreJson(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers || {}) },
  });
}

/**
 * Partner Portal Dealer Identity association + validation.
 *
 * Called on every app mount for the authenticated user.
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
export default async function associateDealerIdentity(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return noStoreJson(
        { resolved: false, reason: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }

    // Obtain the authenticated Partner Portal access token via SSO.
    let accessToken;
    try {
      accessToken = await providerAccessToken(base44, user.id);
    } catch {
      return noStoreJson({ resolved: false, reason: "NO_PORTAL_TOKEN" });
    }

    // Resolve dealer identity from the Partner Portal Dealer Identity Service.
    let identity;
    try {
      identity = await resolvePartnerPortalDealerIdentity({
        url: secrets.get("PARTNER_PORTAL_DEALER_IDENTITY_URL"),
        accessToken,
      });
    } catch (error) {
      return noStoreJson({
        resolved: false,
        reason: String(error?.message || error || "RESOLUTION_FAILED"),
      });
    }

    // Get the authoritative user record (service role bypasses RLS).
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const authoritativeUser =
      Array.isArray(userRecords) && userRecords.length > 0 ? userRecords[0] : null;
    const storedDealerAccountId = authoritativeUser?.dealer_account_id || null;

    if (!storedDealerAccountId) {
      // First launch: store the immutable Dealer Account ID and dealer name.
      await base44.asServiceRole.entities.User.update(user.id, {
        dealer_account_id: identity.dealer_account_id,
        dealer_name: identity.dealer_name,
      });
      return noStoreJson({
        resolved: true,
        identity,
        association: "NEWLY_LINKED",
      });
    }

    // Future login: validate that the stored Dealer Account ID matches.
    if (storedDealerAccountId !== identity.dealer_account_id) {
      // Mismatch — fail closed. Do not silently relink.
      return noStoreJson(
        {
          resolved: false,
          reason: "DEALER_IDENTITY_MISMATCH",
          stored_dealer_account_id: storedDealerAccountId,
          resolved_dealer_account_id: identity.dealer_account_id,
        },
        { status: 403 },
      );
    }

    // Match — identity validated.
    return noStoreJson({
      resolved: true,
      identity,
      association: "VALIDATED",
    });
  } catch (error) {
    return noStoreJson(
      {
        resolved: false,
        reason: String(error?.message || error || "INTERNAL_ERROR"),
      },
      { status: 500 },
    );
  }
}