// System Design Comparison evidence contract: every compared parameter value and
// the Products Selected block must be read from each version's OWN saved report
// source, never from a lagging publication or an alternative evidence path.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readProposalReportEvidence } from '../base44/shared/proposalReportEvidenceReader.js';
import { buildSelectedVersionEvidence } from '../base44/shared/comparisonEvidence.js';
import { buildComparisonTable } from '../base44/shared/comparisonTable.js';

const ids = [12, 13, 14, 18, 19, 20];
const version = (id) => ({ id, version_name: `Level ${id} version`, updated_date: '2026-10-05T10:00:00Z' });
const source = (id) => ({
  available: true,
  identity: { versionId: id },
  report_source_version: 1,
  system: { products_selected: { rows: [{ key: 'lcr', area: 'LCR', value: 'Q8-5 × 3' }], lcr: ['Q8-5 × 3'] } },
  viewing: { available: true, summary: 'Report RP23 summary', primary_floor: 'Level 4' },
  rp22: { parameter_headlines: [] },
  bass: {},
  report_parameters: ids.map((parameter_id) => {
    const level = id === '4' ? 'L4' : 'L2';
    const value = parameter_id === 13
      ? (id === '4' ? '108 dBC (OH)' : '100 dBC (FW)')
      : `report P${parameter_id} value`;
    return { parameter_id, level, value, text: `${level} · ${value}` };
  }),
});
const report = (id, type) => ({
  id: `${id}-${type}`, version_id: id, report_type: type, status: 'current',
  generated_at: '2026-10-05T12:00:00Z', payload: { proposalSource: source(id) },
});
const db = (rows) => ({ ReportSnapshot: { filter: async (q) => ({ items: rows.filter((r) => r.version_id === q.version_id) }) } });
const rows = ['4', '1'].flatMap((id) => ['technical', 'visual'].map((type) => report(id, type)));
const entries = await readProposalReportEvidence(db(rows), 'project', ['4', '1'].map(version));
const evidence = buildSelectedVersionEvidence(entries);
const table = buildComparisonTable(evidence);

test('A/B: both P13 columns copy their own Technical Report, limiting group included', () => {
  assert.deepEqual(table.rows.find((r) => r.key === 'p13').values, ['L4 · 108 dBC (OH)', 'L2 · 100 dBC (FW)']);
});

test('C: all six key parameter levels and values equal saved report text', () => {
  for (const id of ids) {
    assert.deepEqual(
      table.rows.find((r) => r.key === `p${id}`).values,
      ['4', '1'].map((v) => source(v).report_parameters.find((r) => r.parameter_id === id).text),
    );
  }
});

test('D: Products Selected are copied unchanged', () => {
  assert.deepEqual(entries[0].snapshot.system.products_selected, source('4').system.products_selected);
  assert.deepEqual(table.rows.find((r) => r.key === 'lcr').values, ['Q8-5 × 3', 'Q8-5 × 3']);
});

test('E: missing, stale, legacy payload and missing P13 reject with named errors', async () => {
  await assert.rejects(readProposalReportEvidence(db([]), 'project', [version('4')]), /Level 4 version: missing Technical/);
  const stale = structuredClone(rows); stale[0].status = 'stale';
  await assert.rejects(readProposalReportEvidence(db(stale), 'project', [version('4')]), /Level 4 version: stale Technical/);
  const legacy = structuredClone(rows); legacy[0].payload = {};
  await assert.rejects(readProposalReportEvidence(db(legacy), 'project', [version('4')]), /no saved parameter payload/);
  const missing = structuredClone(rows);
  missing[0].payload.proposalSource.report_parameters = missing[0].payload.proposalSource.report_parameters.filter((r) => r.parameter_id !== 13);
  await assert.rejects(readProposalReportEvidence(db(missing), 'project', [version('4')]), /Level 4 version: missing Technical Report parameter P13/);
});

test('no older report may replace the latest missing evidence', async () => {
  const latest = report('4', 'technical'); latest.payload = {};
  await assert.rejects(readProposalReportEvidence(db([latest, ...rows]), 'project', [version('4')]), /no saved parameter payload/);
});

test('bass alternative values cannot override report parameters', () => {
  const conflicting = structuredClone(evidence);
  conflicting[0].bass_evidence_if_reliable.p18 = { text: 'L1 · 99 Hz' };
  assert.equal(
    buildComparisonTable(conflicting).rows.find((r) => r.key === 'p18').values[0],
    source('4').report_parameters.find((r) => r.parameter_id === 18).text,
  );
});