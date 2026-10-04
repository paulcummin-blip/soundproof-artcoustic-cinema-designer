// TEMPORARY DIAGNOSTIC — renders the Proposal Editor's own child components
// with the real stored proposal, to find the component that cannot render.
import './_diag-env.mjs';
import { test, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';

import ProposalSectionNav from '@/components/proposal/ProposalSectionNav';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import ProjectImagesBlock from '@/components/proposal/ProjectImagesBlock';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import ProposalWorkspaceToolbar from '@/components/proposal/ProposalWorkspaceToolbar';
import ProposalPackDocument from '@/components/proposal/print/ProposalPackDocument';
import ProposalSectionToolbar from '@/components/proposal/SectionToolbar';
import InlineRichTextEditor from '@/components/proposal/InlineRichTextEditor';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { isHighChannelDesign } from '@/components/proposal/highChannelLayoutAuthority';
import { compactViewingResult } from '@/components/proposal/print/snapshotViewingRows';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';

const fixture = JSON.parse(fs.readFileSync(new URL('./_failed-proposal-fixture.json', import.meta.url), 'utf8'));
const { proposal, sections, project } = fixture;

const results = [];
const render = (name, element) => {
  try {
    const html = renderToString(element);
    results.push({ name, ok: true, length: html.length });
  } catch (error) {
    results.push({ name, ok: false, error: `${error?.name}: ${error?.message}` });
  }
};

test('every Proposal Editor child renders with the stored proposal', () => {
  const highChannel = isHighChannelDesign(proposal.engineering_snapshot);
  const viewingResult = compactViewingResult(proposal.engineering_snapshot);
  const typeLabel = getProposalTypeLabel(proposal.proposal_type);

  render('ProposalWorkspaceToolbar', React.createElement(ProposalWorkspaceToolbar, {
    title: proposal.title,
    projectName: project?.name,
    typeLabel,
    showClientBrief: false,
    onToggleClientBrief: () => {},
    showProperties: false,
    onToggleProperties: () => {},
    exporting: false,
    onExport: () => {},
    blockedReason: null,
    error: null,
  }));

  render('ProposalSectionNav', React.createElement(ProposalSectionNav, {
    sections,
    activeSectionKey: sections[0]?.section_key,
    onSelect: () => {},
    onToggleVisibility: () => {},
    onReorder: () => {},
    readOnly: false,
  }));

  sections.forEach((section) => {
    if (section.section_type === 'key_performance_highlights') {
      render('KeyPerformanceHighlightsTable', React.createElement(KeyPerformanceHighlightsTable, {
        rows: section.metadata?.highlight_rows,
        comparisonRows: section.metadata?.comparison_rows,
        comparisonVersions: section.metadata?.comparison_versions,
        viewingResult,
      }));
    }
    if (section.section_type === 'room_images') {
      render('ProjectImagesBlock', React.createElement(ProjectImagesBlock, { images: [] }));
    }
    if (section.section_type === 'cover') {
      render('ProposalCoverPage', React.createElement(ProposalCoverPage, {
        projectName: project?.name || proposal.title,
        clientName: project?.client_name,
        versionNames: [],
        reportTypeLabel: typeLabel,
        dealerName: null,
        projectReference: project?.project_reference,
        coverImageUrl: null,
        heroImageUrl: null,
        logoUrl: null,
        generatedDate: proposal.proposal_date || proposal.created_date,
      }));
    }
    if (section.section_type !== 'cover' && section.section_type !== 'room_images') {
      render(`InlineRichTextEditor:${section.section_type}`, React.createElement(InlineRichTextEditor, {
        html: prepareSectionBody(section.body, {
          title: section.title,
          sectionType: section.section_type,
          highChannel,
        }),
        editable: false,
        saveStatus: 'idle',
      }));
      render(`SectionToolbar:${section.section_type}`, React.createElement(ProposalSectionToolbar, {
        section,
        onRegenerate: () => {},
        onToggleLock: () => {},
        onToggleNotes: () => {},
        isRegenerating: false,
        isEditing: false,
        isManuallyEdited: false,
        isSavingEdit: false,
        onStartEdit: () => {},
        onSaveEdit: () => {},
        onCancelEdit: () => {},
      }));
    }
  });

  render('ProposalPackDocument', React.createElement(ProposalPackDocument, {
    proposal,
    projectName: project?.name || proposal.title,
    dealerName: null,
    projectReference: project?.project_reference,
    versionNames: [],
    coverImageUrl: null,
    heroImageUrl: null,
    logoUrl: null,
    sections,
    projectImages: [],
  }));

  const failed = results.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ total: results.length, failed, results }, null, 2));
  expect(failed).toEqual([]);
});