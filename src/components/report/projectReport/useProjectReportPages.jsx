/**
 * useProjectReportPages.jsx
 * -------------------------
 * Builds the Project Report's page list — the CONTENT of each page — and hands
 * it to the composition authority (projectReportRegistry) to be ordered into the
 * document.
 *
 * One page here owns one section of the story: the cover, the category
 * assessment tables, the parameter detail pages, the detailed bass evidence, the
 * per-seat results, treatment, the products schedule, and the closing brand
 * page. Every value is read passively from the published engineering summary and
 * the saved design — nothing is recalculated, re-graded or inferred.
 *
 * The report's structure (section order, headings, continuation state and the
 * P1–P21 inclusion rule) belongs to the registry, not here.
 */

import React, { useMemo } from "react";

import ClientDesignHighlights from "@/components/report/client/ClientDesignHighlights";
import ClientAdiDesignSummary from "@/components/report/client/ClientAdiDesignSummary";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";
import ClientP2SystemArchitecture from "@/components/report/client/ClientP2SystemArchitecture";
import ClientSoundAroundListener from "@/components/report/client/ClientSoundAroundListener";
import ClientP7FrontWides from "@/components/report/client/ClientP7FrontWides";
import ClientP9Overhead from "@/components/report/client/ClientP9Overhead";
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
import AboutSoundProofReportPage from "@/components/report/AboutSoundProofReportPage";
import { buildClientAcousticTreatmentPage } from "@/components/report/client/acousticTreatmentPageAuthority";
import { planSeatRowPages } from "@/components/report/client/perSeatCardLayout";
import { isAssessedLevel } from "@/components/report/client/visualReportSeatStyle";
import {
  PROJECT_REPORT_SECTION,
  buildParameterIndexPages,
  orderProjectReportPages,
  projectReportSectionHeading,
  sectionForPage,
} from "@/components/report/projectReport/projectReportRegistry";
import { buildProjectReportSummaryOpening } from "@/components/report/projectReport/projectReportSummaryOpening";
import ProjectReportCover from "@/components/report/projectReport/ProjectReportCover";
import ProjectReportParameterIndex from "@/components/report/projectReport/ProjectReportParameterIndex";
import ProjectReportProducts from "@/components/report/projectReport/ProjectReportProducts";
import ProjectReportSectionPage from "@/components/report/projectReport/ProjectReportSectionPage";
import ProjectReportSummaryOpening from "@/components/report/projectReport/ProjectReportSummaryOpening";

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
  aboutSoundProofHtml,
  appState,
  projectId,
  versionId,
}) {
  const activePages = useMemo(() => {
    // The Design Summary's opening: one project-specific statement of the cinema
    // this report documents, composed from the report's own evidence. Null when
    // the report carries too little project evidence for one.
    const summaryOpening = buildProjectReportSummaryOpening({
      projectDetails,
      productsSelected,
      seatingPositions,
      engineeringSummary,
    });
    const overviewPages = [];
    const dynamicPages = [];
    const spatialPages = [];
    const timbrePages = [];
    const bassPages = [];
    const summaryPages = [];
    const closingPages = [];
    // Design Summary — always first (intro page)
    if (highlights.length > 0) {
      overviewPages.push({
        id: "design-summary",
        category: "Design Summary",
        // The Design Summary opens on this project — its architecture, screen,
        // seating and specified system, with only the strengths the published
        // assessment supports — instead of a generic statement about seats.
        visual: (
          <>
            {summaryOpening && <ProjectReportSummaryOpening sentence={summaryOpening} />}
            <ClientDesignHighlights highlights={highlights} />
          </>
        ),
        printData: {
          type: "highlights",
          highlights,
          summaryOpening,
        },
      });
    }
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
    // P9 only when at least one seat has a genuine assessed result (L1-L4 or FAIL).
    // Excludes N/A / Not assessed / Not calculated (e.g. single overhead row).
    if (p9Overhead.hasAnyValidResult) {
      spatialPages.push({
        id: "p9-spatial-resolution",
        category: "Spatial Resolution",
        visual: (
          <ClientP9Overhead
            roomDims={roomDims}
            seats={p9Overhead.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={p9Overhead.counts}
            summary={p9Overhead.summary}
            placedSpeakers={placedSpeakers}
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
    // About Sound Proof — the short brand closing section, always last and always
    // present. Its copy is the published copy or the built-in fallback, resolved
    // synchronously, so the page always prints complete: never omitted, never
    // blank, never a loading page.
    closingPages.push({
      id: "about-sound-proof",
      category: "About Sound Proof",
      visual: (
        <div style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
          border: "1px solid #DCDBD6",
        }}>
          <AboutSoundProofReportPage variant="compact" html={aboutSoundProofHtml} />
        </div>
      ),
      printData: { type: "about-sound-proof", aboutHtml: aboutSoundProofHtml },
    });

    return [
      ...overviewPages,
      ...dynamicPages,
      ...spatialPages,
      ...timbrePages,
      ...bassPages,
      ...summaryPages,
      ...closingPages,
    ];
  }, [p5Snapshot, p5SeatResults, p9Snapshot, p9Overhead, bestListeningArea, timbreConsistency, frontSoundstage, nonScreenSoundstage, highlights, screenSeating, hasSeatingPosition, recommendedSeatingPosition, bassPerformance, roomDims, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen, placedSpeakers, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, appState?.abfuserQtySource, coverageSentence, reportGeometry, reportSystem, perSeatPerformance, aboutSoundProofHtml, projectId]);

  // ── The Project Report's composition ────────────────────────────────────
  // ONE composition authority decides the document: the cover, the three
  // category assessment tables (every parameter P1–P21 explicitly stated,
  // including the ones that carry no drawing page of their own), the parameter
  // detail pages, the detailed bass evidence, the per-seat results, treatment,
  // the Systems / Products Selected schedule, the drawings and the closing brand
  // page — in the agreed section order, with every continuation page headed
  // "<section> — Continued".
  return useMemo(() => {
    const pageList = Array.isArray(activePages) ? activePages.filter(Boolean) : [];

    // The three category assessment tables, built once from the published
    // engineering summary. Each opens its own section.
    const indexPages = buildParameterIndexPages(engineeringSummary).map((descriptor) => ({
      id: descriptor.id,
      section: descriptor.section,
      category: descriptor.category,
      parameterIds: descriptor.parameterIds,
      printData: descriptor.printData,
      visual: (
        <ProjectReportSectionPage heading={descriptor.category}>
          <ProjectReportParameterIndex category={descriptor.category} rows={descriptor.rows} />
        </ProjectReportSectionPage>
      ),
    }));

    // A section's opening page: its assessment table, stated before its first
    // detail page. A table whose section has no detail page still prints.
    const openers = new Map(indexPages.map((page) => [page.section, page]));
    const withOpeners = [];
    let currentSection = null;
    for (const page of pageList) {
      const section = sectionForPage(page);
      if (section !== currentSection) {
        currentSection = section;
        const opener = openers.get(section);
        if (opener) {
          withOpeners.push(opener);
          openers.delete(section);
        }
      }
      withOpeners.push(page);
    }
    withOpeners.push(...openers.values());

    const coverPage = {
      id: "project-report-cover",
      printData: {
        type: "project-report-cover",
        projectDetails,
        version: reportVersion,
        reference: projectDetails?.project_reference || null,
        generatedOn: reportOnDate,
      },
      visual: (
        <ProjectReportCover
          projectDetails={projectDetails}
          version={reportVersion}
          reference={projectDetails?.project_reference || null}
          generatedOn={reportOnDate}
        />
      ),
    };

    const productsPage = {
      id: "products-selected",
      printData: { type: "products-selected", rows: productsSelected.rows },
      visual: <ProjectReportProducts rows={productsSelected.rows} />,
    };

    // The registry orders the document by its own section order and resolves
    // each page's heading and continuation state.
    return orderProjectReportPages([coverPage, ...withOpeners, productsPage]);
  }, [activePages, engineeringSummary, projectDetails, reportVersion, reportOnDate, productsSelected]);
}