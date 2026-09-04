// components/report/RP22ReportParameterGrid.jsx
// 3-column grid of exact Compliance Report tiles for the RP22 Report page.
// Stage C: Computation logic extracted to shared useParameterGridAuthority hook.
import React from "react";
import RP22ComplianceParameterTile from "@/components/rp22/RP22ComplianceParameterTile";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import TechnicalParameterCard from "@/components/report/technical/TechnicalParameterCard";
import TechnicalParameterPage from "@/components/report/technical/TechnicalParameterPage";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { useParameterGridAuthority } from "@/components/report/technical/useParameterGridAuthority.jsx";
import P15P21AssumptionControl from "@/components/report/P15P21AssumptionControl";

/* ---------- Canonical RP22 parameter definitions ---------- */
const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

/**
 * Props:
 *   analysisResult      — from useRP22AnalysisEngine
 *   seatHudSnapshots    — { [seatId]: snapshot } object
 *   seatingPositions    — array of seat objects
 *   mlpSeatId           — id of the RSP/primary seat
 *   dolbyLayout         — e.g. "7.1.4"
 *   frontSubsCount      — number
 *   rearSubsCount       — number
 *   assumedP15Level
 *   assumedP21Level
 *   bassAuthority
 *   bassErrorMessage
 *   variant             — "screen" (default) or "print"
 *   contributionsByKey  — ASDR contributions by key
 */
export default function RP22ReportParameterGrid({
  analysisResult,
  seatHudSnapshots,
  seatingPositions,
  mlpSeatId,
  assumedP15Level,
  assumedP21Level,
  setAssumedP15LevelSafe,
  setAssumedP21LevelSafe,
  bassAuthority = null,
  bassErrorMessage = null,
  variant = "screen",
  contributionsByKey = null,
}) {
  const isPrintVariant = variant === "print";

  const authority = useParameterGridAuthority({
    analysisResult,
    seatHudSnapshots,
    seatingPositions,
    mlpSeatId,
    assumedP15Level,
    assumedP21Level,
    bassAuthority,
    bassErrorMessage,
    contributionsByKey,
  });

  const {
    getHudValueForParam,
    getHudLevelForParam,
    buildSeatGridData,
    buildAsdrFooter,
    resolveThresholds,
    resolveP12P13DualLevels,
    bassPresentation,
    renderSeatPillGrid,
    buildP6Presentation,
  } = authority;

  /* ----- Render a single compliance tile (screen variant) ----- */
  const renderCard = (param) => {
    const resolvedThresholds = resolveThresholds(param);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14 || param.id === 18)
      ? { ...param, thresholds: resolvedThresholds }
      : param;
    const isSeatScope = String(param.scope || "").toLowerCase() === "seat";
    const targetBasisNote =
      (param.id === 12 || param.id === 13)
        ? (() => {
            const v = analysisResult?.gradedParameters?.primary?.[param.id]?.value;
            const dual = resolveP12P13DualLevels(param.id, v);
            return dual ? `Minimum ${dual.minimum} · Recommended ${dual.recommended}` : null;
          })()
        : param.id === 14 ? bassPresentation.parameters.p14.detail : null;
    const isP15P21 = param.id === 15 || param.id === 21;
    return (
      <div key={param.id} className="rp22-card-wrap print-avoid-break" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
        <RP22ComplianceParameterTile
          param={resolvedParam}
          achievedValue={getHudValueForParam(param, { isPrintVariant })}
          lvl={getHudLevelForParam(param)}
          seatGridData={isSeatScope ? buildSeatGridData(param.id) : null}
          targetBasisNote={targetBasisNote}
        />
        {isP15P21 && (
          <P15P21AssumptionControl
            paramId={param.id}
            value={param.id === 15 ? assumedP15Level : assumedP21Level}
            onChange={param.id === 15 ? setAssumedP15LevelSafe : setAssumedP21LevelSafe}
            variant="screen"
          />
        )}
      </div>
    );
  };

  /* ----- Render a single redesigned Technical Report parameter card (print variant) ----- */
  const renderPrintCard = (param) => {
    const resolvedThresholds = resolveThresholds(param);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14 || param.id === 18)
      ? { ...param, thresholds: resolvedThresholds }
      : param;
    const targetBasisNote =
      (param.id === 12 || param.id === 13)
        ? (() => {
            const v = analysisResult?.gradedParameters?.primary?.[param.id]?.value;
            const dual = resolveP12P13DualLevels(param.id, v);
            return dual ? `Minimum ${dual.minimum} · Recommended ${dual.recommended}` : null;
          })()
        : param.id === 14 ? bassPresentation.parameters.p14.detail : null;
    const isSeatScope = String(param.scope || "").toLowerCase() === "seat";
    const seatGridData = isSeatScope ? buildSeatGridData(param.id) : null;
    const humanTitle = getHumanTitleForParam(param.id);
    const category = getCategoryForParam(param.id);
    const asdrFooter = buildAsdrFooter(param.id);

    // P6 presentation: show seat spread across all seats, omit RSP label.
    let achievedValue = getHudValueForParam(param, { isPrintVariant });
    let lvl = getHudLevelForParam(param);
    let rspLabel = authority.lockedSeatId ? formatSeatLabel(authority.lockedSeatId) : null;

    if (param.id === 6) {
      const p6 = buildP6Presentation();
      achievedValue = p6.achievedValue;
      if (p6.lvl !== null) lvl = p6.lvl;
      rspLabel = null;
    }

    const isP15P21 = param.id === 15 || param.id === 21;
    return (
      <div key={param.id}>
        <TechnicalParameterCard
          param={resolvedParam}
          achievedValue={achievedValue}
          lvl={lvl}
          category={category}
          humanTitle={humanTitle}
          seatGridData={seatGridData}
          targetBasisNote={targetBasisNote}
          rspLabel={rspLabel}
          asdrFooter={asdrFooter}
        />
        {isP15P21 && (
          <P15P21AssumptionControl
            paramId={param.id}
            value={param.id === 15 ? assumedP15Level : assumedP21Level}
            variant="print"
          />
        )}
      </div>
    );
  };

  if (isPrintVariant) {
    const groups = [];
    for (let i = 0; i < RP22_PARAMS.length; i += 3) {
      groups.push(RP22_PARAMS.slice(i, i + 3));
    }
    return (
      <div className="rp22-params-grid rp22-params-print-groups tech-params-print-groups">
        {groups.map((group, groupIdx) => (
          <TechnicalParameterPage key={groupIdx} params={group} isFirst={groupIdx === 0}>
            {group.map((param) => renderPrintCard(param))}
          </TechnicalParameterPage>
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