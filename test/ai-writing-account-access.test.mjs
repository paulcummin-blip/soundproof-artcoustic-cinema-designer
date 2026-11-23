import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('npm:@base44/sdk')) return {
      url: 'data:text/javascript,export const createClientFromRequest=()=>globalThis.__accountGateTestClient',
      shortCircuit: true,
    };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return {
      format: 'module',
      source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code,
      shortCircuit: true,
    };
    return next(url, context);
  },
});
globalThis.fetch = async () => { throw new Error('Network forbidden in account gate test'); };

for (const functionName of ['generateAiSummary', 'generateAdiNarrativeSuggestions']) {
  const { default: handler } = await import('../base44/functions/' + functionName + '/entry.ts');
  for (const scenario of ['inactive', 'unlinked', 'unverified', 'suspended', 'expired', 'removed', 'price-only', 'anonymous', 'active', 'central-admin']) {
    test(functionName + ': ' + scenario + ' access, with no account writes', async () => {
      const user = { id: 'synthetic-user', email: 'test@example.invalid', role: 'user', is_verified: true,
        account_id: 'synthetic-account', access_level: 'FULL_ACCESS', soundproof_access_enabled: scenario === 'active' };
      const account = { id: 'synthetic-account', name: 'Synthetic', account_type: 'dealer', status: 'active' };
      const member = { id: 'synthetic-seat', user_id: user.id, email: user.email, account_id: account.id,
        membership_role: 'full_access', access_level: 'FULL_ACCESS', status: 'active', is_account_admin: false };
      if (scenario === 'inactive') account.status = 'inactive';
      if (scenario === 'suspended') account.status = 'suspended';
      if (scenario === 'expired') account.soundproof_access_expires_at = '2000-01-01T00:00:00Z';
      if (scenario === 'unverified') user.is_verified = false;
      if (scenario === 'unlinked') delete user.account_id;
      if (scenario === 'removed') member.status = 'removed';
      if (scenario === 'price-only') { member.access_level = 'PRICE_LIST_ONLY'; member.membership_role = 'price_list_only'; }
      if (scenario === 'central-admin') user.role = 'admin';
      const rows = { User: [user], Account: [account], AccountMembership: scenario === 'unlinked' ? [] : [member],
        PortalIdentity: [], ExternalAccountLink: [] };
      const before = JSON.stringify(rows);
      let aiCalls = 0;
      let writes = 0;
      const entities = Object.fromEntries(Object.entries(rows).map(([name, items]) => [name, {
        filter: async (query) => items.filter(item => Object.entries(query).every(([key, value]) => item[key] === value)),
        get: async (id) => items.find(item => item.id === id),
        create: async () => { writes++; throw new Error('Forbidden create'); },
        update: async () => { writes++; throw new Error('Forbidden update'); },
        delete: async () => { writes++; throw new Error('Forbidden delete'); },
      }]));
      globalThis.__accountGateTestClient = {
        auth: { me: async () => scenario === 'anonymous' ? null : user },
        asServiceRole: { entities },
        integrations: { Core: { InvokeLLM: async () => {
          aiCalls++;
          return functionName === 'generateAiSummary' ? 'synthetic summary' : { suggestions: [] };
        } } },
      };
      const body = functionName === 'generateAiSummary'
        ? { summaryType: 'single', payload: { identity: { projectId: 'synthetic-project' }, project: {},
            system: {}, parameters: [], assumptions: {}, bass: {}, viewing: {} } }
        : { engineering_snapshot: { available: true, project: { name: 'Synthetic' }, room: {}, system: {}, rating: {} } };
      const result = await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify(body) }));
      const allowed = scenario === 'active' || scenario === 'central-admin';
      assert.equal(result.status, allowed ? 200 : scenario === 'anonymous' ? 401 : 403, JSON.stringify(await result.json()));
      assert.equal(aiCalls, allowed ? 1 : 0);
      assert.equal(writes, 0);
      assert.equal(JSON.stringify(rows), before);
    });
  }
}
