// proposal-report-button-persistence.test.mjs
// -------------------------------------------
// The Proposal Centre source panel and the wizard's Versions step must ALWAYS
// offer the action that produces a report, until that report is confirmed
// Current.
//
//   Missing / Stale / Failed  → Generate / Regenerate stays on screen
//   Checking / Unresolved     → the action stays, with safe combined wording
//   Generating                → same action, disabled, running copy
//   Current                   → status + generated date + Regenerate action
//
// No state may remove a button because a read finished, a source reloaded, a
// poll returned nothing, or the status came back unresolved.

import { test, beforeEach, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROPOSAL_REPORT_UI_STATE,
  PROPOSAL_REPORT_STATUS_TEXT,
  GENERATION_PENDING_MS,
  resolveReportUiState,
  resolveReportAction,
  resolveReportActionRows,
  generationKey,
  markGenerationRequested,
  isGenerationPending,
  clearGenerationPending,
  clearAllPendingGenerations,
} from '../components/proposal/sourceAuthority/proposalReportActions.js';
import {
  PROPOSAL_SOURCE_STATE,
  resolveProposalSource,
} from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';
import { resolveReportGate } from '../components/proposal/sourceAuthority/proposalReportReadinessGate.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const PANEL = read('src/components/proposal/sourceAuthority/ProposalSourcePanel.jsx');
const GATE_UI = read('src/components/proposal/wizard/ReportReadinessGate.jsx');
const ACTIONS = read('src/components/proposal/sourceAuthority/proposalReportActions.js');

const source = (overrides = {}) => resolveProposalSource({
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'Marquee Home',
  reportGeneratedAt: '2026-10-01T09:39:00.000Z',
  ...overrides,
});

const rowsFor = (overrides = {}, params = {}) => resolveReportActionRows({
  reports: source(overrides).reports,
  projectId: 'p1',
  versionId: 'v1',
  generatedAt: '2026-10-01T09:39:00.000Z',
  ...params,
});

beforeEach(() => {
  clearAllPendingGenerations();
});

/* ── Buttons persist in every non-current state ───────────────────────── */

test('a missing report always offers Generate, with its own report page', () => {
  const rows = rowsFor({ hasSource: false });

  expect(rows.map((r) => r.uiState)).toEqual(['missing', 'missing']);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
  ]);
  expect(rows.map((r) => r.actionDisabled)).toEqual([false, false]);
  expect(rows.map((r) => r.actionUrl)).toEqual([
    '/RP22ClientReport?projectId=p1&versionId=v1',
    '/RP22Report?projectId=p1&versionId=v1',
  ]);
});

test('a stale report keeps a regenerate action, never a hidden button', () => {
  const rows = rowsFor({ hasSource: true, designMovedOn: true });
  expect(rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate stale Visual Report',
    'Regenerate stale Technical Report',
  ]);
});

test('a failed report keeps a regenerate action', () => {
  const rows = rowsFor({ hasSource: true, unavailable: true });
  expect(rows.map((r) => r.status)).toEqual(['Unavailable', 'Unavailable']);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate Visual Report',
    'Regenerate Technical Report',
  ]);
});

/* ── Checking and unresolved never hide the action ────────────────────── */

test('checking shows Checking and keeps both actions with safe copy', () => {
  const rows = rowsFor({ hasSource: false }, { checking: true });

  expect(rows.map((r) => r.uiState)).toEqual(['checking', 'checking']);
  expect(rows.map((r) => r.status)).toEqual(['Checking…', 'Checking…']);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Generate / Regenerate Visual Report',
    'Generate / Regenerate Technical Report',
  ]);
  expect(rows.every((r) => r.actionUrl && r.actionDisabled === false)).toBe(true);
  expect(rows.every((r) => r.current === false)).toBe(true);
});

test('an unresolved report is never presented as current or missing', () => {
  expect(resolveReportUiState({ reportState: null })).toBe(PROPOSAL_REPORT_UI_STATE.UNRESOLVED);
  expect(resolveReportUiState({ reportState: 'something-else' })).toBe(PROPOSAL_REPORT_UI_STATE.UNRESOLVED);

  const rows = rowsFor({}, { reports: { visual: { report: 'visual' }, technical: { report: 'technical' } } });
  expect(rows.map((r) => r.status)).toEqual(['Unresolved', 'Unresolved']);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Generate / Regenerate Visual Report',
    'Generate / Regenerate Technical Report',
  ]);
});

test('a reading source is not reported as Missing', () => {
  const rows = rowsFor({ hasSource: false }, { checking: true });
  expect(rows.map((r) => r.status)).not.toContain('Missing');
  expect(PROPOSAL_REPORT_STATUS_TEXT[PROPOSAL_REPORT_UI_STATE.CHECKING]).toBe('Checking…');
});

/* ── Generating ───────────────────────────────────────────────────────── */

test('a requested generation shows a running, disabled action', () => {
  const key = generationKey('p1', 'v1', 'visual');
  markGenerationRequested(key);

  const rows = rowsFor({ hasSource: false }, { isGenerating: (k) => isGenerationPending(generationKey('p1', 'v1', k)) });

  expect(rows[0].uiState).toBe(PROPOSAL_REPORT_UI_STATE.GENERATING);
  expect(rows[0].status).toBe('Generating…');
  expect(rows[0].actionLabel).toBe('Generating Visual Report…');
  expect(rows[0].actionDisabled).toBe(true);
  // The other report is untouched and still actionable.
  expect(rows[1].actionLabel).toBe('Generate Technical Report');
  expect(rows[1].actionDisabled).toBe(false);
});

test('a confirmed current report clears the pending generation flag', () => {
  const key = generationKey('p1', 'v1', 'visual');
  markGenerationRequested(key);

  const rows = rowsFor({ hasSource: true });
  expect(rows[0].status).toBe('Current');
  expect(isGenerationPending(key)).toBe(false);
});

test('a pending generation is bounded, so a button can never stick disabled', () => {
  const key = generationKey('p1', 'v1', 'technical');
  markGenerationRequested(key, 0);
  expect(isGenerationPending(key, GENERATION_PENDING_MS - 1)).toBe(true);
  expect(isGenerationPending(key, GENERATION_PENDING_MS + 1)).toBe(false);
  expect(isGenerationPending(key, GENERATION_PENDING_MS + 2)).toBe(false);

  clearGenerationPending(key);
  expect(isGenerationPending(key)).toBe(false);
});

/* ── Current ──────────────────────────────────────────────────────────── */

test('a current report shows its status, generated date and a regenerate action', () => {
  const rows = rowsFor({ hasSource: true });

  expect(rows.map((r) => r.uiState)).toEqual(['current', 'current']);
  expect(rows.map((r) => r.current)).toEqual([true, true]);
  expect(rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate Visual Report',
    'Regenerate Technical Report',
  ]);
  expect(rows.map((r) => r.actionDisabled)).toEqual([false, false]);
  // A current report states its generated timestamp on the row.
  expect(rows[0].generatedAt).toBe('2026-10-01T09:39:00.000Z');
  expect(rows[0].reason).toBeNull();
});

test('the action vocabulary is complete for every state', () => {
  const states = Object.values(PROPOSAL_REPORT_UI_STATE);
  states.forEach((state) => {
    const action = resolveReportAction({ label: 'Visual Report', uiState: state });
    expect(typeof action.label).toBe('string');
    expect(action.label.length).toBeGreaterThan(0);
  });
  expect(resolveReportAction({ label: 'Visual Report', uiState: 'checking' }).label)
    .toBe('Generate / Regenerate Visual Report');
});

/* ── Wizard gate stays blocked, actions stay put ──────────────────────── */

test('the Versions gate keeps both actions while checking and stays blocked', () => {
  const gate = resolveReportGate({ status: source({ hasSource: false }), loading: true });

  expect(gate.checking).toBe(true);
  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Checking…', 'Checking…']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Generate / Regenerate Visual Report',
    'Generate / Regenerate Technical Report',
  ]);
});

test('the Versions gate still refuses to advance until both reports are current', () => {
  const blocked = resolveReportGate({ status: source({ hasSource: false }) });
  expect(blocked.ready).toBe(false);
  expect(blocked.rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
  ]);

  const ready = resolveReportGate({ status: source({ hasSource: true }) });
  expect(ready.ready).toBe(true);
  expect(ready.rows.map((r) => r.current)).toEqual([true, true]);
  // Even then the designer can regenerate rather than losing the action.
  expect(ready.rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate Visual Report',
    'Regenerate Technical Report',
  ]);
});

/* ── Wiring: nothing can hide a button by time or by readiness ────────── */

test('the panel renders one action per report row, outside any readiness condition', () => {
  expect(PANEL).toMatch(/resolveReportActionRows\(/);
  expect(PANEL).toMatch(/<ReportAction row=\{row\} onRequest=\{onRequest\} \/>/);
  expect(PANEL).toMatch(/const checking = loading \|\| !versionId \|\| !status\.state;/);
  // The old blocker-only block that withdrew the actions is gone.
  expect(PANEL).not.toMatch(/status\.blockers/);
});

test('no timeout, interval or expiry can remove a report action', () => {
  expect(/setTimeout|setInterval/.test(PANEL)).toBe(false);
  expect(/setTimeout|setInterval/.test(GATE_UI)).toBe(false);
  // The only time bound is the in-flight generation flag, which only ever
  // disables a button and releases it again.
  expect(ACTIONS).toMatch(/GENERATION_PENDING_MS = 60000/);
  expect(PANEL).toMatch(/actionDisabled/);
});

test('the wizard readiness block renders a row action in every state', () => {
  expect(GATE_UI).toMatch(/function ReportAction\(\{ row \}\)/);
  expect(GATE_UI).toMatch(/<ReportAction row=\{row\} \/>/);
  expect(GATE_UI).toMatch(/if \(!row\.actionLabel\) return null;/);
  expect(GATE_UI).toMatch(/PROPOSAL_REPORT_UI_STATE\.GENERATING/);
});