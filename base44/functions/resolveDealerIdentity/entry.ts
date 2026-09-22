import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
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
 * Read-only Partner Portal Dealer Identity resolver.
 *
 * Resolves the authenticated dealer identity from the Partner Portal
 * Dealer Identity Service (GET /dealer-identity-resolve) using the
 * authenticated user's Partner Portal access token (obtained via SSO).
 *
 * This is a read-only integration: nothing is persisted, stored, or
 * stamped. The resolved identity is returned to the caller for
 * in-memory session caching only.
 *
 * Fail-closed: returns { resolved: false, reason } for any failure,
 * including users without a Partner Portal SSO token.
 */
export default async function resolveDealerIdentity(req) {
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
    // This throws PROVIDER_TOKEN_UNAVAILABLE for users who do not have
    // a Partner Portal identity linked — that is expected, not an error.
    let accessToken;
    try {
      accessToken = await providerAccessToken(base44, user.id);
    } catch {
      return noStoreJson({ resolved: false, reason: "NO_PORTAL_TOKEN" });
    }

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

    return noStoreJson({ resolved: true, identity });
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