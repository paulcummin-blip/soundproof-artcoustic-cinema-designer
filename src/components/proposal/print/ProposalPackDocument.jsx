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
 *   - the designed front pages (at a glance, method) and the method notes are
 *     built from the frozen engineering snapshot and fixed approved copy. They
 *     are not AI-written.
 *   - every page is numbered, and every page starts on its own page when
 *     printed.
 *
 * Pure presentation: nothing here calculates, grades or rewrites a result.
 */

import React from 'react';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import ProjectImagesBlock, { projectGalleryImages } from '@/components/proposal/ProjectImagesBlock';
import ProjectImagesPage from '@/components/proposal/print/ProjectImagesPage';
import { imagePagesFor } from '@/components/proposal/print/imagePageLayout';
import AtAGlancePage from '@/components/proposal/print/AtAGlancePage';
import MethodPage from '@/components/proposal/print/MethodPage';
import AppendixPage from '@/components/proposal/print/AppendixPage';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalMetricCards from '@/components/proposal/print/ProposalMetricCards';
import ProposalPackStyles from '@/components/proposal/print/ProposalPackStyles';
import {
  buildAtAGlance,
  buildEvidenceCards,
  statementValue,
} from '@/components/proposal/print/proposalPackAuthority';
import { getSectionsForProposalType } from '@/components/proposal/proposalSections';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';
import { isHighChannelDesign } from '@/components/proposal/highChannelLayoutAuthority';
import { compactViewingResult } from '@/components/proposal/print/snapshotViewingRows';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';

const STRUCTURE_SECTIONS = new Set(['spatial_resolution', 'dynamic_range', 'timbre_matching']);

export default function ProposalPackDocument({
  proposal,
  projectName,
  dealerName,
  projectReference,
  // The exact saved names of the versions this document was built from: one name
  // for a single-version document, every name for a comparison.
  versionNames = [],
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
  // A high-channel-count design (9.1.6, or 15 or more discrete channels) never
  // prints an added-speaker or spacing upgrade: a report generated before that
  // rule existed is cleaned on the way to the page.
  const highChannel = isHighChannelDesign(snapshot);
  // The viewing geometry the table states in one line, taken from the published
  // per-seat angles. Null when the snapshot carries none: the stored result is
  // printed instead.
  const viewingResult = compactViewingResult(snapshot);

  // One stored section per type: the first wins, so nothing prints twice.
  const byType = new Map();
  (sections || [])
    .filter((section) => section.is_enabled !== false)
    .forEach((section) => {
      if (!byType.has(section.section_type)) byType.set(section.section_type, section);
    });

  const canonical = getSectionsForProposalType(reportType);
  const glance = isDesignedPack
    ? buildAtAGlance({ snapshot, projectName, projectReference, generatedDate })
    : { projectCards: [], roomCards: [], systemCards: [], packageRows: [] };
  const gallery = projectGalleryImages(projectImages);
  const hasImagesSection = canonical.some((def) => def.type === 'room_images');

  // Page order, with the numbers assigned as the pages are composed.
  let number = 1;
  const takeNumber = () => String((number += 1)).padStart(2, '0');

  const pages = [];

  // One page carries the project, the room and the brief: no second page
  // restates the same facts.
  const hasGlanceContent = glance.projectCards.length > 0
    || glance.roomCards.length > 0
    || glance.systemCards.length > 0
    || glance.packageRows.length > 0;

  if (hasGlanceContent) {
    pages.push(
      <AtAGlancePage
        key="glance"
        number={takeNumber()}
        snapshot={snapshot}
        projectName={projectName}
        projectReference={projectReference}
        generatedDate={generatedDate}
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
        // The printed page is prose only outside the single evidence table: a
        // highlight list inside a section is repetition of that table.
        proseOnly: true,
        highChannel,
      });

      if (section.section_type === 'room_images') {
        // Image-led: one image page per group of images, so four or more images
        // become further image pages instead of shrinking everything to fit.
        const imagePages = imagePagesFor(gallery.map(({ asset }) => asset));
        if (imagePages.length === 0) {
          pages.push(
            <section key={section.id} className="proposal-print-section pp-page pp-page--images">
              <ProposalPageHeader number={takeNumber()} kicker="Visualisation" title={title} />
              <ProjectImagesBlock images={projectImages} />
            </section>
          );
          return;
        }
        imagePages.forEach((pageImages, index) => {
          pages.push(
            <ProjectImagesPage
              key={`${section.id}:${index}`}
              number={takeNumber()}
              title={title}
              images={pageImages}
            />
          );
        });
        return;
      }

      if (section.section_type === 'key_performance_highlights') {
        // A comparison report's highlights page is its comparison table. A
        // report generated before the table travelled with the section still
        // says so on the page rather than printing a heading over nothing.
        const isComparisonKind = proposal?.proposal_type === 'comparison';
        const isComparison = isComparisonKind
          && Array.isArray(section.metadata?.comparison_rows)
          && section.metadata.comparison_rows.length > 0;
        // The heading, the table header, every row and the footnote are one
        // indivisible printed block on one page. The section carries no
        // introduction of its own: the table is self-explanatory, and an
        // introduction is exactly what pushed the table onto the page after its
        // own title.
        pages.push(
          <section
            key={section.id}
            className="proposal-print-section pp-page pp-page--highlights proposal-print-section--highlights"
          >
            <ProposalPageHeader
              number={takeNumber()}
              kicker="Evidence"
              title={isComparisonKind ? 'System comparison' : title}
            />
            <KeyPerformanceHighlightsTable
              rows={section.metadata?.highlight_rows}
              comparisonRows={section.metadata?.comparison_rows}
              comparisonVersions={section.metadata?.comparison_versions}
              comparisonExpected={isComparisonKind}
              viewingResult={isComparison ? null : viewingResult}
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
          versionNames={versionNames}
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