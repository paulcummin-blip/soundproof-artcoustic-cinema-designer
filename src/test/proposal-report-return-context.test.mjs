// proposal-report-return-context.test.mjs
// ---------------------------------------
// The contextual route back from a generated report to the proposal workflow.
//
//   Proposal Centre → Visual / Technical Report → "Back to Proposal"
//
// Product rules pinned here:
//   • the way back appears only when the report was opened from the proposal
//     workflow (?from=proposal) — never for a report opened from the project;
//   • it returns to the proposal flow, never to an arbitrary or external URL;
//   • the context survives a Visual ↔ Technical move;
//   • it is app navigation only, so it never reaches a downloaded PDF;
//   • nothing about report content, report generation or proposal generation changes.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import {
  BACK_TO_PROPOSAL_LABEL,
  PROPOSAL_CENTRE_ROUTE,
  isProposalReturnPath,
  isSafeInternalPath,
  readProposalContext,
  resolveProposalReturnUrl,
  withProposalContext,
} from '../components/report/proposalReportContext.js';
import { resolveReportActionRows } from '../components/proposal/sourceAuthority/proposalReportActions.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const LINK = read('src/components/report/BackToProposalLink.jsx');
const VISUAL_PAGE = read('src/pages/RP22ClientReport.jsx');
const TECH_HEADER = read('src/components/report/ReportHeader.jsx');
const TECH_PAGE = read('src/pages/RP22Report.jsx');
const REVIEW_ACTIONS = read('src/components/designreview/DesignReviewActions.jsx');
const SOURCE_PANEL = read('src/components/proposal/sourceAuthority/ProposalSourcePanel.jsx');
const WIZARD_GATE = read('src/components/proposal/wizard/ReportReadinessGate.jsx');
const SOURCE_AUTHORITY = read('src/components/proposal/sourceAuthority/proposalSourceAuthority.js');
const REPORT_ACTIONS = read('src/components/proposal/sourceAuthority/proposalReportActions.js');

/* ── Context detection ────────────────────────────────────────────────── */

test('the way back is offered only for a report opened from the proposal workflow', () => {
  const fromProposal = readProposalContext('?from=proposal&projectId=p1');
  expect(fromProposal.active).toBe(true);

  // Opened from the project flow: no proposal context at all.
  expect(readProposalContext('?projectId=p1').active).toBe(false);
  expect(readProposalContext('').active).toBe(false);
  expect(readProposalContext(null).active).toBe(false);
  // Any other origin value is not the proposal workflow.
  expect(readProposalContext('?from=report').active).toBe(false);
});

test('an inactive context carries no proposal id or return path', () => {
  const context = readProposalContext('?projectId=p1&proposalId=prop-9&returnTo=/ProposalEditor');
  expect(context).toEqual({ active: false, proposalId: null, returnTo: null });
});

/* ── Return target ────────────────────────────────────────────────────── */

test('the way back lands on the proposal flow', () => {
  expect(resolveProposalReturnUrl({})).toBe(PROPOSAL_CENTRE_ROUTE);
  expect(resolveProposalReturnUrl({ proposalId: null, returnTo: null })).toBe(PROPOSAL_CENTRE_ROUTE);

  // A known proposal returns to that proposal.
  expect(resolveProposalReturnUrl({ proposalId: 'prop-9' })).toBe('/ProposalEditor?proposalId=prop-9');

  // An explicit safe path wins.
  expect(resolveProposalReturnUrl({ returnTo: '/ProposalCentre?step=2' })).toBe('/ProposalCentre?step=2');
});

test('the return target is never an arbitrary or external URL', () => {
  [
    'https://evil.example/steal',
    'http://evil.example',
    '//evil.example',
    'javascript:alert(1)',
    '/ProposalCentre\\..\\evil',
    ' /ProposalCentre',
    '/RoomDesigner?projectId=p1',
    'ProposalCentre',
  ].forEach((bad) => {
    expect(isProposalReturnPath(bad)).toBe(false);
    expect(resolveProposalReturnUrl({ returnTo: bad })).toBe(PROPOSAL_CENTRE_ROUTE);
  });

  expect(isSafeInternalPath('/ProposalCentre')).toBe(true);
  expect(isProposalReturnPath('/proposal/abc123')).toBe(true);
});

test('an unsafe return path is dropped as the URL is read', () => {
  const context = readProposalContext('?from=proposal&returnTo=https%3A%2F%2Fevil.example');
  expect(context.active).toBe(true);
  expect(context.returnTo).toBeNull();
  expect(resolveProposalReturnUrl(context)).toBe(PROPOSAL_CENTRE_ROUTE);
});

/* ── Carrying the context ─────────────────────────────────────────────── */

test('proposal links mark the report they open', () => {
  expect(withProposalContext('/RP22Report?projectId=p1&versionId=v1'))
    .toBe('/RP22Report?projectId=p1&versionId=v1&from=proposal');
  expect(withProposalContext('/RP22ClientReport?projectId=p1'))
    .toBe('/RP22ClientReport?projectId=p1&from=proposal');
  // A route with no query is marked too.
  expect(withProposalContext('/RP22Report')).toBe('/RP22Report?from=proposal');
  expect(withProposalContext(null)).toBeNull();
});

test('a report-to-report move keeps the context, a project-flow move does not', () => {
  const inProposal = readProposalContext('?from=proposal&projectId=p1&proposalId=prop-9');
  expect(withProposalContext('/DesignReview?projectId=p1', inProposal))
    .toBe('/DesignReview?projectId=p1&from=proposal&proposalId=prop-9');

  // Opened from the project flow: the next report must stay clean.
  const fromProject = readProposalContext('?projectId=p1');
  expect(withProposalContext('/RP22ClientReport?projectId=p1', fromProject))
    .toBe('/RP22ClientReport?projectId=p1');
});

/* ── Wiring: every surface ────────────────────────────────────────────── */

test('Proposal Centre report links carry the proposal context', () => {
  expect(SOURCE_PANEL).toMatch(/withProposalContext\(row\.actionUrl\)/);
  expect(WIZARD_GATE).toMatch(/withProposalContext\(row\.actionUrl\)/);
});

test('the Visual Report shows the way back and preserves it when moving on', () => {
  expect(VISUAL_PAGE).toMatch(/<BackToProposalLink className="client-report-screen-only" \/>/);
  // The pairing hop is built by the shared report context authority, so the
  // proposal context rides along with the version being viewed and the Library
  // return — one builder, no hand-written URL to drop any of them.
  expect(VISUAL_PAGE).toMatch(/buildReportPairingUrl\(\{/);
  expect(VISUAL_PAGE).toMatch(/route: REPORT_ROUTE\.DESIGN_REVIEW/);
  expect(VISUAL_PAGE).toMatch(/versionId: viewedVersionId/);
  expect(VISUAL_PAGE).toMatch(/const currentProposalContext = \(\) => readProposalContext\(searchParams\);/);
});

test('the Technical Report shows the way back and preserves it when moving on', () => {
  expect(TECH_HEADER).toMatch(/<BackToProposalLink \/>/);
  // The header's own Visual hop goes through the same authority, so it carries
  // the version being viewed rather than the designer's loaded version.
  expect(TECH_HEADER).toMatch(/buildReportPairingUrl\(\{/);
  expect(TECH_HEADER).toMatch(/route: REPORT_ROUTE\.VISUAL/);
  expect(TECH_HEADER).toMatch(/versionId: readRequestedVersionId\(searchParams\)/);
  expect(TECH_HEADER).toMatch(/proposalContext: readProposalContext\(searchParams\)/);
  // and it is the header the Technical Report page renders
  expect(TECH_PAGE).toMatch(/<ReportHeader/);
});

test('the Design Review carries the context between the two reports', () => {
  expect(REVIEW_ACTIONS).toMatch(/<BackToProposalLink \/>/);
  // Both hops — back to the Visual, and the Technical PDF — go through the shared
  // pairing authority for the version the Design Review was opened for.
  expect(REVIEW_ACTIONS).toMatch(/route: REPORT_ROUTE\.VISUAL/);
  expect(REVIEW_ACTIONS).toMatch(/route: REPORT_ROUTE\.TECHNICAL/);
  expect(REVIEW_ACTIONS).toMatch(/extraParams: \{ autoPrint: '1' \}/);
  expect(REVIEW_ACTIONS).toMatch(/proposalContext: currentProposalContext\(\)/);
});

/* ── App navigation only ──────────────────────────────────────────────── */

test('the way back is screen navigation, never part of an exported PDF', () => {
  expect(LINK).toMatch(/className\?: string|className/);
  // The Technical Report renders its header inside the screen-only layer…
  expect(TECH_PAGE.indexOf('<div className="screen-only">')).toBeGreaterThan(-1);
  expect(TECH_PAGE.indexOf('<div className="screen-only">')).toBeLessThan(TECH_PAGE.indexOf('<ReportHeader'));
  // …and the Visual Report hides it with its own screen-only class.
  expect(VISUAL_PAGE).toMatch(/<BackToProposalLink className="client-report-screen-only" \/>/);
  expect(read('src/components/report/client/ClientReportPrintStyles.jsx'))
    .toMatch(/\.client-report-screen-only\s*\{\s*display: none !important;/);
  expect(read('src/components/report/ReportPrintStyles.jsx')).toMatch(/\.screen-only,/);
});

test('the label is the product wording', () => {
  expect(BACK_TO_PROPOSAL_LABEL).toBe('Back to Proposal');
  expect(LINK).toMatch(/\{BACK_TO_PROPOSAL_LABEL\}/);
});

/* ── Nothing else changes ─────────────────────────────────────────────── */

test('the proposal report links are unchanged until a proposal surface marks them', () => {
  const rows = resolveReportActionRows({
    reports: {
      visual: { report: 'visual', label: 'Visual Report', state: 'current', route: '/RP22ClientReport' },
      technical: { report: 'technical', label: 'Technical Report', state: 'current', route: '/RP22Report' },
    },
    projectId: 'p1',
    versionId: 'v1',
  });

  // The action state itself is untouched — no report-context vocabulary leaks in.
  expect(rows.map((r) => r.actionUrl)).toEqual([
    '/RP22ClientReport?projectId=p1&versionId=v1',
    '/RP22Report?projectId=p1&versionId=v1',
  ]);
  expect(rows.every((r) => r.actionLabel.startsWith('Generate '))).toBe(true);
  expect(REPORT_ACTIONS).not.toMatch(/from=proposal|proposalReportContext/);
  expect(SOURCE_AUTHORITY).not.toMatch(/from=proposal|proposalReportContext/);
});