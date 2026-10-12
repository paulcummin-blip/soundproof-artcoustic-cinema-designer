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
import { resolveProposalComparison } from '@/components/proposal/comparisonDisplayAuthority';
import ComparisonEvidenceState from '@/components/proposal/ComparisonEvidenceState';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import ProjectImagesBlock from '@/components/proposal/ProjectImagesBlock';
import ProjectImagesPage from '@/components/proposal/print/ProjectImagesPage';
import { imagePagesFor } from '@/components/proposal/print/imagePageLayout';
import ProposalImagePlacement from '@/components/proposal/print/ProposalImagePlacement';
import ProposalImagePlacementStyles from '@/components/proposal/print/ProposalImagePlacementStyles';
import SeatingStylePage from '@/components/proposal/print/SeatingStylePage';
import ComparisonOptionsPage from '@/components/proposal/print/ComparisonOptionsPage';
import {
  SEATING_IMAGES_PER_PAGE,
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '@/components/proposal/images/proposalImagePlanner';
import { validateProposalImagePlan } from '@/components/proposal/images/proposalImagePlanValidator';
import { EDITORIAL_ROLE } from '@/components/proposal/images/proposalImagePlacementAuthority';
import AtAGlancePage from '@/components/proposal/print/AtAGlancePage';
import MethodPage from '@/components/proposal/print/MethodPage';
import DecisionSummaryPage from '@/components/proposal/print/DecisionSummaryPage';
import AppendixPage from '@/components/proposal/print/AppendixPage';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalMetricCards from '@/components/proposal/print/ProposalMetricCards';
import ProposalPackStyles from '@/components/proposal/print/ProposalPackStyles';
import {
  buildAtAGlance,
  buildEvidenceCards,
  statementValue,
} from '@/components/proposal/print/proposalPackAuthority';
import { getSectionsForProposalType, resolveSectionTitle } from '@/components/proposal/proposalSections';
import { orderPublicationSections, seatingPresentationTarget } from '@/components/proposal/publicationOrder';
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
  validatedOptionsCopy = '',
  projectImages = [],
  // A comparison saved before its comparison metadata was persisted: the table
  // rebuilt read-only from each version's own frozen engineering evidence.
  recoveredComparisonTable = null,
}) {
  const snapshot = proposal?.engineering_snapshot || null;
  const reportType = proposal?.proposal_type;
  const reportTypeLabel = getProposalTypeLabel(reportType);
  // Held across renders, so a placement rule that is broken is reported once
  // rather than on every re-render of the editor.
  const reportedPlanRef = React.useRef(null);
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

  // The document's own order authority, applied to the records this pack is given,
  // so the printed sequence can never be driven by an arbitrary read order.
  const orderedSections = orderPublicationSections({ sections: sections || [], proposalType: reportType });

  // One stored section per type: the first wins, so nothing prints twice.
  const byType = new Map();
  orderedSections
    .filter((section) => section.is_enabled !== false)
    .forEach((section) => {
      if (!byType.has(section.section_type)) byType.set(section.section_type, section);
    });

  const canonical = getSectionsForProposalType(reportType);
  // A comparison covers several versions, so its at-a-glance page is built from
  // the same calculated comparison rows the Key Differences table prints: one
  // block per selected version, never one version standing in for them all.
  const comparisonDisplay = resolveProposalComparison(proposal, sections, recoveredComparisonTable);
  const comparisonRows = reportType === 'comparison' ? comparisonDisplay.rows : null;
  const comparisonVersions = reportType === 'comparison' ? comparisonDisplay.versions : null;
  const hasComparisonGlance = Array.isArray(comparisonRows)
    && comparisonRows.length > 0
    && (Array.isArray(comparisonVersions) ? comparisonVersions : []).length >= 2;
  // Never print a single active-version glance or a blank Key Differences page.
  if (reportType === 'comparison' && !hasComparisonGlance) return <ComparisonEvidenceState />;
  const glance = isDesignedPack
    ? buildAtAGlance({ snapshot, projectName, projectReference, generatedDate })
    : { projectCards: [], roomCards: [], systemCards: [], packageRows: [] };
  const hasImagesSection = canonical.some((def) => def.type === 'room_images');

  // ── Editorial image placement ────────────────────────────────────────────
  // The document's images are planned before its pages are composed: the planner
  // decides which stored source carries which page, in which crop, and how far
  // apart a source may return. Presentation only — it reads the project's images
  // and the composed section order, it never reads an engineering value, and it
  // writes nothing.
  const imagePlan = planProposalImages({
    assets: projectImages,
    sectionSlots: composeSectionSlots({
      sections,
      sectionTypes: canonical.map((def) => def.type),
    }),
    coverAssetId: resolveCoverAssetId({ assets: projectImages, coverImageUrl }),
  });

  // The spacing, crop and role rules, checked at layout time. A document that
  // breaks one is reported and still prints: validation never blocks a pack.
  const imagePlanCheck = validateProposalImagePlan(imagePlan, {
    // A comparison image belongs on its group's own page and nowhere else, so
    // the images the designer marked are checked against where they landed.
    galleryImages: imagePlan.galleryImages,
    comparisonImageIds: imagePlan.comparisonImageIds,
  });
  const violationSignature = imagePlanCheck.violations
    .map((violation) => `${violation.code}:${violation.detail}`)
    .join(' | ');
  if (!imagePlanCheck.valid && reportedPlanRef.current !== violationSignature) {
    reportedPlanRef.current = violationSignature;
    console.warn('[ProposalPack] image placement:', imagePlanCheck.violations);
  }

  const placementsBySection = imagePlan.bySection;

  // The seating-style page is not a stored section and carries no narrative: it
  // is composed from the images the designer grouped as seating options.
  const seatingChunks = [];
  for (let index = 0; imagePlan.seatingPlacements.length >= 2 && index < imagePlan.seatingPlacements.length; index += SEATING_IMAGES_PER_PAGE) {
    seatingChunks.push(imagePlan.seatingPlacements.slice(index, index + SEATING_IMAGES_PER_PAGE));
  }
  let seatingPagesPlaced = false;

  // A comparison group is not a stored section either: each group takes a page
  // of its own, carrying the designer's message and both options full width.
  const comparisonGroups = (imagePlan.comparisonPages || []).filter(group => group.placements?.length >= 2);
  let comparisonPagesPlaced = false;

  // The validated Presented Options section is the authority for the seating
  // explanation as well as for its prose. Where that section is part of the
  // document, its seating images are presented WITH it, on its own page, instead
  // of on a separate seating page that would split the explanation from the
  // images it describes — and the copy is never printed twice.
  const seatingWithOptions = seatingPresentationTarget({
    seatingCount: imagePlan.seatingPlacements.length,
    sectionTypes: canonical.map((def) => def.type),
    anchorType: imagePlan.seatingPageAnchorType,
  }) === 'presented_options' && byType.has('presented_options');
  if (seatingWithOptions) seatingPagesPlaced = true;

  // Page order, with the numbers assigned as the pages are composed.
  let number = 1;
  const takeNumber = () => String((number += 1)).padStart(2, '0');

  const pages = [];

  // The seating-style page: the large lifestyle alternatives, placed immediately
  // before the closing section (the planner names that anchor) or at the end of
  // the narrative when there is no closing section.
  const pushSeatingPages = () => {
    seatingChunks.forEach((chunk, index) => {
      pages.push(
        <SeatingStylePage
          key={`seating:${index}`}
          number={takeNumber()}
          placements={chunk}
          showCopy={index === 0}
          validatedCopy={validatedOptionsCopy}
        />
      );
    });
    seatingPagesPlaced = true;
  };

  // Each comparison group's own page: the group's name as its title, the
  // designer's own message above the images, and both options full width
  // underneath, each captioned with what it stands for.
  const pushComparisonPages = () => {
    comparisonGroups.forEach((group) => {
      pages.push(
        <ComparisonOptionsPage
          key={`comparison:${group.id}`}
          number={takeNumber()}
          title={group.title}
          validatedCopy={validatedOptionsCopy}
          placements={group.placements}
        />
      );
    });
    comparisonPagesPlaced = true;
  };

  // One page carries the project, the room and the brief: no second page
  // restates the same facts.
  const hasGlanceContent = glance.projectCards.length > 0
    || glance.roomCards.length > 0
    || glance.systemCards.length > 0
    || glance.packageRows.length > 0
    || hasComparisonGlance;

  if (hasGlanceContent) {
    pages.push(
      <AtAGlancePage
        key="glance"
        number={takeNumber()}
        snapshot={snapshot}
        projectName={projectName}
        projectReference={projectReference}
        generatedDate={generatedDate}
        comparisonRows={comparisonRows}
        comparisonVersions={comparisonVersions}
      />
    );
  }

  if (isDesignedPack) {
    pages.push(<MethodPage key="method" number={takeNumber()} />);
  }

  // A comparison opens with the decision: one page that says which option to
  // choose and why, read from the same calculated rows the Key Differences table
  // prints. A single-version pack has no choice to present, so it never prints
  // this page.
  if (reportType === 'comparison' && hasComparisonGlance) {
    pages.push(
      <DecisionSummaryPage
        key="decision"
        number={takeNumber()}
        comparisonRows={comparisonRows}
        comparisonVersions={comparisonVersions}
      />
    );
  }

  canonical
    .filter((def) => def.type !== 'cover')
    .forEach((def) => {
      // The seating-style page and each comparison page sit immediately before
      // the section the planner anchors them to.
      if (def.type === imagePlan.seatingPageAnchorType) {
        if (!seatingPagesPlaced && seatingChunks.length > 0) pushSeatingPages();
        if (!comparisonPagesPlaced && comparisonGroups.length > 0) pushComparisonPages();
      }
      const section = byType.get(def.type);
      if (!section) return;
      const title = section.title || def.title;
      // A comparison names its own sections — the report presents system options
      // and compares them, so no page is titled as a single system design. The
      // stored title is what the body was written against, so it is still the
      // one the duplicate-heading rule matches on.
      const displayTitle = resolveSectionTitle(section.section_type, title, reportType);
      const body = prepareSectionBody(section.body, {
        title,
        sectionType: section.section_type,
        // The printed page is prose only outside the single evidence table: a
        // highlight list inside a section is repetition of that table.
        proseOnly: true,
        highChannel,
        proposalType: reportType,
      });

      if (section.section_type === 'room_images') {
        // A dedicated gallery spread is kept ONLY when genuinely unused strong
        // images remain. With two or three images the gallery is retired: those
        // images already carry the document editorially, and repeating them here
        // is exactly the gallery-first layout the editorial standard replaces.
        const spreadImages = imagePlan.retainedGallery ? imagePlan.galleryImages : [];
        if (spreadImages.length === 0) {
          // No images page: either the document places its images editorially,
          // or there are no images at all — which is stated, once.
          if (imagePlan.usableCount > 0) return;
          pages.push(
            <section key={section.id} className="proposal-print-section pp-page pp-page--images">
              <ProposalPageHeader number={takeNumber()} kicker="Visualisation" title={displayTitle} />
              <ProjectImagesBlock images={projectImages} />
            </section>
          );
          return;
        }
        // Image-led: one image page per group of images, so four or more unused
        // images become further image pages instead of shrinking to fit.
        imagePagesFor(spreadImages).forEach((pageImages, index) => {
          pages.push(
            <ProjectImagesPage
              key={`${section.id}:${index}`}
              number={takeNumber()}
              title={displayTitle}
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
        const isComparison = isComparisonKind && hasComparisonGlance;
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
              kicker={isComparisonKind ? 'Comparison' : 'Evidence'}
              title={displayTitle}
            />
            <KeyPerformanceHighlightsTable
              rows={section.metadata?.highlight_rows}
              comparisonRows={comparisonRows}
              comparisonVersions={comparisonVersions}
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

      // The images this page carries. The planner decided which source, which
      // crop and which page; the page only composes what it was given, so the
      // document never places an image arbitrarily because space is free.
      const media = placementsBySection[section.id] || [];
      const landscape = media.find((placement) => placement.editorial_role === EDITORIAL_ROLE.LANDSCAPE_FEATURE
        || placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE) || null;
      const portrait = media.find((placement) => placement.editorial_role === EDITORIAL_ROLE.PORTRAIT_EDITORIAL) || null;

      // The seating images this page carries, when the validated Presented
      // Options section leads the seating group this document has.
      const seatingHere = seatingWithOptions && section.section_type === 'presented_options'
        ? seatingChunks[0]
        : null;

      pages.push(
        <section
          key={section.id}
          className={`proposal-print-section pp-page pp-page--${section.section_type}${media.length > 0 ? ' pp-page--imaged' : ''}`}
        >
          <ProposalPageHeader number={takeNumber()} kicker="Design" title={displayTitle} />
          {/* The dominant treatment leads the page: full-width, image-first. */}
          {landscape ? <ProposalImagePlacement placement={landscape} /> : null}
          {/* The portrait accent sits smaller, beside the copy it illustrates. */}
          {portrait ? (
            <div className="pp-media-row">
              <div className="pp-media-row__copy">
                {body ? (
                  <div className="pp-body" dangerouslySetInnerHTML={{ __html: body }} />
                ) : null}
              </div>
              <ProposalImagePlacement placement={portrait} />
            </div>
          ) : (
            body ? <div className="pp-body" dangerouslySetInnerHTML={{ __html: body }} /> : null
          )}
          {evidence.length > 0 ? <ProposalMetricCards cards={evidence} /> : null}
          {/* The seating alternatives follow the copy that explains them, each
              keeping its own caption. Nothing is stated twice: the page's own
              prose is the validated seating explanation. */}
          {seatingHere ? (
            <div className={`pp-seating pp-seating--${seatingHere.length}`}>
              {seatingHere.map((placement) => (
                <ProposalImagePlacement key={placement.id} placement={placement} />
              ))}
            </div>
          ) : null}
        </section>
      );

      // A seating group too long for one page continues past it, every image
      // still with its own caption and the group's explanation already stated.
      if (seatingHere) {
        seatingChunks.slice(1).forEach((chunk, index) => {
          pages.push(
            <SeatingStylePage
              key={`seating:cont:${index}`}
              number={takeNumber()}
              placements={chunk}
              showCopy={false}
            />
          );
        });
      }
    });

  // A seating-style page whose closing anchor was not composed still belongs in
  // the document, after the narrative it supports.
  if (seatingChunks.length > 0 && !seatingPagesPlaced) {
    pushSeatingPages();
  }

  const hasAppendixSection = canonical.some((def) => def.type === 'appendix');
  if (isDesignedPack && !hasAppendixSection) {
    pages.push(<AppendixPage key="appendix" number={takeNumber()} />);
  }

  return (
    <div className="proposal-print-portal">
      <ProposalPackStyles />
      <ProposalImagePlacementStyles />

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
          // Where the planned cover crop is framed. Null (no plan) reads as
          // centre / middle, which is the framing the cover has always used.
          focalPoint={imagePlan.coverPlacement?.focal_point || null}
          logoUrl={logoUrl}
          generatedDate={generatedDate}
        />
      </div>

      {pages}
    </div>
  );
}