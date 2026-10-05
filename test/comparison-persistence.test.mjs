// Durable comparison contract: storage, read-back and canonical resolution.
// Server-side modules (base44/shared) are exercised directly; the frontend
// resolver is imported as a pure module so editor, PDF and At a Glance can be
// asserted against ONE source. No SDK, no network, no database.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildComparisonTable } from '../base44/shared/comparisonTable.js';
import { buildSelectedVersionEvidence } from '../base44/shared/comparisonEvidence.js';
import { comparisonSectionMetadata, verifyComparisonPersisted } from '../base44/shared/comparisonPersistence.js';
import { buildProposalSalesVoice } from '../base44/shared/proposalSalesVoice.js';
import { resolveProposalComparison, resolveComparisonDisplay, isCompleteComparisonTable } from '../src/components/proposal/comparisonDisplayAuthority.js';
import { buildComparisonGlance } from '../src/components/proposal/print/atAGlanceVersions.js';

const headline = (parameter_id, achieved_level, formatted_value) => ({ parameter_id, achieved_level, formatted_value });
const snapshot = (id, name, lcr, count, p12, p13, p14, p17) => ({
  available: true,
  identity: { projectId: 'fixture', versionId: id, engineeringFingerprint: `fingerprint-${id}` },
  version: { name },
  system: {
    configuration: { dolby_config: '9.1.6' },
    product_roles: [{ role: 'lcr', role_description: 'Left/Centre/Right', model_label: lcr }],
    subwoofer_strategy: { count, models: ['sub4-12'] },
  },
  rp22: {
    parameter_headlines: [
      headline(2, 'L4', '15 speakers'),
      headline(12, p12[0], `${p12[1]} dBC`),
      headline(13, p13[0], `${p13[1]} dBC`),
      headline(17, p17, null),
    ],
  },
  bass: { available: true, p14: { available: true, achieved_level: p14[0], formatted_value: `${p14[1]} dBC` } },
});

const evidence = buildSelectedVersionEvidence([
  { version_id: 'low', version_name: 'Level 1 version', snapshot: snapshot('low', 'Level 1 version', 'Q6-3', 2, ['L3', 106], ['L2', 100], ['L3', 115], 'L3') },
  { version_id: 'high', version_name: 'Level 4 version', snapshot: snapshot('high', 'Level 4 version', 'Q8-5', 4, ['L4', 116], ['L4', 108], ['L4', 118], 'L2') },
]);
const table = buildComparisonTable(evidence);
const proposal = { selected_version_ids: ['low', 'high'], metadata: { selected_versions: evidence, comparison_table: table } };
const section = { metadata: comparisonSectionMetadata(table) };
const sdkMock = {
  entities: {
    Proposal: { get: async () => JSON.parse(JSON.stringify(proposal)) },
    ProposalSection: { get: async () => JSON.parse(JSON.stringify(section)) },
  },
};
await verifyComparisonPersisted(sdkMock, 'fixture', table, evidence, 'fixture-section');
let rejectedLoss = false;
try {
  await verifyComparisonPersisted({ entities: { Proposal: { get: async () => ({ metadata: {} }) } } }, 'fixture', table, evidence);
} catch {
  rejectedLoss = true;
}

test('read-back accepts the full contract and rejects metadata loss', () => assert.equal(rejectedLoss, true));

test('schema declares frozen rows, client meaning and source identity', () => {
  const p = JSON.parse(fs.readFileSync('base44/entities/Proposal.jsonc', 'utf8'));
  const s = JSON.parse(fs.readFileSync('base44/entities/ProposalSection.jsonc', 'utf8'));
  const meta = p.properties.metadata.properties;
  assert.ok(meta.selected_versions, 'proposal.selected_versions declared');
  assert.ok(meta.comparison_table.properties.rows.items.properties.client_meaning, 'proposal client_meaning declared');
  assert.ok(meta.comparison_table.properties.versions.items.properties.source_identity, 'proposal source_identity declared');
  assert.ok(s.properties.metadata.properties.comparison_rows.items.properties.client_meaning, 'section client_meaning declared');
  assert.ok(s.properties.metadata.properties.comparison_versions.items.properties.source_identity, 'section source_identity declared');
});

test('P12, P13 and P14 resolve in column order from frozen evidence', () => {
  const expected = {
    p12: ['L3 · 106 dBC', 'L4 · 116 dBC'],
    p13: ['L2 · 100 dBC', 'L4 · 108 dBC'],
    p14: ['L3 · 115 dBC', 'L4 · 118 dBC'],
    subwoofers: ['2 × SUB4-12', '4 × SUB4-12'],
  };
  for (const [key, values] of Object.entries(expected)) {
    assert.deepEqual(table.rows.find((row) => row.key === key)?.values, values, `${key} values`);
  }
});

test('P20 is absent, P17 trade-off is explicit, and P14 does not claim consistency', () => {
  assert.equal(table.rows.some((row) => row.key === 'p20'), false, 'no P20 row without evidence');
  assert.deepEqual(table.rows.find((row) => row.key === 'p17')?.values, ['L3', 'L2'], 'P17 is lower on the higher option');
  assert.match(table.rows.find((row) => row.key === 'p17')?.client_meaning, /trade-off/);
  assert.match(table.rows.find((row) => row.key === 'subwoofers')?.client_meaning, /not inferred seat consistency|P14/);
  assert.match(table.rows.find((row) => row.key === 'p14')?.client_meaning, /does not establish seat-to-seat consistency/);
  assert.ok(table.rows.every((row) => Boolean(row.client_meaning)), 'every row carries client meaning');
  assert.equal(table.versions[1].source_identity.engineeringFingerprint, 'fingerprint-high');
  assert.equal(table.versions[0].version_name, 'Level 1 version');
});

test('the canonical persisted table wins over stale section metadata and stale recovery', () => {
  const stale = { versions: table.versions, rows: [{ key: 'wrong', area: 'Wrong', values: ['a', 'b'], identical: false, change: null }] };
  const resolved = resolveProposalComparison(proposal, [{ section_type: 'key_performance_highlights', metadata: comparisonSectionMetadata(stale) }], stale);
  assert.ok(resolved.rows.some((row) => row.key === 'p12'), 'canonical rows survive');
  assert.equal(resolved.rows.some((row) => row.key === 'wrong'), false, 'stale rows never win');
});

test('a legacy record resolves recovery, and invalid rows never mix with recovered columns', () => {
  const legacy = { selected_version_ids: ['low', 'high'], metadata: {} };
  const resolved = resolveProposalComparison(legacy, [], table);
  assert.equal(resolved.rows.length, table.rows.length, 'recovery supplies the full table');
  assert.deepEqual(resolveProposalComparison(legacy).rows, [], 'no evidence resolves to nothing, never a mixed table');
  const mixed = resolveComparisonDisplay(
    [{ key: 'wrong', values: ['bad', 'bad'] }],
    [{ version_id: 'x', label: 'Option A' }],
    table,
  );
  assert.deepEqual(mixed, resolved, 'invalid pair falls back whole');
});

test('wrong version IDs or wrong column order are rejected, not silently displayed', () => {
  assert.equal(isCompleteComparisonTable(table, ['high', 'low']), false);
  assert.equal(resolveProposalComparison({ selected_version_ids: ['other', 'high'] }, [], table).rows.length, 0);
  assert.equal(isCompleteComparisonTable({ versions: table.versions, rows: [] }), false);
});

test('At a Glance builds one block per resolved version from the same rows', () => {
  const resolved = resolveProposalComparison(proposal);
  const glance = buildComparisonGlance({ comparisonRows: resolved.rows, comparisonVersions: resolved.versions });
  assert.equal(glance.versionGroups.length, 2);
  assert.deepEqual(glance.versionGroups.map((group) => group.name), ['Level 1 version', 'Level 4 version']);
  assert.equal(glance.versionGroups[0].cards.find((card) => card.label.includes('P12')).value, 'L3 · 106 dBC');
  assert.equal(glance.versionGroups[1].cards.find((card) => card.label.includes('P12')).value, 'L4 · 116 dBC');
});

test('editor, PDF and export all consume the canonical resolver and fail closed', () => {
  const editor = fs.readFileSync('src/pages/ProposalEditor.jsx', 'utf8');
  const pack = fs.readFileSync('src/components/proposal/print/ProposalPackDocument.jsx', 'utf8');
  const exporter = fs.readFileSync('src/components/proposal/export/useProposalExport.js', 'utf8');
  assert.match(editor, /comparisonRows=\{comparisonTableForDisplay\.rows\}/);
  assert.match(editor, /comparisonVersions=\{comparisonTableForDisplay\.versions\}/);
  assert.match(editor, /recoveredComparisonTable=\{comparisonTableForDisplay\}/);
  assert.match(editor, /comparisonBlockReason \|\| exportBlockedReason/);
  assert.match(pack, /resolveProposalComparison\(proposal, sections, recoveredComparisonTable\)/);
  assert.match(pack, /reportType === 'comparison' && !hasComparisonGlance/);
  assert.match(exporter, /if \(comparisonBlockReason\) return comparisonBlockReason/);
});

test('generation and regeneration persist the contract and read it back before success', () => {
  for (const name of ['generateProposal', 'regenerateProposalSection']) {
    const source = fs.readFileSync(`base44/functions/${name}/entry.ts`, 'utf8');
    assert.match(source, /comparisonSectionMetadata\(comparisonTable/, `${name} writes section metadata`);
    assert.match(source, /await verifyComparisonPersisted/, `${name} verifies the save`);
    assert.match(source, /selected_versions: (versionEvidence|comparisonEvidence)/, `${name} stores per-version evidence`);
  }
  const reader = fs.readFileSync('base44/functions/readProposalComparisonEvidence/entry.ts', 'utf8');
  assert.match(reader, /isCompleteComparisonTable\(proposal\.metadata\?\.comparison_table, ids\)/, 'reader prefers stored evidence');
});

test('sales voice requires the P17 trade-off, forbids absent-P20 claims and protects the lower option', () => {
  const voice = buildProposalSalesVoice('timbre_matching', 'comparison');
  assert.match(voice, /if P17 is lower/);
  assert.match(voice, /If P20 is absent/);
  assert.match(voice, /Never call it weak/);
  assert.match(buildProposalSalesVoice('key_performance_highlights', 'comparison'), /Do not generate a replacement table/);
});