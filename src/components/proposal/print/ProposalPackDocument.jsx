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
import {
  EDITORIAL_ROLE,
  IMAGE_PRESENTATION,
  imagePresentationOf,
  makePlacement,
} from '@/components/proposal/images/proposalImagePlacementAuthority';
import ClosingPhotographPair from '@/components/proposal/print/ClosingPhotographPair';
import ImageFlowBlock from '@/components/proposal/print/ImageFlowBlock';
import AtAGlancePage from '@/components/proposal/print/AtAGlancePage';
import MethodPage from '@/components/proposal/print/MethodPage';
import DecisionSummaryPage from '@/components/proposal/print/DecisionSummaryPage';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalMetricCards from '@/components/proposal/print/ProposalMetricCards';
import ProposalPackStyles from '@/components/proposal/print/ProposalPackStyles';
import {
  buildAtAGlance,
  buildEvidenceCards,
  statementValue,
} from '@/components/proposal/print/proposalPackAuthority';
import { getSectionsForProposalType, resolveSectionTitle } from '@/components/proposal/proposalSections';
import { alternativesCarrier, orderPublicationSections } from '@/components/proposal/publicationOrder';
import { bandOpeningTypes, isFlowSection } from '@/components/proposal/print/narrativeFlowComposition';
import {
  PILLAR_GROUP_HEADING,
  groupEditorialCompositions,
  isClientVisibleSection,
  isPillarSection,
  mediaFollowsBody,
  splitEditorialBlocks,
} from '@/components/proposal/print/editorialComposition';
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
  for (let index = 0; index < imagePlan.seatingPlacements.length; index += SEATING_IMAGES_PER_PAGE) {
    seatingChunks.push(imagePlan.seatingPlacements.slice(index, index + SEATING_IMAGES_PER_PAGE));
  }
  let seatingPagesPlaced = false;

  // A comparison group is not a stored section either: each group takes a page
  // of its own, carrying the designer's message and both options full width.
  const comparisonGroups = (imagePlan.comparisonPages || []).filter(group => group.placements?.length >= 1);

  // A concluding section may carry ONE dominant photograph. If the planner has
  // already assigned it a landscape/closing feature, that is the photograph. If
  // not, the first unused Full Width image becomes its hero. Every other unused
  // image keeps the Library's own presentation weight on dedicated image pages:
  // Full Width images get one page each and Detail images remain supporting.
  const closingSection = byType.get('overall_design') || byType.get('conclusion') || null;
  const plannedClosingMedia = placementsBySection[closingSection?.id] || [];
  const plannedClosingFeature = plannedClosingMedia.find((placement) => (
    placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE
      || placement.editorial_role === EDITORIAL_ROLE.LANDSCAPE_FEATURE
  )) || null;
  const closingGalleryAsset = plannedClosingFeature
    ? null
    : imagePlan.galleryImages.find((asset) => imagePresentationOf(asset) === IMAGE_PRESENTATION.FULL_WIDTH) || null;
  const galleryPageImages = imagePlan.galleryImages.filter((asset) => (
    !closingGalleryAsset || asset?.id !== closingGalleryAsset?.id
  ));
  let galleryPagesPlaced = galleryPageImages.length === 0;
  let closingHeroPlaced = false;
  let comparisonPagesPlaced = false;

  // ── THE PHOTOGRAPHS INTEGRATED INTO THE NARRATIVE ────────────────────────
  // A selected photograph is not held back for a page of its own: the plan places
  // every one it can between the sections it supports, one or two to a page, and
  // each of those pages renders them inside itself below. What is left for an
  // image page is only what the flow genuinely could not carry, so the document
  // reads as one brochure instead of a narrative with a gallery bolted onto the
  // end of it.
  const flowGroupsBySection = {};
  (imagePlan.flowGroups || []).forEach((group) => {
    if (!group?.section_id) return;
    flowGroupsBySection[group.section_id] = flowGroupsBySection[group.section_id] || [];
    flowGroupsBySection[group.section_id].push(group);
  });
  // ── The photograph that closes the design ────────────────────────────────
  // The conclusion carries one dominant photograph. Declare this helper before
  // the lead-copy decision below consumes it, so rendering never crosses a TDZ.
  const closingPairTypes = new Set(['overall_design', 'conclusion']);
  const composesClosingPair = (sectionType) => !closingHeroPlaced
    && Boolean(plannedClosingFeature || closingGalleryAsset)
    && closingPairTypes.has(sectionType);

  // The validated copy written for the project's images is published ONCE, above
  // the first photographs the document carries — on the page that closes the
  // design where it composes them, otherwise above the first photographs
  // integrated into the narrative — so none of the document's copy is dropped for
  // want of an image page.
  const closingSectionWillPrint = closingSection
    ? Boolean(closingSection.section_type && isClientVisibleSection(closingSection.section_type)
      && composesClosingPair(closingSection.section_type))
    : false;
  let imageFlowLeadPending = !closingSectionWillPrint;

  // The copy the writer wrote for the project's images, prepared once. It is
  // published ONCE, above the photographs the project actually carries, whichever
  // page composes them first — the pair that closes the design, the first section
  // a photograph is integrated into, or the image page the remainder keeps. It is
  // never printed twice and never dropped for want of a page to print it on.
  const roomImagesLead = prepareSectionBody(byType.get('room_images')?.body, {
    title: byType.get('room_images')?.title || '',
    sectionType: 'room_images',
    proseOnly: true,
    highChannel,
    proposalType: reportType,
  });
  const takeImageFlowLead = () => {
    if (!imageFlowLeadPending || !roomImagesLead) return '';
    imageFlowLeadPending = false;
    return roomImagesLead;
  };

  // ── ONE carrier for the document's alternatives ──────────────────────────
  // Whether the designer grouped them as seating styles or as a comparison set,
  // the alternatives and the validated Presented Options prose that explains them
  // are presented TOGETHER, on the section that carries that prose. Images on one
  // page and their explanation two sections later is not a client presentation.
  // Only where the document has no such section do the alternatives keep the page
  // the planner anchored them to. The explanation is never printed twice: the
  // carrier page carries the section's own validated copy, and no option page
  // repeats it.
  const alternativesWithOptions = alternativesCarrier({
    alternativeGroups: (seatingChunks.length > 0 ? 1 : 0) + comparisonGroups.length,
    sectionTypes: canonical.map((def) => def.type),
    anchorType: imagePlan.seatingPageAnchorType,
  }) === 'presented_options' && byType.has('presented_options');
  const seatingWithOptions = alternativesWithOptions && seatingChunks.length > 0;
  const comparisonWithOptions = alternativesWithOptions && comparisonGroups.length > 0;
  // Every option the designer marked, each keeping the label that says what it
  // stands for, presented on the page that explains them.
  const alternativesOnCarrier = comparisonWithOptions ? imagePlan.comparisonPlacements : [];
  if (seatingWithOptions || comparisonWithOptions) {
    seatingPagesPlaced = true;
    comparisonPagesPlaced = true;
  }

  // The document's editorial flow: the narrative sections that may share a sheet,
  // in the order this document prints them. A designed page breaks the flow, and
  // a section a designed page interrupted opens a sheet of its own again.
  const flowOpenings = bandOpeningTypes(
    canonical
      .filter((def) => def.type !== 'cover')
      .map((def) => def.type)
      .filter((type) => byType.has(type)),
  );

  // Page order, with the numbers assigned as the sheets are composed: a sheet is
  // numbered once, by the section that opens it.
  let number = 1;
  const takeNumber = () => String((number += 1)).padStart(2, '0');

  // Every page is either a composed page of its own or a section frame whose
  // children flow — which is what lets consecutive narrative sections share one
  // sheet. A composed page closes the flow, so narrative copy never continues
  // onto a sheet that already carries a designed page.
  const pages = [];
  let openFlowFrame = null;
  const addPage = (node, key) => {
    pages.push({ key: key || node?.key || `page:${pages.length}`, node });
    openFlowFrame = null;
    return node;
  };
  const addSectionFrame = (sectionType, key) => {
    const flow = isFlowSection(sectionType);
    const frame = {
      key,
      flow,
      imaged: false,
      endnote: false,
      className: [`pp-page--${sectionType}`],
      children: [],
    };
    pages.push(frame);
    openFlowFrame = flow ? frame : null;
    return frame;
  };

  // The three RP22 structures are ONE connected editorial section: their groups
  // are composed together, under one shared heading, rather than printed as three
  // unrelated pages. They travel as one composition, so the sheets they need are
  // decided by their complete copy — and if their copy truly needs a second
  // sheet, that continuation still carries the group's own identity and
  // hierarchy.
  let pillarSection = null;
  const flushPillarSection = () => {
    if (!pillarSection) return;
    // ONE connected editorial section. Its shared heading lives inside the first
    // structure's own opening composition — the one place it cannot be parted
    // from the structure it introduces, because the measured compositor reads a
    // composition as one unit and never breaks inside one. The wrapper carries
    // the continuity the two sheets share.
    pillarSection.sheet.children.push(
      <div data-editorial-composition="sound_experience" className="pp-pillars" key="sound_experience">
        {pillarSection.groups}
      </div>,
    );
    pillarSection = null;
  };

  // The seating-style page: the large lifestyle alternatives, placed immediately
  // before the closing section (the planner names that anchor) or at the end of
  // the narrative when there is no closing section.
  const pushSeatingPages = () => {
    seatingChunks.forEach((chunk, index) => {
      addPage(
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
      addPage(
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

  // The remaining photographs are part of the editorial flow, so no portfolio
  // heading is printed over them: a title is passed only where a dedicated
  // gallery was explicitly asked for.
  const pushUnplacedImages = (title = '', lead = '') => {
    if (galleryPagesPlaced || !galleryPageImages.length) return;
    imagePagesFor(galleryPageImages).forEach((images, index) => {
      addPage(<ProjectImagesPage key={`selected-images:${index}`} number={takeNumber()}
        title={title} images={images} preserveNatural lead={index === 0 ? lead : ''} />);
    });
    galleryPagesPlaced = true;
  };

  // One page carries the project, the room and the brief: no second page
  // restates the same facts.
  const hasGlanceContent = glance.projectCards.length > 0
    || glance.roomCards.length > 0
    || glance.systemCards.length > 0
    || glance.packageRows.length > 0
    || hasComparisonGlance;

  if (hasGlanceContent) {
    addPage(
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
    addPage(<MethodPage key="method" number={takeNumber()} />);
  }

  // A comparison opens with the decision: one page that says which option to
  // choose and why, read from the same calculated rows the Key Differences table
  // prints. A single-version pack has no choice to present, so it never prints
  // this page.
  if (reportType === 'comparison' && hasComparisonGlance) {
    addPage(
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
      // The concluding section composes the photographs that would otherwise
      // have had a page of their own, so they are not sent to one here.
      if ((!hasImagesSection || !byType.has('room_images')) && ['overall_design', 'conclusion', 'appendix'].includes(def.type) && !composesClosingPair(def.type)) pushUnplacedImages();
      const section = byType.get(def.type);
      if (!section) return;
      // A section a client-facing document does not print — the Appendix, whose
      // evidence the Project Report already carries — keeps its stored record
      // exactly as it is and simply has no page here. Nothing is left behind it:
      // no empty sheet, no leftover rule, and no generic closing note in its
      // place.
      if (!isClientVisibleSection(section.section_type)) return;
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
        // A selected photograph not already placed editorially must still print,
        // even when only one or two sources remain.
        const spreadImages = imagePlan.galleryImages;
        if (spreadImages.length === 0) {
          // No images page: either the document places its images editorially,
          // or there are no images at all — which is stated, once.
          if (imagePlan.usableCount > 0) return;
          // This section states that the project carries no imagery. Its own
          // approved copy prints with that statement — once, here — rather than
          // being left behind by a page that composes no photographs.
          const emptyLead = takeImageFlowLead();
          addPage(
            <section key={section.id} className="proposal-print-section pp-page pp-page--images">
              <ProposalPageHeader number={takeNumber()} kicker="Visualisation" title={displayTitle} />
              {emptyLead ? (
                <div className="pp-body pp-image-flow__lead" dangerouslySetInnerHTML={{ __html: emptyLead }} />
              ) : null}
              <ProjectImagesBlock images={projectImages} />
            </section>
          );
          return;
        }
        // Preserve every unused selected photograph, with its caption and natural
        // proportions — and, where no other page published it, the project's own
        // images copy above them.
        pushUnplacedImages('', takeImageFlowLead());
        return;
      }

      if (section.section_type === 'key_performance_highlights') {
        // A comparison report's highlights page is its comparison table. A
        // report generated before the table travelled with the section still
        // says so on the page rather than printing a heading over nothing.
        const isComparisonKind = proposal?.proposal_type === 'comparison';
        const isComparison = isComparisonKind && hasComparisonGlance;
        // The heading, the table header, every row and the footnote are one
        // indivisible printed block. The section's own validated introduction
        // prints above the table it introduces: an introduction is part of the
        // approved copy, so it is published once, here, and nowhere else.
        addPage(
          <section
            key={section.id}
            className="proposal-print-section pp-page pp-page--highlights proposal-print-section--highlights"
          >
            <ProposalPageHeader
              number={takeNumber()}
              kicker={isComparisonKind ? 'Comparison' : 'Evidence'}
              title={displayTitle}
            />
            {body ? (
              <div
                className="pp-body pp-highlights__intro"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : null}
            <KeyPerformanceHighlightsTable
              rows={section.metadata?.highlight_rows}
              comparisonRows={comparisonRows}
              comparisonVersions={comparisonVersions}
              comparisonExpected={isComparisonKind}
              viewingResult={isComparison ? null : viewingResult}
              snapshot={proposal?.engineering_snapshot}
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

      // The single photograph that closes the design. A section placement wins;
      // otherwise one unused Full Width Library image is handed into this page.
      // Detail images are never promoted into the closing hero.
      const sectionClosingFeature = media.find((placement) => (
        placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE
          || placement.editorial_role === EDITORIAL_ROLE.LANDSCAPE_FEATURE
      )) || null;
      const closingPlacements = composesClosingPair(section.section_type)
        ? [sectionClosingFeature || makePlacement({
          source: closingGalleryAsset,
          role: EDITORIAL_ROLE.CLOSING_FEATURE,
          sectionId: section.id,
          pagePosition: 'closing',
          order: 0,
        })]
        : [];
      // The section's copy for the images it closes with: the Project Images
      // introduction, published above the photographs it was written for. The lead
      // is taken once, so it is never printed twice and never lost.
      const closingLead = closingPlacements.length > 0 ? takeImageFlowLead() : '';

      // The photographs the plan integrated into THIS section: they follow its
      // copy, so they read between this section's text and the next section's.
      const imageFlow = flowGroupsBySection[section.id] || [];
      const imageFlowLead = imageFlow.length > 0 ? takeImageFlowLead() : '';

      // The seating images this page carries, when the validated Presented
      // Options section leads the seating group this document has.
      const seatingHere = seatingWithOptions && section.section_type === 'presented_options'
        ? seatingChunks[0]
        : null;

      // A narrative section continues on the sheet the section before it opened,
      // under its own heading and hierarchy; a designed page opens a sheet of its
      // own. The section that opens a sheet carries its number, and no sheet is
      // numbered twice.
      const continuesOpenSheet = isFlowSection(section.section_type)
        && Boolean(openFlowFrame)
        && !flowOpenings.has(section.section_type);
      const sheet = continuesOpenSheet
        ? openFlowFrame
        : addSectionFrame(section.section_type, section.id);
      if (media.length > 0) sheet.imaged = true;

      // The section's own heading, and the photograph that leads it — or, for the
      // three design structures, the photograph that supports the explanation
      // printed above it.
      // The three structures are read as ONE section under the shared Sound
      // Experience heading, which already names this part of the document. Their
      // own headings carry the structure's name alone: the repeated "Design"
      // label is printed nowhere in the group, on either of the sheets it needs.
      const sectionKicker = isPillarSection(section.section_type) ? null : 'Design';
      const header = (
        <ProposalPageHeader
          number={continuesOpenSheet ? null : takeNumber()}
          kicker={sectionKicker}
          title={displayTitle}
          continued={continuesOpenSheet}
        />
      );
      // An INLINE DETAIL image is composed in the copy-and-image row the portrait
      // accent already uses, beside the paragraphs it supports, so a drawing is
      // not parted from the description it explains. The row is an existing
      // layout with its own keep-together rule: nothing about measurement, page
      // breaks or pagination changes here. Where the section already carries a
      // portrait accent, the drawing keeps the established placement instead, so
      // no image is ever dropped or composed twice.
      const inlineDetail = Boolean(landscape)
        && !portrait
        && (landscape.crop_protected === true
          || landscape.image_presentation === IMAGE_PRESENTATION.DETAIL
          || landscape.image_presentation === IMAGE_PRESENTATION.CROPPED_DETAIL);
      // Where the section's own photograph is the first of the closing pair, it is
      // printed by the pair and never a second time here.
      const leadingMedia = landscape && !mediaFollowsBody(section.section_type) && !inlineDetail
        && closingPlacements.length === 0
        ? <ProposalImagePlacement placement={landscape} />
        : null;
      const supportingMedia = landscape && mediaFollowsBody(section.section_type) && !inlineDetail
        && closingPlacements.length === 0
        ? <ProposalImagePlacement placement={landscape} />
        : null;

      // The copy, read as the compositions the document is composed in. A block is
      // a heading and the paragraphs it introduces, and the blocks together are the
      // stored body character for character: nothing is shortened, reordered or
      // dropped. The opening composition carries the section's heading, its
      // photograph and its first block; the rest of the copy continues in one
      // further composition, so a section that needs a second sheet continues at a
      // block boundary rather than midway through a paragraph.
      const copyBlocks = groupEditorialCompositions(splitEditorialBlocks(body));
      const blockCopy = (blocks) => blocks.map((block) => (
        <div
          key={block.id}
          className="pp-body"
          data-editorial-block="copy"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      ));
      const openingCopy = blockCopy(copyBlocks[0] || []);
      const continuingBlocks = copyBlocks.slice(1).flat();

      // The seating alternatives follow the copy that explains them, each keeping
      // its own caption. Nothing is stated twice: the page's own prose is the
      // validated seating explanation.
      const seatingImages = seatingHere ? (
        <div className={`pp-seating pp-seating--${seatingHere.length}`}>
          {seatingHere.map((placement) => (
            <ProposalImagePlacement key={placement.id} placement={placement} />
          ))}
        </div>
      ) : null;
      // The alternatives the designer marked as comparison options are shown on
      // this same page, under the copy that explains them, each captioned with
      // what it stands for.
      const alternativeImages = alternativesOnCarrier.length > 0
        && section.section_type === 'presented_options' ? (
          <div className={`pp-comparison pp-comparison--${alternativesOnCarrier.length}`}>
            {alternativesOnCarrier.map((placement) => (
              <ProposalImagePlacement
                key={placement.id}
                placement={placement}
                caption={placement.comparison_option_label || placement.source_caption || null}
              />
            ))}
          </div>
        ) : null;

      // The first structure of the group carries THE SOUND EXPERIENCE heading: it
      // opens the section, so it is the one the heading must never be parted from.
      const opensPillarGroup = isPillarSection(section.section_type)
        && (!pillarSection || pillarSection.groups.length === 0);

      const groupNode = (
        <div
          key={section.id}
          className={isPillarSection(section.section_type) ? 'pp-pillar' : undefined}
          data-editorial-section={section.section_type}
          data-editorial-block={isPillarSection(section.section_type) ? 'pillar' : 'section'}
          style={{ display: 'flow-root' }}
        >
          {/* The section identity travels with the composition, so a composed
              sheet still states which structure it carries — the evidence the
              export's image trace and the three-pillar composition read. */}
          <div
            className="pp-composition"
            data-editorial-composition="opening"
            data-editorial-section={section.section_type}
          >
            {opensPillarGroup ? <h2 className="pp-pillars__title">{PILLAR_GROUP_HEADING}</h2> : null}
            {header}
            {leadingMedia}
            {/* The portrait accent sits smaller, beside the copy it illustrates. */}
            {portrait ? (
              <div className="pp-media-row">
                <div className="pp-media-row__copy">{openingCopy}</div>
                <ProposalImagePlacement placement={portrait} />
              </div>
            ) : inlineDetail ? (
              <div className="pp-media-row">
                <div className="pp-media-row__copy">{openingCopy}</div>
                <ProposalImagePlacement placement={landscape} />
              </div>
            ) : openingCopy}
            {supportingMedia}
            {/* The photographs that close the design, composed as ONE unit inside
                this section: the compositor measures the pair whole, so it stays
                on the sheet the conclusion is read on and, where the copy is
                longer, moves to the section's own continuation sheet rather than
                being split across two. */}
            {closingPlacements.length > 0 ? (
              <ClosingPhotographPair placements={closingPlacements} lead={closingLead} />
            ) : null}
            {evidence.length > 0 ? <ProposalMetricCards cards={evidence} /> : null}
            {seatingImages}
            {alternativeImages}
          </div>
          {continuingBlocks.length > 0 ? (
            <div
              className="pp-composition"
              data-editorial-composition="continuing"
              data-editorial-section={section.section_type}
            >
              {blockCopy(continuingBlocks)}
            </div>
          ) : null}
          {/* The project photographs the plan integrated into this page, composed
              after its copy: a photograph that would have had a gallery page of
              its own takes its place in the narrative instead, one or two to a
              page. The block is one composition, so a pair is kept together on the
              sheet where the sheet can hold both and continues onto the section's
              own next sheet rather than being shrunk or cropped to fit. */}
          {imageFlow.map((group, index) => (
            <ImageFlowBlock
              key={group.id}
              placements={group.placements}
              layout={group.layout}
              lead={index === 0 ? imageFlowLead : ''}
            />
          ))}
        </div>
      );

      // The three design structures travel as one composition; every other section
      // takes its own place in the flow.
      if (isPillarSection(section.section_type)) {
        pillarSection = pillarSection || { sheet, groups: [] };
        pillarSection.groups.push(groupNode);
      } else {
        flushPillarSection();
        sheet.children.push(groupNode);
      }

      // The concluding hero has been used once. Remaining images still flow to
      // their own metadata-led pages after the narrative.
      if (closingPlacements.length > 0) closingHeroPlaced = true;

      // A seating group too long for one page continues past it, every image
      // still with its own caption and the group's explanation already stated.
      if (seatingHere) {
        seatingChunks.slice(1).forEach((chunk, index) => {
          addPage(
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

  flushPillarSection();

  // A seating-style page whose closing anchor was not composed still belongs in
  // the document, after the narrative it supports.
  if (seatingChunks.length > 0 && !seatingPagesPlaced) {
    pushSeatingPages();
  }

  if (!comparisonPagesPlaced && comparisonGroups.length) pushComparisonPages();
  pushUnplacedImages('', takeImageFlowLead());

  return (
    <div className="proposal-print-portal" data-selected-images={JSON.stringify(imagePlan.selectedImageUrls)}>
      <ProposalPackStyles />
      <ProposalImagePlacementStyles />

      <div className="proposal-print-cover">
        <ProposalCoverPage
          projectName={projectName}
          clientName={clientName}
          dealerName={dealerName}
          projectReference={projectReference}
          versionNames={versionNames}
          proposalType={reportType}
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

      {/* A section frame flows: consecutive narrative sections share one sheet,
          and a frame that needs a further sheet continues onto it. */}
      {pages.map((entry) => (entry.node ? entry.node : (
        <section
          key={entry.key}
          className={[
            'proposal-print-section',
            'pp-page',
            ...entry.className,
            entry.flow ? 'pp-page--flow' : null,
            entry.imaged ? 'pp-page--imaged' : null,
            entry.endnote ? 'pp-page--with-endnote' : null,
          ].filter(Boolean).join(' ')}
        >
          {entry.children}
        </section>
      )))}
    </div>
  );
}