// proposal-report-readiness-gate.test.mjs
// ---------------------------------------
// Step 3 (Versions) of the proposal wizard does not advance until the selected
// version has BOTH a current Visual Report and a current Technical Report.
//
//   A proposal is never built from stale project data.
//
// Covers the gate derivation (Current / Missing / Stale / Failed), the exact
// blocking message, the correct create/regenerate action per report, the
// version-scoped action URLs and the wizard wiring.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROPOSAL_REPORT_GATE_MESSAGE,
  PROPOSAL_REPORT_GATE_DETAIL,
  resolveReportGate,
  gateActionLabel,
} from '../components/proposal/sourceAuthority/proposalReportReadinessGate.js';
import {
  PROPOSAL_SOURCE_STATE,
  resolveProposalSource,
} from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';

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

test('both reports missing blocks the step and offers both create actions', () => {
  const gate = gateFor({ hasSource: false });

  expect(gate.ready).toBe(false);
  expect(gate.message).toBe('Create Visual and Technical reports in order to continue.');
  expect(gate.message).toBe(PROPOSAL_REPORT_GATE_MESSAGE);
  expect(gate.detail).toBe(PROPOSAL_REPORT_GATE_DETAIL);
  expect(gate.detail).toMatch(/uses the current Visual and Technical reports/);

  expect(gate.rows.map((r) => r.label)).toEqual(['Visual Report', 'Technical Report']);
  expect(gate.rows.map((r) => r.status)).toEqual(['Missing', 'Missing']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Create Visual Report',
    'Create Technical Report',
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

test('a failed report reads Failed and blocks the step', () => {
  const gate = gateFor({ hasSource: true, unavailable: true });

  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Failed', 'Failed']);
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

/* ── Enabling ─────────────────────────────────────────────────────────── */

test('both reports current enables the step', () => {
  const gate = gateFor({ hasSource: true });

  expect(gate.available).toBe(true);
  expect(gate.ready).toBe(true);
  expect(gate.rows.map((r) => r.status)).toEqual(['Current', 'Current']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([null, null]);
  expect(gate.message).toBeNull();
  expect(gate.detail).toBeNull();
});

test('the gate never enables while the authority is still reading', () => {
  const gate = gateFor({ hasSource: true }, true);
  expect(gate.checking).toBe(true);
  expect(gate.ready).toBe(false);
  expect(gate.message).toBe(PROPOSAL_REPORT_GATE_MESSAGE);
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

test('the action per state follows the create / regenerate distinction', () => {
  expect(gateActionLabel('Visual Report', PROPOSAL_SOURCE_STATE.MISSING)).toBe('Create Visual Report');
  expect(gateActionLabel('Visual Report', PROPOSAL_SOURCE_STATE.STALE)).toBe('Regenerate stale Visual Report');
  expect(gateActionLabel('Technical Report', PROPOSAL_SOURCE_STATE.FAILED)).toBe('Regenerate Technical Report');
  expect(gateActionLabel('Technical Report', PROPOSAL_SOURCE_STATE.CURRENT)).toBeNull();
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
  expect(/entities\.|base44\.|functions\.invoke/.test(GATE_AUTHORITY)).toBe(false);
  expect(GATE_AUTHORITY).toMatch(/PROPOSAL_REPORT_GATE_TITLE = 'Proposal source reports'/);
});