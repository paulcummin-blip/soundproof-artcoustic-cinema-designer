/**
 * ProjectReportParameterCards.jsx
 * -------------------------------
 * The consolidated Project Report's technical-evidence block: the SAME
 * TechnicalParameterCard the Technical Report prints — human title, RP22 level
 * pill, achieved value, thresholds, scope label, assumed/target-basis note,
 * per-seat result grid and ASDR footer — for the parameters a report page is the
 * detailed page for.
 *
 * The Technical Report's own presentation component and the one parameter-grid
 * authority are reused, so the consolidated report states exactly the values the
 * Technical Report states: nothing is recalculated, re-graded, re-derived or
 * copied, and no second parameter-card layout exists.
 *
 * Props:
 *   engineeringSummary — the published engineering summary (single authority)
 *   seatingPositions   — the design's seating, so a seat-scoped card lays its
 *                        results out in the seating plan's own shape
 *   parameterIds       — which parameters this page is the evidence for
 *   contributionsByKey — ASDR contributions, when the publication carries them
 *   variant            — "screen" (default) or "print"
 */

import React from "react";

import TechnicalParameterCard from "@/components/report/technical/TechnicalParameterCard";
import { useParameterGridAuthority } from "@/components/report/technical/useParameterGridAuthority.jsx";
import {
  getCategoryColour,
  getCategoryForParam,
  getHumanTitleForParam,
} from "@/components/report/technical/technicalParameterMeta";
import { readReportParameter } from "@/components/report/reportParameterEvidence";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import P15P21AssumptionControl from "@/components/report/P15P21AssumptionControl";

// The canonical parameter catalogue, keyed by id. The catalogue is the same one
// the Technical Report's grid reads, so a card's thresholds, scope and title
// cannot differ between the two documents.
const PARAM_BY_ID = new Map(
  RP22_PRESENTATION_PARAMETERS.map((param) => [Number(param.id), param]),
);

// P12/P13/P14/P18 state their thresholds per target basis, so the resolved set
// is the one the card must print. The resolution itself is the shared
// authority's, never this component's.
const BASIS_DEPENDENT_IDS = [12, 13, 14, 18];

export default function ProjectReportParameterCards({
  engineeringSummary,
  seatingPositions = null,
  parameterIds = [],
  contributionsByKey = null,
  variant = "screen",
}) {
  const isPrint = variant === "print";

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
  } = authority;

  const ids = (Array.isArray(parameterIds) ? parameterIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && PARAM_BY_ID.has(id));

  if (ids.length === 0) return null;

  return (
    <div
      className="project-report-parameter-cards"
      data-report-block-kind="rp22-parameter-cards"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: isPrint ? "3mm" : 12,
      }}
    >
      {ids.map((id) => {
        const param = PARAM_BY_ID.get(id);
        const resolvedParam = BASIS_DEPENDENT_IDS.includes(id)
          ? { ...param, thresholds: resolveThresholds(param) }
          : param;
        const atomic = readReportParameter(engineeringSummary, id);
        // No seat grid is ever built for a parameter the catalogue does not
        // assess seat by seat — P19 is RSP-scoped, so it prints as one result
        // however a legacy publication stored it.
        const seatScoped = String(param?.scope || "").toLowerCase() === "seat";
        const seatGridData = id === 19 || !seatScoped ? null : buildSeatGridData(id);
        const category = getCategoryForParam(id);
        const humanTitle = getHumanTitleForParam(id)
          + (id === 10 ? " — Project/all-seat floor" : "");
        const targetBasisNote =
          engineeringSummary?.roomResultsByParameter?.[id]?.targetBasisNote
          ?? engineeringSummary?.roomResultsByParameter?.[id]?.detail
          ?? null;
        const achievedValue = engineeringSummary?.reportAuthority
          ? atomic.value
          : getHudValueForParam(param);
        const lvl = engineeringSummary?.reportAuthority
          ? atomic.level
          : getHudLevelForParam(param);

        return (
          <div
            key={id}
            className="project-report-parameter-card print-avoid-break"
            data-report-param-card={id}
            style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
          >
            <TechnicalParameterCard
              param={resolvedParam}
              achievedValue={achievedValue}
              lvl={lvl}
              category={category}
              categoryColour={getCategoryColour(category)}
              humanTitle={humanTitle}
              seatGridData={seatGridData}
              targetBasisNote={targetBasisNote}
              asdrFooter={buildAsdrFooter(id)}
              assumed={engineeringSummary?.roomResultsByParameter?.[id]?.assumed === true}
            />
            {/* P15 and P21 are the two parameters the designer must assume, so
                their assumption control travels with their own card — never a
                second control somewhere else in the document. */}
            {(id === 15 || id === 21) && (
              <P15P21AssumptionControl paramId={id} variant={isPrint ? "print" : "screen"} />
            )}
          </div>
        );
      })}
    </div>
  );
}