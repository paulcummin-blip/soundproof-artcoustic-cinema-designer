// proposal-source-authority.test.mjs
// ----------------------------------
// The proposal source identity: ONE report — the Project Report — and the URL a
// blocked version is sent to.
//
//   No current Project Report = no proposal.
//
// The retired dual-report gate layer (the readiness gate, its panel, its action
// rows and the source-status hook) is gone: this file guards that it is gone,
// that the wizard consults the ONE readiness authority, and that the server
// states the same rule and returns named per-version blockers.
//
// Run: npx vitest run src/test/proposal-source-authority.test.mjs

import { test, expect } from 'vitest';
import fs from 'node:fs';
import * as sourceAuthority from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';
import {
  PROPOSAL_SOURCE_REPORT,
  PROPOSAL_SOURCE_REPORT_ROUTE,
  PROPOSAL_SOURCE_REQUIRED_MESSAGE,
  PROPOSAL_SOURCE_RULE,
  buildReportActionUrl,
} from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));

const WIZARD = read('components/proposal/CreateProposalWizard.jsx');
const CENTRE = read('pages/ProposalCentre.jsx');
const VERSIONS_STEP = read('components/proposal/wizard/VersionSelectStep.jsx');
const TABLE = read('components/proposal/sourceAuthority/VersionReadinessTable.jsx');
const HOOK = read('components/proposal/sourceAuthority/useProposalReadiness.js');
const GENERATE = readRoot('base44/functions/generateProposal/entry.ts');

/* ── The one rule ─────────────────────────────────────────────────────── */

test('a proposal needs a current Project Report, and nothing else', () => {
  expect(PROPOSAL_SOURCE_RULE).toBe('No current Project Report = no proposal.');
  expect(PROPOSAL_SOURCE_REQUIRED_MESSAGE).toContain('Create the Project Report for every selected version');
  expect(PROPOSAL_SOURCE_REQUIRED_MESSAGE).not.toMatch(/Visual Report|Technical Report/);
  expect(PROPOSAL_SOURCE_REPORT.PROJECT).toBe('project');
  expect(PROPOSAL_SOURCE_REPORT_ROUTE.project).toBe('/RP22ClientReport');
});

test('the action URL carries the exact project and version', () => {
  expect(buildReportActionUrl({
    route: PROPOSAL_SOURCE_REPORT_ROUTE.project,
    projectId: 'p1',
    versionId: 'v1',
  })).toBe('/RP22ClientReport?projectId=p1&versionId=v1');
  // A route with no identity is still a usable URL.
  expect(buildReportActionUrl({ route: PROPOSAL_SOURCE_REPORT_ROUTE.project }))
    .toBe('/RP22ClientReport');
});

/* ── The retired layer is gone ────────────────────────────────────────── */

test('the retired dual-report derivation is removed, not merely unused', () => {
  // No dual-report resolver survives on the module's public surface.
  for (const retired of [
    'resolveProposalSource',
    'verifySourceIdentity',
    'resolveReportSourceState',
    'describeSourceState',
    'PROPOSAL_SOURCE_STATE',
    'PROPOSAL_SOURCE_TITLE',
    'PROPOSAL_SOURCE_REPORT_LABEL',
  ]) {
    expect(retired in sourceAuthority).toBe(false);
  }

  // And the files that stated the retired Visual + Technical contract are gone.
  for (const retired of [
    'components/proposal/sourceAuthority/proposalReportReadinessGate.js',
    'components/proposal/sourceAuthority/ProposalSourcePanel.jsx',
    'components/proposal/sourceAuthority/proposalReportActions.js',
    'components/proposal/sourceAuthority/useProposalSourceStatus.js',
    'components/proposal/wizard/ReportReadinessGate.jsx',
  ]) {
    expect(exists(retired)).toBe(false);
  }
});

/* ── Wiring: one authority, on every live surface ─────────────────────── */

test('the proposal builder blocks generation on the shared readiness result', () => {
  expect(WIZARD).toContain('useProposalReadiness({');
  expect(WIZARD).not.toContain('useProposalSourceStatus');
  expect(WIZARD).not.toContain('useProposalReportGate');
  expect(WIZARD).not.toContain('ReportReadinessGate');
  expect(WIZARD).toMatch(/<VersionReadinessTable[\s\S]*gate=\{readiness\}/);
  expect(WIZARD).toMatch(/if \(!readiness\.ready\) \{[\s\S]{0,140}?return readiness\.message/);
  expect(WIZARD).toContain('disabled={!!generateBlockReason}');
  expect(WIZARD).toContain('Every selected version needs its current Project Report before this proposal can be generated.');
  expect(WIZARD).toContain('written from the current Project Report data');
});

test('the version step shows the same table and never interrupts the choice itself', () => {
  expect(VERSIONS_STEP).toContain("import VersionReadinessTable from '@/components/proposal/sourceAuthority/VersionReadinessTable'");
  expect(VERSIONS_STEP).toContain('<VersionReadinessTable gate={readiness} projectId={projectId} />');
  expect(VERSIONS_STEP).not.toMatch(/disabled=\{!readiness/);
});

test('Proposal Centre stays passive until the proposal wizard owns readiness', () => {
  expect(CENTRE).not.toMatch(/useProposalSourceStatus/);
  expect(CENTRE).not.toMatch(/ProposalSourcePanel/);
  expect(CENTRE).toMatch(/CreateProposalWizard/);
});

test('the readiness read asks for the saved Project Report and the durable engineering result', () => {
  expect(HOOK).toContain('::project');
  expect(HOOK).not.toMatch(/::visual|::technical/);
  expect(HOOK).toContain('fetchDurablePublication');
  expect(HOOK).toContain('readProjectAnalysisCacheRecord');
  expect(HOOK).toContain('resolveVersionReadinessRow');
  expect(HOOK).toContain('savedProjectReport');
  expect(HOOK).not.toContain('savedTechnicalReport');
});

test('the table states one report row and one action, and carries the proposal context', () => {
  expect(TABLE).toContain('READINESS_REPORT_LABEL');
  expect(TABLE).toContain('buildProjectReportAction({');
  expect(TABLE).toContain('withProposalContext(action.url)');
  expect(TABLE).not.toMatch(/RP22Report|Visual Report|Technical Report/);
  expect(TABLE).toContain('data-version-readiness-table');
});

/* ── Server-side authority ────────────────────────────────────────────── */

test('the server blocks generation on the same rule and names the blocked version', () => {
  expect(GENERATE).toContain('Create the Project Report for every selected version before creating a proposal.');
  expect(GENERATE).toContain('resolveProposalReadinessGate({ rows: readinessRows, minVersions: 1 })');
  expect(GENERATE).toContain('source_blockers');
  expect(GENERATE).toContain('version_name: row.versionName');
  expect(GENERATE).toMatch(/\{ status: 409 \}/);
  // The server reads the version's canonical saved Project Report, and the
  // retired reports are never consulted for readiness.
  expect(GENERATE).toContain('savedProjectReport');
  expect(GENERATE).not.toContain('savedTechnicalReport');
});