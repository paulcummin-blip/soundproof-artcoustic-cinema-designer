// components/report/RP22ReportParameterGrid.jsx
// 3-column grid of exact Compliance Report tiles for the RP22 Report page.
// Stage C: Computation logic extracted to shared useParameterGridAuthority hook.
import React from "react";
import { readReportParameter } from "@/components/report/reportParameterEvidence";
import RP22ComplianceParameterTile from "@/components/rp22/RP22ComplianceParameterTile";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import TechnicalParameterCard from "@/components/report/technical/TechnicalParameterCard";
import TechnicalParameterPage from "@/components/report/technical/TechnicalParameterPage";
import { getCategoryForParam, getCategoryColour, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";
import { useParameterGridAuthority } from "@/components/report/technical/useParameterGridAuthority.jsx";
import P15P21AssumptionControl from "@/components/report/P15P21AssumptionControl";

/* ---------- Canonical RP22 parameter definitions ---------- */
const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;
export const TECHNICAL_PARAMETER_CARDS_PER_PAGE = 3;

/**
 * Props:
 *   analysisResult      — from useRP22AnalysisEngine
 *   seatHudSnapshots    — { [seatId]: snapshot } object
 *   seatingPositions    — array of seat objects
 *   mlpSeatId           — id of the RSP/primary seat
 *   dolbyLayout         — e.g. "7.1.4"
 *   frontSubsCount      — number
 *   rearSubsCount       — number
 *   variant             — "screen" (default) or "print"
 *   contributionsByKey  — ASDR contributions by key
 */
export default function RP22ReportParameterGrid({
  engineeringSummary,
  analysisResult,
  seatHudSnapshots,
  seatingPositions,
  mlpSeatId,
  variant = "screen",
  contributionsByKey = null,
}) {
  const isPrintVariant = variant === "print";

  const authority = useParameterGridAuthority({
    engineeringSummary,
    contributionsByKey,
    seatingPositions,
  });

  const {
    getHudValueForParam,
    getHudLevelForParam,
    buildSeatGridData,
    buildAsdrFooter,
    resolveThresholds,
    bassPresentation,
    renderSeatPillGrid,
    buildP6Presentation,
  } = authority;

  /**
   * Seat results for a parameter, arranged as a seat-layout map.
   *
   * Seat-scoped parameters show their results in the shape of the seating plan.
   * P19 is RSP-scoped in the canonical catalogue, so no per-seat map is ever
   * built for it — the scope authority decides, not this grid.
   */
  const seatMapFor = (param) => (
    // P19 is RSP-scoped and assessed at the reference seating position alone, so
    // no P19 seat map is ever built — not even where a legacy catalogue entry or
    // a legacy stored publication states a seat scope for it.
    Number(param?.id) === 19
      ? null
      : String(param?.scope || "").toLowerCase() === "seat"
        ? buildSeatGridData(param.id)
        : null
  );

  /* ----- Render a single compliance tile (screen variant) ----- */
  const renderCard = (param) => {
    const resolvedThresholds = resolveThresholds(param);
    const atomic = readReportParameter(engineeringSummary, param.id);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14 || param.id === 18)
      ? { ...param, thresholds: resolvedThresholds }
      : param;
    const targetBasisNote =
      engineeringSummary?.roomResultsByParameter?.[param.id]?.targetBasisNote
      ?? engineeringSummary?.roomResultsByParameter?.[param.id]?.detail
      ?? null;
    const isP15P21 = param.id === 15 || param.id === 21;
    return (
      <div key={param.id} className="rp22-card-wrap print-avoid-break" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
        <RP22ComplianceParameterTile
          param={resolvedParam}
          achievedValue={engineeringSummary?.reportAuthority ? atomic.value : getHudValueForParam(param, { isPrintVariant })}
          lvl={engineeringSummary?.reportAuthority ? atomic.level : getHudLevelForParam(param)}
          seatGridData={seatMapFor(param)}
          targetBasisNote={targetBasisNote}
        />
        {isP15P21 && (
          <P15P21AssumptionControl
            paramId={param.id}
            variant="screen"
          />
        )}
      </div>
    );
  };

  /* ----- Render a single redesigned Technical Report parameter card (print variant) ----- */
  const renderPrintCard = (param) => {
    const resolvedThresholds = resolveThresholds(param);
    const atomic = readReportParameter(engineeringSummary, param.id);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14 || param.id === 18)
      ? { ...param, thresholds: resolvedThresholds }
      : param;
    const targetBasisNote =
      engineeringSummary?.roomResultsByParameter?.[param.id]?.targetBasisNote
      ?? engineeringSummary?.roomResultsByParameter?.[param.id]?.detail
      ?? null;
    const seatGridData = seatMapFor(param);
    const humanTitle = getHumanTitleForParam(param.id) + (param.id === 10 ? ' — Project/all-seat floor' : '');
    const category = getCategoryForParam(param.id);
    const asdrFooter = buildAsdrFooter(param.id);

    const achievedValue = engineeringSummary?.reportAuthority ? atomic.value : getHudValueForParam(param, { isPrintVariant });
    const lvl = engineeringSummary?.reportAuthority ? atomic.level : getHudLevelForParam(param);

    const isP15P21 = param.id === 15 || param.id === 21;
    return (
      <div key={param.id}>
        <TechnicalParameterCard
          param={resolvedParam}
          achievedValue={achievedValue}
          lvl={lvl}
          category={category}
          categoryColour={getCategoryColour(category)}
          humanTitle={humanTitle}
          seatGridData={seatGridData}
          targetBasisNote={targetBasisNote}
          asdrFooter={asdrFooter}
          assumed={engineeringSummary?.roomResultsByParameter?.[param.id]?.assumed === true}
        />
        {isP15P21 && (
          <P15P21AssumptionControl
            paramId={param.id}
            variant="print"
          />
        )}
      </div>
    );
  };

  if (isPrintVariant) {
    // Each page still carries three cards. Within the page, consecutive cards
    // are grouped into category runs, so a page crossing from Spatial
    // Resolution into Dynamic Range prints a Dynamic Range banner before its
    // first Dynamic Range parameter instead of one mixed heading. Every run
    // states the canonical category name and nothing else: a category that
    // began on an earlier page prints its own banner, never a note about
    // pagination, and the category itself always comes from the canonical map.
    const pages = [];
    for (let i = 0; i < RP22_PARAMS.length; i += TECHNICAL_PARAMETER_CARDS_PER_PAGE) {
      const pageParams = RP22_PARAMS.slice(i, i + TECHNICAL_PARAMETER_CARDS_PER_PAGE);
      const segments = [];
      pageParams.forEach((param) => {
        const category = getCategoryForParam(param.id);
        const previous = segments[segments.length - 1];
        if (previous && previous.category === category) {
          previous.params.push(param);
          return;
        }
        segments.push({ category, params: [param] });
      });
      pages.push({ pageParams, segments });
    }

    return (
      <div className="rp22-params-grid rp22-params-print-groups tech-params-print-groups">
        {pages.map((page, pageIdx) => (
          <TechnicalParameterPage
            key={pageIdx}
            params={page.pageParams}
            isFirst={pageIdx === 0}
            segments={page.segments.map((segment) => ({
              category: segment.category,
              cards: segment.params.map((param) => renderPrintCard(param)),
            }))}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="rp22-params-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {RP22_PARAMS.map((param) => renderCard(param))}
    </div>
  );
}