// TEMPORARY DIAGNOSTIC — traces the failed proposal through the Proposal
// Editor's own load and render pipeline (pure helpers only, no SDK, no DOM).
import './_diag-env.mjs';
import { test, expect } from 'vitest';
import fs from 'node:fs';

import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { resolveCoverAsset, resolvePackImages } from '@/components/library/imageScopeAuthority';
import { resolveDealerBrandPresentation } from '@/components/account/defaultDealerBranding';
import { resolveDealerIdentityName } from '@/components/account/dealerIdentityDisplay';
import { resolveReportFilenameDetails } from '@/components/report/reportFilenameIdentity';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { isHighChannelDesign } from '@/components/proposal/highChannelLayoutAuthority';
import { compactViewingResult } from '@/components/proposal/print/snapshotViewingRows';
import { getSectionDef } from '@/components/proposal/proposalSections';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';
import { isArchived, getRestoreStatus } from '@/components/proposal/proposalLifecycle';
import { isManuallyEdited } from '@/components/proposal/proposalManualEdit';
import { excludeDesignIndexRows } from '@/components/proposal/designIndexRowAuthority';
import { buildHighlightDisplayRows } from '@/components/proposal/keyPerformanceHighlightsAuthority';
import { documentTypeForProposalType } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { proposalReportTypeToken } from '@/components/report/reportPdfTitle';
import { buildAtAGlance, buildEvidenceCards, statementValue } from '@/components/proposal/print/proposalPackAuthority';
import { imagePagesFor } from '@/components/proposal/print/imagePageLayout';

const fixture = JSON.parse(fs.readFileSync(new URL('./_failed-proposal-fixture.json', import.meta.url), 'utf8'));
const { proposal, sections, project } = fixture;

const steps = [];
const run = (name, fn) => {
  try {
    const value = fn();
    steps.push({ name, ok: true, note: String(value).slice(0, 90) });
    return value;
  } catch (error) {
    steps.push({ name, ok: false, error: `${error?.name}: ${error?.message}` });
    return null;
  }
};

test('the failed proposal loads through the editor pipeline', () => {
  run('proposalVersionIds', () => JSON.stringify(proposalVersionIds(proposal)));
  const versionIds = proposalVersionIds(proposal);

  run('resolveDealerBrandPresentation(null, account)', () => typeof resolveDealerBrandPresentation(null, proposal.account_id));
  run('resolveDealerIdentityName(null, null)', () => String(resolveDealerIdentityName(null, null)));
  run('resolveReportFilenameDetails(project, null)', () => JSON.stringify(resolveReportFilenameDetails(project, null)));
  run('resolveCoverAsset([])', () => JSON.stringify(resolveCoverAsset([], versionIds)));
  run('buildVersionNameMap([])', () => buildVersionNameMap([]).size);
  run('resolvePackImages([])', () => resolvePackImages({ assets: [], versionIds, versionNameById: new Map() }).length);
  run('getProposalTypeLabel', () => getProposalTypeLabel(proposal.proposal_type));
  run('isArchived / getRestoreStatus', () => `${isArchived(proposal.status)}/${getRestoreStatus(proposal.status, proposal.previous_status, false)}`);
  run('documentTypeForProposalType', () => documentTypeForProposalType(proposal.proposal_type));
  run('proposalReportTypeToken', () => proposalReportTypeToken(proposal.proposal_type));
  run('isHighChannelDesign(snapshot)', () => isHighChannelDesign(proposal.engineering_snapshot));
  run('compactViewingResult(snapshot)', () => compactViewingResult(proposal.engineering_snapshot));

  sections.forEach((section) => {
    run(`sectionDef:${section.section_type}`, () => getSectionDef(section.section_type)?.label || 'NO_DEF');
    run(`isManuallyEdited:${section.section_type}`, () => isManuallyEdited(section));
    if (section.section_type !== 'cover' && section.section_type !== 'room_images') {
      run(`prepareSectionBody:${section.section_type}`, () => prepareSectionBody(section.body, {
        title: section.title,
        sectionType: section.section_type,
        highChannel: isHighChannelDesign(proposal.engineering_snapshot),
      }).length);
    }
    if (section.section_type === 'key_performance_highlights') {
      run('excludeDesignIndexRows(null meta)', () => excludeDesignIndexRows(section.metadata?.comparison_rows).length);
      run('buildHighlightDisplayRows(undefined)', () => buildHighlightDisplayRows(section.metadata?.highlight_rows, {
        viewingResult: compactViewingResult(proposal.engineering_snapshot),
      }).length);
    }
  });

  run('imagePagesFor([])', () => imagePagesFor([]).length);
  const snapshot = proposal.engineering_snapshot;
  run('statementValue', () => statementValue(snapshot?.project?.client_name));
  run('buildAtAGlance', () => typeof buildAtAGlance(snapshot));
  run('buildEvidenceCards', () => typeof buildEvidenceCards(snapshot));

  const failed = steps.filter((step) => !step.ok);
  console.log(JSON.stringify({ total: steps.length, failed, steps }, null, 2));
  expect(failed).toEqual([]);
});