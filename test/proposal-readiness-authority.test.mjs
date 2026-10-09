/**
 * Acceptance tests — ONE proposal readiness authority, ONE report source.
 *
 * Sound Proof has ONE report: the Project Report. It carries the visual and
 * technical content, the P1–P21 evidence, the drawings, the products and the
 * bass evidence, and it is the only report a proposal is gated on.
 *
 * The rule under test:
 *
 *   Every selected version must have a CURRENT, proposal-ready Project Report
 *   before a proposal can be generated.
 *
 * A version's Project Report reads as one of four states, and only the first
 * lets a proposal through:
 *
 *   Current        the report exists, matches the version's current design and
 *                  carries complete, proposal-ready evidence
 *   Update needed  the report exists but the design has moved past it
 *   Not generated  no Project Report has been saved for the version
 *   Incomplete     the report exists and its evidence is not proposal-ready
 *
 *   TEST 1  Both modules (client mirror + server authority) share one vocabulary
 *   TEST 2  The one column states the Project Report, and no exported copy names
 *           any other report
 *   TEST 3  Current: complete, proposal-ready report → version ready, gate open
 *   TEST 4  Not generated: no saved report → named, with the create action
 *   TEST 5  Update needed: the design moved on → named, with the update action
 *   TEST 6  Update needed: the report's own stored status says the project has
 *           moved past it
 *   TEST 7  Incomplete: evidence stored but not proposal-ready — never Missing
 *   TEST 8  Incomplete: failing evidence parity is refused too
 *   TEST 9  The evidence contract requires a proposal-ready report, by itself
 *   TEST 10 A report from another payload generation is not a usable source
 *   TEST 11 Retired report identities neither satisfy readiness nor block it
 *   TEST 12 The gate is open only when EVERY selected version is Current
 *   TEST 13 A version is always named by the name the designer saved
 *   TEST 14 Client and server derive the same verdicts, sentences and gate
 *   TEST 15 The Project Library banner reads the same rows, in the same words
 *   TEST 16 The calculated engineering result resolves from the version's own
 *           authority, and takes the Project Report by that name
 *
 * Pure: no React, no database.
 *
 * Run: npx vitest run test/proposal-readiness-authority.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test as vitestTest } from 'vitest';

import {
  CALCULATION_AUTHORITY_SOURCE as SHARED_CALC_SOURCE,
  PROPOSAL_READINESS_BLOCK_FALLBACK as SHARED_BLOCK_FALLBACK,
  PROPOSAL_READINESS_READY_COPY as SHARED_READY_COPY,
  PROPOSAL_READINESS_RULE as SHARED_RULE,
  PROPOSAL_READINESS_TITLE as SHARED_TITLE,
  READINESS_ACTION as SHARED_ACTION,
  READINESS_ACTION_BY_STATE as SHARED_ACTION_BY_STATE,
  READINESS_COLUMNS as SHARED_COLUMNS,
  READINESS_REPORT_LABEL as SHARED_REPORT_LABEL,
  READINESS_SOURCE as SHARED_SOURCE,
  READINESS_STATE,
  READINESS_STATUS_TEXT as SHARED_STATUS_TEXT,
  buildReadinessCell,
  resolveCalculationAuthority as sharedCalculationAuthority,
  resolveProposalReadinessGate,
  resolveSavedReportCell as sharedSavedReportCell,
  resolveVersionReadiness,
  resolveVersionReadinessRow as sharedVersionReadinessRow,
  versionDisplayName as sharedVersionDisplayName,
} from '../base44/shared/proposalReadinessAuthority.js';

import {
  CALCULATION_AUTHORITY_SOURCE as CLIENT_CALC_SOURCE,
  PROPOSAL_READINESS_BLOCK_FALLBACK as CLIENT_BLOCK_FALLBACK,
  PROPOSAL_READINESS_READY_COPY as CLIENT_READY_COPY,
  PROPOSAL_READINESS_RULE as CLIENT_RULE,
  PROPOSAL_READINESS_TITLE as CLIENT_TITLE,
  READINESS_ACTION as CLIENT_ACTION,
  READINESS_ACTION_BY_STATE as CLIENT_ACTION_BY_STATE,
  READINESS_COLUMNS as CLIENT_COLUMNS,
  READINESS_REPORT_LABEL as CLIENT_REPORT_LABEL,
  READINESS_SOURCE as CLIENT_SOURCE,
  READINESS_STATUS_TEXT as CLIENT_STATUS_TEXT,
  buildProjectReportAction,
  resolveCalculationAuthority as clientCalculationAuthority,
  resolveProposalReadinessGate as clientGate,
  resolveSavedReportCell as clientSavedReportCell,
  resolveVersionReadiness as clientVersionReadiness,
  resolveVersionReadinessRow as clientRow,
  versionDisplayName as clientVersionDisplayName,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

import { validateReportEvidence } from '../base44/shared/reportEvidenceCompleteness.js';

import {
  LIBRARY_CHECKLIST_STATUS,
  LIBRARY_MISSING_REPORTS_HEADLINE,
  LIBRARY_READINESS_CELLS,
  LIBRARY_READINESS_HEADLINE,
  LIBRARY_VERDICT,
  buildLibraryProposalReadiness,
} from '../src/components/library/libraryProposalReadiness.js';

const readSource = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const SHARED_AUTHORITY_SOURCE = readSource('../base44/shared/proposalReadinessAuthority.js');
const CLIENT_AUTHORITY_SOURCE = readSource('../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js');

// ── The stored sources: one version, one Project Report ─────────────────────

const PROJECT_ID = 'p1';
const ENGINEERING_FP = 'eng:v1:c19ceb2efb6c3d9c';
const BASS_FP = 'cal:v8:2b7f4c91d0a8e63f|mode:canonical-physics-eq';
const SEAT_PRIORITY = 'seat-r1-c1:primary|seat-r1-c2:secondary';
const GENERATED_AT = '2026-10-04T17:11:05.564Z';

const LEVEL_4_VERSION = {
  id: '6abbca6e199f13dc4d74ec4a',
  version_name: 'Level 4 version',
  version_number: 1,
};

const ORIGINAL_VERSION = {
  id: '6ac22230d40d8bb0a925ecab',
  version_name: 'Original Design',
  version_number: 2,
};

const CURRENT_FINGERPRINTS = {
  engineeringFingerprint: ENGINEERING_FP,
  calculationFingerprint: BASS_FP,
  seatPriorityFingerprint: SEAT_PRIORITY,
};

/**
 * One parameter row exactly as the capture writes it: the reading, the scope it
 * was taken at, and the durable authority it came from. The parameter index and
 * the parallel `parameters` list share these very objects, which is how the
 * contract requires the two to agree field for field.
 */
function parameterRow({ key, value, level, scope, rawValue = null }) {
  const bass = ['P14', 'P18', 'P19', 'P20'].includes(key);
  return {
    key,
    parameter_id: Number(key.slice(1)),
    scope,
    value,
    level,
    ...(rawValue === null ? {} : { raw_value: rawValue }),
    authority_value: value,
    authority_level: level,
    authority_fingerprint: bass ? BASS_FP : ENGINEERING_FP,
    authority_timestamp: GENERATED_AT,
    source_type: bass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
  };
}

/** The parameter readings the Project Report's evidence states. */
function projectParameters() {
  return [
    parameterRow({ key: 'P4', value: 4.02, level: 'L3', scope: 'room' }),
    parameterRow({ key: 'P5', value: 41.2, level: 'L2', scope: 'room' }),
    parameterRow({ key: 'P10', value: 4, level: 'L3', scope: 'project' }),
    // The bass row states its reading exactly as the bass authority does, which
    // is the atomic pair the contract compares against evidence.bass.p14.
    parameterRow({ key: 'P14', value: 4, level: 'L4', scope: 'room', rawValue: 4 }),
  ];
}

const EVIDENCE_SEATS = [
  { row: 1, seat_id: 'seat-r1-c1', column: 1, priority: 'primary', distance_m: 4.12, horizontal_angle_deg: -3.1 },
  { row: 1, seat_id: 'seat-r1-c2', column: 2, priority: 'secondary', distance_m: 4.02, horizontal_angle_deg: 3.1 },
];

/** One complete, proposal-ready Project Report evidence payload. */
function projectEvidence({ versionId = LEVEL_4_VERSION.id } = {}) {
  const parameters = projectParameters();
  return {
    evidence_version: 1,
    report_type: 'project',
    identity: {
      project_id: PROJECT_ID,
      version_id: versionId,
      report_type: 'project',
      source_fingerprint: ENGINEERING_FP,
      bass_fingerprint: BASS_FP,
    },
    room: { length_m: 6.2, width_m: 4.6, height_m: 2.5, volume_m3: 71.3 },
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_diagonal_in: 120 },
    system: { products_selected: [{ role: 'Screen LCR', model: 'DF-48', quantity: 3 }] },
    seating: { seats: EVIDENCE_SEATS.length, per_seat: EVIDENCE_SEATS.map((seat) => ({ ...seat })) },
    parameters,
    parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: { current: true, p14: { raw_value: 4, achieved_level: 'L4' } },
    proposal_ready: true,
    evidence_fingerprint: 're1-project-8c1f0f2a-2a0',
  };
}

/**
 * A saved Project Report snapshot: its payload, its frozen source fingerprints
 * and its stored status. Omitting `evidence` is the report written before the
 * evidence capture existed — it exists and is current, and its evidence is not
 * proposal-ready.
 */
function savedProjectReport({
  versionId = LEVEL_4_VERSION.id,
  evidence = null,
  fingerprints = CURRENT_FINGERPRINTS,
  generatedAt = GENERATED_AT,
  status = 'current',
  reportSchemaVersion = 1,
  parity = null,
} = {}) {
  return {
    report_type: 'project',
    project_id: PROJECT_ID,
    version_id: versionId,
    report_schema_version: reportSchemaVersion,
    status,
    payload: {
      pages: [{ id: 'cover', category: 'cover' }],
      proposalSource: { report_source_version: 1 },
      ...(evidence ? { reportEvidence: evidence } : {}),
      ...(parity ? { evidence_parity: parity } : {}),
    },
    source_fingerprints: fingerprints,
    generated_at: generatedAt,
  };
}

const CURRENT_REPORT = savedProjectReport({ evidence: projectEvidence() });
const CURRENT_SOURCES = { version: LEVEL_4_VERSION, savedProjectReport: CURRENT_REPORT };

/** The same version read the way the Step 3/5 table assembles its row. */
const asClientRow = (sources, currentFingerprints = CURRENT_FINGERPRINTS) => {
  const cell = clientSavedReportCell({
    saved: sources.savedProjectReport,
    currentFingerprints,
  });
  return clientRow({
    versionId: sources.version.id,
    versionName: clientVersionDisplayName(sources.version),
    versionNumber: sources.version.version_number,
    cells: { project: cell },
  });
};

/** The version's completed calculation authority, in its own cache record. */
const BASS_FINGERPRINT = 'cal:v8:395d1a338da6c449|mode:canonical-physics-eq';
const CALC_COMPLETED_AT_MS = 1791108297487;
const CACHE_RECORD = {
  version_id: LEVEL_4_VERSION.id,
  status: 'complete',
  current_fingerprint: BASS_FINGERPRINT,
  completed_by_fingerprint: {
    [BASS_FINGERPRINT]: {
      metricSchemaVersion: 21,
      job: { status: 'complete', completedAtMs: CALC_COMPLETED_AT_MS },
    },
  },
};

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message}`);
  }
};

// ── 1. One vocabulary ───────────────────────────────────────────────────────

test('1. both modules share one vocabulary', () => {
  assert.equal(CLIENT_REPORT_LABEL, SHARED_REPORT_LABEL);
  assert.deepEqual(CLIENT_COLUMNS, SHARED_COLUMNS);
  assert.deepEqual(CLIENT_STATUS_TEXT, SHARED_STATUS_TEXT);
  assert.deepEqual(CLIENT_SOURCE, SHARED_SOURCE);
  assert.deepEqual(CLIENT_ACTION, SHARED_ACTION);
  assert.deepEqual(CLIENT_ACTION_BY_STATE, SHARED_ACTION_BY_STATE);
  assert.equal(CLIENT_READY_COPY, SHARED_READY_COPY);
  assert.equal(CLIENT_TITLE, SHARED_TITLE);
  assert.equal(CLIENT_RULE, SHARED_RULE);
  assert.equal(CLIENT_BLOCK_FALLBACK, SHARED_BLOCK_FALLBACK);
  assert.deepEqual(CLIENT_CALC_SOURCE, SHARED_CALC_SOURCE);
  assert.equal(clientVersionDisplayName(LEVEL_4_VERSION), sharedVersionDisplayName(LEVEL_4_VERSION));
});

// ── 2. The one column, and no other report named in any copy ────────────────

test('2. the table states the Project Report, and no exported copy names any other report', () => {
  assert.equal(SHARED_REPORT_LABEL, 'Project Report');
  assert.deepEqual(SHARED_COLUMNS, [{ key: 'project', label: 'Project Report' }]);
  assert.deepEqual(CLIENT_COLUMNS.map((column) => column.label), ['Project Report']);

  // Every word the designer can read comes from these, and none of them may
  // name another report. This is the guard against a retired identity drifting
  // back into the readiness copy.
  const exportedCopy = [
    SHARED_REPORT_LABEL,
    SHARED_TITLE,
    SHARED_RULE,
    SHARED_BLOCK_FALLBACK,
    SHARED_READY_COPY,
    ...SHARED_COLUMNS.map((column) => column.label),
    ...Object.values(SHARED_STATUS_TEXT),
    ...Object.values(SHARED_ACTION),
    ...Object.values(SHARED_ACTION_BY_STATE),
    ...Object.values(SHARED_SOURCE),
  ].join(' | ');
  assert.doesNotMatch(exportedCopy, /Visual Report|Technical Report/);
  assert.doesNotMatch(exportedCopy, /visual|technical/);
});

// ── 3. Current ─────────────────────────────────────────────────────────────

test('3. a complete, proposal-ready Project Report reads Current and opens the gate', () => {
  const row = resolveVersionReadiness(CURRENT_SOURCES);
  assert.equal(row.versionId, LEVEL_4_VERSION.id);
  assert.equal(row.versionName, 'Level 4 version');
  assert.equal(row.project_report_status, 'Current');
  assert.equal(row.project.state, READINESS_STATE.CURRENT);
  assert.equal(row.project.generatedAt, GENERATED_AT);
  assert.equal(row.blockingSentence, null);
  assert.deepEqual(row.blockers, []);
  assert.equal(row.ready, true);

  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.ready, true);
  assert.equal(gate.message, null);
  assert.equal(gate.blockedVersions.length, 0);
  assert.equal(gate.detail, SHARED_READY_COPY);
  assert.match(gate.detail, /Every selected version has its current Project Report/);
});

// ── 4. Not generated ───────────────────────────────────────────────────────

test('4. no saved Project Report reads Not generated, and names the create action', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: null,
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(row.project.state, READINESS_STATE.MISSING);
  assert.equal(row.project.status, 'Not generated');
  assert.equal(row.blockingSentence, 'Level 4 version needs a Project Report.');
  assert.equal(row.ready, false);
  assert.deepEqual(row.blockers.map((blocker) => blocker.source), ['project']);
  assert.deepEqual(row.blockers.map((blocker) => blocker.label), ['Project Report']);

  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.ready, false);
  assert.equal(gate.message, 'Level 4 version needs a Project Report.');
  assert.equal(gate.blockedVersions[0].version_name, 'Level 4 version');
  assert.equal(gate.blockedVersions[0].blockers[0].label, 'Project Report');
  assert.equal(
    gate.detail,
    'Create the Project Report named above for that version, then return to this step.',
  );

  // The one action a version with no report offers, and where it goes.
  const action = buildProjectReportAction({
    state: row.project.state,
    projectId: PROJECT_ID,
    versionId: row.versionId,
  });
  assert.equal(action.label, 'Create Project Report');
  assert.equal(action.url, `/RP22ClientReport?projectId=p1&versionId=${LEVEL_4_VERSION.id}`);
});

// ── 5. Update needed — the design moved on ─────────────────────────────────

test('5. a report the design has moved past reads Update needed', () => {
  const movedOn = { ...CURRENT_FINGERPRINTS, engineeringFingerprint: 'eng:v1:newer-design' };
  const row = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: CURRENT_REPORT,
    currentFingerprints: movedOn,
  });
  assert.equal(row.project.state, READINESS_STATE.STALE);
  assert.equal(row.project.status, 'Update needed');
  assert.equal(row.blockingSentence, 'Level 4 version needs an updated Project Report.');
  assert.equal(row.ready, false);

  const gate = resolveProposalReadinessGate({ rows: [row] });
  assert.equal(gate.message, 'Level 4 version needs an updated Project Report.');

  const action = buildProjectReportAction({
    state: row.project.state,
    projectId: PROJECT_ID,
    versionId: row.versionId,
  });
  assert.equal(action.label, 'Create Updated Report');
  assert.equal(action.url, `/RP22ClientReport?projectId=p1&versionId=${LEVEL_4_VERSION.id}&updateReport=1`);
});

// ── 6. Update needed — the report's own stored status ──────────────────────

test('6. a report stored as superseded reads Update needed without a fingerprint comparison', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: savedProjectReport({ evidence: projectEvidence(), status: 'stale' }),
    currentFingerprints: null,
  });
  assert.equal(row.project.state, READINESS_STATE.STALE);
  assert.equal(row.project.status, 'Update needed');
  assert.equal(row.ready, false);
});

// ── 7. Incomplete — the report exists, its evidence does not pass ───────────

test('7. a report without proposal-ready evidence reads Incomplete, never Missing', () => {
  // A Project Report saved before the evidence capture existed: current, and
  // with no reportEvidence at all.
  const withoutEvidence = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: savedProjectReport({ evidence: null }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(withoutEvidence.project.state, READINESS_STATE.INCOMPLETE);
  assert.equal(withoutEvidence.project.status, 'Incomplete');
  assert.equal(
    withoutEvidence.project.reason,
    'This Project Report needs to be completed before this version can be used in a proposal.',
  );
  assert.doesNotMatch(withoutEvidence.project.status, /Not generated|Missing/);
  assert.equal(
    withoutEvidence.blockingSentence,
    "Level 4 version's Project Report needs to be completed before this version can be used in a proposal.",
  );
  assert.equal(withoutEvidence.ready, false);
  assert.equal(resolveProposalReadinessGate({ rows: [withoutEvidence] }).ready, false);

  // Stored evidence that is not proposal-ready: Incomplete, and still never
  // described as missing.
  const notReady = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: savedProjectReport({
      evidence: { ...projectEvidence(), proposal_ready: false },
    }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(notReady.project.state, READINESS_STATE.INCOMPLETE);
  assert.doesNotMatch(notReady.blockingSentence, /^Level 4 version needs a Project Report/);

  // The action for a report that exists and must be brought up to date.
  const action = buildProjectReportAction({
    state: notReady.project.state,
    projectId: PROJECT_ID,
    versionId: LEVEL_4_VERSION.id,
  });
  assert.equal(action.label, 'Create Updated Report');
  assert.equal(action.url, `/RP22ClientReport?projectId=p1&versionId=${LEVEL_4_VERSION.id}&updateReport=1`);
});

// ── 8. Incomplete — failing evidence parity is refused ─────────────────────

test('8. a report whose evidence parity failed is refused', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: savedProjectReport({
      evidence: projectEvidence(),
      parity: { proposal_ready: false },
    }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(row.project.state, READINESS_STATE.INCOMPLETE);
  assert.equal(row.ready, false);
});

// ── 9. The contract itself requires a proposal-ready report ────────────────

test('9. the evidence contract requires a proposal-ready payload, by itself', () => {
  const complete = validateReportEvidence(CURRENT_REPORT.payload.reportEvidence, 'project', {
    projectId: PROJECT_ID,
    versionId: LEVEL_4_VERSION.id,
    snapshotFingerprint: ENGINEERING_FP,
    sourceFingerprint: ENGINEERING_FP,
  });
  assert.equal(complete.complete, true, `complete (${complete.missing.join(', ')})`);

  // The same payload without its proposal-ready statement is refused, and the
  // contract names exactly what it requires — never a vague refusal.
  const refused = validateReportEvidence(
    { ...projectEvidence(), proposal_ready: false },
    'project',
  );
  assert.equal(refused.complete, false);
  assert.ok(refused.missing.includes('proposal_ready'));
  assert.equal(refused.reason, 'proposal_ready is missing');

  // Evidence that states none of the required facts names every one of them.
  const empty = validateReportEvidence(
    {
      evidence_version: 1,
      report_type: 'project',
      identity: { project_id: PROJECT_ID, version_id: LEVEL_4_VERSION.id, report_type: 'project' },
      proposal_ready: true,
    },
    'project',
  );
  assert.equal(empty.complete, false);
  for (const field of [
    'identity.source_fingerprint', 'room.length_m', 'screen.screen_type',
    'system.products_selected', 'parameter_index', 'seating.per_seat',
  ]) {
    assert.ok(empty.missing.includes(field), `the contract still requires ${field}`);
  }
});

// ── 10. Another payload generation is not a usable source ──────────────────

test('10. a report written under another payload generation reads Not generated', () => {
  const row = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: savedProjectReport({ evidence: projectEvidence(), reportSchemaVersion: 0 }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(row.project.state, READINESS_STATE.MISSING);
  assert.equal(row.project.status, 'Not generated');
  assert.equal(row.ready, false);
});

// ── 11. Retired report identities are inert, both ways ─────────────────────

test('11. retired report identities neither satisfy readiness nor block it', () => {
  // The readiness read asks for the Project Report identity and nothing else.
  const hook = readSource('../src/components/proposal/sourceAuthority/useProposalReadiness.js');
  assert.match(hook, /::project/, 'the saved Project Report is the only report read');
  assert.doesNotMatch(hook, /::visual|::technical/, 'no retired report is read');

  // A version whose Project Report is Current is ready, whatever else is stored
  // against it: the retired rows are never passed in, so they cannot block.
  const row = resolveVersionReadiness(CURRENT_SOURCES);
  assert.equal(row.ready, true);
  assert.deepEqual(row.blockers, []);
  assert.equal(row.blockers.length, 0);

  // And with no Project Report, retired snapshots do not make it ready.
  const withoutProjectReport = resolveVersionReadiness({
    version: LEVEL_4_VERSION,
    savedProjectReport: null,
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  assert.equal(withoutProjectReport.ready, false);
  assert.equal(withoutProjectReport.project.state, READINESS_STATE.MISSING);
});

// ── 12. The gate decides Generate ──────────────────────────────────────────

test('12. the gate is open only when every selected version is Current', () => {
  const ready = resolveVersionReadiness(CURRENT_SOURCES);
  const otherReady = resolveVersionReadiness({
    version: ORIGINAL_VERSION,
    savedProjectReport: savedProjectReport({
      versionId: ORIGINAL_VERSION.id,
      evidence: projectEvidence({ versionId: ORIGINAL_VERSION.id }),
    }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  const allCurrent = resolveProposalReadinessGate({ rows: [ready, otherReady], minVersions: 2 });
  assert.equal(allCurrent.ready, true);
  assert.equal(allCurrent.message, null);

  const blocked = resolveVersionReadiness({
    version: ORIGINAL_VERSION,
    savedProjectReport: null,
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  const oneBlocked = resolveProposalReadinessGate({ rows: [ready, blocked], minVersions: 2 });
  assert.equal(oneBlocked.ready, false);
  assert.equal(oneBlocked.message, 'Original Design needs a Project Report.');
  assert.equal(oneBlocked.blockedVersions.length, 1);
  assert.equal(oneBlocked.blockedVersions[0].version_name, 'Original Design');

  // One sentence per blocked version, in the order the versions are listed.
  const staleOther = resolveVersionReadiness({
    version: ORIGINAL_VERSION,
    savedProjectReport: savedProjectReport({ versionId: ORIGINAL_VERSION.id, evidence: projectEvidence(), status: 'stale' }),
    currentFingerprints: CURRENT_FINGERPRINTS,
  });
  const twoBlocked = resolveProposalReadinessGate({ rows: [blocked, staleOther], minVersions: 2 });
  assert.equal(
    twoBlocked.message,
    'Original Design needs a Project Report. Original Design needs an updated Project Report.',
  );

  // A read in flight claims nothing, and a version-count block states no report.
  const checking = resolveProposalReadinessGate({ rows: [], loading: true });
  assert.equal(checking.ready, false);
  assert.equal(checking.checking, true);
  assert.equal(checking.message, null);

  const countBlocked = resolveProposalReadinessGate({ rows: [ready], minVersions: 2 });
  assert.equal(countBlocked.versionCountValid, false);
  assert.equal(countBlocked.ready, false);
  assert.equal(countBlocked.message, null);
  assert.deepEqual(countBlocked.blockedVersions, []);
});

// ── 13. Saved version names only ───────────────────────────────────────────

test('13. a version is named by the name the designer saved, never a slot label', () => {
  const row = resolveVersionReadiness(CURRENT_SOURCES);
  assert.equal(row.versionName, 'Level 4 version');
  assert.doesNotMatch(row.versionName, /·\s*V\d/);

  const unnamed = resolveVersionReadiness({
    version: { id: 'v9', version_name: '', version_number: 3 },
    savedProjectReport: null,
    currentFingerprints: null,
  });
  assert.equal(unnamed.versionName, 'Version 3');
  assert.equal(unnamed.blockingSentence, 'Version 3 needs a Project Report.');
});

// ── 14. Client and server derive the same verdict ──────────────────────────

test('14. client and server derive the same rows, sentences and gate', () => {
  const fixtures = [
    { name: 'current', sources: CURRENT_SOURCES, fingerprints: CURRENT_FINGERPRINTS },
    {
      name: 'update needed',
      sources: CURRENT_SOURCES,
      fingerprints: { ...CURRENT_FINGERPRINTS, engineeringFingerprint: 'eng:v1:newer-design' },
    },
    {
      name: 'not generated',
      sources: { version: LEVEL_4_VERSION, savedProjectReport: null },
      fingerprints: CURRENT_FINGERPRINTS,
    },
    {
      name: 'incomplete',
      sources: { version: LEVEL_4_VERSION, savedProjectReport: savedProjectReport({ evidence: null }) },
      fingerprints: CURRENT_FINGERPRINTS,
    },
  ];

  for (const { name, sources, fingerprints } of fixtures) {
    const serverRow = resolveVersionReadiness({
      version: sources.version,
      savedProjectReport: sources.savedProjectReport,
      currentFingerprints: fingerprints,
    });
    const clientRowResult = asClientRow(sources, fingerprints);

    assert.equal(clientRowResult.project_report_status, serverRow.project_report_status, `${name}: status`);
    assert.equal(clientRowResult.ready, serverRow.ready, `${name}: verdict`);
    assert.equal(clientRowResult.blockingSentence, serverRow.blockingSentence, `${name}: sentence`);

    const serverGate = resolveProposalReadinessGate({ rows: [serverRow] });
    const centreGate = clientGate({ rows: [clientRowResult] });
    assert.equal(centreGate.ready, serverGate.ready, `${name}: gate verdict`);
    assert.equal(centreGate.message, serverGate.message, `${name}: gate message`);
    assert.equal(centreGate.detail, serverGate.detail, `${name}: gate detail`);

    // The same cell, resolved on both sides, states the same thing.
    const serverCell = sharedSavedReportCell({
      saved: sources.savedProjectReport,
      currentFingerprints: fingerprints,
    });
    const clientCell = clientSavedReportCell({
      saved: sources.savedProjectReport,
      currentFingerprints: fingerprints,
    });
    assert.equal(clientCell.state, serverCell.state, `${name}: cell state`);
    assert.equal(clientCell.status, serverCell.status, `${name}: cell status`);

    // And the row assembly itself is shared, word for word.
    const mirrored = sharedVersionReadinessRow({
      versionId: serverRow.versionId,
      versionName: serverRow.versionName,
      versionNumber: serverRow.versionNumber,
      cells: { project: serverRow.project },
    });
    assert.equal(mirrored.blockingSentence, serverRow.blockingSentence, `${name}: mirrored row`);
    assert.equal(mirrored.ready, serverRow.ready, `${name}: mirrored verdict`);
  }

  // A row assembled from a cell the table built reads the same as the row the
  // authority derived directly.
  assert.equal(asClientRow(CURRENT_SOURCES).ready, true);
  assert.equal(
    clientVersionReadiness({
      version: LEVEL_4_VERSION,
      savedProjectReport: CURRENT_REPORT,
      currentFingerprints: CURRENT_FINGERPRINTS,
    }).ready,
    true,
  );
});

// ── 15. The Project Library banner reads the same rows ─────────────────────

test('15. the Library banner reads the same rows in the same words', () => {
  const fixtures = [
    { name: 'current', sources: CURRENT_SOURCES, fingerprints: CURRENT_FINGERPRINTS, verdict: LIBRARY_VERDICT.READY, status: LIBRARY_CHECKLIST_STATUS.READY },
    {
      name: 'update needed',
      sources: CURRENT_SOURCES,
      fingerprints: { ...CURRENT_FINGERPRINTS, engineeringFingerprint: 'eng:v1:newer-design' },
      verdict: LIBRARY_VERDICT.UPDATES_NEEDED,
      status: LIBRARY_CHECKLIST_STATUS.UPDATE_NEEDED,
    },
    {
      name: 'not generated',
      sources: { version: LEVEL_4_VERSION, savedProjectReport: null },
      fingerprints: CURRENT_FINGERPRINTS,
      verdict: LIBRARY_VERDICT.UPDATES_NEEDED,
      status: LIBRARY_CHECKLIST_STATUS.NOT_GENERATED,
    },
  ];

  // The compact list has ONE row per version, and it is the Project Report.
  assert.deepEqual(LIBRARY_READINESS_CELLS.map((cell) => cell.label), ['Project Report']);

  for (const { name, sources, fingerprints, verdict, status } of fixtures) {
    const row = asClientRow(sources, fingerprints);
    const banner = buildLibraryProposalReadiness({ rows: [row], versions: [sources.version] });

    assert.equal(banner.verdict, verdict, `${name}: verdict`);
    assert.equal(banner.checklist.length, 1, `${name}: one checklist row per version`);
    assert.deepEqual(
      banner.checklist[0].cells.map((cell) => cell.label),
      ['Project Report'],
      `${name}: one report row`,
    );
    assert.equal(banner.checklist[0].cells[0].status, status, `${name}: status word`);
    // The Library's plain words never name an internal state.
    assert.doesNotMatch(banner.checklist[0].cells[0].status, /current|stale|incomplete|missing/i, `${name}: words`);

    // The banner's own verdict decides its headline, and its verdict is the
    // gate's, never a second opinion. A report that was never created is a
    // different job from one the design has moved past, so the words differ.
    const expectedHeadline = verdict === LIBRARY_VERDICT.READY
      ? LIBRARY_READINESS_HEADLINE.READY
      : status === LIBRARY_CHECKLIST_STATUS.NOT_GENERATED
        ? LIBRARY_MISSING_REPORTS_HEADLINE
        : LIBRARY_READINESS_HEADLINE.UPDATES_NEEDED;
    assert.equal(banner.headline, expectedHeadline, `${name}: headline`);
    if (verdict !== LIBRARY_VERDICT.READY) {
      assert.equal(banner.showChecklist, true, `${name}: the blocked version is listed`);
      assert.match(banner.primaryAction.label, /Project Report|Room Designer/, `${name}: one action`);
    }
    assert.equal(banner.ready, row.ready, `${name}: banner verdict follows the row`);
  }
});

// ── 16. The calculated engineering result, and the neutral name ────────────

test('16. the calculation authority takes the Project Report, and both sides agree', () => {
  const report = savedProjectReport({
    evidence: projectEvidence(),
    fingerprints: { engineeringFingerprint: null, calculationFingerprint: BASS_FINGERPRINT, seatPriorityFingerprint: SEAT_PRIORITY },
  });

  // The version's own current fingerprint wins.
  const found = sharedCalculationAuthority({ cacheRecord: CACHE_RECORD, savedProjectReport: report });
  assert.equal(found.fingerprint, BASS_FINGERPRINT);
  assert.equal(found.source, SHARED_CALC_SOURCE.COMPLETED_AUTHORITY);
  assert.equal(found.completedAt, new Date(CALC_COMPLETED_AT_MS).toISOString());

  // A design that moved on, where the report's own stated source is all the
  // cache still holds: that stated source is what "not missing" means here.
  const fromReport = sharedCalculationAuthority({
    cacheRecord: {
      current_fingerprint: 'cal:v8:not-yet-calculated',
      completed_by_fingerprint: { [BASS_FINGERPRINT]: { job: { completedAtMs: CALC_COMPLETED_AT_MS } } },
    },
    savedProjectReport: report,
  });
  assert.equal(fromReport.fingerprint, BASS_FINGERPRINT);
  assert.equal(fromReport.source, SHARED_CALC_SOURCE.REPORT_SOURCE);

  // Nothing calculated at all is genuinely missing.
  assert.equal(sharedCalculationAuthority({ cacheRecord: null }), null);
  assert.equal(sharedCalculationAuthority({
    cacheRecord: { current_fingerprint: null, completed_by_fingerprint: {} },
    savedProjectReport: report,
  }), null);

  // The parameter is named for the report it is given, on both sides of the
  // boundary — the retired name is gone, so no reader is misled about which
  // report this reads.
  assert.match(SHARED_AUTHORITY_SOURCE, /savedProjectReport = null/);
  assert.match(CLIENT_AUTHORITY_SOURCE, /savedProjectReport = null/);
  assert.doesNotMatch(SHARED_AUTHORITY_SOURCE, /savedTechnicalReport/);
  assert.doesNotMatch(CLIENT_AUTHORITY_SOURCE, /savedTechnicalReport/);
  for (const input of [
    { cacheRecord: CACHE_RECORD, savedProjectReport: report },
    { cacheRecord: { current_fingerprint: BASS_FINGERPRINT, completed_by_fingerprint: {} }, savedProjectReport: report },
    { cacheRecord: { current_fingerprint: null, completed_by_fingerprint: {} }, savedProjectReport: null },
    { cacheRecord: null, savedProjectReport: report },
  ]) {
    assert.deepEqual(clientCalculationAuthority(input), sharedCalculationAuthority(input));
  }

  // The one build cell both sides share.
  assert.equal(buildReadinessCell({ state: READINESS_STATE.CURRENT }).status, 'Current');
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