import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  PARTNER_PORTAL_SOURCE,
  resolveDealerAccountNavigation,
} from '../../shared/dealerNavigationAuthority.js';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * Read-only Sound Proof -> Partner Portal navigation resolver.
 *
 * Security properties:
 * - accepts no account/dealer/partner selector from the request;
 * - resolves User.account_id from the authenticated Base44 user record;
 * - blocks central admin and non-dealer/inactive accounts;
 * - requires exactly one active canonical ExternalAccountLink;
 * - fails closed if partner_user_id is duplicated across accounts;
 * - returns the Partner Portal self-view route with no editable account id.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) {
      return Response.json({ eligible: false });
    }

    const accessContext = await resolveAccountAccess(base44, sessionUser);
    try {
      assertCapability(accessContext, 'commercial');
    } catch {
      return Response.json({ eligible: false });
    }

    // Re-read the user with service role. Never trust request data or URL params.
    const userRecords = await base44.asServiceRole.entities.User.filter({ id: sessionUser.id });
    const user = Array.isArray(userRecords) && userRecords.length === 1
      ? userRecords[0]
      : null;

    if (!user || user.role === 'admin' || !user.account_id) {
      return Response.json({ eligible: false });
    }

    const accounts = await base44.asServiceRole.entities.Account.filter({ id: user.account_id });
    const account = Array.isArray(accounts) && accounts.length === 1
      ? accounts[0]
      : null;

    if (!account || account.account_type !== 'dealer' || account.status !== 'active') {
      return Response.json({ eligible: false });
    }

    const accountLinks = await base44.asServiceRole.entities.ExternalAccountLink.filter({
      account_id: account.id,
      source_system: PARTNER_PORTAL_SOURCE,
      active: true,
    });

    const canonicalLinks = (Array.isArray(accountLinks) ? accountLinks : []).filter(
      (link) => typeof link?.partner_user_id === 'string' && link.partner_user_id.trim().length > 0,
    );

    if (canonicalLinks.length !== 1) {
      return Response.json({ eligible: false });
    }

    const identityLinks = await base44.asServiceRole.entities.ExternalAccountLink.filter({
      source_system: PARTNER_PORTAL_SOURCE,
      partner_user_id: canonicalLinks[0].partner_user_id,
      active: true,
    });

    const result = resolveDealerAccountNavigation({
      user,
      account,
      accountLinks,
      identityLinks,
    });

    return Response.json(
      result.eligible
        ? { eligible: true, url: result.url }
        : { eligible: false },
    );
  } catch {
    // Navigation is optional. Any ambiguity or backend failure hides the link.
    return Response.json({ eligible: false });
  }
}
