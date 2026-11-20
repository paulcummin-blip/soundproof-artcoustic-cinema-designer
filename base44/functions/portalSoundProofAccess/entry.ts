import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  verifyActivationBearerToken,
  validateActivationGrant,
  resolveDealerAccountFromGrant,
  createPortalActivation,
  renewPortalAccess,
} from '../../shared/portalActivationAuthority.js';

/**
 * Secure server-to-server endpoint for Portal-first Sound Proof activation
 * and renewal. Called by the Artcoustic Partner Portal (Lovable).
 *
 * Authentication: Bearer token matching the PORTAL_ACTIVATION_SHARED_SECRET.
 * No client-supplied account id, email or permission is trusted beyond that.
 *
 * POST /functions/portalSoundProofAccess
 *   Authorization: Bearer <PORTAL_ACTIVATION_SHARED_SECRET>
 *   Body: { grant: { jti, exp, purpose, target, dealer_account_id,
 *                    portal_user_id, portal_profile_id, trading_account_number?,
 *                    admin_email?, admin_full_name? } }
 *
 * jti is "<canonical portal_user_id>:<unique nonce>"; exp is at most five
 * minutes ahead. The authenticated Portal server supplies the canonical
 * subject from its verified dealer records.
 * dealer_account_id is the immutable Portal Dealer Account UUID (organisation
 * identity). trading_account_number is the commercial trading reference,
 * separately supplied and optional. portal_user_id is the authenticated
 * Portal user. All supplied identifiers are verified against the active
 * Portal link.
 *
 * purpose "activate": creates one pending dealer-admin invitation. Does NOT
 *   start the 90-day term. The term starts when the invited user verifies,
 *   signs in and claims the membership.
 * purpose "renew": extends the 90-day expiry, preserving remaining time.
 *
 * Responses:
 *   200 — activation/renewal accepted (or replay idempotent)
 *   400 — grant missing or invalid
 *   401 — bearer token missing or incorrect
 *   403 — account not eligible, suspended, or admin seat already occupied
 *   404 — dealer link or account not found
 *   409 — dealer mapping ambiguous
 *   500 — internal error
 */
export default async function(req: Request): Promise<Response> {
  const json = (status: number, body: Record<string, unknown>) =>
    Response.json(body, {
      status,
      headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });

  if (req.method !== 'POST') return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  try {
    const token = verifyActivationBearerToken(req);
    if (!token) return json(401, { ok: false, error: 'UNAUTHORIZED' });

    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const validation = validateActivationGrant(body);
    if (!validation.ok) {
      return json(400, { ok: false, error: validation.error });
    }

    const grant = validation.grant;
    const resolution = await resolveDealerAccountFromGrant(service, grant);
    if (!resolution.ok) {
      const status = resolution.error === 'DEALER_LINK_NOT_FOUND' ? 404
        : resolution.error === 'ACCOUNT_NOT_FOUND' ? 404
        : resolution.error === 'DEALER_LINK_AMBIGUOUS' ? 409
        : 403;
      return json(status, { ok: false, error: resolution.error });
    }

    const { account, link } = resolution;

    if (grant.purpose === 'activate') {
      const result = await createPortalActivation(service, base44, { grant, account, link });
      if (!result.ok) {
        const status = result.error === 'ACCOUNT_NOT_ELIGIBLE' ? 403
          : result.error === 'ACCOUNT_SUSPENDED' ? 403
          : result.error === 'ADMIN_SEAT_ALREADY_OCCUPIED' ? 403
          : result.error === 'SEAT_LIMIT_REACHED' ? 403
          : result.error === 'ACCOUNT_NOT_FOUND' ? 404
          : 409;
        return json(status, { ok: false, error: result.error });
      }
      return json(200, {
        ok: true,
        status: result.status,
        account_id: account.id,
        account_name: account.name,
        membership_id: result.membership?.id || null,
        invitation_sent: result.invitation_sent,
        invitation_error: result.invitation_error || null,
        replay: result.replay === true,
        term_started: false,
      });
    }

    if (grant.purpose === 'renew') {
      const result = await renewPortalAccess(service, { grant, account });
      if (!result.ok) {
        const status = result.error === 'ACCOUNT_SUSPENDED' ? 403
          : result.error === 'ACCOUNT_NOT_ELIGIBLE' ? 403
          : result.error === 'ACCOUNT_NOT_YET_ACTIVATED' ? 403
          : result.error === 'ACCOUNT_NOT_FOUND' ? 404
          : 409;
        return json(status, { ok: false, error: result.error });
      }
      return json(200, {
        ok: true,
        status: result.status,
        account_id: account.id,
        account_name: account.name,
        expires_at: result.expires_at,
        linked_users_updated: result.linked_users_updated || 0,
        replay: result.replay === true,
      });
    }

    return json(400, { ok: false, error: 'GRANT_PURPOSE_INVALID' });
  } catch (error) {
    return json(500, { ok: false, error: 'INTERNAL_ERROR', message: String(error?.message || '') });
  }
}