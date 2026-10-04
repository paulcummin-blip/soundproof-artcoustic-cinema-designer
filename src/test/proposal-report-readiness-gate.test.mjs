// proposal-report-readiness-gate.test.mjs
// ---------------------------------------
// Step 3 (Versions) of the proposal wizard does not advance until the selected
// version has BOTH a current Visual Report and a current Technical Report.
//
//   A proposal is never built from stale project data.
//
// Covers the gate derivation (Current / Missing / Stale / Failed / Checking),
// the exact blocking copy, the one Generate action per report — the same label
// in every state — the version-scoped action URLs and the wizard wiring.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  PROPOSAL_REPORT_GATE_MESSAGE,
  PROPOSAL_REPORT_GATE_DETAIL,
  PROPOSAL_REPORT_GATE_READY_COPY,
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
const VERSIONED_ENGINEERING_HOOK = read('src/components/engineering/useVersionedEngineeringAuthority.js');
const TECHNICAL_REPORT = read('src/pages/RP22Report.jsx');
const ROOM_DESIGNER = read('src/pages/RoomDesigner.jsx');

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
  expect(gate.message).toBe(PROPOSAL_REPORT_GATE_MESSAGE);
  expect(gate.message).toBe(
    'Generate the Visual and Technical Reports before creating a proposal. '
    + 'This ensures the proposal uses the current project data and RP22 results.',
  );
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

test('a stale report blocks the step and keeps the Generate action', () => {
  const gate = gateFor({ hasSource: true, designMovedOn: true });

  expect(gate.ready).toBe(false);
  expect(gate.rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
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
    'Generate Visual Report',
    'Generate Technical Report',
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
    'Generate Visual Report',
    'Generate Technical Report',
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
  // The action stays available on a current report, under the same label.
  expect(gate.rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
  ]);
  expect(gate.rows.every((r) => r.actionUrl && !r.actionDisabled)).toBe(true);
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

test('the same Generate label is used in every state, with the status carrying the state', () => {
  const states = [
    {},
    { hasSource: true },
    { hasSource: true, designMovedOn: true },
    { hasSource: true, unavailable: true },
  ];

  states.forEach((overrides) => {
    const gate = gateFor(overrides);
    expect(gate.rows.map((r) => r.actionLabel)).toEqual([
      'Generate Visual Report',
      'Generate Technical Report',
    ]);
  });

  const checking = gateFor({ hasSource: false }, true);
  expect(checking.rows.map((r) => r.actionLabel)).toEqual([
    'Generate Visual Report',
    'Generate Technical Report',
  ]);

  // The status text is what distinguishes the states.
  expect(gateFor({ hasSource: true }).rows.map((r) => r.status)).toEqual(['Current', 'Current']);
  expect(gateFor({ hasSource: false }).rows.map((r) => r.status)).toEqual(['Missing', 'Missing']);
  expect(gateFor({ hasSource: true, designMovedOn: true }).rows.map((r) => r.status)).toEqual(['Stale', 'Stale']);
  expect(gateFor({ hasSource: true, unavailable: true }).rows.map((r) => r.status)).toEqual(['Unavailable', 'Unavailable']);
});

test('no Regenerate or Generate / Regenerate wording reaches the gate surfaces', () => {
  [GATE_UI, GATE_AUTHORITY, ...Object.values(PROPOSAL_REPORT_GATE_STATUS)].forEach((value) => {
    expect(String(value)).not.toMatch(/Regenerate/i);
  });
  expect(GATE_AUTHORITY).not.toMatch(/Generate\s*\/\s*Regenerate/);
  expect(GATE_UI).not.toMatch(/Generate\s*\/\s*Regenerate/);
});

/* ── Wiring ───────────────────────────────────────────────────────────── */

test('durable bass restore overlays the engineering summary and reinserts it into the report snapshot', () => {
  expect(VERSIONED_ENGINEERING_HOOK).toMatch(/const composedSummary = extractEngineeringSummary\(composedSnapshot\)/);
  expect(VERSIONED_ENGINEERING_HOOK).toMatch(/applyRestoredBassAuthority\(\s*composedSummary,/);
  expect(VERSIONED_ENGINEERING_HOOK).toMatch(/engineeringSummary: restoredSummary/);
  expect(VERSIONED_ENGINEERING_HOOK).not.toMatch(/applyRestoredBassAuthority\(\s*composeAuthoritySnapshot/);
});

test('Technical Report cold restore is gated by the complete engineering summary, not session analysisResult', () => {
  expect(TECHNICAL_REPORT).toMatch(/renderGatePassed: !!engineeringSummary && reportAuthority\.reportComplete/);
  expect(TECHNICAL_REPORT).not.toMatch(/if \(!authorityResolving && \(!analysisResult \|\| !analysisResult\.gradedParameters\)\)/);
});

test('Compliance cold restore uses complete versioned authority without mounting the Bass UI', () => {
  expect(ROOM_DESIGNER).toMatch(/useVersionedEngineeringAuthority\(/);
  expect(ROOM_DESIGNER).toMatch(/restoredEngineeringAuthority\.reportComplete/);
  expect(ROOM_DESIGNER).toMatch(/engineeringSummary=\{complianceEngineeringSummary\}/);
  expect(ROOM_DESIGNER).toMatch(/p19SeatAuthority=\{complianceEngineeringSummary\?\.p19SeatAuthority/);
  expect(ROOM_DESIGNER).toMatch(/: \(appDesignRating\?\.engineeringSummary \?\? null\)/);
});

test('the Versions step advances only when EVERY selected version has current reports', () => {
  // ONE per-version readiness result drives the step — never the first selected
  // version alone.
  expect(WIZARD).toMatch(/useProposalReadiness\(\{/);
  expect(WIZARD).toMatch(/resolveProposalReadinessGate\(\{/);
  // Choosing versions stays smooth: the gate is not what enables Next.
  expect(WIZARD).toMatch(/versionsValid, \/\/ step 2/);
  // The hard block lands when the step is left, naming the blocked versions.
  expect(WIZARD).toMatch(/if \(step === 2 && versionsValid && !readiness\.ready\) \{/);
  expect(WIZARD).toMatch(/setBlockedAttempt\(true\)/);
  // Step 5 shows the same result, and its Generate action is gated on it: the
  // readiness result is one of the named reasons that disable Generate, and the
  // button carries those reasons and nothing else.
  expect(WIZARD).toMatch(/<VersionReadinessTable[\s\S]{0,200}gate=\{readiness\}/);
  expect(WIZARD).toMatch(/if \(!readiness\.ready\) {\n\s+return readiness\.message/);
  expect(WIZARD).toMatch(/disabled=\{!!generateBlockReason\}/);
});

test('the Versions step renders the per-version readiness table beside the version cards', () => {
  expect(VERSIONS_STEP).toMatch(/import VersionReadinessTable from '@\/components\/proposal\/sourceAuthority\/VersionReadinessTable'/);
  expect(VERSIONS_STEP).toMatch(/<VersionReadinessTable gate=\{readiness\} projectId=\{projectId\} \/>/);
  expect(VERSIONS_STEP).toMatch(/readiness = null/);
});

test('the copy is exact: the blocking sentence while blocked, the promise once current', () => {
  expect(PROPOSAL_REPORT_GATE_MESSAGE).toBe(
    'Generate the Visual and Technical Reports before creating a proposal. '
    + 'This ensures the proposal uses the current project data and RP22 results.',
  );
  expect(PROPOSAL_REPORT_GATE_READY_COPY).toBe('The proposal will be generated from these reports.');

  expect(GATE_UI).toMatch(/PROPOSAL_REPORT_GATE_READY_COPY/);
  expect(GATE_UI).toMatch(/\{gate\.message\}/);

  // A ready gate carries neither blocking sentence.
  const ready = gateFor({ hasSource: true });
  expect(ready.message).toBeNull();
  expect(ready.detail).toBeNull();
  expect(PROPOSAL_REPORT_GATE_READY_COPY).not.toMatch(/Regenerate/i);
});

test('the readiness block states both reports, the message and the actions', () => {
  expect(GATE_UI).toMatch(/PROPOSAL_REPORT_GATE_TITLE/);
  expect(GATE_UI).toMatch(/gate\.rows/);
  expect(GATE_UI).toMatch(/row\.status/);
  expect(GATE_UI).toMatch(/gate\.message/);
  expect(GATE_UI).toMatch(/gate\.detail/);
  expect(GATE_UI).toMatch(/row\.actionLabel/);
  // The action opens the report from the proposal workflow, so the link carries
  // the proposal context that gives the report its way back.
  expect(GATE_UI).toMatch(/href=\{withProposalContext\(row\.actionUrl\)\}/);
  expect(GATE_UI).toMatch(/role="alert"/);
});

test('the gate adds no parallel authority and no report generation', () => {
  expect(GATE_AUTHORITY).toMatch(/proposalSourceAuthority'/);
  expect(GATE_AUTHORITY).toMatch(/proposalReportActions'/);
  expect(/entities\.|base44\.|functions\.invoke/.test(GATE_AUTHORITY)).toBe(false);
  expect(GATE_AUTHORITY).toMatch(/PROPOSAL_REPORT_GATE_TITLE = 'Proposal source reports'/);
});