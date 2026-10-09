import { test, vi } from 'vitest';
vi.mock('../src/api/base44Client.js', () => ({ base44: { entities: {}, functions: { invoke: vi.fn() } } }));
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { engineeringPublicationPreflight } from '../src/components/engineering/engineeringPublicationPreflight.js';
import { auditDurablePublication, auditReportSaveAuthority } from '../src/components/engineering/publicationGateAuthority.js';
import { buildFrozenReportProject, buildAtomicParameterIndex, PUBLICATION_CONTRACT_VERSION } from '../shared/engineeringPublicationContract.js';
import { PUBLICATION_ATTEMPT, recordPublicationAttempt, readPublicationAttempt } from '../src/components/engineering/publicationAcknowledgementStore.js';
import { resolveBassReadiness } from '../src/components/hooks/useAppDesignRating.js';

const summary = {
  parameterAuthority: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['p' + (i + 1), { state: 'scored', rawValue: 1, level: 'L4' }])),
  designRating: { rating: { level: 'L3' } }, seatPriorityFingerprint: 'seats:v1',
  viewing: { perSeatRp23: { s1: { level: 'L3' } } },
  roomResultsByParameter: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i + 1, { state: 'scored', status: 'scored', value: 1, formatted: '1 dB', level: 'L4' }])),
  project: { reportCounts: { seatResultsByParameter: Object.fromEntries([10, 20].map(id => ['p' + id, [{ seatId: 's1', row: 1, column: 1, priority: 'primary', status: 'scored', value: 1, level: 'L4', valueFormatted: '1 dB' }]])) } },
};
const designState = {
  name: 'Publication fixture', versionName: 'Original Design',
  roomDims: { widthM: 5, lengthM: 7, heightM: 3 },
  screen: { visibleWidthInches: 170, aspectRatio: '16:9', manualMode: false, heightFromFloorM: 0.5, mountMode: 'baffle' },
  screenFrontPlaneM: 0.1, dolbyLayout: '3.1',
  seatingPositions: [{ id: 's1', rowNumber: 1, priority: 'primary', x: 2.5, y: 4, z: 1.2 }],
  placedSpeakers: ['FL', 'FC', 'FR'].map((role, i) => ({ id: role, role, model: 'Q8-5', position: { x: i, y: 0.5, z: 1.2 } })),
  subwooferInstances: [], acousticTreatmentEnabled: false, selectedAbfuserQty: 0,
};
const payload = {
  analysisResult: { perSeatRp22: {} }, priceData: { total: 1 },
  seatingPositions: designState.seatingPositions, placedSpeakers: designState.placedSpeakers,
  report_project: buildFrozenReportProject(designState, { projectId: 'p', versionId: 'l1' }).reportProject,
};
const versions = { engine_version: '1', rp22_version: '21', algorithm_version: '24' };
const input = { projectId: 'p', versionId: 'l1', ready: true, isPublishable: true,
  engineeringSummary: summary, engineeringFingerprint: 'eng:v1:l1',
  bassReadiness: { ready: true, fingerprint: 'cal:l1' }, reportSnapshot: payload,
  designState, versions };
const publication = { engineering_fingerprint: input.engineeringFingerprint, published_at: '2026-10-05T20:00:00Z',
  engineering_summary: summary, report_snapshot: payload, provenance: { bass_fingerprint: 'cal:l1' },
  publication_contract_version: PUBLICATION_CONTRACT_VERSION, ...versions };
publication.parameter_index = buildAtomicParameterIndex(publication);

test('Displayed assessment plus bass cache but no publication never reads Current', () => {
  assert.equal(auditDurablePublication({ durable: { publication: null }, assessmentExists: true }).allowed, false);
  assert.equal(auditDurablePublication({ durable: { publication, version: {} } }).allowed, false);
  assert.equal(auditReportSaveAuthority({ publication, version: { published_fingerprint: null } }).allowed, false);
});
test('Preflight lists every section and succeeds for complete own-version inputs', () => {
  const preflight = engineeringPublicationPreflight(input);
  assert.equal(preflight.ready, true, preflight.reason);
  for (const key of ['rp22_terminal', 'bass_current', 'design_rating', 'products', 'room', 'screen', 'seating', 'seat_priority', 'rp23_viewing', 'source_fingerprints']) {
    assert.equal(preflight.gates.find(gate => gate.key === key)?.ok, true, key);
  }
});
test('P19 NOT_VERIFIED blocks publication with the exact bass rejection reason', () => {
  const bassReadiness = resolveBassReadiness({ authorityStatus: 'NOT_VERIFIED', currentFingerprint: 'cal:l1', publicationRejectionReason: 'reference-eq-parity-invalid' }, true);
  assert.equal(bassReadiness.ready, false);
  const preflight = engineeringPublicationPreflight({ ...input, isPublishable: false, bassReadiness });
  assert.equal(preflight.ready, false);
  assert.equal(preflight.p19Blocks, true);
  assert.match(preflight.reason, /reference-eq-parity-invalid/);
  assert.equal(preflight.action, 'Verify Bass / Complete P19');
});
test('Verified P19 does not independently block a complete publication', () => {
  assert.equal(engineeringPublicationPreflight(input).p19Blocks, false);
  assert.equal(engineeringPublicationPreflight(input).ready, true);
});
test('A skipped preflight records the exact reason, and cannot save a final report', () => {
  const preflight = engineeringPublicationPreflight({ ...input, ready: false });
  recordPublicationAttempt('p', 'skip', { status: PUBLICATION_ATTEMPT.NOT_READY, message: preflight.reason, gates: preflight.gates });
  const attempt = readPublicationAttempt('p', 'skip');
  assert.match(attempt.message, /Version loaded/);
  const gate = auditDurablePublication({ durable: { publication: null }, attempt });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /Version loaded/);
});
test('Cancelled debounce and failed 422 acknowledgement remain explicit and block reports', () => {
  for (const status of [PUBLICATION_ATTEMPT.CANCELLED, PUBLICATION_ATTEMPT.FAILED]) {
    recordPublicationAttempt('p', status, { status, message: 'publication interrupted', httpStatus: 422 });
    const attempt = readPublicationAttempt('p', status);
    assert.equal(attempt.httpStatus, 422);
    assert.equal(auditDurablePublication({ durable: {}, attempt }).allowed, false);
  }
});
test('Acknowledged durable publication survives a cold read; mismatched or missing pointer fails', () => {
  const durable = { publication, version: { published_fingerprint: input.engineeringFingerprint } };
  assert.equal(auditDurablePublication({ durable }).allowed, true);
  assert.equal(auditDurablePublication({ durable: JSON.parse(JSON.stringify(durable)) }).allowed, true);
  assert.equal(auditDurablePublication({ durable: { ...durable, version: { published_fingerprint: 'eng:l4' } } }).allowed, false);
  assert.equal(auditDurablePublication({ durable: { ...durable, version: {} } }).allowed, false);
});
test('Debounce depends on semantic summary, not render object identity', () => {
  const hook = fs.readFileSync(new URL('../src/components/proposal/engineeringAuthority/useEngineeringPublicationEffect.js', import.meta.url), 'utf8');
  assert.match(hook, /const summaryKey = JSON.stringify\(engineeringSummary\)/);
  const dependencies = hook.match(/\}, \[projectId, versionId[^\]]+\]\);/)[0];
  assert.match(dependencies, /summaryKey/);
  assert.doesNotMatch(dependencies, /engineeringSummary/);
  assert.match(hook, /PUBLICATION_ATTEMPT.CANCELLED/);
});
test('Publish acknowledgement audits fresh database reads, not submitted fallback', () => {
  const server = fs.readFileSync(new URL('../base44/functions/publishEngineering/entry.ts', import.meta.url), 'utf8');
  assert.match(server, /ProjectVersion.get\(versionId\)/);
  assert.match(server, /ProjectAnalysisCache.get\(cacheRecord.id\)/);
  assert.match(server, /findPublication\(storedCache, fingerprint\)/);
  assert.doesNotMatch(server, /findPublication\(cacheRecord, fingerprint\) \|\| publication/);
});