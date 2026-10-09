/**
 * One readiness authority drives Step 5 — the contract
 * ---------------------------------------------------
 * The Version Readiness table, the Generate Proposal enabled/disabled state, the
 * blocking message and the server gate must all state ONE verdict, from ONE
 * authority (proposalReadinessAuthority, mirrored by the server's copy).
 *
 * The defect this guards: the wizard also consulted a second, legacy
 * "source ready" boolean, computed from the published engineering publication
 * alone. A version whose saved reports were Current and whose engineering result
 * lived in the completed calculation authority therefore read Current in the
 * panel while the Generate button claimed:
 *
 *   "Generate the Visual and Technical Reports before creating a proposal…"
 *
 * There is no second gate any more. What this suite proves:
 *   TEST 1  a version with three Current cells is ready, and the gate agrees
 *   TEST 2  the button and the table read the same result
 *   TEST 3  no legacy report-ready boolean can contradict the panel
 *   TEST 4  a blocked version names itself and the exact missing item
 *   TEST 5  the comparison path is unchanged
 *   TEST 6  generation proceeds, and the editor opens only on a saved proposal
 *   TEST 7  no report generation or report logic is involved
 * ---------------------------------------------------------------------------
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  READINESS_SOURCE,
  READINESS_STATE,
  buildReadinessCell,
  resolveProposalReadinessGate,
  resolveVersionReadinessRow,
} from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const WIZARD = read('src/components/proposal/CreateProposalWizard.jsx');
const READINESS_HOOK = read('src/components/proposal/sourceAuthority/useProposalReadiness.js');
const SERVER_GATE = read('base44/functions/generateProposal/entry.ts');

const current = () => buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: '2026-10-04T10:00:00.000Z' });
const missing = () => buildReadinessCell({ state: READINESS_STATE.MISSING });

/** One version's readiness row, with its Project Report Current unless overridden. */
function readinessRow(overrides = {}, identity = {}) {
  return resolveVersionReadinessRow({
    versionId: identity.versionId || 'v1',
    versionName: identity.versionName || 'Level 1 version',
    versionNumber: identity.versionNumber ?? 1,
    cells: { project: current(), ...overrides },
  });
}

// ── TEST 1 — a Current Project Report is a ready version ───────────────────
test('TEST 1 — a version whose Project Report is Current is ready', () => {
  const row = readinessRow();

  assert.equal(row.project_report_status, 'Current');
  assert.equal(row.ready, true, 'the current Project Report is the whole report requirement');
  assert.equal(row.blockers.length, 0);

  const gate = resolveProposalReadinessGate({ rows: [row], minVersions: 1 });
  assert.equal(gate.ready, true, 'the panel verdict and the gate verdict are one verdict');
  assert.equal(gate.message, null, 'nothing is reported as missing');
  assert.equal(gate.blockedVersions.length, 0);
});

// ── TEST 2 — the button reads the table's own result ───────────────────────
test('TEST 2 — Generate and the readiness table read one result', () => {
  assert.match(
    WIZARD,
    /<VersionReadinessTable[\s\S]*?gate=\{readiness\}/,
    'the review step shows the shared readiness result',
  );
  assert.match(
    WIZARD,
    /const \{[\s\S]{0,240}?rows: readinessRows,[\s\S]{0,240}?\} = useProposalReadiness\(\{/,
    'the wizard reads the shared per-version readiness',
  );
  assert.match(
    WIZARD,
    /if \(!readiness\.ready\) \{[\s\S]{0,140}?return readiness\.message/,
    'the disabled reason is the readiness sentence itself',
  );
  assert.match(WIZARD, /disabled=\{!!generateBlockReason\}/, 'the button is disabled on that one reason');
});

// ── TEST 3 — the legacy gate is gone ───────────────────────────────────────
test('TEST 3 — no legacy report-ready boolean can contradict the panel', () => {
  assert.equal(WIZARD.includes('useProposalSourceStatus'), false, 'the legacy source hook is not consulted');
  assert.equal(WIZARD.includes('sourceReady'), false, 'no separate ready boolean is computed');
  assert.equal(WIZARD.includes('sourceStatus'), false, 'and its status is never read');
  assert.equal(
    WIZARD.includes('PROPOSAL_SOURCE_REQUIRED_MESSAGE'),
    false,
    'the report-missing warning can no longer be produced by the wizard',
  );
  assert.equal(
    WIZARD.includes('Generate the Visual and Technical Reports before creating a proposal'),
    false,
    'the false warning is not stated anywhere in the wizard',
  );

  assert.match(
    WIZARD,
    /readiness\.message \|\| 'Every selected version needs its current Project Report/,
    'the one blocking sentence comes from the readiness authority',
  );
});

// ── TEST 4 — a blocked version names what is missing ───────────────────────
test('TEST 4 — a blocked reason names the version and the exact missing item', () => {
  const blocked = readinessRow({ project: missing() });
  const gate = resolveProposalReadinessGate({ rows: [blocked], minVersions: 1 });

  assert.equal(gate.ready, false);
  assert.equal(gate.blockedVersions.length, 1);
  assert.equal(gate.blockedVersions[0].version_name, 'Level 1 version', 'the saved version name is used');
  assert.deepEqual(
    gate.blockedVersions[0].blockers.map((blocker) => blocker.source),
    [READINESS_SOURCE.PROJECT],
    'the Project Report is the one source that can block a version',
  );
  assert.match(gate.message, /Level 1 version/);
  assert.match(gate.message, /Project Report/);
  assert.equal(
    /Visual Report|Technical Report/.test(gate.message),
    false,
    'no retired report is ever named',
  );

  // The retry the table offers reads the same authority again — nothing else.
  assert.match(WIZARD, /onRetry=\{readinessError \? retryReadiness : null\}/);
  assert.match(READINESS_HOOK, /return \{ rows, loading, error, retry \}/);
});

// ── TEST 8 — no retired report is named anywhere on the path ──────────────
test('TEST 8 — the wizard, the table and the server name the Project Report only', () => {
  const TABLE_SRC = read('src/components/proposal/sourceAuthority/VersionReadinessTable.jsx');
  for (const source of [WIZARD, TABLE_SRC, SERVER_GATE]) {
    assert.equal(/Visual Report|Technical Report/.test(source), false, 'no retired report is required or named');
    assert.equal(/Visual and Technical Reports/.test(source), false, 'the dual-report sentence is gone');
  }
  assert.match(TABLE_SRC, /READINESS_REPORT_LABEL/, 'the table states the one report label');
  assert.match(SERVER_GATE, /savedProjectReport/, 'the server gate reads the saved Project Report');
  assert.equal(SERVER_GATE.includes('savedReports'), false, 'the server no longer feeds report cells by type');
});

// ── TEST 5 — the comparison path is unchanged ─────────────────────────────
test('TEST 5 — a comparison is still judged version by version', () => {
  const first = readinessRow();
  const second = readinessRow(
    { project: missing() },
    { versionId: 'v2', versionName: 'Level 4 version', versionNumber: 4 },
  );

  const readyGate = resolveProposalReadinessGate({ rows: [first, readinessRow({}, { versionId: 'v2', versionName: 'Level 4 version', versionNumber: 4 })], minVersions: 2 });
  assert.equal(readyGate.ready, true, 'two current versions can be compared');

  const blockedGate = resolveProposalReadinessGate({ rows: [first, second], minVersions: 2 });
  assert.equal(blockedGate.ready, false);
  assert.equal(blockedGate.blockedVersions[0].version_name, 'Level 4 version');

  // A comparison is not held up by a single-version requirement, and the server
  // gate applies the same per-version rule.
  assert.match(WIZARD, /if \(selectedVersionIds\.length > 1\) return null;/);
  assert.match(SERVER_GATE, /resolveProposalReadinessGate\(\{ rows: readinessRows, minVersions: 1 \}\)/);
  assert.match(SERVER_GATE, /resolveCalculationAuthority\(\{/);
});

// ── TEST 6 — generation proceeds, the editor opens on a saved proposal ────
test('TEST 6 — generation runs, and the editor opens only once sections exist', () => {
  assert.match(WIZARD, /await base44\.functions\.invoke\('generateProposal'/);
  assert.match(WIZARD, /confirmProposalSectionsSaved\(proposalId\)/);
  assert.match(WIZARD, /if \(!handoff\.ok\) throw new Error\(handoff\.reason\)/);
  assert.match(WIZARD, /onCreated\(proposalId\)/, 'the editor opens only after the handoff is confirmed');
  // A single-version report still requires its frozen engineering snapshot.
  assert.match(WIZARD, /if \(!engineeringSnapshot\) \{/);
});

// ── TEST 7 — no report generation or report logic is touched ──────────────
test('TEST 7 — the wizard generates no report', () => {
  const invokes = [...WIZARD.matchAll(/base44\.functions\.invoke\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(invokes, ['generateProposal'], 'the wizard invokes no report generator');

  // Readiness is read from the saved reports and the durable engineering
  // authority — never generated here.
  assert.match(READINESS_HOOK, /base44\.entities\.ReportSnapshot\.filter\(/);
  assert.match(READINESS_HOOK, /fetchDurablePublication\(/);
  assert.match(READINESS_HOOK, /readProjectAnalysisCacheRecord\(/);
  assert.equal(WIZARD.includes('/RP22ClientReport'), false, 'the wizard does not produce a report');
});