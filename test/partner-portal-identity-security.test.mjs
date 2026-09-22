import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePartnerPortalDealerIdentity } from '../base44/shared/partnerPortalIdentityClient.js';

const ENDPOINT = 'https://partner-config.example/functions/v1/dealer-identity-resolve';
const DEALER_ID = 'b9d453e8-3386-4294-bd99-7ad2d80120b2';

function validIdentity(overrides = {}) {
  return {
    dealer_account_id: DEALER_ID,
    dealer_name: 'Example Cinema',
    organisation_type: 'dealer',
    status: 'active',
    identity_version: 1,
    ...overrides,
  };
}

test('dealer identity request sends only the authenticated bearer token', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, request) => {
    assert.equal(url, ENDPOINT);
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer verified-sso-token');
    assert.equal(request.headers['cache-control'], 'no-store');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    assert.equal('body' in request, false);
    return new Response(JSON.stringify(validIdentity()), { status: 200 });
  };

  const identity = await resolvePartnerPortalDealerIdentity({
    url: ENDPOINT,
    accessToken: 'verified-sso-token',
    dealer_account_id: 'browser-supplied-id-is-ignored',
  });

  assert.deepEqual(identity, validIdentity());
});

test('dealer identity response validation fails closed', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    () => resolvePartnerPortalDealerIdentity({
      url: undefined,
      accessToken: 'verified-sso-token',
    }),
    /DEALER_IDENTITY_URL_UNAVAILABLE/,
  );

  await assert.rejects(
    () => resolvePartnerPortalDealerIdentity({
      url: 'http://insecure.example/dealer-identity-resolve',
      accessToken: 'verified-sso-token',
    }),
    /DEALER_IDENTITY_URL_INVALID/,
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify(validIdentity({ dealer_account_id: 'not-a-uuid' })), { status: 200 });

  await assert.rejects(
    () => resolvePartnerPortalDealerIdentity({
      url: ENDPOINT,
      accessToken: 'verified-sso-token',
    }),
    /DEALER_IDENTITY_INVALID_ACCOUNT_ID/,
  );
});

test('browser identity provider has no persistent or URL-derived dealer identity path', () => {
  const provider = readFileSync(
    new URL('../src/components/providers/PartnerPortalIdentityProvider.jsx', import.meta.url),
    'utf8',
  );
  const resolver = readFileSync(
    new URL('../base44/functions/resolveDealerIdentity/entry.ts', import.meta.url),
    'utf8',
  );
  const identityClient = readFileSync(
    new URL('../base44/shared/partnerPortalIdentityClient.js', import.meta.url),
    'utf8',
  );

  const executableProvider = provider
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  assert.match(executableProvider, /invoke\("resolveDealerIdentity", \{\}\)/);
  assert.doesNotMatch(executableProvider, /localStorage|sessionStorage|URLSearchParams|location\.search|searchParams/);
  assert.doesNotMatch(executableProvider, /dealerAccountId:/);

  assert.match(resolver, /base44\.auth\.me\(\)/);
  assert.match(resolver, /providerAccessToken\(base44, user\.id\)/);
  assert.doesNotMatch(resolver, /providerIdToken/);
  assert.match(resolver, /secrets\.get\("PARTNER_PORTAL_DEALER_IDENTITY_URL"\)/);
  assert.doesNotMatch(resolver, /req\.json\(|req\.url|searchParams|dealer_account_id/);
  assert.match(resolver, /Cache-Control\": \"no-store, private, max-age=0\"/);

  assert.doesNotMatch(identityClient, /supabase\.co/);
  assert.doesNotMatch(identityClient, /DEFAULT_DEALER_IDENTITY_URL/);
});
