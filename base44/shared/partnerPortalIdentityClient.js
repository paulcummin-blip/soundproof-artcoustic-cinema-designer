/**
 * Partner Portal Dealer Identity Service client.
 *
 * The single service responsible for calling GET /dealer-identity-resolve
 * using the authenticated Partner Portal access token. Do not duplicate
 * this logic elsewhere.
 *
 * Read-only: this client resolves the dealer identity and returns it. It
 * never persists, stores, or stamps anything.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatedEndpoint(value) {
  if (!hasText(value)) {
    throw new Error('DEALER_IDENTITY_URL_UNAVAILABLE');
  }

  let endpoint;
  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new Error('DEALER_IDENTITY_URL_INVALID');
  }

  if (
    endpoint.protocol !== 'https:'
    || endpoint.username
    || endpoint.password
    || endpoint.hash
  ) {
    throw new Error('DEALER_IDENTITY_URL_INVALID');
  }

  return endpoint.toString();
}

/**
 * Call GET /dealer-identity-resolve and validate the response contract.
 *
 * Accepts the response only when:
 *   - status == 'active'
 *   - identity_version == 1
 *   - dealer_account_id is present (non-empty)
 *   - dealer_name is present (non-empty)
 *
 * Fails closed (throws) on every other response. Does not guess or
 * substitute values.
 *
 * @param {object} params
 * @param {string} params.url - Deployment-configured endpoint URL.
 * @param {string} params.accessToken - Authenticated Partner Portal access token.
 * @returns {Promise<{dealer_account_id: string, dealer_name: string, organisation_type: string, status: string, identity_version: number}>}
 * @throws {Error} on any validation failure or HTTP error.
 */
export async function resolvePartnerPortalDealerIdentity({ url, accessToken }) {
  if (!hasText(accessToken)) {
    throw new Error('ACCESS_TOKEN_UNAVAILABLE');
  }

  const endpoint = validatedEndpoint(url);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`DEALER_IDENTITY_HTTP_${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!isPlainObject(payload)) {
    throw new Error('DEALER_IDENTITY_INVALID_PAYLOAD');
  }

  if (payload.status !== 'active') {
    throw new Error('DEALER_IDENTITY_NOT_ACTIVE');
  }

  if (Number(payload.identity_version) !== 1) {
    throw new Error('DEALER_IDENTITY_UNSUPPORTED_VERSION');
  }

  const dealerAccountId = hasText(payload.dealer_account_id)
    ? payload.dealer_account_id.trim()
    : '';
  if (!UUID_PATTERN.test(dealerAccountId)) {
    throw new Error('DEALER_IDENTITY_INVALID_ACCOUNT_ID');
  }

  if (!hasText(payload.dealer_name)) {
    throw new Error('DEALER_IDENTITY_MISSING_NAME');
  }

  return {
    dealer_account_id: dealerAccountId.toLowerCase(),
    dealer_name: payload.dealer_name.trim(),
    organisation_type: hasText(payload.organisation_type)
      ? payload.organisation_type.trim()
      : '',
    status: payload.status,
    identity_version: payload.identity_version,
  };
}