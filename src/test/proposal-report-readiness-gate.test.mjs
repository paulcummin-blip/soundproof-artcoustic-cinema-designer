// proposal-report-readiness-gate.test.mjs
// ---------------------------------------
// Step 3 (Versions) of the proposal wizard does not advance until the selected
// version has BOTH a current Visual Report and a current Technical Report.
//
//   A proposal is never built from stale project data.
//
// Covers the gate derivation (Current / Missing / Stale / Failed / Checking),
// the exact blocking message, the generate-or-regenerate action per report, the
// version-scoped action URLs and the wizard wiring.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROPOSAL_REPORT_GATE_MESSAGE,
  PROPOSAL_REPORT_GATE_DETAIL,
  PROPOSAL_REPORT_GATE_STATUS,
  describeGateStatus,
  resolveReportGate,
} from '../components/proposal/sourceAuthority/proposalReportReadinessGate.js';
import { PROPOSAL_REPORT_UI_STATE } from '../components/proposal/sourceAuthority/proposalReportActions.js';
import { resolveProposalSource } from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const WIZARD = read('src/components/proposal/CreateProposalWizard.jsx');
const VERSIONS_STEP = read('src/components/proposal/wizard/VersionSelectStep.jsx');
const GATE_UI = read('src/components/proposal/wizard/ReportReadinessGate.jsx');
const GATE_AUTHORITY = read('src/components/proposal/sourceAuthority/proposalReportReadinessGate.js');

const source = (overrides = {}) => resolveProposalSource({
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'Marquee Home',
  ...overrides,
});

const gateFor = (overrides = {}, loading = false) => resolveReportGate({
  status: source(overrides),
  loading,
});

/* ── Blocking ─────────────────────────────────────────────────────────── */

test('both reports missing blocks the step and offers both generate actions', () => {
  const gate = gateFor({ hasSource: false });

  expect(gate.ready).toBe(false);
  expect(gate.message).toBe('Create Visual and Technical reports in order to continue.');
  expect(gate.message).toBe(PROPOSAL_REPORT_GATE_MESSAGE);
  expect(gate.detail).toBe(PROPOSAL_REPORT_GATE_DETAIL);
  expect(gate.detail).toMatch(/uses the current Visual and Technical reports/);

  expect(gate.rows.map((r) => r.label)).toEqual(['Visual Report', 'Technical Report']);
  expect(gate.rows.map((r) => r.status)).toEqual(['Missing', 'Missing']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
  ]);
  expect(gate.rows.map((r) => r.actionUrl)).toEqual([
    '/RP22ClientReport?projectId=p1&versionId=v1',
    '/RP22Report?projectId=p1&versionId=v1',
  ]);
});

test('a stale report blocks the step and asks for a regeneration', () => {
  const gate = gateFor({ hasSource: true, designMovedOn: true });

  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate stale Visual Report',
    'Regenerate stale Technical Report',
  ]);
});

test('a report generated for another version is stale, not usable', () => {
  const gate = gateFor({ hasSource: true, identityVerified: false, identityMismatches: ['version'] });

  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
  expect(gate.rows[0].reason).toMatch(/different project or version/);
});

test('a failed report reads Unavailable and blocks the step', () => {
  const gate = gateFor({ hasSource: true, unavailable: true });

  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Unavailable', 'Unavailable']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Regenerate Visual Report',
    'Regenerate Technical Report',
  ]);
});

test('a pending recalculation is stale, so the step stays blocked', () => {
  const gate = gateFor({ hasSource: true, recalculationPending: true });
  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
});

/* ── Checking ─────────────────────────────────────────────────────────── */

test('the gate never enables while the authority is still reading', () => {
  const gate = gateFor({ hasSource: true }, true);
  expect(gate.checking).toBe(true);
  expect(gate.ready).toBe(false);
  expect(gate.message).toBe(PROPOSAL_REPORT_GATE_MESSAGE);
});

test('checking is not presented as Missing and keeps both actions', () => {
  const gate = gateFor({ hasSource: false }, true);

  expect(gate.rows.map((r) => r.status)).toEqual(['Checking…', 'Checking…']);
  expect(gate.rows.map((r) => r.uiState)).toEqual([
    PROPOSAL_REPORT_UI_STATE.CHECKING,
    PROPOSAL_REPORT_UI_STATE.CHECKING,
  ]);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Generate / Regenerate Visual Report',
    'Generate / Regenerate Technical Report',
  ]);
  expect(gate.rows.every((r) => r.actionUrl && !r.actionDisabled)).toBe(true);
});

/* ── Enabling ─────────────────────────────────────────────────────────── */

test('both reports current enables the step', () => {
  const gate = gateFor({ hasSource: true });

  expect(gate.available).toBe(true);
  expect(gate.ready).toBe(true);
  expect(gate.rows.map((r) => r.status)).toEqual(['Current', 'Current']);
  expect(gate.rows.map((r) => r.current)).toEqual([true, true]);
  expect(gate.message).toBeNull();
  expect(gate.detail).toBeNull();
});

test('with no selected version the gate is inert', () => {
  const gate = resolveReportGate({ status: null });
  expect(gate.available).toBe(false);
  expect(gate.ready).toBe(false);
  expect(gate.rows).toEqual([]);

  const unselected = resolveReportGate({ status: source({ versionId: null, hasSource: false }) });
  expect(unselected.available).toBe(false);
});

/* ── Action vocabulary ────────────────────────────────────────────────── */

test('every readiness state keeps a usable action', () => {
  expect(describeGateStatus(PROPOSAL_REPORT_UI_STATE.MISSING)).toBe('Missing');
  expect(describeGateStatus(PROPOSAL_REPORT_UI_STATE.STALE)).toBe('Stale');
  expect(describeGateStatus(PROPOSAL_REPORT_UI_STATE.FAILED)).toBe('Unavailable');
  expect(describeGateStatus(PROPOSAL_REPORT_UI_STATE.CURRENT)).toBe('Current');
  expect(describeGateStatus(PROPOSAL_REPORT_UI_STATE.CHECKING)).toBe('Checking…');
  expect(Object.values(PROPOSAL_REPORT_GATE_STATUS).length).toBeGreaterThanOrEqual(6);

  const rows = gateFor({ hasSource: false }).rows;
  rows.forEach((row) => expect(row.actionLabel.length).toBeGreaterThan(0));
});

/* ── Wiring ───────────────────────────────────────────────────────────── */

test('the Versions step cannot advance without both current reports', () => {
  expect(WIZARD).toMatch(/resolveReportGate\(\{ status: sourceStatus, loading: sourceLoading \}\)/);
  expect(WIZARD).toMatch(/versionsValid && reportGate\.ready, \/\/ step 2/);
  expect(WIZARD).toMatch(/reportGate=\{reportGate\}/);
});

test('the Versions step renders the readiness block beside the version cards', () => {
  expect(VERSIONS_STEP).toMatch(/import ReportReadinessGate from '@\/components\/proposal\/wizard\/ReportReadinessGate'/);
  expect(VERSIONS_STEP).toMatch(/<ReportReadinessGate gate=\{reportGate\} \/>/);
  expect(VERSIONS_STEP).toMatch(/reportGate = null/);
});

test('the readiness block states both reports, the message and the actions', () => {
  expect(GATE_UI).toMatch(/PROPOSAL_REPORT_GATE_TITLE/);
  expect(GATE_UI).toMatch(/gate\.rows/);
  expect(GATE_UI).toMatch(/row\.status/);
  expect(GATE_UI).toMatch(/gate\.message/);
  expect(GATE_UI).toMatch(/gate\.detail/);
  expect(GATE_UI).toMatch(/row\.actionLabel/);
  expect(GATE_UI).toMatch(/href=\{row\.actionUrl\}/);
  expect(GATE_UI).toMatch(/role="alert"/);
});

test('the gate adds no parallel authority and no report generation', () => {
  expect(GATE_AUTHORITY).toMatch(/proposalSourceAuthority'/);
  expect(GATE_AUTHORITY).toMatch(/proposalReportActions'/);
  expect(/entities\.|base44\.|functions\.invoke/.test(GATE_AUTHORITY)).toBe(false);
  expect(GATE_AUTHORITY).toMatch(/PROPOSAL_REPORT_GATE_TITLE = 'Proposal source reports'/);
});