import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  verifyActivationBearerToken,
  readSoundProofAccessStatus,
} from '../../shared/portalActivationAuthority.js';

/**
 * Read-only Sound Proof access status endpoint for the Artcoustic Partner
 * Portal (Lovable). Returns eligibility, activation status, expiry and days
 * remaining. The Portal does not maintain an independent access decision.
 *
 * Authentication: Bearer token matching the PORTAL_ACTIVATION_SHARED_SECRET.
 *
 * POST /functions/readSoundProofAccessStatus
 *   Authorization: Bearer <PORTAL_ACTIVATION_SHARED_SECRET>
 *   Body: { dealer_account_id: string }
 *
 * Responses:
 *   200 — status returned
 *   400 — dealer_account_id missing
 *   401 — bearer token missing or incorrect
 *   404 — dealer link or account not found (DEALER_LINK_NOT_FOUND,
 *         DEALER_LINK_UNRESOLVED, ACCOUNT_NOT_FOUND)
 *   409 — dealer mapping ambiguous or not canonical (DEALER_LINK_AMBIGUOUS,
 *         DEALER_LINK_NOT_CANONICAL)
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
    const dealerAccountId = String(body?.dealer_account_id || '').trim();
    if (!dealerAccountId) {
      return json(400, { ok: false, error: 'DEALER_ACCOUNT_ID_REQUIRED' });
    }

    const result = await readSoundProofAccessStatus(service, { dealerAccountId });
    if (!result.ok) {
      const status = result.error === 'DEALER_LINK_NOT_FOUND' ? 404
        : result.error === 'ACCOUNT_NOT_FOUND' ? 404
        : result.error === 'DEALER_LINK_UNRESOLVED' ? 404
        : result.error === 'DEALER_LINK_AMBIGUOUS' ? 409
        : result.error === 'DEALER_LINK_NOT_CANONICAL' ? 409
        : 500;
      return json(status, { ok: false, error: result.error });
    }

    return json(200, result);
  } catch (error) {
    return json(500, { ok: false, error: 'INTERNAL_ERROR', message: String(error?.message || '') });
  }
}