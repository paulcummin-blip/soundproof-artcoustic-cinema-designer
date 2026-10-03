/**
 * ProposalPackDocument
 * --------------------
 * The client specification pack: the cover, the designed front pages, the
 * narrative sections with their evidence blocks, the highlights page, the
 * project images and the method notes.
 *
 * Composition rules:
 *   - the report's own section set is the structure authority: one page per
 *     section type, in report order, so a duplicated or legacy section can
 *     never print twice.
 *   - the designed front pages (at a glance, the room and the brief, method) and
 *     the method notes are built from the frozen engineering snapshot and fixed
 *     approved copy. They are not AI-written.
 *   - every page is numbered, and every page starts on its own page when
 *     printed.
 *
 * Pure presentation: nothing here calculates, grades or rewrites a result.
 */

import React from 'react';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import ProjectImagesBlock, { projectGalleryImages } from '@/components/proposal/ProjectImagesBlock';
import AtAGlancePage from '@/components/proposal/print/AtAGlancePage';
import RoomAndBriefPage from '@/components/proposal/print/RoomAndBriefPage';
import MethodPage from '@/components/proposal/print/MethodPage';
import AppendixPage from '@/components/proposal/print/AppendixPage';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalMetricCards from '@/components/proposal/print/ProposalMetricCards';
import ProposalPackStyles from '@/components/proposal/print/ProposalPackStyles';
import {
  buildAtAGlanceCards,
  buildEvidenceCards,
  buildRoomBriefFacts,
  statementValue,
} from '@/components/proposal/print/proposalPackAuthority';
import { getSectionsForProposalType } from '@/components/proposal/proposalSections';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';

const STRUCTURE_SECTIONS = new Set(['spatial_resolution', 'dynamic_range', 'timbre_matching']);

export default function ProposalPackDocument({
  proposal,
  projectName,
  dealerName,
  projectReference,
  coverImageUrl,
  heroImageUrl,
  logoUrl,
  sections,
  projectImages = [],
}) {
  const snapshot = proposal?.engineering_snapshot || null;
  const reportType = proposal?.proposal_type;
  const reportTypeLabel = getProposalTypeLabel(reportType);
  const generatedDate = proposal?.proposal_date || proposal?.created_date;
  const clientName = statementValue(snapshot?.project?.client_name) || null;
  const isDesignedPack = reportType !== 'single';

  // One stored section per type: the first wins, so nothing prints twice.
  const byType = new Map();
  (sections || [])
    .filter((section) => section.is_enabled !== false)
    .forEach((section) => {
      if (!byType.has(section.section_type)) byType.set(section.section_type, section);
    });

  const canonical = getSectionsForProposalType(reportType);
  const glanceCards = isDesignedPack
    ? buildAtAGlanceCards({ snapshot, projectName, dealerName, projectReference, generatedDate })
    : [];
  const { facts, products } = isDesignedPack
    ? buildRoomBriefFacts(snapshot)
    : { facts: [], products: [] };
  const gallery = projectGalleryImages(projectImages);
  const editorialImageUrl = gallery[0]?.asset?.file_url || null;
  const hasImagesSection = canonical.some((def) => def.type === 'room_images');

  // Page order, with the numbers assigned as the pages are composed.
  let number = 1;
  const takeNumber = () => String((number += 1)).padStart(2, '0');

  const pages = [];

  if (glanceCards.length > 0) {
    pages.push(
      <AtAGlancePage
        key="glance"
        number={takeNumber()}
        snapshot={snapshot}
        projectName={projectName}
        dealerName={dealerName}
        projectReference={projectReference}
        generatedDate={generatedDate}
      />
    );
  }

  if (facts.length > 0 || products.length > 0) {
    pages.push(
      <RoomAndBriefPage
        key="room"
        number={takeNumber()}
        snapshot={snapshot}
        editorialImageUrl={editorialImageUrl}
      />
    );
  }

  if (isDesignedPack) {
    pages.push(<MethodPage key="method" number={takeNumber()} />);
  }

  canonical
    .filter((def) => def.type !== 'cover')
    .forEach((def) => {
      const section = byType.get(def.type);
      if (!section) return;
      const title = section.title || def.title;
      const body = prepareSectionBody(section.body, {
        title,
        sectionType: section.section_type,
      });

      if (section.section_type === 'room_images') {
        pages.push(
          <section key={section.id} className="proposal-print-section pp-page pp-page--images">
            <ProposalPageHeader number={takeNumber()} kicker="Visualisation" title={title} />
            <ProjectImagesBlock images={projectImages} />
          </section>
        );
        return;
      }

      if (section.section_type === 'key_performance_highlights') {
        const isComparison = Array.isArray(section.metadata?.comparison_rows)
          && section.metadata.comparison_rows.length > 0;
        pages.push(
          <section
            key={section.id}
            className="proposal-print-section pp-page pp-page--highlights proposal-print-section--highlights"
          >
            <ProposalPageHeader
              number={takeNumber()}
              kicker="Evidence"
              title={isComparison ? 'System comparison' : title}
            />
            {body ? (
              <div className="pp-body" dangerouslySetInnerHTML={{ __html: body }} />
            ) : null}
            <KeyPerformanceHighlightsTable
              rows={section.metadata?.highlight_rows}
              comparisonRows={section.metadata?.comparison_rows}
              comparisonVersions={section.metadata?.comparison_versions}
            />
          </section>
        );
        return;
      }

      const evidence = STRUCTURE_SECTIONS.has(section.section_type)
        ? buildEvidenceCards(section.metadata?.highlight_rows, section.section_type)
        : [];

      pages.push(
        <section
          key={section.id}
          className={`proposal-print-section pp-page pp-page--${section.section_type}`}
        >
          <ProposalPageHeader number={takeNumber()} kicker="Design" title={title} />
          {body ? (
            <div className="pp-body" dangerouslySetInnerHTML={{ __html: body }} />
          ) : null}
          {evidence.length > 0 ? <ProposalMetricCards cards={evidence} /> : null}
        </section>
      );
    });

  const hasAppendixSection = canonical.some((def) => def.type === 'appendix');
  if (isDesignedPack && !hasAppendixSection) {
    pages.push(<AppendixPage key="appendix" number={takeNumber()} />);
  }

  return (
    <div className="proposal-print-portal">
      <ProposalPackStyles />

      <div className="proposal-print-cover">
        <ProposalCoverPage
          projectName={projectName}
          clientName={clientName}
          dealerName={dealerName}
          projectReference={projectReference}
          reportTypeLabel={reportTypeLabel}
          coverImageUrl={coverImageUrl}
          heroImageUrl={heroImageUrl}
          logoUrl={logoUrl}
          generatedDate={generatedDate}
        />
      </div>

      {pages}
    </div>
  );
}