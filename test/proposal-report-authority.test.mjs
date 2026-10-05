// System Design Comparison evidence contract: every compared parameter value and
// the Products Selected block must be read from each version's OWN saved report
// source, never from a lagging publication or an alternative evidence path.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readProposalReportEvidence } from '../base44/shared/proposalReportEvidenceReader.js';
import { buildSelectedVersionEvidence } from '../base44/shared/comparisonEvidence.js';
import { buildComparisonTable } from '../base44/shared/comparisonTable.js';

const ids = [12, 13, 14, 18, 19, 20];
// No modified time on the fixture: a version record's own mtime is never
// consulted, because it moves whenever the record is written for any reason.
const version = (id, publishedFingerprint = null) => ({
  id, version_name: `Level ${id} version`, published_fingerprint: publishedFingerprint,
});
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
/* ── The machine-readable evidence each report carries ───────────────────────
   A proposal reads this and nothing else, so the fixture states it explicitly.
   It is deliberately built from `source(id)` — the report's own frozen
   proposalSource — exactly as a generated report builds it: one authority, two
   readers. */
const productsByLayer = () => ({
  lcr: [{ role: 'LCR', model: 'Q8-5', quantity: 3, position: null }],
  subwoofers: [{ role: 'Subwoofers', model: 'SUB4-12', quantity: 2, position: 'front' }],
});

const reportEvidence = (id, type, engineeringFingerprint = null) => {
  const parameters = source(id).report_parameters.map((row) => ({
    key: `P${row.parameter_id}`,
    parameter_id: row.parameter_id,
    title: `P${row.parameter_id}`,
    area: 'RP22',
    level: row.level,
    value: row.value,
    text: row.text,
    unit: null,
    context: null,
    source: 'technical_report',
  }));
  return {
    evidence_version: 1,
    report_type: type,
    identity: {
      project_id: 'project',
      version_id: id,
      report_type: type,
      source_fingerprint: engineeringFingerprint,
      generated_at: '2026-10-05T12:00:00Z',
    },
    room: { length_m: 6, width_m: 4.5, height_m: 2.4 },
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_width_cm: 265.5 },
    seating: {
      row_count: 1,
      per_seat: [{
        row: 1, seat_id: 'r1c1', seat_label: 'Row 1 seat 1',
        distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, rp23_level: 'Level 4',
      }],
    },
    system: {
      products_selected: Object.values(productsByLayer()).flat(),
      products_selected_by_layer: productsByLayer(),
    },
    parameters,
    parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: { current: false, p14: null, p18: null, p19: null, p20: null },
    proposal_ready: true,
    evidence_fingerprint: `re1-evidence-${id}-${type}`,
  };
};

const report = (id, type, engineeringFingerprint = null) => ({
  id: `${id}-${type}`, version_id: id, report_type: type, status: 'current',
  generated_at: '2026-10-05T12:00:00Z',
  source_fingerprints: { engineeringFingerprint },
  payload: {
    proposalSource: source(id),
    reportEvidence: reportEvidence(id, type, engineeringFingerprint),
  },
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

test('D: Products Selected are read from the report evidence, unchanged', () => {
  const products = entries[0].snapshot.system.products_selected;
  assert.deepEqual(products.lcr, ['Q8-5 × 3'], 'the loudspeaker row is the evidence row');
  assert.deepEqual(products.subwoofers, ['SUB4-12 × 2 (front)'], 'a positioned sub keeps its position');
  assert.deepEqual(products.surrounds, ['None specified'], 'an absent layer is stated, never invented');
  assert.deepEqual(
    products.rows.map((row) => row.key),
    ['lcr', 'surrounds', 'overheads', 'subwoofers', 'acoustic_treatment'],
    'every layer the report prints is present, in report order',
  );
  assert.deepEqual(table.rows.find((r) => r.key === 'lcr').values, ['Q8-5 × 3', 'Q8-5 × 3']);
});

test('E: missing, stale, legacy payload and missing P13 reject with named errors', async () => {
  await assert.rejects(readProposalReportEvidence(db([]), 'project', [version('4')]), /Level 4 version: missing Technical/);
  const stale = structuredClone(rows); stale[0].status = 'stale';
  await assert.rejects(readProposalReportEvidence(db(stale), 'project', [version('4')]), /Level 4 version: stale Technical/);
  // A report that EXISTS and is current, written before the proposal evidence
  // capture, is a legacy snapshot. It is never reported as a missing report.
  const legacy = structuredClone(rows); legacy[0].payload = {};
  await assert.rejects(
    readProposalReportEvidence(db(legacy), 'project', [version('4')]),
    /Level 4 version: Technical Report is current, but it needs a one-time evidence refresh/,
  );
  // P13 is removed from the EVIDENCE only. The report's own frozen source still
  // states it, so this proves the reader's P13 comes from the evidence.
  const missing = structuredClone(rows);
  missing[0].payload.reportEvidence.parameters = missing[0].payload.reportEvidence.parameters
    .filter((r) => r.parameter_id !== 13);
  delete missing[0].payload.reportEvidence.parameter_index.P13;
  assert.ok(
    missing[0].payload.proposalSource.report_parameters.some((r) => r.parameter_id === 13),
    'the frozen source still states P13 — it is simply not what the proposal reads',
  );
  await assert.rejects(readProposalReportEvidence(db(missing), 'project', [version('4')]), /Level 4 version: missing Technical Report parameter P13/);
});

test('a legacy snapshot is never described as a missing report', async () => {
  const legacy = structuredClone(rows); legacy[0].payload = {};
  const error = await readProposalReportEvidence(db(legacy), 'project', [version('4')]).catch((e) => e);
  assert.match(error.message, /Level 4 version/);
  assert.match(error.message, /Technical Report is current/);
  assert.doesNotMatch(error.message, /missing (Technical|Visual) Report/);
});

test('no older report may replace the latest missing evidence', async () => {
  const latest = report('4', 'technical'); latest.payload = {};
  await assert.rejects(
    readProposalReportEvidence(db([latest, ...rows]), 'project', [version('4')]),
    /Technical Report is current, but it needs a one-time evidence refresh/,
  );
});

test('a version record touched without a design change keeps the report Current', async () => {
  // The version pointer states the SAME engineering fingerprint the report was
  // generated from, so the report is usable for a proposal later: opening the
  // project, exporting a PDF or storing a library asset cannot make it Stale.
  const versions = [version('4', 'eng:v1:same-design')];
  const generated = ['4', '1'].flatMap((id) => ['technical', 'visual'].map((type) => report(id, type, 'eng:v1:same-design')));
  const entries = await readProposalReportEvidence(db(generated), 'project', versions);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].snapshot.identity.versionId, '4');
  assert.equal(entries[0].snapshot.identity.technicalReportId, '4-technical');
});

test('a design change after generation makes the report Stale', async () => {
  const versions = [version('4', 'eng:v1:new-design')];
  const generated = ['4', '1'].flatMap((id) => ['technical', 'visual'].map((type) => report(id, type, 'eng:v1:old-design')));
  await assert.rejects(
    readProposalReportEvidence(db(generated), 'project', versions),
    /Level 4 version: stale Technical Report\. The design changed after it was generated/,
  );
});

test('an unreadable version fingerprint never manufactures staleness', async () => {
  // No publication pointer on the version: nothing states the design moved on, so
  // the report stays usable rather than being called Stale on no evidence.
  const versions = [version('4', null)];
  const generated = ['4', '1'].flatMap((id) => ['technical', 'visual'].map((type) => report(id, type, 'eng:v1:old-design')));
  const entries = await readProposalReportEvidence(db(generated), 'project', versions);
  assert.equal(entries.length, 1);
});

test('bass alternative values cannot override report parameters', () => {
  const conflicting = structuredClone(evidence);
  conflicting[0].bass_evidence_if_reliable.p18 = { text: 'L1 · 99 Hz' };
  assert.equal(
    buildComparisonTable(conflicting).rows.find((r) => r.key === 'p18').values[0],
    source('4').report_parameters.find((r) => r.parameter_id === 18).text,
  );
});