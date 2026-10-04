// proposal-source-authority.test.mjs
// ---------------------------------
// Guards the proposal source authority: a proposal is downstream of the
// generated Visual and Technical Reports, and is blocked without them.
//
//   No current Visual Report + current Technical Report = no proposal.
//
// Covers the state derivation, the blocking message and actions, identity and
// staleness detection, the builder gate, the server-side guard, the prompt's
// report-only instruction and the Project Images identity line.
//
// Run: node --import ./test/_alias-register.mjs test/proposal-source-authority.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROPOSAL_SOURCE_STATE,
  PROPOSAL_SOURCE_REQUIRED_MESSAGE,
  PROPOSAL_SOURCE_RULE,
  PROPOSAL_SOURCE_TITLE,
  PROPOSAL_SOURCE_REPORT_ROUTE,
  describeSourceState,
  verifySourceIdentity,
  resolveReportSourceState,
  resolveProposalSource,
  buildReportActionUrl,
} from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readRoot = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const WIZARD = read('components/proposal/CreateProposalWizard.jsx');
const CENTRE = read('pages/ProposalCentre.jsx');
const PANEL = read('components/proposal/sourceAuthority/ProposalSourcePanel.jsx');
const HOOK = read('components/proposal/sourceAuthority/useProposalSourceStatus.js');
const IDENTITY_LINE = read('components/projects/ProjectVersionIdentityLine.jsx');
const ASSETS_PAGE = read('pages/ProjectProposalAssets.jsx');
const GENERATE = readRoot('base44/functions/generateProposal/entry.ts');

const READY_SOURCE = {
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'Original Design',
  hasSource: true,
  reportGeneratedAt: '2026-10-01T09:00:00.000Z',
  sourceFingerprint: 'eng:v1:abc',
};

/* ── State derivation ─────────────────────────────────────────────────── */

test('a report with no source is missing; a superseded one is stale', () => {
  assert.equal(resolveReportSourceState({ hasSource: false }), PROPOSAL_SOURCE_STATE.MISSING);
  assert.equal(resolveReportSourceState({ hasSource: true }), PROPOSAL_SOURCE_STATE.CURRENT);
  assert.equal(
    resolveReportSourceState({ hasSource: true, designMovedOn: true }),
    PROPOSAL_SOURCE_STATE.STALE,
    'the design changed since the report was generated',
  );
  assert.equal(
    resolveReportSourceState({ hasSource: true, recalculationPending: true }),
    PROPOSAL_SOURCE_STATE.STALE,
    'a recalculation is in flight',
  );
  assert.equal(
    resolveReportSourceState({ hasSource: true, identityVerified: false }),
    PROPOSAL_SOURCE_STATE.STALE,
    'generated for another project or version',
  );
  assert.equal(
    resolveReportSourceState({ hasSource: true, unavailable: true }),
    PROPOSAL_SOURCE_STATE.FAILED,
  );
});

test('the status vocabulary is the client-facing one', () => {
  assert.equal(describeSourceState(PROPOSAL_SOURCE_STATE.CURRENT), 'Current');
  assert.equal(describeSourceState(PROPOSAL_SOURCE_STATE.MISSING), 'Missing');
  assert.equal(describeSourceState(PROPOSAL_SOURCE_STATE.STALE), 'Stale');
  assert.equal(PROPOSAL_SOURCE_TITLE, 'Proposal Source Data');
  assert.equal(PROPOSAL_SOURCE_RULE, 'No current Visual Report + current Technical Report = no proposal.');
});

/* ── Blocking ─────────────────────────────────────────────────────────── */

test('proposal blocked without a Visual Report', () => {
  const source = resolveProposalSource({ projectId: 'p1', versionId: 'v1', hasSource: false });
  assert.equal(source.ready, false);
  assert.equal(source.reports.visual.status, 'Missing');
  assert.equal(source.reports.visual.action, 'Generate Visual Report');
  assert.equal(source.reports.technical.status, 'Missing');
  assert.equal(source.message, PROPOSAL_SOURCE_REQUIRED_MESSAGE);
  assert.equal(
    source.message,
    'Generate the Visual and Technical Reports before creating a proposal. This ensures the proposal uses the current project data and RP22 results.',
  );
});

test('proposal blocked without a Technical Report', () => {
  const source = resolveProposalSource({ projectId: 'p1', versionId: 'v1', hasSource: false });
  assert.equal(source.ready, false);
  assert.equal(source.reports.technical.action, 'Generate Technical Report');
  assert.deepEqual(
    source.blockers.map((blocker) => blocker.label),
    ['Visual Report', 'Technical Report'],
  );
  assert.deepEqual(
    source.blockers.map((blocker) => blocker.route),
    [PROPOSAL_SOURCE_REPORT_ROUTE.visual, PROPOSAL_SOURCE_REPORT_ROUTE.technical],
  );
});

test('a stale report is reported as stale and offers regeneration', () => {
  const source = resolveProposalSource({ ...READY_SOURCE, designMovedOn: true });
  assert.equal(source.ready, false);
  assert.equal(source.state, PROPOSAL_SOURCE_STATE.STALE);
  assert.equal(source.reports.visual.status, 'Stale');
  assert.equal(source.reports.visual.action, 'Regenerate Visual Report');
  assert.equal(source.reports.technical.action, 'Regenerate Technical Report');
  assert.match(source.reports.visual.reason, /earlier design/);
});

test('project and version fingerprint checks are explicit', () => {
  const wrongProject = verifySourceIdentity({
    projectId: 'p1', versionId: 'v1', sourceProjectId: 'p2', sourceVersionId: 'v1',
  });
  assert.equal(wrongProject.ok, false);
  assert.deepEqual(wrongProject.mismatches, ['project']);

  const wrongVersion = verifySourceIdentity({
    projectId: 'p1', versionId: 'v1', sourceProjectId: 'p1', sourceVersionId: 'v2',
  });
  assert.equal(wrongVersion.ok, false);
  assert.deepEqual(wrongVersion.mismatches, ['version']);

  const matched = verifySourceIdentity({
    projectId: 'p1', versionId: 'v1', sourceProjectId: 'p1', sourceVersionId: 'v1',
  });
  assert.equal(matched.ok, true);

  // A source generated for another version must never be used.
  const source = resolveProposalSource({
    projectId: 'p1',
    versionId: 'v1',
    hasSource: true,
    identityVerified: wrongVersion.ok,
    identityMismatches: wrongVersion.mismatches,
  });
  assert.equal(source.ready, false);
  assert.equal(source.state, PROPOSAL_SOURCE_STATE.STALE);
  assert.match(source.reports.visual.reason, /different project or version/);
});

test('both reports current allows generation and names the source', () => {
  const source = resolveProposalSource(READY_SOURCE);
  assert.equal(source.ready, true);
  assert.deepEqual(source.blockers, []);
  assert.equal(source.message, null);
  assert.equal(source.reports.visual.status, 'Current');
  assert.equal(source.reports.technical.status, 'Current');
  assert.equal(source.versionName, 'Original Design');
  assert.equal(source.reportGeneratedAt, READY_SOURCE.reportGeneratedAt);
});

test('the action URL carries the exact project and version', () => {
  const url = buildReportActionUrl({
    route: PROPOSAL_SOURCE_REPORT_ROUTE.visual,
    projectId: 'p1',
    versionId: 'v1',
  });
  assert.equal(url, '/RP22ClientReport?projectId=p1&versionId=v1');
});

/* ── Wiring ───────────────────────────────────────────────────────────── */

test('the proposal builder blocks generation on the shared readiness result', () => {
  // ONE authority: the wizard consults the per-version readiness result and
  // nothing else. The legacy source boolean is gone — it is what allowed the
  // panel to read Current while the button said the reports were missing.
  assert.match(WIZARD, /useProposalReadiness\(\{/, 'the shared readiness is resolved');
  assert.equal(WIZARD.includes('useProposalSourceStatus'), false, 'no second source gate is consulted');
  assert.equal(WIZARD.includes('sourceReady'), false, 'no separate report-ready boolean exists');
  assert.match(WIZARD, /<VersionReadinessTable[\s\S]*gate=\{readiness\}/, 'the same per-version readiness result is shown on the review step');
  assert.match(WIZARD, /if \(!readiness\.ready\) \{[\s\S]{0,140}?return readiness\.message/, 'the same readiness result is one of the named reasons Generate is blocked');
  assert.match(WIZARD, /disabled=\{!!generateBlockReason\}/, 'the Generate button is disabled until every selected version is current');
  assert.match(WIZARD, /written from the current Visual and Technical Report data/);
});

test('Proposal Centre stays passive until the proposal wizard owns source readiness', () => {
  assert.doesNotMatch(CENTRE, /useProposalSourceStatus/);
  assert.doesNotMatch(CENTRE, /ProposalSourcePanel/);
  assert.doesNotMatch(CENTRE, /useActiveProjectId/);
  assert.match(CENTRE, /CreateProposalWizard/);
});

test('the panel shows both reports, the version and the generation time', () => {
  assert.match(PANEL, /PROPOSAL_SOURCE_TITLE/);
  assert.match(PANEL, /resolveReportActionRows\(\{/);
  assert.match(PANEL, /reports: status\.reports \|\| \{\}/);
  assert.match(PANEL, /rows\.map\(\(row\)/);
  assert.match(PANEL, /Project Version/);
  assert.match(PANEL, /Last generated/);
  assert.match(PANEL, /status\.message/, 'the required action is shown');
  assert.match(PANEL, /href=\{withProposalContext\(row\.actionUrl\)\}/, 'the resolved action opens the report that must be generated');
});

test('the source status reads the durable report authority, not a parallel one', () => {
  assert.match(HOOK, /useVersionedEngineeringAuthority\(projectId, versionId\)/);
  assert.match(HOOK, /readSeatPriorityFingerprint/);
  assert.match(HOOK, /readBassPendingIndicator/);
  assert.match(HOOK, /authority\.version\?\.published_fingerprint/, 'the publication pointer detects a stale report');
});

test('Project Images shows Project, Client, Reference and Version — and no dealer field', () => {
  assert.match(ASSETS_PAGE, /<ProjectVersionIdentityLine/);
  assert.match(IDENTITY_LINE, /label="Project"/);
  assert.match(IDENTITY_LINE, /label="Client"/);
  assert.match(IDENTITY_LINE, /label="Reference"/);
  assert.match(IDENTITY_LINE, /label="Version"/);
  assert.doesNotMatch(IDENTITY_LINE, /label="Dealer"/i, 'no dealer label on this identity line');
  assert.doesNotMatch(IDENTITY_LINE, /dealerName|dealer_name|dealer_account/i, 'no dealer field on this identity line');
});

/* ── Server-side authority ────────────────────────────────────────────── */

test('the server blocks generation without a current report source', () => {
  assert.ok(
    GENERATE.includes(PROPOSAL_SOURCE_REQUIRED_MESSAGE),
    'the blocking message matches the client authority word for word',
  );
  assert.match(GENERATE, /loadCacheRecord\(base44, project_id, versionId\)/);
  assert.match(GENERATE, /findPublication\(cacheRecord, pointer\)/);
  assert.match(GENERATE, /source_blockers/);
  assert.match(GENERATE, /\{ status: 409 \}/, 'blocked, not generated');
});

test('the AI prompt is given the report identity and report-only facts', () => {
  assert.match(GENERATE, /Use only the supplied report data for project facts\./);
  assert.match(GENERATE, /Report project id: \$\{sourceIdentity\?\.project_id/);
  assert.match(GENERATE, /Report version id: \$\{sourceIdentity\?\.version_id/);
  assert.match(GENERATE, /Report fingerprint: \$\{sourceIdentity\?\.engineering_fingerprint/);
  assert.match(GENERATE, /Reports generated: \$\{sourceIdentity\?\.published_at/);
  // Facts read from the report, never the legacy project row.
  assert.match(GENERATE, /const screenSize = snapshotRoom\.size_inches \?\? ''/);
  assert.match(GENERATE, /const aspectRatio = snapshotRoom\.aspect_ratio \|\| project\.aspect_ratio/);
  assert.match(GENERATE, /snapshotSystem\.channel_layout\?\.configuration_text/);
});