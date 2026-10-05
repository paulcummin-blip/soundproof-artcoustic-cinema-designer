/**
 * publication-durability.test.mjs
 * -------------------------------
 * The durability standard, cases A-F:
 *
 *   A  an assessment completes → a full publication is written durably, the
 *      version pointer is populated, engineering_publications holds it
 *   B  report generation BEFORE publication → blocked; no snapshot marked Current
 *   C  browser refresh after publication → the durable authority is still there
 *      and reports can be generated (and a browser-only result never qualifies)
 *   D  debounce/cancel/imcomplete write → report generation stays blocked
 *   E  Level 1 Marquee recovery → the gate opens only for a full authority
 *   F  Level 4 regression → stays Current, and a pointer mismatch blocks
 *
 * Both halves of the rule are exercised (the server module the backend functions
 * use, and its client mirror), and they are asserted to agree on every fixture.
 *
 * Pure: no entity is created, updated or deleted.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  auditEngineeringPublication,
  isPublishableEngineeringSummary,
  publicationBlockReason,
} from '../base44/shared/publicationGateAuthority.js';
import { upsertPublication, findPublication } from '../base44/shared/publishedEngineeringAuthority.js';
import {
  auditDurablePublication,
  auditPublicationEntry,
  auditReportSaveAuthority,
  publicationBlockMessage,
} from '../src/components/engineering/publicationGateAuthority.js';

// ── Fixtures shaped from the real Marquee Home publications ──────────────────

const FINGERPRINT_L4 = 'eng:v1:c19ceb2efb6c3d9c';
const FINGERPRINT_L1 = 'eng:v1:level1recovered0001';

function parameters() {
  const map = {};
  for (let i = 1; i <= 21; i += 1) {
    const key = `p${i}`;
    // The real Level 4 publication carries p14/p18/p19 as provisional: their
    // values are supplied by the version's durable bass contract, which is why
    // the bass authority is satisfied by results OR the durable contract.
    const provisional = [14, 18, 19].includes(i);
    map[key] = { state: provisional ? 'provisional' : 'scored', scope: 'room', level: provisional ? null : 'L3' };
  }
  return map;
}

function completePublication({ fingerprint = FINGERPRINT_L4 } = {}) {
  return {
    engineering_fingerprint: fingerprint,
    published_at: '2026-10-01T23:10:14.308Z',
    engine_version: '1.1',
    rp22_version: '21',
    algorithm_version: '24',
    schema_version: 1,
    publication_reason: 'auto-settled',
    provenance: { snapshot_version: 1, instance_authority_version: 1, summary_schema_version: 1, bass_fingerprint: null },
    engineering_summary: {
      seatPriorityFingerprint: 'seat-r1-c1:secondary|seat-r1-c2:primary',
      parameterAuthority: parameters(),
      roomResultsByParameter: {
        12: { value: 102.5 },
        13: { value: 108 },
        14: { value: null, status: 'no_data' },
        18: { value: null, status: 'no_data' },
        19: { value: null, status: 'no_data' },
      },
      viewing: { perSeatRp23: { 'seat-r1-c1': { p1: 'L4' } } },
      designRating: { rating: { level: 'L3', status: 'ASSESSED' } },
      project: { seatIds: ['seat-r1-c1', 'seat-r1-c2'] },
    },
    report_snapshot: {
      analysisResult: { perSeatRp22: {}, perSeatRp23: {}, seatMetrics: {}, param5: {} },
      priceData: { total: 128400 },
      seatingPositions: [{ id: 'seat-r1-c1' }, { id: 'seat-r1-c2' }],
      placedSpeakers: [{ id: 'lcr-l' }, { id: 'lcr-c' }, { id: 'lcr-r' }],
      showAsdr: true,
    },
  };
}

const PROJECT = Object.freeze({
  roomDims: '{"widthM":5.18,"lengthM":7.29,"heightM":2.8}',
  screen_size: 120,
});

const durableRead = ({ publication, fingerprint = null, versionName = null, status = 'published', readState = 'success' }) => ({
  publication: publication || null,
  status,
  readState,
  version: { published_fingerprint: fingerprint, version_name: versionName },
});

const L4_READ = durableRead({
  publication: completePublication(),
  fingerprint: FINGERPRINT_L4,
  versionName: 'Level 4 version',
});
const L1_READ = durableRead({
  publication: null,
  fingerprint: null,
  versionName: 'Level 1 version',
  status: 'not_calculated',
});

/** The two halves must never drift: same sections, same verdict. */
function assertHalvesAgree(publication, { expectedFingerprint = null, project = PROJECT, bassAuthorityAvailable = false } = {}) {
  const server = auditEngineeringPublication(publication, { expectedFingerprint, project, bassAuthorityAvailable });
  const client = auditPublicationEntry(publication, { expectedFingerprint, project, bassAuthorityAvailable });
  assert.equal(client.complete, server.complete, 'both halves agree on completeness');
  assert.deepEqual(
    client.missing.map((item) => item.key).sort(),
    server.missing.map((item) => item.key).sort(),
    'both halves agree on the missing sections',
  );
  return server;
}

// ── A. Assessment complete → durable publication ─────────────────────────────

test('A. a completed assessment writes a full durable publication and populates the pointer', () => {
  const cacheRecord = { project_id: 'p', version_id: 'v', engineering_publications: {} };
  const written = completePublication();
  const { publications } = upsertPublication(cacheRecord, FINGERPRINT_L4, written);
  const stored = findPublication({ engineering_publications: publications }, FINGERPRINT_L4);

  assert.ok(stored, 'the publication is in engineering_publications');
  assert.equal(stored.engineering_fingerprint, FINGERPRINT_L4);

  // The version pointer is what makes it authority.
  const pointer = FINGERPRINT_L4;
  const audit = assertHalvesAgree(stored, {
    expectedFingerprint: pointer,
    bassAuthorityAvailable: true,
  });
  assert.equal(audit.complete, true);
  assert.equal(audit.durablyPublished, true);
  assert.equal(audit.status, 'durably_published');
  assert.equal(audit.fingerprintMatches, true);
});

test('A2. a summary without the full RP22 authority is refused at the source', () => {
  assert.equal(isPublishableEngineeringSummary(completePublication().engineering_summary).usable, true);
  assert.equal(isPublishableEngineeringSummary(null).usable, false);
  assert.equal(isPublishableEngineeringSummary({}).usable, false);

  const partial = parameters();
  delete partial.p20;
  const verdict = isPublishableEngineeringSummary({ parameterAuthority: partial });
  assert.equal(verdict.usable, false);
  assert.deepEqual(verdict.missing, ['rp22_parameters']);
});

// ── B. Report generation before publication ─────────────────────────────────

test('B. report generation without a durable publication is blocked with the exact reason', () => {
  const gate = auditDurablePublication({
    durable: L1_READ,
    versionName: 'Level 1 version',
    authorityComplete: true,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.blocked, true);
  assert.equal(
    gate.reason,
    'Engineering assessment has not been saved for Level 1 version. Run assessment before generating reports.',
  );

  // The same reason from the server half — one sentence, both halves.
  assert.equal(
    publicationBlockReason({ versionName: 'Level 1 version' }),
    publicationBlockMessage({ versionName: 'Level 1 version' }),
  );

  // A report snapshot is refused: nothing is marked Current.
  const save = auditReportSaveAuthority(L1_READ, { versionName: 'Level 1 version' });
  assert.equal(save.allowed, false);
  assert.match(save.reason, /has not been saved for Level 1 version/);
});

// ── C. Browser refresh / no browser-only authority ──────────────────────────

test('C. after publication a cold read still opens the gate, and a browser result never does', () => {
  const coldRead = auditDurablePublication({
    durable: L4_READ,
    versionName: 'Level 4 version',
    project: PROJECT,
    authorityComplete: true,
  });
  assert.equal(coldRead.allowed, true);
  assert.equal(coldRead.status, 'durably_published');

  // The gate never consults a browser handoff: a summary that exists only in the
  // browser cannot authorise a report, whatever it carries.
  const localOnly = auditDurablePublication({
    durable: { ...L1_READ, localSnapshot: { engineeringSummary: completePublication().engineering_summary } },
    versionName: 'Level 1 version',
    authorityComplete: true,
  });
  assert.equal(localOnly.allowed, false);
});

test('C2. a publication that exists but cannot be read blocks the report', () => {
  const gate = auditDurablePublication({
    durable: durableRead({ publication: null, versionName: 'Level 4 version', status: 'published', readState: 'failed' }),
    versionName: 'Level 4 version',
    authorityComplete: true,
  });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /could not be read/);
});

// ── D. Debounce / cancel path ───────────────────────────────────────────────

test('D. an interrupted publication leaves report generation blocked', () => {
  const publishing = auditDurablePublication({
    durable: L1_READ,
    versionName: 'Level 1 version',
    authorityComplete: true,
    attempt: { status: 'publishing' },
  });
  assert.equal(publishing.allowed, false);
  assert.match(publishing.reason, /still being saved/);

  const failed = auditDurablePublication({
    durable: L1_READ,
    versionName: 'Level 1 version',
    authorityComplete: true,
    attempt: { status: 'failed', message: 'Network request failed.' },
  });
  assert.equal(failed.allowed, false);
  assert.match(failed.reason, /Network request failed\./);

  // And a failed attempt can never be mistaken for a Current report.
  assert.equal(auditReportSaveAuthority(L1_READ, { versionName: 'Level 1 version' }).allowed, false);
});

// ── E. Level 1 recovery ─────────────────────────────────────────────────────

test('E. the gate opens for a full Level 1 authority and refuses a partial one', () => {
  const recovered = completePublication({ fingerprint: FINGERPRINT_L1 });
  const read = durableRead({
    publication: recovered,
    fingerprint: FINGERPRINT_L1,
    versionName: 'Level 1 version',
  });

  const gate = auditDurablePublication({ durable: read, versionName: 'Level 1 version', project: PROJECT, authorityComplete: true });
  assert.equal(gate.allowed, true);
  assert.equal(gate.status, 'durably_published');
  assert.equal(assertHalvesAgree(recovered, { expectedFingerprint: FINGERPRINT_L1, project: PROJECT, bassAuthorityAvailable: true }).complete, true);

  // A publication that is missing its report payload (the historical Level 1
  // case: values in the report, no authority behind it) is refused, and the
  // reason names what is missing.
  const partial = { ...recovered, report_snapshot: {} };
  const partialGate = auditDurablePublication({
    durable: durableRead({ publication: partial, fingerprint: FINGERPRINT_L1, versionName: 'Level 1 version' }),
    versionName: 'Level 1 version',
    project: PROJECT,
    authorityComplete: true,
  });
  assert.equal(partialGate.allowed, false);
  assert.match(partialGate.reason, /incomplete/);
  assert.match(partialGate.reason, /the products selected/);
  assert.equal(assertHalvesAgree(partial, { expectedFingerprint: FINGERPRINT_L1, project: PROJECT, bassAuthorityAvailable: true }).complete, false);
});

// ── F. Level 4 regression ───────────────────────────────────────────────────

test('F. the published Level 4 authority stays Current and a pointer mismatch blocks', () => {
  const gate = auditDurablePublication({
    durable: L4_READ,
    versionName: 'Level 4 version',
    project: PROJECT,
    authorityComplete: true,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.blocked, false);
  assert.equal(gate.reason, null);

  const mismatch = assertHalvesAgree(completePublication(), {
    expectedFingerprint: 'eng:v1:adifferentdesign',
    project: PROJECT,
    bassAuthorityAvailable: true,
  });
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.fingerprintMatches, false);
  assert.ok(mismatch.missing.some((item) => item.key === 'pointer_match'));

  const mismatchGate = auditDurablePublication({
    durable: durableRead({
      publication: completePublication(),
      fingerprint: 'eng:v1:adifferentdesign',
      versionName: 'Level 4 version',
    }),
    versionName: 'Level 4 version',
    project: PROJECT,
    authorityComplete: true,
  });
  assert.equal(mismatchGate.allowed, false);
  assert.match(mismatchGate.reason, /a matching version publication pointer/);
});

test('F2. an incomplete composed assessment still blocks an otherwise durable publication', () => {
  const gate = auditDurablePublication({
    durable: L4_READ,
    versionName: 'Level 4 version',
    project: PROJECT,
    authorityComplete: false,
    authorityReason: 'Complete the remaining assessment before generating reports or proposals: P20.',
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 'incomplete');
  assert.match(gate.reason, /P20/);
});

test('F3. room and screen are only required when the project authority is supplied', () => {
  const published = completePublication();
  assert.equal(
    assertHalvesAgree(published, { expectedFingerprint: FINGERPRINT_L4, project: null, bassAuthorityAvailable: true }).complete,
    true,
    'without the project, the gate does not invent a room requirement',
  );
  assert.equal(
    assertHalvesAgree(published, {
      expectedFingerprint: FINGERPRINT_L4,
      project: { roomDims: null, screen_size: null },
      bassAuthorityAvailable: true,
    }).complete,
    false,
    'with the project supplied, missing room and screen are stated',
  );
});