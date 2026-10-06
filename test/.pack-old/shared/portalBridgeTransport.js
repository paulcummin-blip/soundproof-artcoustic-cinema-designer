/**
 * Partner Portal bridge transport.
 *
 * The single place that mints the provider identity token and calls the
 * Partner Portal bridge, shared by the launch path and the ongoing
 * session-validation path. Behaviour is unchanged from the SSO authority it
 * was extracted from.
 */

import { BRIDGE_URL_SECRET } from './pilotPortalConstants.js';
import { hasText } from './portalPrimitives.js';

function providerTokenValue(response) {
  const candidate = (value, depth = 0) => {
    if (depth > 4) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== trimmed) return candidate(parsed, depth + 1);
      } catch {
        return trimmed;
      }
      return trimmed;
    }
    if (value && typeof value === 'object') {
      return candidate(
        value.id_token
        ?? value.idToken
        ?? value.token
        ?? value.value
        ?? value.data?.id_token
        ?? value.data?.idToken
        ?? value.data?.token
        ?? value.data?.value
        ?? value.data,
        depth + 1,
      );
    }
    return null;
  };

  let token = candidate(response);
  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  if (!hasText(token)) throw new Error('PROVIDER_TOKEN_UNAVAILABLE');
  return token;
}

export async function providerIdToken(base44, base44UserId) {
  let response;
  try {
    response = await base44.asServiceRole.sso.getIdToken(base44UserId);
  } catch {
    // The SSO SDK reports its own message here; the launch path and the
    // diagnostic trail both key off one stable code instead.
    throw new Error('PROVIDER_TOKEN_UNAVAILABLE');
  }
  return providerTokenValue(response);
}

function providerAccessTokenValue(response) {
  const candidate = response?.access_token
    ?? response?.accessToken
    ?? response?.data?.access_token
    ?? response?.data?.accessToken
    ?? response?.data
    ?? response;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('PROVIDER_ACCESS_TOKEN_UNAVAILABLE');
  }
  const token = candidate.trim();
  return token.startsWith('Bearer ') ? token.slice(7) : token;
}

export async function providerAccessToken(base44, base44UserId) {
  const response = await base44.asServiceRole.sso.getAccessToken(base44UserId);
  return providerAccessTokenValue(response);
}

function configuredBridgeUrl(override) {
  const raw = hasText(override)
    ? override
    : globalThis.Deno?.env?.get?.(BRIDGE_URL_SECRET);
  if (!hasText(raw)) throw new Error('PORTAL_BRIDGE_URL_UNAVAILABLE');

  let endpoint;
  try {
    endpoint = new URL(raw.trim());
  } catch {
    throw new Error('PORTAL_BRIDGE_URL_INVALID');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('PORTAL_BRIDGE_URL_INVALID');
  }
  return endpoint.toString();
}

export async function callBridge(base44, base44UserId, body, bridgeUrl) {
  const token = await providerIdToken(base44, base44UserId);
  const response = await fetch(configuredBridgeUrl(bridgeUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload?.binding) {
    throw new Error('PORTAL_SESSION_REJECTED');
  }
  return payload.binding;
}