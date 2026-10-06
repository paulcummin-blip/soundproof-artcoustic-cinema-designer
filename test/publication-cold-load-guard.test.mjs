/**
 * publication-cold-load-guard.test.mjs
 * ------------------------------------
 * The cold-load guard for the publication audit.
 *
 * A report page mounts before the durable publication has resolved. The audit
 * runs with nothing loaded yet, and must:
 *
 *   - not crash (the historical failure read the engineering summary of an
 *     authority that had not resolved)
 *   - not authorise a report snapshot write
 *   - never report the version as Current / durably published
 *   - hand the page a checking state and its reason
 *
 * Then, when the authority resolves, the same audits run normally and the
 * report can regenerate.
 *
 * Pure: no entity is created, updated or deleted.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PUBLICATION_CONTRACT_VERSION,
  buildAtomicParameterIndex,
  auditPublicationContract,
} from '../shared/engineeringPublicationContract.js';
import {
  PUBLICATION_ACKNOWLEDGEMENT,
  auditPublicationEntry,
} from '../src/components/engineering/publicationGateCore.js';
import {
  auditDurablePublication,
  auditReportSaveAuthority,
} from '../src/components/engineering/publicationGateAuthority.js';
import { auditFinalReportAuthority } from '../src/components/report/finalReportAuthorityGate.js';

// ── A resolved, contract-valid publication for one version ───────────────────

const FINGERPRINT = 'eng:v1:coldload00000001';
const VERSION_NAME = 'Level 4 version';
const SEATS = [
  { id: 'seat-r1-c1', rowNumber: 1, row: 1 },
  { id: 'seat-r2-c1', rowNumber: 2, row: 2 },
];
const SPEAKERS = ['L', 'C', 'R', 'SL', 'SR'].map((role, index) => ({
  id: `sp-${role}`, model: 'SPK', role, position: { x: index, y: 1, z: 1.2 },
}));
const ROOM = { widthM: 5, lengthM: 7, heightM: 2.8 };
const SCREEN_SIZE_INCHES = 120;
const SCREEN_WIDTH_M = SCREEN_SIZE_INCHES * 0.0254;
const ROOM_RESULT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21];

const seatedRow = (seat, value) => ({
  seatId: seat.id, row: seat.row, column: 1, priority: 'primary', isPrimary: true,
  level: 'L3', status: 'scored', value, valueFormatted: `${value} dB`,
});

const reportProject = () => ({
  project_id: 'project-1', version_id: 'version-1', version_name: VERSION_NAME, name: 'Marquee Home',
  roomDims: JSON.stringify(ROOM),
  room_width: ROOM.widthM, room_length: ROOM.lengthM, room_height: ROOM.heightM,
  screen_size: SCREEN_SIZE_INCHES, screen_width_m: SCREEN_WIDTH_M,
  aspect_ratio: '16:9', manual_dimensions: false,
  dolby_config: '5.1',
  seating_rows: SEATS.length, seats_per_row_by_row: SEATS.map(() => 1),
  seating_positions: SEATS, selected_speakers: SPEAKERS,
  subwooferInstances: [{ id: 'sub-1', model: 'SUB', enabled: true, position: { x: 2, y: 3 } }],
  acoustic_treatment_enabled: false, selected_abfuser_qty: 0,
});

function resolvedPublication() {
  const publication = {
    publication_contract_version: PUBLICATION_CONTRACT_VERSION,
    engineering_fingerprint: FINGERPRINT,
    published_at: '2026-10-06T09:00:00.000Z',
    engine_version: '1.1', rp22_version: '21', algorithm_version: '24',
    provenance: { bass_fingerprint: 'cal:v8:coldload0001' },
    engineering_summary: {
      seatPriorityFingerprint: 'seat-r1-c1:primary|seat-r2-c1:secondary',
      parameterAuthority: Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [`p${index + 1}`, { state: 'scored', level: 'L3', rawValue: 1 }]),
      ),
      roomResultsByParameter: Object.fromEntries(
        ROOM_RESULT_IDS.map((id) => [id, { title: `RP22 P${id}`, value: 1, formatted: '1', level: 'L3', status: 'scored' }]),
      ),
      viewing: { perSeatRp23: { 'seat-r1-c1': { p1: 'L3' } } },
      designRating: { rating: { level: 'L3', status: 'ASSESSED' } },
      project: { reportCounts: { seatResultsByParameter: {
        p10: [seatedRow(SEATS[0], 1)],
        p20: [seatedRow(SEATS[1], 4)],
      } } },
    },
    report_snapshot: {
      analysisResult: { perSeatRp22: {}, seatMetrics: {} },
      priceData: { total: 1 },
      seatingPositions: SEATS,
      placedSpeakers: SPEAKERS,
      report_project: reportProject(),
    },
  };
  publication.parameter_index = buildAtomicParameterIndex(publication);
  return publication;
}

const resolvedRead = () => ({
  publication: resolvedPublication(),
  status: 'published',
  readState: 'success',
  version: { published_fingerprint: FINGERPRINT, version_name: VERSION_NAME },
});

/** The read a report page holds before the durable publication has resolved. */
const notLoadedYet = {
  publication: null,
  status: 'not_calculated',
  readState: 'success',
  version: { published_fingerprint: null, version_name: VERSION_NAME },
};

// ── 1. Cold load: the audit runs before the authority is loaded ─────────────

test('cold load: every publication audit accepts an unloaded authority without throwing', () => {
  const contract = auditPublicationContract(undefined);
  assert.equal(contract.allowed, false);
  assert.equal(contract.blocked, true);
  assert.equal(contract.status, 'checking');
  assert.deepEqual(contract.missing_fields, ['engineering_authority']);
  assert.match(contract.reason, /still loading/);

  const entry = auditPublicationEntry(undefined);
  assert.equal(entry.complete, false);
  assert.equal(entry.durablyPublished, false);
  assert.equal(entry.status, PUBLICATION_ACKNOWLEDGEMENT.CHECKING);

  const finalGate = auditFinalReportAuthority(undefined);
  assert.equal(finalGate.allowed, false);
  assert.equal(finalGate.status, 'checking');
  assert.match(finalGate.reason, /still loading/);

  const durableGate = auditDurablePublication({ versionName: VERSION_NAME, authorityComplete: true });
  assert.equal(durableGate.allowed, false);
  assert.equal(durableGate.blocked, true);
  assert.equal(durableGate.status, PUBLICATION_ACKNOWLEDGEMENT.CHECKING);
  assert.match(durableGate.reason, /still loading/);

  // The index builder is the historical crash site.
  assert.deepEqual(buildAtomicParameterIndex(undefined), {});
  assert.deepEqual(buildAtomicParameterIndex(null), {});
});

test('cold load: no snapshot is saved and readiness is never Current while loading', () => {
  // The save boundary every report snapshot write passes through.
  const saveGate = auditReportSaveAuthority(notLoadedYet, { versionName: VERSION_NAME });
  const loadingGate = auditReportSaveAuthority(undefined, { versionName: VERSION_NAME });
  const pendingGate = auditDurablePublication({ versionName: VERSION_NAME, authorityComplete: true });

  assert.equal(saveGate.allowed, false);
  assert.equal(loadingGate.allowed, false);
  assert.equal(pendingGate.allowed, false);
  assert.equal(pendingGate.status, PUBLICATION_ACKNOWLEDGEMENT.CHECKING);

  // Readiness: the composed completeness a report reads collapses to blocked,
  // never to Current, while the authority is still loading.
  const gatedCompleteness = pendingGate.allowed
    ? { complete: true, publicationBlocked: false }
    : { complete: false, publicationBlocked: true, reason: pendingGate.reason };
  assert.equal(gatedCompleteness.complete, false);
  assert.equal(gatedCompleteness.publicationBlocked, true);
  assert.equal(auditPublicationEntry(undefined).durablyPublished, false);
  assert.equal(auditFinalReportAuthority(undefined).allowed, false);
});

// ── 2. Read finished, nothing published: missing, still no crash ────────────

test('a read that finishes with no publication reports missing, not checking', () => {
  const gate = auditDurablePublication({ durable: notLoadedYet, versionName: VERSION_NAME, authorityComplete: true });
  assert.equal(gate.allowed, false);
  assert.equal(gate.blocked, true);
  assert.equal(gate.status, PUBLICATION_ACKNOWLEDGEMENT.NOT_PUBLISHED);
  assert.match(gate.reason, /has not been saved/);

  const nullContract = auditPublicationContract(null);
  assert.equal(nullContract.allowed, false);
  assert.equal(nullContract.status, 'missing');
  assert.deepEqual(nullContract.missing_fields, ['engineering_authority']);

  const nullFinalGate = auditFinalReportAuthority(null);
  assert.equal(nullFinalGate.allowed, false);
  assert.equal(nullFinalGate.status, 'missing');

  assert.equal(auditReportSaveAuthority(notLoadedYet, { versionName: VERSION_NAME }).allowed, false);
});

// ── 3. Authority resolved: the audits run normally ─────────────────────────

test('once the authority resolves the audits run normally and open the gate', () => {
  const read = resolvedRead();

  assert.equal(auditPublicationContract(read.publication).allowed, true);
  assert.equal(auditPublicationContract(read.publication).status, 'complete');

  const entry = auditPublicationEntry(read.publication, { expectedFingerprint: FINGERPRINT });
  assert.equal(entry.complete, true);
  assert.equal(entry.status, PUBLICATION_ACKNOWLEDGEMENT.DURABLE);

  const finalGate = auditFinalReportAuthority(read.publication);
  assert.equal(finalGate.allowed, true);
  assert.deepEqual(finalGate.missing, []);

  const durableGate = auditDurablePublication({ durable: read, versionName: VERSION_NAME, authorityComplete: true });
  assert.equal(durableGate.allowed, true);
  assert.equal(durableGate.status, PUBLICATION_ACKNOWLEDGEMENT.DURABLE);

  const saveGate = auditReportSaveAuthority(read, { versionName: VERSION_NAME });
  assert.equal(saveGate.allowed, true);
  assert.equal(saveGate.reason, null);
});

// ── 4. The save boundary stays behind the durable read ─────────────────────

test('the report snapshot write is gated by the durable publication read', () => {
  const code = fs.readFileSync('src/components/report/useReportSnapshot.js', 'utf8');
  assert.match(code, /const durableRead = await fetchDurablePublication\(projectId, versionId, \{ force: true \}\)/);
  assert.match(code, /const saveGate = auditReportSaveAuthority\(durableRead/);
  assert.match(code, /if \(!saveGate\.allowed\)/);
});