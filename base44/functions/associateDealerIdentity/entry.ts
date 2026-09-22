import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { associateDealerIdentityCore } from "../../shared/dealerIdentityAssociation.js";

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
 * Called on every app mount by the PartnerPortalIdentityProvider.
 * The core logic lives in the shared module so that consumePortalLaunch
 * can invoke the exact same association during the live launch path.
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

    const result = await associateDealerIdentityCore(base44, user.id);

    if (result.resolved) {
      return noStoreJson(result);
    }

    // DEALER_IDENTITY_MISMATCH is a 403 security failure.
    if (result.reason === "DEALER_IDENTITY_MISMATCH") {
      return noStoreJson(result, { status: 403 });
    }

    // NO_PORTAL_TOKEN, RESOLUTION_FAILED, etc. — 200 with resolved: false
    // (expected for admins / email-password users without a portal token).
    return noStoreJson(result);
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