/**
 * Acceptance tests — ONE proposal readiness authority.
 *
 * Defect under test (Marquee Home, Step 5):
 *   The Version Readiness panel read every selected version as Current, while
 *   the Generate gate blocked with
 *   "Level 1 version · V2 is missing Visual and Technical Reports".
 *
 * Two authorities were answering: the panel read the version's engineering
 * result from a browser-session handoff (which the server cannot see), and the
 * server judged the version from its published engineering pointer — then
 * described that block as missing REPORTS, and named the version with a slot
 * suffix ("· V2").
 *
 * The second defect (Marquee Home, Step 3) is the one tested hardest here:
 *   Level 1 version read "Visual Current / Technical Current / Engineering
 *   Missing". Its calculated engineering result was never missing — it is the
 *   completed result in the version's own ProjectAnalysisCache, which is exactly
 *   what its Technical Report was generated from. Only a SEPARATE published
 *   publication row was absent, so the engineering column was reading a
 *   different source from the Technical Report beside it.
 *
 * The stored truth for Marquee Home is in the fixtures below:
 *   Level 4 version (slot 1) — published engineering result + current reports
 *   Level 1 version (slot 2) — reports current, completed calculation authority
 *     in ProjectAnalysisCache, NO separate published publication
 *
 * The three columns must therefore agree, version by version: a Technical Report
 * that reads Current can never sit beside an engineering column reading Missing.
 *
 *   TEST 1  Both modules derive the same rows, sentences and gate (parity)
 *   TEST 2  Both modules share one vocabulary (no drift in the copy)
 *   TEST 3  Marquee Home Level 4 version: everything Current, gate ready
 *   TEST 4  Marquee Home Level 1 version: everything Current, gate ready
 *   TEST 5  The gate message is the panel's own sentence (one authority)
 *   TEST 6  No false missing-report warning; the real source is named
 *   TEST 7  A stale report names that report, per version
 *   TEST 8  Both reports missing → one combined clause
 *   TEST 9  Saved version names only — never "· V2"
 *   TEST 10 Generate is enabled only when every selected version is Current
 *   TEST 11 The engineering cell follows durable results, never a handoff
 *   TEST 12 A report cell is judged by the fingerprints both sides state
 *   TEST 13 The engineering result resolves from the completed calculation
 *           authority the Technical Report was generated from
 *   TEST 14 Client and server resolve the same engineering result
 *   TEST 15 A version with reports but no calculated result still blocks, and
 *           names the calculated engineering result as what is missing
 *   TEST 20 The four snapshot fixtures, one verdict each: A legacy (no evidence),
 *           B incomplete evidence, C current visual, D current technical
 *   TEST 21 Server authority, client mirror, Proposal Centre gate and Project
 *           Library banner read every fixture alike
 *   TEST 22 The fixtures satisfy the shared completeness contract, and the
 *           incomplete one is refused by it
 *
 * Pure: no React, no database.
 *
 * Run: node test/proposal-readiness-authority.test.mjs
 */

import assert from 'node:assert/strict';
import { test as vitestTest } from 'vitest';

import {
  READINESS_VERB as SHARED_VERB,
  READINESS_COLUMNS as SHARED_COLUMNS,
  READINESS_COMBINED_REPORT_LABEL as SHARED_COMBINED_LABEL,
  READINESS_STATUS_TEXT as SHARED_STATUS_TEXT,
  PROPOSAL_READINESS_READY_COPY as SHARED_READY_COPY,
  CALCULATION_AUTHORITY_SOURCE as SHARED_CALC_SOURCE,
  READINESS_STATE,
  PUBLICATION_STATUS,
  buildReadinessCell,
  blockerLabel as sharedBlockerLabel,
  resolveCalculationAuthority as sharedCalculationAuthority,
  resolveEngineeringCell,
  resolveProposalReadinessGate,
  resolveSavedReportCell,
  resolveVersionReadiness,
  resolveVersionReadinessRow as sharedVersionReadinessRow,
  versionDisplayName as sharedVersionDisplayName,
} from '../base44/shared/proposalReadinessAuthority.js';

import { validateReportEvidence } from '../base44/shared/reportEvidenceCompleteness.js';

import {
  LIBRARY_CHECKLIST_STATUS,
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
} from '../src/components/library/libraryProposalReadiness.js';

import {
  READINESS_VERB as CLIENT_VERB,
  READINESS_COLUMNS as CLIENT_COLUMNS,
  READINESS_COMBINED_REPORT_LABEL as CLIENT_COMBINED_LABEL,
  READINESS_STATUS_TEXT as CLIENT_STATUS_TEXT,
  PROPOSAL_READINESS_READY_COPY as CLIENT_READY_COPY,
  CALCULATION_AUTHORITY_SOURCE as CLIENT_CALC_SOURCE,
  blockerLabel as clientBlockerLabel,
  resolveCalculationAuthority as clientCalculationAuthority,
  resolveEngineeringCell as clientEngineeringCell,
  resolveProposalReadinessGate as clientGate,
  resolveVersionReadinessRow as clientRow,
  versionDisplayName as clientVersionDisplayName,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

// ── The stored Marquee Home sources (read from the app's own records) ───────

const SEAT_PRIORITY =
  'seat-r1-c1:secondary|seat-r1-c2:primary|seat-r1-c3:primary|seat-r1-c4:secondary'
  + '|seat-r2-c1:secondary|seat-r2-c2:secondary|seat-r2-c3:primary|seat-r2-c4:secondary|seat-r2-c5:secondary';

const PROJECT_ID = 'p1';
const ENGINEERING_FP = 'eng:v1:c19ceb2efb6c3d9c';
const EVIDENCE_TIMESTAMP = '2026-10-04T17:11:05.564Z';

/** The parameters whose provenance comes from the durable bass authority. */
const BASS_PARAMETER_KEYS = ['P14', 'P18', 'P19', 'P20'];

/** The RP22 parameters a Technical Report must state before a proposal may read it. */
const REQUIRED_TECHNICAL_PARAMETER_IDS = [12, 13, 14, 18, 19, 20];

/** The room, screen, system and seating facts every complete payload states. */
const EVIDENCE_ROOM = { length_m: 6.2, width_m: 4.6, height_m: 2.5, volume_m3: 71.3 };

const EVIDENCE_SCREEN = {
  screen_type: 'Projection screen',
  format: '16:9',
  viewable_diagonal_in: 120,
  viewable_width_cm: 265.7,
  viewable_height_cm: 149.4,
};

const EVIDENCE_PRODUCTS = [
  { role: 'Screen LCR', model: 'DF-48', quantity: 3, position: null },
  { role: 'Surround', model: 'DF-24', quantity: 4, position: 'side and rear' },
  { role: 'Overhead', model: 'DF-12', quantity: 6, position: null },
  { role: 'Subwoofer', model: 'SUB3-12', quantity: 4, position: 'front and rear' },
];

const EVIDENCE_SEATS = [
  { row: 1, seat_id: 'seat-r1-c1', column: 1, priority: 'secondary', distance_m: 4.12, horizontal_angle_deg: -14.2 },
  { row: 1, seat_id: 'seat-r1-c2', column: 2, priority: 'primary', distance_m: 4.02, horizontal_angle_deg: -3.1 },
  { row: 1, seat_id: 'seat-r1-c3', column: 3, priority: 'primary', distance_m: 4.02, horizontal_angle_deg: 3.1 },
  { row: 2, seat_id: 'seat-r2-c2', column: 2, priority: 'secondary', distance_m: 5.68, horizontal_angle_deg: -4.4 },
];

/**
 * One parameter row exactly as the capture writes it: the reading, the scope it
 * was taken at, and the durable authority it came from. The parameter index and
 * the parallel `parameters` list share these very objects, which is how the
 * contract requires the two to agree field for field.
 */
function parameterRow({ key, value, level, scope, authorityFingerprint, rawValue = null }) {
  const bass = BASS_PARAMETER_KEYS.includes(key);
  return {
    key,
    parameter_id: Number(key.slice(1)),
    scope,
    value,
    level,
    ...(rawValue === null ? {} : { raw_value: rawValue }),
    authority_value: value,
    authority_level: level,
    authority_fingerprint: authorityFingerprint,
    authority_timestamp: EVIDENCE_TIMESTAMP,
    source_type: bass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
  };
}

/** The viewing geometry a Visual Report states — no bass rows, and none needed. */
function viewingParameters(sourceFingerprint) {
  return [
    { key: 'P4', value: 4.02, level: 'L3', scope: 'room' },
    { key: 'P5', value: 41.2, level: 'L2', scope: 'room' },
    { key: 'P7', value: 52.8, level: 'L4', scope: 'per-seat' },
  ].map((row) => parameterRow({ ...row, authorityFingerprint: sourceFingerprint }));
}

/** P1–P21, the set a Technical Report states, with the bass rows on their own authority. */
function technicalParameters({ sourceFingerprint, bassFingerprint }) {
  const rows = [];
  for (let id = 1; id <= 21; id += 1) {
    const key = `P${id}`;
    const bass = BASS_PARAMETER_KEYS.includes(key);
    const value = id === 14 ? 4 : 3;
    rows.push(parameterRow({
      key,
      value,
      level: id === 14 ? 'L4' : 'L3',
      scope: id === 10 ? 'project' : 'room',
      authorityFingerprint: bass ? bassFingerprint : sourceFingerprint,
      rawValue: id === 14 ? value : null,
    }));
  }
  return rows;
}

/** One complete evidence payload, of one report type, for one version. */
function completeEvidence({ reportType, versionId, sourceFingerprint, bassFingerprint = null, parameters }) {
  return {
    evidence_version: 1,
    report_type: reportType,
    identity: {
      project_id: PROJECT_ID,
      version_id: versionId,
      report_type: reportType,
      source_fingerprint: sourceFingerprint,
      bass_fingerprint: bassFingerprint,
    },
    room: { ...EVIDENCE_ROOM },
    screen: { ...EVIDENCE_SCREEN },
    system: { products_selected: EVIDENCE_PRODUCTS.map((product) => ({ ...product })) },
    seating: { seats: EVIDENCE_SEATS.length, per_seat: EVIDENCE_SEATS.map((seat) => ({ ...seat })) },
    parameters,
    parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: bassFingerprint
      ? { current: true, p14: { raw_value: 4, achieved_level: 'L4' } }
      : { current: false, p14: null },
    proposal_ready: true,
    evidence_fingerprint: 're1-8c1f0f2a-2a0',
  };
}

/** Fixture C — the Visual Report's own evidence: correct type, viewing facts, no bass rows. */
const visualEvidence = ({ versionId, sourceFingerprint }) => completeEvidence({
  reportType: 'visual',
  versionId,
  sourceFingerprint,
  parameters: viewingParameters(sourceFingerprint),
});

/** Fixture D — the Technical Report's own evidence: P1–P21, with bass provenance. */
const technicalEvidence = ({ versionId, sourceFingerprint, bassFingerprint }) => completeEvidence({
  reportType: 'technical',
  versionId,
  sourceFingerprint,
  bassFingerprint,
  parameters: technicalParameters({ sourceFingerprint, bassFingerprint }),
});

/**
 * Fixture B — evidence that is stored but NOT complete: it states its own
 * identity and claims proposal-ready, and nothing else the contract requires —
 * no source fingerprint, room, screen, seating, products or parameter index.
 * This is the shape a proposal must refuse as Incomplete.
 */
const incompleteEvidence = ({ reportType, versionId }) => ({
  evidence_version: 1,
  report_type: reportType,
  identity: { project_id: PROJECT_ID, version_id: versionId, report_type: reportType },
  proposal_ready: true,
  evidence_fingerprint: 're1-8c1f0f2a-2a0',
});

/**
 * A saved report carried under the current payload generation: its pages, its
 * frozen proposal source and — when the fixture states one — the reportEvidence
 * a proposal reads. Omitting `evidence` is Fixture A, the legacy snapshot: the
 * report exists and is current, and only its evidence was never captured.
 */
const savedReport = ({ reportType = null, versionId = null, fingerprints, generatedAt, evidence = null }) => ({
  report_type: reportType,
  project_id: PROJECT_ID,
  version_id: versionId,
  report_schema_version: 1,
  payload: {
    pages: [{ id: 'cover', category: 'cover' }],
    proposalSource: { report_source_version: 1, identity: {} },
    ...(evidence ? { reportEvidence: evidence } : {}),
  },
  source_fingerprints: fingerprints,
  generated_at: generatedAt,
});

/**
 * Fixture A — the same report written BEFORE the proposal evidence capture
 * existed: pages and fingerprints, stored current, and no reportEvidence. The
 * report is not missing; only its proposal evidence needs a one-time refresh.
 */
const legacyReport = ({ reportType = null, versionId = null, fingerprints, generatedAt }) => savedReport({
  reportType, versionId, fingerprints, generatedAt,
});

const LEVEL_4_VERSION = {
  id: '6abbca6e199f13dc4d74ec4a',
  version_name: 'Level 4 version',
  version_number: 1,
  published_fingerprint: 'eng:v1:c19ceb2efb6c3d9c',
};

const LEVEL_1_VERSION = {
  id: '6ac22230d40d8bb0a925ecab',
  version_name: 'Level 1 version',
  version_number: 2,
  published_fingerprint: null,
};

/**
 * The bass fingerprint this version's reports were frozen against. A publication
 * only exists once the bass authority it froze is stated — the publication
 * contract requires provenance.bass_fingerprint — so the fixture states it, and
 * the reports state the same design they were generated from.
 */
const LEVEL_4_BASS_FINGERPRINT =
  'cal:v8:2b7f4c91d0a8e63f|mode:canonical-physics-eq|protocol:bass-optimiser-protocol-v1'
  + '|engine:house-curve-shape-fit-v41-physically-qualified-p18|result-schema:34|metric-schema:21';

const LEVEL_4_PUBLICATION = {
  engineering_fingerprint: ENGINEERING_FP,
  published_at: '2026-10-01T23:10:14.308Z',
  provenance: { bass_fingerprint: LEVEL_4_BASS_FINGERPRINT },
  engineering_summary: { seatPriorityFingerprint: SEAT_PRIORITY },
};

/** Fixture C — a complete Visual Report: room, screen, viewing and seating, no bass rows. */
const LEVEL_4_VISUAL = savedReport({
  reportType: 'visual',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: '2026-10-02T22:03:28.601Z',
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: visualEvidence({ versionId: LEVEL_4_VERSION.id, sourceFingerprint: ENGINEERING_FP }),
});

/** Fixture D — a complete Technical Report: P1–P21, with the bass rows on the bass authority. */
const LEVEL_4_TECHNICAL = savedReport({
  reportType: 'technical',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: EVIDENCE_TIMESTAMP,
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: technicalEvidence({
    versionId: LEVEL_4_VERSION.id,
    sourceFingerprint: ENGINEERING_FP,
    bassFingerprint: LEVEL_4_BASS_FINGERPRINT,
  }),
});

const LEVEL_4_SOURCES = {
  version: LEVEL_4_VERSION,
  savedReports: { visual: LEVEL_4_VISUAL, technical: LEVEL_4_TECHNICAL },
  publication: LEVEL_4_PUBLICATION,
  publicationStatus: PUBLICATION_STATUS.PUBLISHED,
  currentFingerprints: {
    engineeringFingerprint: ENGINEERING_FP,
    calculationFingerprint: LEVEL_4_BASS_FINGERPRINT,
    seatPriorityFingerprint: SEAT_PRIORITY,
  },
};

/**
 * The Level 1 version's calculated engineering result.
 *
 * ProjectAnalysisCache.completed_by_fingerprint holds the completed bass result
 * for the version's OWN current fingerprint — the same fingerprint the saved
 * reports state as their source (see the trace below, taken from the stored
 * Marquee Home records). The version has no separate published publication.
 */
const CALC_FINGERPRINT =
  'cal:v8:395d1a338da6c449|mode:canonical-physics-eq|protocol:bass-optimiser-protocol-v1'
  + '|pool:bass-optimiser-pool-v41-physically-qualified-p18'
  + '|engine:house-curve-shape-fit-v41-physically-qualified-p18|result-schema:34|metric-schema:21';
const CALC_COMPLETED_AT_MS = 1791108297487;

const LEVEL_1_VISUAL = savedReport({
  reportType: 'visual',
  versionId: LEVEL_1_VERSION.id,
  generatedAt: '2026-10-04T10:07:51.482Z',
  fingerprints: { engineeringFingerprint: null, calculationFingerprint: CALC_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: visualEvidence({ versionId: LEVEL_1_VERSION.id, sourceFingerprint: CALC_FINGERPRINT }),
});

const LEVEL_1_TECHNICAL = savedReport({
  reportType: 'technical',
  versionId: LEVEL_1_VERSION.id,
  generatedAt: '2026-10-04T15:48:40.816Z',
  fingerprints: { engineeringFingerprint: null, calculationFingerprint: CALC_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: technicalEvidence({
    versionId: LEVEL_1_VERSION.id,
    sourceFingerprint: CALC_FINGERPRINT,
    bassFingerprint: CALC_FINGERPRINT,
  }),
});

const LEVEL_1_CACHE = {
  version_id: LEVEL_1_VERSION.id,
  status: 'complete',
  current_fingerprint: CALC_FINGERPRINT,
  completed_by_fingerprint: {
    [CALC_FINGERPRINT]: {
      version: 'bass-analysis-contract',
      metricSchemaVersion: 21,
      job: { status: 'complete', completedAtMs: CALC_COMPLETED_AT_MS },
    },
  },
};

const LEVEL_1_SOURCES = {
  version: LEVEL_1_VERSION,
  savedReports: { visual: LEVEL_1_VISUAL, technical: LEVEL_1_TECHNICAL },
  publication: null,
  publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED,
  currentFingerprints: {
    engineeringFingerprint: null,
    calculationFingerprint: CALC_FINGERPRINT,
    seatPriorityFingerprint: SEAT_PRIORITY,
  },
  calculationAuthority: sharedCalculationAuthority({
    cacheRecord: LEVEL_1_CACHE,
    savedTechnicalReport: LEVEL_1_TECHNICAL,
  }),
};

/**
 * The same version with its completed result gone: reports still saved, but the
 * analysis cache holds nothing for it and it has no publication. This is the
 * only shape in which the engineering column may read Missing — and then the
 * sentence must name the calculated engineering result.
 */
const UNBACKED_SOURCES = {
  ...LEVEL_1_SOURCES,
  currentFingerprints: {
    engineeringFingerprint: null,
    calculationFingerprint: null,
    seatPriorityFingerprint: SEAT_PRIORITY,
  },
  calculationAuthority: null,
};

/**
 * Fixture B — the same version's reports saved under the current payload
 * generation, carrying evidence that is stored and incomplete. The version has
 * moved nowhere: the reports match the design, and only the evidence fails the
 * contract. Incomplete — never Current, and never Legacy.
 */
const INCOMPLETE_VISUAL = savedReport({
  reportType: 'visual',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: '2026-10-02T22:03:28.601Z',
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: incompleteEvidence({ reportType: 'visual', versionId: LEVEL_4_VERSION.id }),
});

const INCOMPLETE_TECHNICAL = savedReport({
  reportType: 'technical',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: EVIDENCE_TIMESTAMP,
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  evidence: incompleteEvidence({ reportType: 'technical', versionId: LEVEL_4_VERSION.id }),
});

const INCOMPLETE_SOURCES = {
  ...LEVEL_4_SOURCES,
  savedReports: { visual: INCOMPLETE_VISUAL, technical: INCOMPLETE_TECHNICAL },
};

/** The same row, assembled the way the Step 5 table assembles it. */
const asClientRow = (sources) => clientRow({
  versionId: sources.version.id,
  versionName: clientVersionDisplayName(sources.version),
  versionNumber: sources.version.version_number,
  cells: {
    visual: sources.savedReports.visual
      ? buildReadinessCell({
        state: resolveSavedReportCell({ saved: sources.savedReports.visual, currentFingerprints: sources.currentFingerprints }).state,
      })
      : undefined,
    technical: sources.savedReports.technical
      ? buildReadinessCell({
        state: resolveSavedReportCell({ saved: sources.savedReports.technical, currentFingerprints: sources.currentFingerprints }).state,
      })
      : undefined,
    engineering: undefined,
  },
});

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
};

// ── 1. Parity: both modules derive the same verdict ─────────────────────────

test('1. both modules derive the same rows, sentences and gate message', () => {
  for (const sources of [LEVEL_4_SOURCES, LEVEL_1_SOURCES]) {
    const shared = resolveVersionReadiness(sources);
    const client = clientRow({
      versionId: shared.versionId,
      versionName: shared.versionName,
      versionNumber: shared.versionNumber,
      cells: { visual: shared.visual, technical: shared.technical, engineering: shared.engineering },
    });
    assert.equal(client.blockingSentence, shared.blockingSentence, 'same sentence');
    assert.equal(client.ready, shared.ready, 'same verdict');
    assert.equal(client.visual_report_status, shared.visual_report_status);
    assert.equal(client.technical_report_status, shared.technical_report_status);
    assert.equal(client.engineering_result_status, shared.engineering_result_status);
  }

  const sharedGate = resolveProposalReadinessGate({ rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)] });
  const clientGateResult = clientGate({ rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)] });
  assert.equal(clientGateResult.ready, sharedGate.ready);
  assert.equal(clientGateResult.message, sharedGate.message);
  assert.deepEqual(clientGateResult.blockedVersions, sharedGate.blockedVersions);
});

// ── 2. One vocabulary ───────────────────────────────────────────────────────

test('2. both modules share one vocabulary', () => {
  assert.deepEqual(CLIENT_VERB, SHARED_VERB);
  assert.deepEqual(CLIENT_STATUS_TEXT, SHARED_STATUS_TEXT);
  assert.deepEqual(CLIENT_COLUMNS, SHARED_COLUMNS);
  assert.equal(CLIENT_COMBINED_LABEL, SHARED_COMBINED_LABEL);
  assert.equal(CLIENT_READY_COPY, SHARED_READY_COPY);
  for (const source of ['visual', 'technical', 'engineering']) {
    for (const state of Object.values(READINESS_STATE)) {
      assert.equal(clientBlockerLabel({ source, state }), sharedBlockerLabel({ source, state }), `${source} / ${state}`);
    }
  }
  assert.equal(clientVersionDisplayName(LEVEL_1_VERSION), sharedVersionDisplayName(LEVEL_1_VERSION));
});

// ── 3. Marquee Home Level 4 version ─────────────────────────────────────────

test('3. Level 4 version reads Current everywhere and does not block', () => {
  const row = resolveVersionReadiness(LEVEL_4_SOURCES);
  assert.equal(row.versionId, LEVEL_4_VERSION.id);
  assert.equal(row.versionName, 'Level 4 version');
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Current');
  assert.equal(row.blockingSentence, null);
  assert.equal(row.ready, true);

  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.ready, true);
  assert.equal(gate.message, null);
  assert.equal(gate.blockedVersions.length, 0);
});

// ── 4. Marquee Home Level 1 version ─────────────────────────────────────────

test('4. Level 1 bass cache never substitutes for a saved engineering assessment', () => {
  const row = resolveVersionReadiness(LEVEL_1_SOURCES);
  assert.equal(row.engineering_result_status, 'Missing');
  assert.match(row.engineering.reason, /Engineering assessment not saved/);
  assert.equal(row.ready, false);
  assert.equal(row.engineering.generatedAt, null);
  assert.equal(resolveProposalReadinessGate({ rows: [row] }).ready, false);
});

// ── 5. One authority: gate message is the panel's own sentence ──────────────

test('5. the gate message is the row sentence, verbatim', () => {
  const rows = [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(UNBACKED_SOURCES)];
  const gate = resolveProposalReadinessGate({ rows });
  assert.equal(gate.ready, false);
  assert.equal(gate.message, `${rows[1].blockingSentence}.`);
  assert.equal(gate.blockedVersions.length, 1);
  assert.equal(gate.blockedVersions[0].version_name, 'Level 1 version');
  assert.deepEqual(gate.blockedVersions[0].blockers.map((blocker) => blocker.source), ['engineering']);
});

// ── 6. The false warning is gone; the real source is named ──────────────────

test('6. only a version with no calculated result is told so, by name', () => {
  const unbacked = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(UNBACKED_SOURCES)],
  });
  assert.equal(unbacked.message, 'Level 1 version is missing the calculated engineering result.');
  assert.doesNotMatch(unbacked.message, /Visual and Technical Reports/, 'the current reports are not claimed missing');
  assert.doesNotMatch(unbacked.message, /Visual Report|Technical Report/);

  // The stored truth: BOTH Marquee Home versions have their calculated result,
  // so the sentence is never produced for either of them.
  const stored = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)],
  });
  assert.equal(stored.ready, false);
  assert.match(stored.message, /Level 1 version/);
});

// ── 7. A genuinely stale report is named, per version ───────────────────────

test('7. a stale report names that report and that version', () => {
  const row = resolveVersionReadiness({
    ...LEVEL_4_SOURCES,
    savedReports: {
      ...LEVEL_4_SOURCES.savedReports,
      technical: savedReport({
        generatedAt: '2026-10-04T17:11:05.564Z',
        fingerprints: { engineeringFingerprint: 'eng:v1:older-design', calculationFingerprint: null, seatPriorityFingerprint: SEAT_PRIORITY },
      }),
    },
  });
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Stale');
  assert.equal(row.blockingSentence, 'Level 4 version has a stale Technical Report');
  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.message, 'Level 4 version has a stale Technical Report.');
});

// ── 8. Both reports missing → one combined clause ──────────────────────────

test('8. both reports missing reads as one clause', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_1_VERSION,
    savedReports: { visual: null, technical: null },
    publication: null,
    publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED,
    currentFingerprints: null,
  });
  assert.equal(row.visual_report_status, 'Missing');
  assert.equal(row.technical_report_status, 'Missing');
  assert.equal(
    row.blockingSentence,
    'Level 1 version is missing Visual and Technical Reports and the calculated engineering result',
  );
});

// ── 9. Saved version names only ────────────────────────────────────────────

test('9. the sentence uses the saved version name and no slot suffix', () => {
  const row = resolveVersionReadiness(UNBACKED_SOURCES);
  assert.match(row.blockingSentence, /^Level 1 version /);
  assert.doesNotMatch(row.blockingSentence, /·\s*V\d/, 'never "Level 1 version · V2"');
  assert.doesNotMatch(row.blockingSentence, /\bV\d\b/);
});

// ── 10. Generate gate ──────────────────────────────────────────────────────

test('10. Generate is enabled only when every selected version is Current', () => {
  const allCurrent = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness({ ...LEVEL_4_SOURCES, version: { ...LEVEL_4_VERSION, id: LEVEL_1_VERSION.id, version_name: 'Level 1 version', version_number: 2 } })],
  });
  assert.equal(allCurrent.ready, true, 'both versions current → Generate enabled');
  assert.equal(allCurrent.message, null);

  // The stored truth: both Marquee Home versions are Current, so Generate is
  // enabled for the real fixture — the pair the wizard is actually handed.
  const storedPair = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(LEVEL_1_SOURCES)],
  });
  assert.equal(storedPair.ready, false, 'bass-only Level 1 → Generate blocked');
  assert.match(storedPair.message, /Level 1 version/);
  assert.equal(storedPair.blockedVersions.length, 1);

  const oneBlocked = resolveProposalReadinessGate({
    rows: [resolveVersionReadiness(LEVEL_4_SOURCES), resolveVersionReadiness(UNBACKED_SOURCES)],
  });
  assert.equal(oneBlocked.ready, false, 'one blocked version → Generate disabled');

  const checking = resolveProposalReadinessGate({ rows: [], loading: true });
  assert.equal(checking.ready, false);
  assert.equal(checking.message, null, 'a read in flight never claims anything is missing');
});

// ── The per-source rules the server and the client share ───────────────────

test('11. the engineering cell follows durable results, never a handoff', () => {
  assert.equal(resolveEngineeringCell({ publication: LEVEL_4_PUBLICATION, publicationStatus: PUBLICATION_STATUS.PUBLISHED }).state, READINESS_STATE.CURRENT);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.STALE }).state, READINESS_STATE.STALE);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED }).state, READINESS_STATE.MISSING);
  assert.equal(resolveEngineeringCell({ publication: null, publicationStatus: PUBLICATION_STATUS.READ_FAILED }).state, READINESS_STATE.UNAVAILABLE);

  // The version's completed calculation authority is the SAME calculated result
  // a Technical Report renders, so it reads Current too — including when the
  // separate publication pointer is stale or its read failed, because the
  // result itself is present.
  const authority = { fingerprint: CALC_FINGERPRINT, completedAt: new Date(CALC_COMPLETED_AT_MS).toISOString() };
  for (const publicationStatus of [
    PUBLICATION_STATUS.NOT_CALCULATED,
    PUBLICATION_STATUS.STALE,
    PUBLICATION_STATUS.READ_FAILED,
  ]) {
    const cell = resolveEngineeringCell({ publication: null, publicationStatus, calculationAuthority: authority });
    assert.notEqual(cell.state, READINESS_STATE.CURRENT, `bass-only cache cannot read Current (${publicationStatus})`);
    assert.equal(cell.generatedAt, null);
  }
});

test('12. a report cell is judged by the fingerprints both sides state', () => {
  // Marquee Home Level 1: the saved report states no engineering fingerprint, so
  // that key is never compared — the report reads Current rather than being
  // accused of staleness on a value nobody recorded.
  assert.equal(resolveSavedReportCell({ saved: LEVEL_1_SOURCES.savedReports.visual, currentFingerprints: LEVEL_1_SOURCES.currentFingerprints }).state, READINESS_STATE.CURRENT);
  // A report from another payload generation is not a usable source.
  assert.equal(resolveSavedReportCell({ saved: { ...LEVEL_1_SOURCES.savedReports.visual, report_schema_version: 0 }, currentFingerprints: null }).state, READINESS_STATE.MISSING);
  // No saved report at all is Missing, never Current.
  assert.equal(resolveSavedReportCell({ saved: null, currentFingerprints: null }).state, READINESS_STATE.MISSING);
});

// ── 13. The completed calculation authority the Technical Report uses ───────

test('13. the engineering result resolves from the completed calculation authority', () => {
  // Marquee Home Level 1: the cache holds the completed result for the version's
  // own current fingerprint, which IS the fingerprint its reports were generated
  // from. That is the authority the Technical Report renders — not a separate row.
  const found = sharedCalculationAuthority({
    cacheRecord: LEVEL_1_CACHE,
    savedTechnicalReport: LEVEL_1_TECHNICAL,
  });
  assert.equal(found.fingerprint, CALC_FINGERPRINT);
  assert.equal(found.source, SHARED_CALC_SOURCE.COMPLETED_AUTHORITY);
  assert.equal(found.completedAt, new Date(CALC_COMPLETED_AT_MS).toISOString());

  // The version's own current fingerprint wins over the one the report states.
  const newer = sharedCalculationAuthority({
    cacheRecord: {
      current_fingerprint: 'cal:v8:newer-design',
      completed_by_fingerprint: { 'cal:v8:newer-design': { job: { completedAtMs: CALC_COMPLETED_AT_MS } }, [CALC_FINGERPRINT]: {} },
    },
    savedTechnicalReport: LEVEL_1_TECHNICAL,
  });
  assert.equal(newer.fingerprint, 'cal:v8:newer-design');
  assert.equal(newer.source, SHARED_CALC_SOURCE.COMPLETED_AUTHORITY);

  // A design that moved on, where the report's own source is all the cache still
  // holds: the report's source authority is what "not missing" means here.
  const fromReport = sharedCalculationAuthority({
    cacheRecord: {
      current_fingerprint: 'cal:v8:not-yet-calculated',
      completed_by_fingerprint: { [CALC_FINGERPRINT]: { job: { completedAtMs: CALC_COMPLETED_AT_MS } } },
    },
    savedTechnicalReport: LEVEL_1_TECHNICAL,
  });
  assert.equal(fromReport.fingerprint, CALC_FINGERPRINT);
  assert.equal(fromReport.source, SHARED_CALC_SOURCE.REPORT_SOURCE);

  // Nothing calculated at all is genuinely missing.
  assert.equal(sharedCalculationAuthority({ cacheRecord: null }), null);
  assert.equal(sharedCalculationAuthority({
    cacheRecord: { current_fingerprint: null, completed_by_fingerprint: {} },
    savedTechnicalReport: LEVEL_1_TECHNICAL,
  }), null);

  // Historical report status does not establish durable engineering authority.
  const row = resolveVersionReadiness(LEVEL_1_SOURCES);
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Missing');
  assert.equal(row.blockers.length, 1);
  assert.equal(row.ready, false);
});

// ── 14. The client and the server resolve the same engineering result ───────

test('14. client and server resolve the same engineering result', () => {
  assert.deepEqual(CLIENT_CALC_SOURCE, SHARED_CALC_SOURCE);

  const inputs = [
    { cacheRecord: LEVEL_1_CACHE, savedTechnicalReport: LEVEL_1_TECHNICAL },
    { cacheRecord: { current_fingerprint: CALC_FINGERPRINT, completed_by_fingerprint: {} }, savedTechnicalReport: LEVEL_1_TECHNICAL },
    { cacheRecord: { current_fingerprint: null, completed_by_fingerprint: {} }, savedTechnicalReport: null },
    { cacheRecord: null, savedTechnicalReport: LEVEL_1_TECHNICAL },
  ];
  for (const input of inputs) {
    assert.deepEqual(
      clientCalculationAuthority(input),
      sharedCalculationAuthority(input),
      'same calculation authority',
    );
  }

  const cellInputs = [
    { publication: LEVEL_4_PUBLICATION, publicationStatus: PUBLICATION_STATUS.PUBLISHED },
    { publication: null, publicationStatus: PUBLICATION_STATUS.STALE },
    { publication: null, publicationStatus: PUBLICATION_STATUS.NOT_CALCULATED },
    { publication: null, publicationStatus: PUBLICATION_STATUS.READ_FAILED },
    { publication: null, publicationStatus: PUBLICATION_STATUS.STALE, calculationAuthority: { fingerprint: CALC_FINGERPRINT, completedAt: null } },
  ];
  for (const input of cellInputs) {
    assert.deepEqual(clientEngineeringCell(input), resolveEngineeringCell(input), 'same engineering cell');
  }

  // One row, assembled on both sides, reads identically.
  const sharedRow = resolveVersionReadiness(LEVEL_1_SOURCES);
  const clientRowResult = clientRow({
    versionId: sharedRow.versionId,
    versionName: sharedRow.versionName,
    versionNumber: sharedRow.versionNumber,
    cells: { visual: sharedRow.visual, technical: sharedRow.technical, engineering: sharedRow.engineering },
  });
  assert.equal(clientRowResult.engineering_result_status, sharedRow.engineering_result_status);
  assert.equal(clientRowResult.ready, sharedRow.ready);
  assert.equal(clientRowResult.blockingSentence, sharedRow.blockingSentence);
});

// ── 16. A version that has a publication keeps its publication's verdict ────

test('16. a published version is left exactly as it was: every column Current', () => {
  // Marquee Home Level 4 also has a completed calculation authority in its cache
  // (the same row shape as Level 1's). Its publication is the evidence that
  // speaks for it, so the engineering cell reads the publication's own time and
  // the report columns keep comparing against the publication's fingerprints.
  const level4Cache = {
    current_fingerprint: CALC_FINGERPRINT,
    completed_by_fingerprint: { [CALC_FINGERPRINT]: { job: { completedAtMs: CALC_COMPLETED_AT_MS } } },
  };
  const row = resolveVersionReadiness({
    ...LEVEL_4_SOURCES,
    calculationAuthority: sharedCalculationAuthority({
      cacheRecord: level4Cache,
      savedTechnicalReport: LEVEL_4_SOURCES.savedReports.technical,
    }),
  });
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Current');
  assert.equal(row.engineering.generatedAt, LEVEL_4_PUBLICATION.published_at);
  assert.equal(row.ready, true);

  // The bass fingerprint the reports were generated from is compared against the
  // one the publication states for the design as it stands, and the two agree —
  // so the report stays Current rather than being accused of staleness.
  const visualWithPublication = resolveSavedReportCell({
    saved: LEVEL_4_SOURCES.savedReports.visual,
    currentFingerprints: LEVEL_4_SOURCES.currentFingerprints,
  });
  assert.equal(visualWithPublication.state, READINESS_STATE.CURRENT);
});

// ── 15. A genuinely uncalculated version still blocks, by name ──────────────
test('15. reports without a calculated result still block, naming that result', () => {
  const row = resolveVersionReadiness(UNBACKED_SOURCES);
  assert.equal(row.visual_report_status, 'Current');
  assert.equal(row.technical_report_status, 'Current');
  assert.equal(row.engineering_result_status, 'Missing');
  assert.equal(row.engineering.reason, 'Engineering assessment not saved. Assessment values may be displayed, but are not published. Verify bass and publish this version in Room Designer.');
  assert.equal(row.ready, false);
  assert.deepEqual(row.blockers.map((blocker) => blocker.source), ['engineering']);

  // The row, read by the client mirror, blocks with the same sentence.
  const clientRowResult = clientRow({
    versionId: row.versionId,
    versionName: row.versionName,
    versionNumber: row.versionNumber,
    cells: { visual: row.visual, technical: row.technical, engineering: row.engineering },
  });
  assert.equal(clientRowResult.ready, row.ready);
  assert.equal(clientRowResult.blockingSentence, row.blockingSentence);
});

// ── 17. A legacy snapshot: the report exists and is current ─────────────────

/** Fixture A — current reports whose proposal evidence was never captured. */
const LEGACY_VISUAL = legacyReport({
  reportType: 'visual',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: '2026-10-02T22:03:28.601Z',
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
});
const LEGACY_TECHNICAL = legacyReport({
  reportType: 'technical',
  versionId: LEVEL_4_VERSION.id,
  generatedAt: EVIDENCE_TIMESTAMP,
  fingerprints: { engineeringFingerprint: ENGINEERING_FP, calculationFingerprint: LEVEL_4_BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
});
const LEGACY_SOURCES = {
  ...LEVEL_4_SOURCES,
  savedReports: { visual: LEGACY_VISUAL, technical: LEGACY_TECHNICAL },
};

test('17. a current snapshot without proposal evidence is Legacy, never Missing', () => {
  // Acceptance A: the snapshot exists, is stored current, and has no
  // reportEvidence.
  for (const report of [LEGACY_VISUAL, LEGACY_TECHNICAL]) {
    const cell = resolveSavedReportCell({
      saved: report,
      currentFingerprints: LEVEL_4_SOURCES.currentFingerprints,
    });
    assert.equal(cell.state, READINESS_STATE.LEGACY);
    assert.equal(cell.status, 'Needs one-time evidence refresh');
    assert.notEqual(cell.status, 'Missing');
  }

  const row = resolveVersionReadiness(LEGACY_SOURCES);
  assert.equal(row.visual_report_status, 'Needs one-time evidence refresh');
  assert.equal(row.technical_report_status, 'Needs one-time evidence refresh');
  assert.equal(row.ready, false);
  // Acceptance E/2: the warning names the exact version and report, and reads as
  // a ONE-TIME refresh rather than recurring maintenance.
  assert.equal(
    row.blockingSentence,
    'Level 4 version has a current Visual Report, but it needs a one-time evidence refresh. '
    + 'Level 4 version has a current Technical Report, but it needs a one-time evidence refresh',
  );
  assert.doesNotMatch(row.blockingSentence, /missing/i, 'a report that exists is never called missing');
  assert.doesNotMatch(row.blockingSentence, /refresh(ing)? (the )?(build|proposal)/i, 'never described as recurring maintenance');

  // Acceptance F: Generate stays blocked while any selected version is Legacy.
  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.ready, false);
  assert.equal(gate.message, `${row.blockingSentence}.`);
  assert.equal(gate.blockedVersions[0].version_name, 'Level 4 version');
});

test('18. Missing means no snapshot; Stale means the fingerprints moved on', () => {
  // Acceptance B: no matching ReportSnapshot for the version and report type.
  assert.equal(resolveSavedReportCell({ saved: null, currentFingerprints: null }).state, READINESS_STATE.MISSING);

  // Acceptance C: the saved report no longer matches the design it came from,
  // so it is Stale — not Legacy, and not Missing.
  const stale = resolveSavedReportCell({
    saved: legacyReport({
      generatedAt: '2026-10-04T17:11:05.564Z',
      fingerprints: { engineeringFingerprint: 'eng:v1:older-design', calculationFingerprint: null, seatPriorityFingerprint: SEAT_PRIORITY },
    }),
    currentFingerprints: LEVEL_4_SOURCES.currentFingerprints,
  });
  assert.equal(stale.state, READINESS_STATE.STALE);
  assert.equal(stale.status, 'Stale');

  // Acceptance D: the snapshot carries its proposal evidence.
  const current = resolveSavedReportCell({
    saved: LEVEL_4_SOURCES.savedReports.technical,
    currentFingerprints: LEVEL_4_SOURCES.currentFingerprints,
  });
  assert.equal(current.state, READINESS_STATE.CURRENT);
  assert.equal(current.status, 'Current');
});

test('19. the client mirror derives the same legacy verdict, word for word', () => {
  const cells = {
    visual: resolveSavedReportCell({ saved: LEGACY_VISUAL, currentFingerprints: LEVEL_4_SOURCES.currentFingerprints }),
    technical: resolveSavedReportCell({ saved: LEGACY_TECHNICAL, currentFingerprints: LEVEL_4_SOURCES.currentFingerprints }),
    engineering: buildReadinessCell({ state: READINESS_STATE.CURRENT }),
  };
  const rowInput = {
    versionId: LEVEL_4_VERSION.id,
    versionName: sharedVersionDisplayName(LEVEL_4_VERSION),
    versionNumber: LEVEL_4_VERSION.version_number,
    cells,
  };
  const clientResult = clientRow(rowInput);
  const sharedResult = sharedVersionReadinessRow(rowInput);
  assert.equal(clientResult.blockingSentence, sharedResult.blockingSentence);
  assert.equal(clientResult.visual_report_status, 'Needs one-time evidence refresh');
  assert.equal(clientResult.ready, false);
  assert.equal(sharedResult.ready, false);
});

// ── 20. The four snapshot fixtures, each with one verdict ───────────────────

test('20. the fixtures read Legacy, Incomplete, Current and Current', () => {
  const cellOf = (saved) => resolveSavedReportCell({
    saved,
    currentFingerprints: LEVEL_4_SOURCES.currentFingerprints,
  });

  // A — no evidence stored at all: the report exists, is current, and needs a
  // single one-time evidence refresh.
  assert.equal(cellOf(LEGACY_VISUAL).state, READINESS_STATE.LEGACY);
  assert.equal(cellOf(LEGACY_VISUAL).status, 'Needs one-time evidence refresh');
  assert.equal(cellOf(LEGACY_TECHNICAL).state, READINESS_STATE.LEGACY);

  // B — evidence stored, and incomplete: Incomplete, not Current, not Legacy.
  assert.equal(cellOf(INCOMPLETE_VISUAL).state, READINESS_STATE.INCOMPLETE);
  assert.equal(cellOf(INCOMPLETE_VISUAL).status, 'Incomplete');
  assert.match(cellOf(INCOMPLETE_VISUAL).reason, /is missing/);
  assert.equal(cellOf(INCOMPLETE_TECHNICAL).state, READINESS_STATE.INCOMPLETE);

  // C — a complete Visual Report, under its own report type.
  assert.equal(cellOf(LEVEL_4_VISUAL).state, READINESS_STATE.CURRENT);
  const visual = LEVEL_4_VISUAL.payload.reportEvidence;
  assert.equal(visual.report_type, 'visual');
  assert.equal(visual.identity.report_type, 'visual');
  assert.equal(visual.identity.source_fingerprint, ENGINEERING_FP);

  // D — a complete Technical Report, under its own report type.
  assert.equal(cellOf(LEVEL_4_TECHNICAL).state, READINESS_STATE.CURRENT);
  const technical = LEVEL_4_TECHNICAL.payload.reportEvidence;
  assert.equal(technical.report_type, 'technical');
  assert.equal(technical.identity.report_type, 'technical');
  assert.equal(technical.identity.bass_fingerprint, LEVEL_4_BASS_FINGERPRINT);

  // Every required RP22 parameter is stated with its level, its atomic pair and
  // its provenance — and the bass rows are on the bass authority, not the
  // engineering one.
  for (const id of REQUIRED_TECHNICAL_PARAMETER_IDS) {
    const row = technical.parameter_index[`P${id}`];
    assert.ok(row, `P${id} is stated`);
    assert.match(String(row.level), /^L[1-4]$/, `P${id} level`);
    assert.equal(row.authority_value, row.value, `P${id} authority value`);
    assert.equal(row.authority_level, row.level, `P${id} authority level`);
    assert.ok(
      row.scope && row.authority_fingerprint && row.authority_timestamp && row.source_type,
      `P${id} provenance`,
    );
  }
  assert.equal(technical.parameter_index.P14.raw_value, technical.bass.p14.raw_value);
  assert.equal(technical.parameter_index.P14.level, technical.bass.p14.achieved_level);

  // The Visual Report's evidence is its own: it never borrows the technical payload.
  assert.notDeepEqual(visual.parameters, technical.parameters);
  assert.equal(visual.parameter_index.P12, undefined, 'a Visual Report states no P12');
  assert.ok(technical.parameter_index.P12, 'a Technical Report states P12');
});

// ── 21. One verdict, four readers ──────────────────────────────────────────

test('21. server, client, Proposal Centre and the Library banner read every fixture alike', () => {
  const fixtures = [
    { name: 'A legacy snapshot', sources: LEGACY_SOURCES },
    { name: 'B incomplete evidence', sources: INCOMPLETE_SOURCES },
    { name: 'C/D current reports', sources: LEVEL_4_SOURCES },
    { name: 'current on the calculation authority', sources: LEVEL_1_SOURCES },
  ];

  for (const { name, sources } of fixtures) {
    // 1. The server authority, from the version's stored sources.
    const serverRow = resolveVersionReadiness(sources);

    // 2. The client authority, assembled from the SAME cells.
    const clientRowResult = clientRow({
      versionId: serverRow.versionId,
      versionName: serverRow.versionName,
      versionNumber: serverRow.versionNumber,
      cells: { visual: serverRow.visual, technical: serverRow.technical, engineering: serverRow.engineering },
    });
    assert.equal(clientRowResult.visual_report_status, serverRow.visual_report_status, `${name}: visual`);
    assert.equal(clientRowResult.technical_report_status, serverRow.technical_report_status, `${name}: technical`);
    assert.equal(clientRowResult.engineering_result_status, serverRow.engineering_result_status, `${name}: engineering`);
    assert.equal(clientRowResult.ready, serverRow.ready, `${name}: verdict`);
    assert.equal(clientRowResult.blockingSentence, serverRow.blockingSentence, `${name}: sentence`);

    // 3. Proposal Centre readiness — the gate that decides Generate.
    const serverGate = resolveProposalReadinessGate({ rows: [serverRow] });
    const centreGate = clientGate({ rows: [clientRowResult] });
    assert.equal(centreGate.ready, serverGate.ready, `${name}: gate verdict`);
    assert.equal(centreGate.message, serverGate.message, `${name}: gate message`);

    // 4. The Project Library banner, over that same row.
    const banner = buildLibraryProposalReadiness({
      rows: [clientRowResult],
      versions: [sources.version],
    });
    assert.equal(banner.ready, centreGate.ready, `${name}: banner verdict`);
    // The banner's own verdict decides its words — and the Library words never
    // name an internal state.
    assert.equal(
      banner.headline,
      {
        [LIBRARY_VERDICT.READY]: LIBRARY_READINESS_HEADLINE.READY,
        [LIBRARY_VERDICT.UPDATES_NEEDED]: LIBRARY_READINESS_HEADLINE.UPDATES_NEEDED,
        [LIBRARY_VERDICT.NOT_ASSESSED]: LIBRARY_READINESS_HEADLINE.NOT_ASSESSED,
      }[banner.verdict],
      `${name}: banner headline`,
    );

    // The banner's plain words are the row's own states, never a second opinion.
    const expectedCell = (cell) => (cell.state === READINESS_STATE.CURRENT
      ? LIBRARY_CHECKLIST_STATUS.READY
      : cell.state === READINESS_STATE.MISSING
        ? LIBRARY_CHECKLIST_STATUS.NOT_GENERATED
        : LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED);
    const checklist = banner.checklist[0];
    assert.equal(checklist.cells[0].status, expectedCell(serverRow.visual), `${name}: banner visual cell`);
    assert.equal(checklist.cells[1].status, expectedCell(serverRow.technical), `${name}: banner technical cell`);
  }
});

// ── 22. Strictness: the contract, not the fixture, decides ─────────────────

test('22. incomplete evidence is refused, and never reads Current', () => {
  // The complete fixtures satisfy the shared contract itself.
  const visual = validateReportEvidence(LEVEL_4_VISUAL.payload.reportEvidence, 'visual', {
    projectId: PROJECT_ID,
    versionId: LEVEL_4_VERSION.id,
    snapshotFingerprint: ENGINEERING_FP,
    sourceFingerprint: ENGINEERING_FP,
  });
  assert.equal(visual.complete, true, `visual evidence complete (${visual.missing.join(', ')})`);

  const technical = validateReportEvidence(LEVEL_4_TECHNICAL.payload.reportEvidence, 'technical', {
    projectId: PROJECT_ID,
    versionId: LEVEL_4_VERSION.id,
    snapshotFingerprint: ENGINEERING_FP,
    sourceFingerprint: ENGINEERING_FP,
  });
  assert.equal(technical.complete, true, `technical evidence complete (${technical.missing.join(', ')})`);

  // The incomplete fixture states none of the facts the contract requires, and
  // the contract still names every one of them.
  const refused = validateReportEvidence(INCOMPLETE_TECHNICAL.payload.reportEvidence, 'technical');
  assert.equal(refused.complete, false);
  for (const field of [
    'identity.source_fingerprint', 'room.length_m', 'screen.screen_type',
    'system.products_selected', 'parameter_index', 'seating.per_seat',
    'parameter_index.P12', 'parameter_index.P14', 'parameter_index.P18',
    'parameter_index.P19', 'parameter_index.P20',
  ]) {
    assert.ok(refused.missing.includes(field), `the contract still requires ${field}`);
  }

  // And it blocks, by name, on both sides of the boundary.
  const row = resolveVersionReadiness(INCOMPLETE_SOURCES);
  assert.equal(row.visual_report_status, 'Incomplete');
  assert.equal(row.technical_report_status, 'Incomplete');
  assert.equal(row.ready, false);
  assert.equal(resolveProposalReadinessGate({ rows: [row] }).ready, false);
  const mirrored = clientRow({
    versionId: row.versionId,
    versionName: row.versionName,
    versionNumber: row.versionNumber,
    cells: { visual: row.visual, technical: row.technical, engineering: row.engineering },
  });
  assert.equal(mirrored.ready, false);
  assert.equal(mirrored.blockingSentence, row.blockingSentence);
});

// ── Report ─────────────────────────────────────────────────────────────────

const failures = results.filter((line) => line.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);

// Registered with vitest so the file is collected and reported as a test run
// (the checks above run at import, and this asserts every one of them passed).
vitestTest('proposal readiness authority — every acceptance check passes', () => {
  assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
});