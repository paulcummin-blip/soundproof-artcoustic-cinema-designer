/**
 * Read-only authority for Sound Proof -> Partner Portal dealer navigation.
 *
 * The Partner Portal /dashboard route resolves the dealer from its own
 * authenticated Supabase session. Sound Proof therefore returns a fixed
 * self-view URL with no account selector in the query string or path.
 *
 * partner_user_id is used here only to prove that the authenticated Sound
 * Proof account has exactly one active canonical Partner Portal identity.
 */

export const PARTNER_PORTAL_SOURCE = 'ARTCOUSTIC_PARTNER_PORTAL';
export const PARTNER_PORTAL_SELF_URL = 'https://partners.artcousticpartners.uk/dashboard';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resolve eligibility from trusted, server-loaded records only.
 *
 * @param {object} input
 * @param {object|null} input.user Authoritative Base44 User record.
 * @param {object|null} input.account Authoritative Account record.
 * @param {Array<object>} input.accountLinks Active Partner Portal links for the account.
 * @param {Array<object>} input.identityLinks All active links using the selected partner_user_id.
 * @returns {{eligible: boolean, url?: string, reason?: string}}
 */
export function resolveDealerAccountNavigation({
  user,
  account,
  accountLinks = [],
  identityLinks = [],
}) {
  if (!user || user.role === 'admin') {
    return { eligible: false, reason: 'NOT_DEALER_USER' };
  }

  if (!hasText(user.account_id) || !account || account.id !== user.account_id) {
    return { eligible: false, reason: 'ACCOUNT_NOT_RESOLVED' };
  }

  if (account.account_type !== 'dealer' || account.status !== 'active') {
    return { eligible: false, reason: 'ACCOUNT_NOT_ELIGIBLE' };
  }

  const canonicalLinks = (Array.isArray(accountLinks) ? accountLinks : []).filter((link) =>
    link
    && link.account_id === account.id
    && link.source_system === PARTNER_PORTAL_SOURCE
    && link.active === true
    && hasText(link.partner_user_id)
  );

  // Fail closed unless the account has exactly one canonical active identity.
  if (canonicalLinks.length !== 1) {
    return { eligible: false, reason: 'CANONICAL_LINK_NOT_UNIQUE' };
  }

  const canonical = canonicalLinks[0];
  const identityMatches = (Array.isArray(identityLinks) ? identityLinks : []).filter((link) =>
    link
    && link.source_system === PARTNER_PORTAL_SOURCE
    && link.active === true
    && link.partner_user_id === canonical.partner_user_id
  );

  // The same Partner Portal identity must not be active for another account.
  if (
    identityMatches.length !== 1
    || identityMatches[0].id !== canonical.id
    || identityMatches[0].account_id !== account.id
  ) {
    return { eligible: false, reason: 'PARTNER_IDENTITY_NOT_UNIQUE' };
  }

  return {
    eligible: true,
    url: PARTNER_PORTAL_SELF_URL,
  };
}
