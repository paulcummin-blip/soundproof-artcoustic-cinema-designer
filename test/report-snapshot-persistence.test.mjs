import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/report/reportSnapshotStore.js', 'utf8');
async function storeWith(rows, { dropEvidence = false, failUpdate = false } = {}) {
  const calls = [];
  const api = {
    filter: async (query, options) => {
      calls.push(['filter', query, options]);
      return { items: rows.filter(r => r.project_id === query.project_id && r.version_id === query.version_id && r.report_type === query.report_type)
        .sort((a, b) => b.generated_at.localeCompare(a.generated_at)).slice(0, options.limit) };
    },
    update: async (id, record) => {
      calls.push(['update', id]);
      if (failUpdate) throw new Error('save failed');
      const index = rows.findIndex(r => r.id === id);
      rows[index] = { ...rows[index], ...record };
      if (dropEvidence) rows[index].payload = {};
      return { id };
    },
    create: async record => { calls.push(['create']); const row = { ...record, id: 'new' }; rows.push(row); return row; },
    get: async id => { calls.push(['get', id]); return rows.find(r => r.id === id); },
  };
  // Test the actual storage module with an in-memory database, not a copied implementation.
  const moduleSource = source
    .replace("import { base44 } from '@/api/base44Client';", 'const base44 = globalThis.__snapshotTestClient;')
    .replace("import { notifyReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';", 'const notifyReportSourceStored = globalThis.__snapshotTestNotify;');
  globalThis.__snapshotTestClient = { entities: { ReportSnapshot: api } };
  globalThis.__snapshotTestNotify = entry => calls.push(['notify', entry]);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(moduleSource + '\n// ' + Math.random()).toString('base64'));
  return { ...mod, calls };
}
const row = (id, generated_at, version_id = 'v4', report_type = 'technical') => ({
  id, generated_at, project_id: 'marquee', version_id, report_type, status: 'current', payload: {},
});
const record = { ...row(undefined, '2026-10-05'), payload: { reportEvidence: { evidence_version: 1, proposal_ready: true, room: { width_m: 5.18 } } } };

test('same canonical newest row is loaded and saved despite old duplicate/current rows', async () => {
  const rows = [row('old', '2026-10-01'), row('latest', '2026-10-04'), row('other-version', '2026-10-06', 'v1')];
  const mod = await storeWith(rows);
  assert.equal((await mod.loadReportSnapshot({ projectId: 'marquee', versionId: 'v4', reportType: 'technical' })).id, 'latest');
  const saved = await mod.saveReportSnapshot({ existing: rows[0], record });
  assert.equal(saved.id, 'latest');
  assert.equal(rows.length, 3);
  assert.deepEqual(mod.calls.filter(c => c[0] === 'update'), [['update', 'latest']]);
  assert.ok(mod.calls.findIndex(c => c[0] === 'get') < mod.calls.findIndex(c => c[0] === 'notify'));
});

test('missing local existing row does not create duplicate when canonical exists', async () => {
  const mod = await storeWith([row('latest', '2026-10-04')]);
  assert.equal((await mod.saveReportSnapshot({ record })).id, 'latest');
  assert.equal(mod.calls.some(c => c[0] === 'create'), false);
});

test('database missing evidence rejects save and does not announce readiness', async () => {
  const mod = await storeWith([row('latest', '2026-10-04')], { dropEvidence: true });
  await assert.rejects(() => mod.saveReportSnapshot({ record }), /persistence could not be verified/);
  assert.equal(mod.calls.some(c => c[0] === 'notify'), false);
});

test('failed database write is not announced', async () => {
  const mod = await storeWith([row('latest', '2026-10-04')], { failUpdate: true });
  await assert.rejects(() => mod.saveReportSnapshot({ record }), /save failed/);
  assert.equal(mod.calls.some(c => c[0] === 'notify'), false);
});

test('first report creates once and verifies stored row', async () => {
  const rows = [];
  const mod = await storeWith(rows);
  assert.equal((await mod.saveReportSnapshot({ record })).id, 'new');
  await mod.saveReportSnapshot({ record });
  assert.equal(rows.length, 1);
});

test('incomplete offline legacy evidence cannot stop the ready refresh', () => {
  const hook = fs.readFileSync('src/components/report/useReportSnapshot.js', 'utf8');
  const offline = hook.slice(hook.indexOf('const stored = saved.payload?.proposalSource;'));
  assert.match(offline, /const parity = checkReportEvidenceParity[\s\S]*?if \(!parity.passed\) return;[\s\S]*?saveReportSnapshot/);
});
