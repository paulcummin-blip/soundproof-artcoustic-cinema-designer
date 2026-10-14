/**
 * ONE readiness verdict on the Generate step
 * ------------------------------------------
 * The defect this guards: the Version Readiness card read Current while the lower
 * generate gate refused the SAME version —
 *
 *   "Original Design: stale Project Report. The design changed after it was
 *    generated. Regenerate it before creating a proposal."
 *
 * The card (and the Generate button, and the wizard's own guard) applied the
 * presentation-only exemption: a publication that moved past the saved Report
 * without changing the physical design is not a design change. The gate that reads
 * the Report evidence on the server did not, so it compared raw engineering
 * fingerprints and refused a version the card had just called Current. Two status
 * paths, two answers.
 *
 * There is now ONE verdict — `engineeringMoveIsPresentationOnly`, mirrored from the
 * browser's designIdentityComparison — applied by the readiness authority, by the
 * report-evidence reader that supplies generation, and by the wizard's own refusal
 * reason. What this suite proves:
 *   TEST 1  a Current version's presentation-only move passes the evidence gate
 *   TEST 2  a real physical change is still refused, with the same sentence
 *   TEST 3  an unreadable comparison never excuses a Report
 *   TEST 4  current: card Current, no warning, Generate enabled and allowed
 *           stale:   card Update needed, warning is the same sentence, blocked
 *   TEST 5  the browser and the server state one verdict from one rule
 *   TEST 6  the wizard keeps no second, stale status path of its own
 * ---------------------------------------------------------------------------
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_STATE,
  resolveProposalReadinessGate,
  resolveSavedReportCell,
  resolveVersionReadinessRow,
} from '../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';
import {
  READINESS_STATE as SERVER_STATE,
  resolveVersionReadiness as serverReadiness,
} from '../base44/shared/proposalReadinessAuthority.js';
import {
  engineeringDifferenceIsPresentationOnly,
  proposalEvidenceDifferenceIsSafe,
} from '../src/components/report/designIdentityComparison.js';
import { DERIVED_DISPLAY_IDENTITY_KEYS } from '../src/components/models/screen/displayTypeAuthority.js';
import {
  DERIVED_DISPLAY_IDENTITY_KEYS as SERVER_KEYS,
  engineeringDifferenceIsPresentationOnly as serverVerdict,
  proposalEvidenceDifferenceIsSafe as serverProposalVerdict,
  proposalEvidenceMoveIsSafe,
} from '../base44/shared/designIdentityComparison.js';
import { readProposalReportEvidence } from '../base44/shared/proposalReportEvidenceReader.js';
import {
  CURRENT_FINGERPRINTS,
  ENGINEERING_FP,
  LEVEL_4_VERSION,
  PROJECT_ID,
  projectEvidence,
  savedProjectReport,
} from './fixtures/proposalReadinessFixtures.mjs';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const WIZARD = read('src/components/proposal/CreateProposalWizard.jsx');
const READER = read('base44/shared/proposalReportEvidenceReader.js');
const SERVER_GATE = read('base44/functions/generateProposal/entry.ts');
const READ_EVIDENCE_FUNCTION = read('base44/functions/readProposalReportEvidence/entry.ts');

/** The fingerprint the version's pointer has moved to — the move is presentation only. */
const MOVED_FP = 'eng:v1:0f4c1b7a2d9e6531';

const VERSION = {
  ...LEVEL_4_VERSION,
  project_id: PROJECT_ID,
  published_fingerprint: MOVED_FP,
};

/**
 * The version's report evidence, complete: the fixture's own authority wiring,
 * plus the parameters the evidence gate requires (P12–P20).
 */
function completeEvidence({ fingerprint = ENGINEERING_FP } = {}) {
  const evidence = projectEvidence();
  const bassFingerprint = evidence.parameter_index.P14.authority_fingerprint;
  const row = (key, value, level) => {
    const bass = ['P14', 'P18', 'P19', 'P20'].includes(key);
    return {
      key,
      parameter_id: Number(key.slice(1)),
      scope: 'room',
      value,
      level,
      authority_value: value,
      authority_level: level,
      authority_fingerprint: bass ? bassFingerprint : fingerprint,
      authority_timestamp: '2026-10-04T17:11:05.564Z',
      source_type: bass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
    };
  };
  for (const [key, value, level] of [
    ['P12', '100 dBC', 'L2'],
    ['P13', '96 dBC', 'L2'],
    ['P18', '25 Hz', 'L3'],
    ['P19', '+/-3 dB', 'L3'],
    ['P20', '+/-5 dB', 'L1'],
  ]) {
    const entry = row(key, value, level);
    evidence.parameter_index[key] = entry;
    evidence.parameters.push(entry);
  }
  // The evidence states the design it was frozen from, and every non-bass
  // parameter cites that same frozen authority.
  evidence.identity.source_fingerprint = fingerprint;
  for (const entry of evidence.parameters) {
    if (entry.source_type === 'durable-engineering-publication') entry.authority_fingerprint = fingerprint;
  }
  return evidence;
}

const saved = savedProjectReport({
  evidence: completeEvidence(),
  fingerprints: CURRENT_FINGERPRINTS,
});

/**
 * What the version holds NOW: its publication pointer has moved to MOVED_FP, so
 * the saved report's frozen engineering fingerprint no longer matches it. The bass
 * and seating fingerprints are untouched — this move is engineering-only.
 */
const MOVED_CURRENT = { ...CURRENT_FINGERPRINTS, engineeringFingerprint: MOVED_FP };

/** The two publications of one version, as its own publication history holds them. */
const frozenProject = (displayType, roomWidthM) => ({
  room_width: roomWidthM,
  room_length: 6.2,
  room_height: 2.5,
  screen_size: 120,
  aspect_ratio: '16:9',
  report_screen: { visibleWidthInches: 104.6, aspectRatio: '16:9', tvPresetKey: 'tv120', displayType },
});
const publication = (facts) => ({ report_snapshot: { report_project: facts } });

/** The version's analysis cache: the report's frozen publication, and the moved one. */
const cacheRecord = ({ designChanged = false, displayChanged = false } = {}) => ({
  project_id: PROJECT_ID,
  version_id: LEVEL_4_VERSION.id,
  engineering_publications: {
    [ENGINEERING_FP]: publication(frozenProject('projector_screen', 4.6)),
    [MOVED_FP]: publication(frozenProject(displayChanged ? 'tv' : 'projector_screen', designChanged ? 5.4 : 4.6)),
  },
});

const entities = (record) => ({
  ReportSnapshot: { filter: async () => ({ items: [saved] }) },
  ProjectAnalysisCache: { filter: async () => (record ? [record] : []) },
});

// ── TEST 1 — a wording-only move passes the gate that supplies evidence ──────
test('TEST 1 — a wording-only publication move is not refused', async () => {
  const snapshots = await readProposalReportEvidence(entities(cacheRecord()), PROJECT_ID, [VERSION]);
  assert.equal(snapshots.length, 1, 'the version supply is passed to generation unchanged');
  assert.equal(snapshots[0].version_id, LEVEL_4_VERSION.id);
  assert.equal(snapshots[0].engineeringState, 'current');
  assert.equal(!!snapshots[0].evidence.citation, true);
});

// ── TEST 2 — a changed Display authority requires refreshed report evidence ──
test('TEST 2 — a projector-to-TV authority change is refused until the Project Report is updated', async () => {
  await assert.rejects(
    () => readProposalReportEvidence(entities(cacheRecord({ displayChanged: true })), PROJECT_ID, [VERSION]),
    /stale Project Report/,
    'old Screen evidence must not survive into a proposal whose current authority says TV',
  );
});

// ── TEST 3 — a real physical change is still refused ─────────────────────────
test('TEST 3 — a real physical change is still refused, in the same sentence', async () => {
  await assert.rejects(
    () => readProposalReportEvidence(entities(cacheRecord({ designChanged: true })), PROJECT_ID, [VERSION]),
    (error) => {
      assert.match(error.message, /Level 4 version: stale Project Report\./);
      assert.match(error.message, /The design changed after it was generated\./);
      assert.match(error.message, /Regenerate it before creating a proposal\./);
      return true;
    },
    'a changed room is a changed design',
  );
});

// ── TEST 3 — an unreadable comparison never excuses a Report ──────────────────
test('TEST 3 — no comparison, no exemption', async () => {
  await assert.rejects(
    () => readProposalReportEvidence(entities(null), PROJECT_ID, [VERSION]),
    /stale Project Report/,
    'a version with no publication history keeps the strict verdict',
  );
  assert.equal(
    engineeringMoveIsPresentationOnly(null, { frozenFingerprint: ENGINEERING_FP, currentFingerprint: MOVED_FP }),
    false,
    'an absent comparison answers false',
  );
});

// ── TEST 4 — one verdict for the card, the warning and the guard ─────────────
const rowFor = (presentationOnlyMove) => resolveVersionReadinessRow({
  versionId: LEVEL_4_VERSION.id,
  versionName: LEVEL_4_VERSION.version_name,
  versionNumber: 1,
  cells: {
    project: resolveSavedReportCell({
      saved,
      currentFingerprints: MOVED_CURRENT,
      presentationOnlyMove,
    }),
  },
});

test('TEST 4 — Current: the card, the warning and the Generate guard are one verdict', () => {
  const row = rowFor(true);
  const gate = resolveProposalReadinessGate({ rows: [row], minVersions: 1 });

  assert.equal(row.project.state, READINESS_STATE.CURRENT);
  assert.equal(row.project.status, 'Current', 'the top card reads Current');
  assert.equal(gate.ready, true, 'the Generate guard passes');
  assert.equal(gate.message, null, 'no lower stale warning is rendered');
  assert.equal(gate.blockedVersions.length, 0, 'nothing is reported as blocked');
});

test('TEST 4 — stale: the warning states the same reason the gate is blocked by', () => {
  const row = rowFor(false);
  const gate = resolveProposalReadinessGate({ rows: [row], minVersions: 1 });

  assert.equal(row.project.state, READINESS_STATE.STALE);
  assert.equal(row.project.status, 'Update needed', 'the top card reads Update needed');
  assert.equal(gate.ready, false, 'the Generate guard is blocked');
  assert.equal(gate.message, 'Level 4 version needs an updated Project Report.', 'the one blocking sentence');
  assert.deepEqual(
    gate.blockedVersions.map((entry) => entry.reason),
    [gate.message],
    'the blocked reason and the warning are the same sentence',
  );
});

// ── TEST 5 — the browser and the server state one verdict from one rule ──────
test('TEST 5 — the server mirror answers exactly as the browser does', () => {
  assert.deepEqual([...SERVER_KEYS], [...DERIVED_DISPLAY_IDENTITY_KEYS], 'one derived-identity key list');

  const frozen = publication(frozenProject('projector_screen', 4.6));
  const moved = publication(frozenProject('tv', 4.6));
  const changed = publication(frozenProject('tv', 5.4));
  assert.equal(serverVerdict(frozen, moved), engineeringDifferenceIsPresentationOnly(frozen, moved));
  assert.equal(serverVerdict(frozen, moved), true, 'presentation only, on both sides');
  assert.equal(serverVerdict(frozen, changed), engineeringDifferenceIsPresentationOnly(frozen, changed));
  assert.equal(serverVerdict(frozen, changed), false, 'a physical change, on both sides');

  const server = serverReadiness({
    version: VERSION,
    savedProjectReport: saved,
    currentFingerprints: MOVED_CURRENT,
    presentationOnlyMove: true,
  });
  assert.equal(server.project.state, SERVER_STATE.CURRENT, 'the server gate reads Current too');
  assert.equal(server.ready, true);
  assert.equal(server.blockingSentence, null);
});

// ── TEST 7 — the verdict is read through the durable authority door ──────────
test('TEST 7 — the two publications are read exactly as the readiness card reads them', async () => {
  // The production divergence, reproduced: the caller's own read sees no cache
  // row (its access scope does not cover it) while the authority door sees it —
  // which is what made the comparison answer "false" for an unchanged design, so
  // the card read Current and this gate refused the same report as stale.
  const callerEntities = {
    ReportSnapshot: { filter: async () => ({ items: [saved] }) },
    ProjectAnalysisCache: { filter: async () => [] },
  };
  const authority = { ProjectAnalysisCache: { filter: async () => [cacheRecord()] } };

  const snapshots = await readProposalReportEvidence(callerEntities, PROJECT_ID, [VERSION], {
    authorityEntities: authority,
  });
  assert.equal(snapshots.length, 1, 'an unchanged design is never refused for a row the caller cannot see');
  assert.equal(snapshots[0].engineeringState, 'current');

  // Without an authority client the strict verdict stands: an absent comparison
  // never excuses a report.
  await assert.rejects(
    () => readProposalReportEvidence(callerEntities, PROJECT_ID, [VERSION]),
    /stale Project Report/,
  );

  // Both callers pass the authority door, and the reader uses the one shared cache
  // read the published-engineering authority itself uses.
  assert.match(READ_EVIDENCE_FUNCTION, /authorityEntities: client\.asServiceRole\.entities/);
  assert.match(SERVER_GATE, /authorityEntities: base44\.asServiceRole\.entities/);
  assert.match(SERVER_GATE, /loadCacheRecord\(base44\.asServiceRole, project_id, versionId\)/);
  assert.match(READER, /loadCacheRecord\(authority, projectId, version\.id\)/);
});

// ── TEST 6 — no second status path is left on the screen ─────────────────────
test('TEST 6 — the wizard states one readiness verdict and clears the refused attempt', () => {
  assert.match(
    WIZARD,
    /if \(!readiness\.ready\) \{[\s\S]{0,160}?return readiness\.message/,
    'the refusal reason is the readiness sentence itself',
  );
  assert.match(
    WIZARD,
    /if \(!readiness\.ready \|\| !error\) return;\s*\n\s*if \(!isReadinessRefusalMessage\(error\)\) return;\s*\n\s*setError\(null\);\s*\n\s*\}, \[readiness\.ready, error\]\);/,
    'a refused attempt cannot outlive the verdict that produced it',
  );
  assert.equal(
    WIZARD.includes('stale Project Report'),
    false,
    'the wizard states no staleness of its own — it never invents one',
  );

  // The evidence gate asks the one rule, and the server gate applies it too.
  assert.match(READER, /engineeringMoveIsPresentationOnly\(record, \{ frozenFingerprint, currentFingerprint \}\)/);
  assert.match(READER, /presentationOnlyMove = reportSourceMovedPastVersion\(projectRow, version\)/);
  assert.match(SERVER_GATE, /engineeringMoveIsPresentationOnly\(/);
  assert.match(SERVER_GATE, /presentationOnlyMove,/);
});