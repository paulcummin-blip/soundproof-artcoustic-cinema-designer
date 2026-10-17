import test from 'node:test';
import assert from 'node:assert/strict';
import { associateDealerIdentityCore } from '../base44/shared/dealerIdentityAssociation.js';
import { resolvePartnerPortalDealerIdentity } from '../base44/shared/partnerPortalIdentityClient.js';

const ENDPOINT = 'https://jzwuhrmbshfyybxbeckf.supabase.co/functions/v1/dealer-identity-resolve';

test('401 response bodies produce only fixed non-sensitive diagnostic codes', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const cases = [
    [{ code: 401, message: 'Invalid JWT' }, 'DEALER_IDENTITY_GATEWAY_TOKEN_REJECTED'],
    [{ message: 'Missing authorization header' }, 'DEALER_IDENTITY_GATEWAY_AUTH_HEADER_MISSING'],
    [{ message: 'No API key found in request' }, 'DEALER_IDENTITY_GATEWAY_API_KEY_MISSING'],
    [{ ok: false, error: 'unauthorized' }, 'DEALER_IDENTITY_FUNCTION_UNAUTHORIZED'],
    [{ message: 'private diagnostic must never be returned' }, 'DEALER_IDENTITY_HTTP_401'],
  ];
  for (const [body, expected] of cases) {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 401 });
    await assert.rejects(
      () => resolvePartnerPortalDealerIdentity({ url: ENDPOINT, accessToken: 'opaque-provider-token' }),
      error => error.message === expected && !error.message.includes('private diagnostic'),
    );
  }
});

test('a configured endpoint outside the shared live backend never receives a provider token', async (t) => {
  const oldDeno = globalThis.Deno;
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.Deno = oldDeno; globalThis.fetch = oldFetch; });
  globalThis.Deno = { env: { get: () => 'https://other-project.example/functions/v1/dealer-identity-resolve' } };
  globalThis.fetch = async () => { throw new Error('FETCH_MUST_NOT_RUN'); };
  const base44 = { asServiceRole: { sso: {
    async getAccessToken() { return { access_token: 'opaque-provider-token' }; },
  } } };
  const result = await associateDealerIdentityCore(base44, 'pilot-user');
  assert.deepEqual(result, { resolved: false, reason: 'DEALER_IDENTITY_URL_TARGET_MISMATCH' });
});
