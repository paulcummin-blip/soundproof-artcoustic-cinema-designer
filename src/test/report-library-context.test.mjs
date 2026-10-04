/**
 * Project Library version context across report navigation.
 *
 * Contract:
 *   - A report opened from the Library carries projectId, versionId,
 *     source=library and returnTo=project-library.
 *   - Every cross-report hop carries the same versionId.
 *   - The report's requested version is the authority; the loaded Room Designer
 *     version is only a fallback when nothing was requested.
 *   - "Back to Project Library" is only offered when the Library context exists.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BACK_TO_PROJECT_LIBRARY_LABEL,
  PROJECT_LIBRARY_ROUTE,
  REPORT_ROUTE,
  buildLibraryReportActionUrl,
  buildReportPairingUrl,
  readLibraryContext,
  resolveLibraryReturnUrl,
  withLibraryContext,
} from '../components/report/reportLibraryContext.js';
import {
  readRequestedVersionId,
  resolveReportVersionId,
} from '../components/report/reportVersionRequest.js';
import { readProposalContext } from '../components/report/proposalReportContext.js';

const read = (path) => fs.readFileSync(path, 'utf8');

const PROJECT = 'project-1';
const VERSION_4 = 'version-level-4';
const VERSION_1 = 'version-level-1';

const params = (url) => new URLSearchParams(url.split('?')[1] || '');

test('the Library context is read only when both markers are present', () => {
  assert.equal(readLibraryContext(`?projectId=${PROJECT}&versionId=${VERSION_4}&source=library&returnTo=project-library`).active, true);
  assert.equal(readLibraryContext(`?projectId=${PROJECT}&versionId=${VERSION_4}`).active, false);
  assert.equal(readLibraryContext('?source=library').active, false);
  assert.equal(readLibraryContext('').active, false);
});

test('a Library report action carries the row version and the Library context', () => {
  const url = buildLibraryReportActionUrl({
    route: REPORT_ROUTE.TECHNICAL,
    projectId: PROJECT,
    versionId: VERSION_4,
  });
  const p = params(url);

  assert.ok(url.startsWith(`${REPORT_ROUTE.TECHNICAL}?`), url);
  assert.equal(p.get('projectId'), PROJECT);
  assert.equal(p.get('versionId'), VERSION_4);
  assert.equal(p.get('source'), 'library');
  assert.equal(p.get('returnTo'), 'project-library');
  assert.equal(readLibraryContext(p).active, true);
  // The row's own version is what the report page resolves.
  assert.equal(readRequestedVersionId(p), VERSION_4);
});

test('the return route is the Generated Reports tab of the same version', () => {
  const url = resolveLibraryReturnUrl({ projectId: PROJECT, versionId: VERSION_4 });
  const p = params(url);

  assert.ok(url.startsWith(`${PROJECT_LIBRARY_ROUTE}?`), url);
  assert.equal(p.get('tab'), 'reports');
  assert.equal(p.get('projectId'), PROJECT);
  assert.equal(p.get('versionId'), VERSION_4);
  // Never an external or inherited path.
  assert.equal(url.includes('://'), false);
});

test('the pairing URL keeps the version through every hop', () => {
  const visualToTechnical = buildReportPairingUrl({
    route: REPORT_ROUTE.DESIGN_REVIEW,
    projectId: PROJECT,
    versionId: VERSION_4,
    libraryContext: { active: true },
    proposalContext: readProposalContext(''),
  });
  const technicalToVisual = buildReportPairingUrl({
    route: REPORT_ROUTE.VISUAL,
    projectId: PROJECT,
    versionId: VERSION_4,
    libraryContext: readLibraryContext(params(visualToTechnical)),
    proposalContext: readProposalContext(params(visualToTechnical)),
  });

  for (const url of [visualToTechnical, technicalToVisual]) {
    const p = params(url);
    assert.equal(p.get('projectId'), PROJECT);
    assert.equal(p.get('versionId'), VERSION_4);
    assert.equal(p.get('source'), 'library');
    assert.equal(p.get('returnTo'), 'project-library');
    // A report opened from the Library must not invent a proposal route.
    assert.equal(p.get('from'), null);
  }
});

test('the proposal context survives a report-to-report move, and nothing is invented without it', () => {
  const withProposal = buildReportPairingUrl({
    route: REPORT_ROUTE.DESIGN_REVIEW,
    projectId: PROJECT,
    versionId: VERSION_4,
    libraryContext: { active: true },
    proposalContext: { active: true, proposalId: 'proposal-9', returnTo: '/ProposalCentre' },
  });
  const p = params(withProposal);
  assert.equal(p.get('versionId'), VERSION_4);
  assert.equal(p.get('source'), 'library');
  assert.equal(p.get('from'), 'proposal');
  assert.equal(p.get('proposalId'), 'proposal-9');
});

test('the project-flow context adds no Library return', () => {
  const url = buildReportPairingUrl({
    route: REPORT_ROUTE.DESIGN_REVIEW,
    projectId: PROJECT,
    versionId: VERSION_1,
    libraryContext: readLibraryContext(''),
    proposalContext: readProposalContext(''),
  });
  const p = params(url);

  assert.equal(p.get('versionId'), VERSION_1);
  assert.equal(p.get('source'), null);
  assert.equal(p.get('returnTo'), null);
  assert.equal(withLibraryContext('/RP22Report?projectId=x', { active: false }), '/RP22Report?projectId=x');
  assert.equal(readLibraryContext(p).active, false);
  assert.equal(BACK_TO_PROJECT_LIBRARY_LABEL, 'Back to Project Library');
});

test('the requested version wins; the active version is only the fallback', () => {
  assert.equal(
    resolveReportVersionId({ requestedVersionId: VERSION_4, activeVersionId: VERSION_1 }),
    VERSION_4,
  );
  assert.equal(
    resolveReportVersionId({ requestedVersionId: null, activeVersionId: VERSION_1 }),
    VERSION_1,
  );
});

test('every report hop is built from the shared pairing authority', () => {
  // No surface may compose its own report-to-report URL: a hand-built link is
  // how the version gets dropped.
  for (const file of [
    'src/pages/RP22ClientReport.jsx',
    'src/components/designreview/DesignReviewActions.jsx',
    'src/components/report/TechnicalReportNavBar.jsx',
    'src/components/library/ProjectLibraryReportsSection.jsx',
  ]) {
    const source = read(file);
    assert.ok(
      source.includes('reportLibraryContext'),
      `${file} uses the shared report context authority`,
    );
  }
  // The Library's report rows open through the same authority.
  assert.ok(
    read('src/components/library/ProjectLibraryReportsSection.jsx').includes('buildLibraryReportActionUrl'),
    'the Library row opens the report with its own version and the Library context',
  );
});

test('the reports read their version from the request, never the loaded designer version', () => {
  // The Technical Report resolves the request itself.
  const technical = read('src/pages/RP22Report.jsx');
  assert.ok(technical.includes('readRequestedVersionId'), 'the Technical Report reads the requested version');
  assert.ok(technical.includes('resolveReportVersionId'), 'the Technical Report resolves it request-first');

  // The Visual Report hands the request to its authority, which resolves it the
  // same way — and is the version the report exports.
  const visual = read('src/pages/RP22ClientReport.jsx');
  assert.ok(visual.includes('readRequestedVersionId'), 'the Visual Report reads the requested version');
  assert.ok(
    visual.includes('useClientReportAuthority(projectId, requestedVersionId)'),
    'the Visual Report hands the request to its authority',
  );
  assert.ok(
    read('src/components/report/client/useClientReportAuthority.jsx').includes('resolveReportVersionId'),
    'the Visual Report authority resolves the request first',
  );

  // Design Review is the technical surface reached from the Visual Report, so
  // it must honour the requested version too, and hand it to its actions.
  const review = read('src/pages/DesignReviewPage.jsx');
  assert.ok(review.includes('readRequestedVersionId'), 'Design Review reads the requested version');
  assert.ok(review.includes('resolveReportVersionId'), 'Design Review resolves it request-first');
  assert.ok(
    review.includes('versionId={activeVersionId}'),
    'Design Review hands the resolved version to its report actions',
  );
});