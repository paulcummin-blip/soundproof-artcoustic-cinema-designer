/**
 * useProjectReportPages.jsx
 * -------------------------
 * The consolidated Project Report's page list.
 *
 * THE PROJECT REPORT IS AN EDIT OF THE TWO REPORTS, NOT A THIRD ONE:
 *
 *   01  Project Report / Design Summary       — the merged front page
 *   02  System + Products / Project Overview  — the equipment brought forward
 *   THEN the Visual Report's own pages, in their existing order and their
 *        existing presentation
 *   THEN the Technical Report's own pages, in their existing order, mounted by
 *        the report page itself (see TechnicalReportDocument): the complete
 *        P1–P21 parameter-card sequence, the drawings, the bass curves and the
 *        single closing About Sound Proof page.
 *
 * Two pages stand in for pages the two reports already state, which is what
 * makes this an edit rather than a merge of duplicates: the front page replaces
 * both the Visual Report's design-summary page and the Technical Report's cover,
 * and the Technical Report's closing About page is the document's only About
 * page. Everything else is kept as it is.
 *
 * Every value is read passively from the published engineering summary and the
 * saved design: nothing is recalculated, re-graded or inferred, no parameter
 * card is moved between reports, and no drawing leaves the section it prints in.
 */

import React, { useMemo } from "react";

import ClientAdiDesignSummary from "@/components/report/client/ClientAdiDesignSummary";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";
import ClientP2SystemArchitecture from "@/components/report/client/ClientP2SystemArchitecture";
import ClientSoundAroundListener from "@/components/report/client/ClientSoundAroundListener";
import ClientP7FrontWides from "@/components/report/client/ClientP7FrontWides";
import ClientP9Overhead from "@/components/report/client/ClientP9Overhead";
import { isP9ReportApplicable } from "@/components/report/client/p9SeatScopeAuthority";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import ClientFrontSoundstageDynamicRange from "@/components/report/client/ClientFrontSoundstageDynamicRange";
import ClientNonScreenDynamicRange from "@/components/report/client/ClientNonScreenDynamicRange";
import ClientBassCapability from "@/components/report/client/ClientBassCapability";
import ClientBassResponse from "@/components/report/client/ClientBassResponse";
import ClientP19RspPresentation from "@/components/report/client/ClientP19RspPresentation";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import ClientAcousticTreatment from "@/components/report/client/ClientAcousticTreatment";
import ClientPerSeatPerformance from "@/components/report/client/ClientPerSeatPerformance";
import { buildClientAcousticTreatmentPage } from "@/components/report/client/acousticTreatmentPageAuthority";
import { planSeatRowPages } from "@/components/report/client/perSeatCardLayout";
import { isAssessedLevel } from "@/components/report/client/visualReportSeatStyle";
import { buildProjectReportSummaryOpening } from "@/components/report/projectReport/projectReportSummaryOpening";
import ProjectReportDesignSummary from "@/components/report/projectReport/ProjectReportDesignSummary";
import AdiDesignHighlightsPage from "@/components/report/projectReport/AdiDesignHighlightsPage";
import ProjectReportSystemOverview from "@/components/report/projectReport/ProjectReportSystemOverview";
import { buildAdiDesignHighlights } from "@/components/report/projectReport/adiDesignHighlights";

export function useProjectReportPages({
  hydrating,
  engineeringSummary,
  projectDetails,
  reportVersion,
  reportOnDate,
  productsSelected,
  // Selector outputs — already computed by the page from the published summary.
  p5Snapshot,
  p5SeatResults,
  p9Snapshot,
  p9Overhead,
  bestListeningArea,
  timbreConsistency,
  frontSoundstage,
  nonScreenSoundstage,
  highlights,
  screenSeating,
  p2SystemArchitecture,
  p7FrontWides,
  hasSeatingPosition,
  recommendedSeatingPosition,
  bassPerformance,
  perSeatPerformance,
  // Published geometry / system context.
  roomDims,
  screen,
  screenFrontPlaneM,
  screenWidthM,
  rsp,
  rspSourceLabel,
  seatingPositions,
  placedSpeakers,
  subwooferInstances,
  p19Graph,
  coverageSentence,
  reportGeometry,
  reportSystem,
  appState,
  projectId,
  versionId,
}) {
  // The Design Summary's opening: one project-specific statement of the cinema
  // this report documents, composed from the report's own evidence. Null when
  // the report carries too little project evidence for one. It opens the merged
  // document's first page.
  const summaryOpening = useMemo(() => buildProjectReportSummaryOpening({
    projectDetails,
    productsSelected,
    seatingPositions,
    engineeringSummary,
  }), [projectDetails, productsSelected, seatingPositions, engineeringSummary]);

  // The ADI Design Highlights page's content: the highlights ADI selects from
  // this design's own frozen evidence — the published RP22 and RP23 results and
  // their seat scope, the products specified, the seating and the architecture.
  // Only genuine strengths are raised, and the list is already fitted to its
  // page budget, so the Highlights page can never clip.
  const adiHighlights = useMemo(() => buildAdiDesignHighlights({
    engineeringSummary,
    productsSelected,
    seatingPositions,
    dolbyConfig: projectDetails?.dolby_config,
  }), [engineeringSummary, productsSelected, seatingPositions, projectDetails]);

  // The Visual Report's own pages — its existing order and its existing
  // presentation, exactly as the Visual Report prints them. No parameter card is
  // inserted between its drawings, and no page is re-sectioned.
  const activePages = useMemo(() => {
    const overviewPages = [];
    const dynamicPages = [];
    const spatialPages = [];
    const timbrePages = [];
    const bassPages = [];
    const summaryPages = [];
    const closingPages = [];
    // ADI Design Summary — what Artcoustic Design Intelligence contributes:
    // the project's genuine strengths, the main limiting factor and the
    // practical next actions. Immediately after the performance highlights.
    overviewPages.push({
      id: "adi-design-summary",
      category: "ADI Design Summary",
      visual: (
        <ClientAdiDesignSummary
          engineeringSummary={engineeringSummary}
          seats={seatingPositions}
          geometry={reportGeometry}
          system={reportSystem}
          projectId={projectId}
          versionId={versionId || null}
        />
      ),
      printData: { type: "adi-design-summary" },
    });
    // RP23 Screen Size / Seating — project overview page
    if (screenSeating.hasAny) {
      overviewPages.push({
        id: "screen-seating",
        category: "Viewing Experience",
        visual: (
          <ClientScreenSeating
            roomDims={roomDims}
            seats={screenSeating.seats}
            rows={screenSeating.rows}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            zones={screenSeating.zones}
            explanation={screenSeating.explanation}
            projectorLumens={screenSeating.projectorLumens}
          />
        ),
        printData: {
          type: "screen-seating",
          roomDims,
          seats: screenSeating.seats,
          rows: screenSeating.rows,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          zones: screenSeating.zones,
          explanation: screenSeating.explanation,
          projectorLumens: screenSeating.projectorLumens,
        },
      });
    }
    // P2 System Architecture — after Viewing Experience, before P5
    if (p2SystemArchitecture) {
      spatialPages.push({
        id: "p2-system-architecture",
        category: "Spatial Resolution",
        visual: (
          <ClientP2SystemArchitecture
            p2Data={p2SystemArchitecture}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            placedSpeakers={placedSpeakers}
            subwooferInstances={subwooferInstances}
          />
        ),
        printData: {
          type: "p2-system-architecture",
          p2Data: p2SystemArchitecture,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          placedSpeakers,
          subwooferInstances,
        },
      });
    }
    if (p5Snapshot && isAssessedLevel(p5Snapshot.level)) {
      spatialPages.push({
        id: "p5-spatial-resolution",
        category: "Spatial Resolution",
        visual: (
          <ClientSoundAroundListener
            p5Snapshot={p5Snapshot}
            seatResults={p5SeatResults}
            roomDims={roomDims}
            screen={screen}
            screenFrontPlaneM={screenFrontPlaneM}
          />
        ),
        printData: {
          type: "p5",
          p5Snapshot,
          seatResults: p5SeatResults,
          roomDims,
          screen,
          screenFrontPlaneM,
        },
      });
    }
    // P7 Front Wides — only when front wides are present
    if (p7FrontWides) {
      spatialPages.push({
        id: "p7-front-wides",
        category: "Spatial Resolution",
        visual: (
          <ClientP7FrontWides
            p7Data={p7FrontWides}
            roomDims={roomDims}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
          />
        ),
        printData: {
          type: "p7-front-wides",
          p7Data: p7FrontWides,
          roomDims,
          screenFrontPlaneM,
          screenWidthM,
        },
      });
    }
    // P9 only when at least one seat has a genuine assessed result (L1-L4 or FAIL)
    // AND the system has two or more applicable overhead rows. With no overhead
    // speakers, or a single overhead row, spacing between rows is not assessed:
    // the page is not rendered at all, and no angle is ever invented for it.
    if (p9Overhead.hasAnyValidResult && isP9ReportApplicable(p9Snapshot)) {
      spatialPages.push({
        id: "p9-spatial-resolution",
        category: "Spatial Resolution",
        visual: (
          <ClientP9Overhead
            roomDims={roomDims}
            seats={p9Overhead.seats}
            summary={p9Overhead.summary}
            p9Snapshot={p9Snapshot}
          />
        ),
        printData: {
          type: "p9",
          p9Snapshot,
          roomDims,
          p9Overhead,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
        },
      });
    }
    // Best Listening Area — only when at least one seat has a genuine assessed result
    if (bestListeningArea.hasAnyValidResult) {
      spatialPages.push({
        id: "best-listening-area",
        category: "Spatial Resolution",
        visual: (
          <ClientBestListeningArea
            roomDims={roomDims}
            seats={bestListeningArea.seats}
            rsp={bestListeningArea.rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={bestListeningArea.counts}
            explanation={bestListeningArea.explanation}
          />
        ),
        printData: {
          type: "best-listening-area",
          roomDims,
          seats: bestListeningArea.seats,
          rsp: bestListeningArea.rsp,
          screenFrontPlaneM,
          screenWidthM,
          counts: bestListeningArea.counts,
          explanation: bestListeningArea.explanation,
        },
      });
    }
    // Timbre Consistency (after Best Listening Area, before Design Highlights)
    if (timbreConsistency.hasAnyValidResult) {
      timbrePages.push({
        id: "timbre-consistency",
        category: "Timbre Matching",
        visual: (
          <ClientTimbreConsistency
            roomDims={roomDims}
            seats={timbreConsistency.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={timbreConsistency.counts}
          />
        ),
        printData: {
          type: "timbre-consistency",
          roomDims,
          seats: timbreConsistency.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          counts: timbreConsistency.counts,
        },
      });
    }
    // Front Soundstage Dynamic Range (after Timbre Consistency, before Design Highlights)
    if (frontSoundstage.hasAny) {
      dynamicPages.push({
        id: "front-soundstage-dynamic-range",
        category: "Dynamic Range",
        visual: (
          <ClientFrontSoundstageDynamicRange
            roomDims={roomDims}
            seats={frontSoundstage.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            screen={screen}
            placedSpeakers={placedSpeakers}
            fl={frontSoundstage.fl}
            fc={frontSoundstage.fc}
            fr={frontSoundstage.fr}
            minimum={frontSoundstage.minimum}
            level={frontSoundstage.level}
            bandLabels={frontSoundstage.bandLabels}
            targetBasisLabel={frontSoundstage.targetBasisLabel}
            resultHeading={frontSoundstage.resultHeading}
            resultExplanation={frontSoundstage.resultExplanation}
          />
        ),
        printData: {
          type: "front-soundstage-dynamic-range",
          roomDims,
          seats: frontSoundstage.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          screen,
          placedSpeakers,
          fl: frontSoundstage.fl,
          fc: frontSoundstage.fc,
          fr: frontSoundstage.fr,
          minimum: frontSoundstage.minimum,
          level: frontSoundstage.level,
          bandLabels: frontSoundstage.bandLabels,
          targetBasisLabel: frontSoundstage.targetBasisLabel,
          resultHeading: frontSoundstage.resultHeading,
          resultExplanation: frontSoundstage.resultExplanation,
        },
      });
    }
    // Non-Screen Dynamic Range (after Front Soundstage, before Design Highlights)
    if (nonScreenSoundstage.hasAny) {
      dynamicPages.push({
        id: "non-screen-dynamic-range",
        category: "Dynamic Range",
        visual: (
          <ClientNonScreenDynamicRange
            roomDims={roomDims}
            seats={nonScreenSoundstage.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            placedSpeakers={placedSpeakers}
            speakerSplValues={nonScreenSoundstage.speakerSplValues}
            minimum={nonScreenSoundstage.minimum}
            level={nonScreenSoundstage.level}
            targetBasisLabel={nonScreenSoundstage.targetBasisLabel}
            resultHeading={nonScreenSoundstage.resultHeading}
            resultExplanation={nonScreenSoundstage.resultExplanation}
          />
        ),
        printData: {
          type: "non-screen-dynamic-range",
          roomDims,
          seats: nonScreenSoundstage.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          placedSpeakers,
          speakerSplValues: nonScreenSoundstage.speakerSplValues,
          minimum: nonScreenSoundstage.minimum,
          level: nonScreenSoundstage.level,
          targetBasisLabel: nonScreenSoundstage.targetBasisLabel,
          resultHeading: nonScreenSoundstage.resultHeading,
          resultExplanation: nonScreenSoundstage.resultExplanation,
        },
      });
    }
    // Bass Performance — two adjacent pages:
    //   Page 1: P14/P18 — Output Capability and Low-Frequency Extension
    //   Page 2: P19/P20 — Response Quality and Seat Consistency
    // Both consume the same canonical bass authority. Only included when at
    // least one genuine assessed bass result exists.
    if (bassPerformance) {
      bassPages.push({
        id: "bass-capability",
        category: "Bass Performance",
        visual: (
          <ClientBassCapability bassPerformance={bassPerformance} />
        ),
        printData: {
          type: "bass-capability",
          bassPerformance,
        },
      });
      bassPages.push({
        id: "bass-response",
        category: "Bass Performance",
        visual: (
          <ClientBassResponse
            bassPerformance={bassPerformance}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
          />
        ),
        printData: {
          type: "bass-response",
          bassPerformance,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
        },
      });
      // P19 — Bass Response at RSP. P19 is assessed at the reference seating
      // position only, so it is presented as a single RSP result. Seat-to-seat
      // consistency is the P20 page above; no all-seat P19 grid is ever drawn.
      bassPages.push({
        id: "p19-rsp",
        category: "Bass Performance",
        visual: (
          <ClientP19RspPresentation
            bassPerformance={bassPerformance}
            p19Graph={p19Graph}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            subwooferInstances={subwooferInstances}
          />
        ),
        printData: {
          type: "p19-rsp",
          bassPerformance,
          p19Graph,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          subwooferInstances,
        },
      });
    }
    // Recommended Seating Position (only when valid geometry + seats + RSP)
    if (hasSeatingPosition) {
      bassPages.push({
        id: "recommended-seating-position",
        category: "Spatial Resolution",
        visual: (
          <ClientRecommendedSeatingPosition
            roomDims={roomDims}
            seats={recommendedSeatingPosition.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            screen={screen}
          />
        ),
        printData: {
          type: "seating-position",
          roomDims,
          seats: recommendedSeatingPosition.seats,
          rsp,
          rspSourceLabel,
          screenFrontPlaneM,
          screenWidthM,
          screen,
        },
      });
    }
    // Acoustic Treatment — a real printed page whenever the design carries
    // treatment. ONE authority decides both the quantity the page may state (the
    // design's included quantity, the same number pricing follows) and whether
    // the page exists: with treatment switched off, or no quantity anywhere to
    // state, the page is not added at all — so it can never print as an empty
    // sheet, and never as a loading page.
    const acousticTreatmentPage = buildClientAcousticTreatmentPage({
      roomDims,
      seatingPositions,
      placedSpeakers,
      rsp,
      acousticTreatmentEnabled: appState?.acousticTreatmentEnabled === true,
      selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
      legacyAutoQuantity: Number(appState?.legacyAbfuserAutoQty) || 0,
      abfuserQtySource: appState?.abfuserQtySource || null,
    });
    if (acousticTreatmentPage.hasPage) {
      const reportPriceSummary = (() => {
        const summary = typeof window !== "undefined" ? window.__ROOM_DESIGNER_PRICE__ : null;
        return summary && projectId && String(summary.projectId || "") === String(projectId)
          ? summary
          : null;
      })();
      const acousticTreatmentProps = {
        roomDims,
        seatingPositions,
        placedSpeakers,
        rsp,
        acousticTreatmentEnabled: true,
        selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
        legacyAutoQuantity: Number(appState?.legacyAbfuserAutoQty) || 0,
        abfuserQtySource: appState?.abfuserQtySource || null,
        // Quantity consistency: the report reads the same canonical quantity the
        // priced schedule uses, and warns rather than contradicting it.
        pricedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
        priceSummary: reportPriceSummary,
        projectId,
      };
      closingPages.push({
        id: "acoustic-treatment",
        category: "Acoustic Treatment",
        visual: <ClientAcousticTreatment {...acousticTreatmentProps} />,
        printData: {
          type: "acoustic-treatment",
          ...acousticTreatmentProps,
        },
      });
    }
    // Per-Seat Performance — the seat-by-seat summary, after the parameter
    // pages. Every assessed seat in the seating plan's own shape, read from the
    // same published authority as the Room Designer seat pop-up.
    if (perSeatPerformance?.hasAny) {
      // The cards keep the seating plan's own shape, at a size the system can
      // carry. A system with more seating rows than one printed page holds is
      // split BETWEEN rows — never into a numbered seat list — so no card is
      // clipped and none is printed below its readable size.
      const seatRowPages = planSeatRowPages(perSeatPerformance.rows);
      seatRowPages.forEach((pageRows, index) => {
        const continuation = index > 0;
        summaryPages.push({
          id: continuation ? `per-seat-performance-${index + 1}` : "per-seat-performance",
          category: "Per-Seat Performance",
          visual: continuation
            ? <ClientPerSeatPerformance rows={[]} rsp={rsp} continuation />
            : <ClientPerSeatPerformance rows={perSeatPerformance.rows} rsp={rsp} />,
          printData: {
            type: "per-seat-performance",
            // Distinct key: the viewing page owns `rows` for its own print data.
            seatRows: pageRows,
            rsp,
          },
        });
      });
    }
    // The document's closing About Sound Proof page is the Technical Report's own,
    // mounted with the Technical pages by the report page. The consolidated
    // document therefore states About Sound Proof once, never twice.

    return [
      ...overviewPages,
      ...dynamicPages,
      ...spatialPages,
      ...timbrePages,
      ...bassPages,
      ...summaryPages,
      ...closingPages,
    ];
  }, [p5Snapshot, p5SeatResults, p9Snapshot, p9Overhead, bestListeningArea, timbreConsistency, frontSoundstage, nonScreenSoundstage, highlights, screenSeating, hasSeatingPosition, recommendedSeatingPosition, bassPerformance, roomDims, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen, placedSpeakers, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, appState?.abfuserQtySource, coverageSentence, reportGeometry, reportSystem, perSeatPerformance, projectId]);

  // ── The Project Report's composition ────────────────────────────────────
  // The document is an EDIT of the two reports, not a third one: the merged
  // front section, then the Visual Report's own pages in the order it already
  // prints them, then the Technical Report's own pages, mounted by the report
  // page, and its single closing About page. No cover page, no category
  // assessment tables, no second About page and no parameter card inserted
  // between the Visual pages.
  return useMemo(() => {
    const pageList = Array.isArray(activePages) ? activePages.filter(Boolean) : [];

    // 01 PROJECT SUMMARY — the design's key facts, then one short
    // project-specific paragraph. Nothing else belongs on this page: the
    // strengths the published assessment supports have their own page, so this
    // page can never overfill or clip.
    const projectSummaryPage = {
      id: "project-report-design-summary",
      printData: {
        type: "design-summary",
        projectDetails,
        roomDims,
        seatingPositions,
        screenWidthM,
        productsSelected,
        summaryOpening,
      },
      visual: (
        <ProjectReportDesignSummary
          projectDetails={projectDetails}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          screenWidthM={screenWidthM}
          productsSelected={productsSelected}
          summaryOpening={summaryOpening}
        />
      ),
    };

    // 02 ADI DESIGN HIGHLIGHTS — the highlights ADI selected from this design's
    // own frozen engineering evidence: the strongest, most client-relevant
    // results of THIS system, each with the evidence it rests on. Generated from
    // the evidence, never from a fixed template.
    const adiHighlightsPage = {
      id: "project-report-adi-highlights",
      printData: {
        type: "adi-highlights",
        highlights: adiHighlights,
      },
      visual: <AdiDesignHighlightsPage highlights={adiHighlights} />,
    };

    // 03 SYSTEM & PRODUCTS — the equipment brought forward: the complete
    // specification schedule, each layer's own engineering job and the viewing
    // geometry of every seating row.
    const systemProductsPage = {
      id: "project-report-system-overview",
      printData: {
        type: "system-overview",
        projectDetails,
        productsSelected,
        engineeringSummary,
        rows: screenSeating.rows,
      },
      visual: (
        <ProjectReportSystemOverview
          projectDetails={projectDetails}
          productsSelected={productsSelected}
          engineeringSummary={engineeringSummary}
          rows={screenSeating.rows}
        />
      ),
    };

    // THE DOCUMENT: the three opening pages, then the Visual Report's own pages
    // in their existing order, unchanged. The Technical Report's pages follow
    // them, mounted by the report page itself (TechnicalReportDocument) — that is
    // where the complete P1–P21 parameter-card sequence, the drawing set, the
    // bass curves and the single closing About Sound Proof page print.
    return [projectSummaryPage, adiHighlightsPage, systemProductsPage, ...pageList];
  }, [activePages, summaryOpening, projectDetails, roomDims, seatingPositions, screenWidthM, productsSelected, adiHighlights, screenSeating, engineeringSummary]);
}