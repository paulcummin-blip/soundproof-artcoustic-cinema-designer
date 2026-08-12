/**
 * ParameterExplorer.jsx
 * ----------------------
 * Stage C — Compact parameter explorer for the Design Review workspace.
 *
 * Renders compact rows for all RP22 parameters with filter bar.
 * One parameter expands at a time into a TechnicalParameterCard (screen variant).
 *
 * Uses the shared useParameterGridAuthority hook — same computation
 * authority as RP22ReportParameterGrid. No parallel parameter grading.
 *
 * Does NOT mount useRP22AnalysisEngine. Reads analysisResult from the
 * shared window.__ROOM_DESIGNER_ASDR__ store.
 */

import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { useParameterGridAuthority } from "@/components/report/technical/useParameterGridAuthority.jsx";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import TechnicalParameterCard from "@/components/report/technical/TechnicalParameterCard";
import { getWeaknessBand, needsAttention } from "@/components/designreview/needsAttentionAuthority";

const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
  fail: "#8B2E2E",
  warn: "#8B5E34",
  muted: "#77736B",
  hover: "#F8F7F5",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const FILTERS = [
  { key: "needs", label: "NEEDS ATTENTION" },
  { key: "all", label: "ALL" },
  { key: "spatial", label: "SPATIAL" },
  { key: "dynamic", label: "DYNAMIC" },
  { key: "timbre", label: "TIMBRE" },
];

// Map numeric RP22 keys to string keys (same as useAppDesignRating)
const SEAT_PARAM_KEY_MAP = {
  1: 'p1', 4: 'p4', 5: 'p5', 6: 'p6',
  9: 'p9', 10: 'p10', 16: 'p16', 17: 'p17',
  19: 'p19', 20: 'p20',
};

/** Build lightweight seatHudSnapshots from analysisResult.perSeatRp22. */
function buildSeatHudFromAnalysis(analysisResult, seats) {
  const out = {};
  const perSeatRp22 = analysisResult?.perSeatRp22;
  if (!perSeatRp22) return out;
  for (const seat of seats) {
    if (!seat?.id) continue;
    const seatData = perSeatRp22[seat.id];
    if (!seatData) continue;
    const rp22 = {};
    const srcRp22 = seatData?.rp22 || {};
    for (const [numKey, strKey] of Object.entries(SEAT_PARAM_KEY_MAP)) {
      const metric = srcRp22[numKey];
      if (metric != null) rp22[strKey] = metric;
    }
    out[seat.id] = { rp22, seatId: seat.id, isPrimary: !!seat.isPrimary };
  }
  return out;
}

function getSeverityColors(band) {
  if (band === 3) return { color: COLORS.fail, bg: "#FCF0F0", border: COLORS.fail };
  if (band === 2) return { color: COLORS.warn, bg: "#F5EDE3", border: "#E0D4C2" };
  if (band === 1) return { color: COLORS.secondary, bg: "#F0EFEA", border: COLORS.borderStrong };
  return { color: COLORS.label, bg: "#F3F2EF", border: COLORS.border };
}

function getSeverityLabel(band) {
  if (band === 3) return "FAIL";
  if (band === 2) return "L1";
  if (band === 1) return "L2";
  return "L3+";
}

export default function ParameterExplorer({
  rating,
  analysisResult,
  projectId,
  expandedParamKey,
  onExpandParam,
  activeFilter,
  onFilterChange,
}) {
  const app = useAppState();
  const seats = app?.seatingPositions || [];
  const mlpSeatId = useMemo(() => {
    const primary = seats.find(s => s?.isPrimary && s?.id);
    return primary?.id || seats[0]?.id || "";
  }, [seats]);

  const completedBassAuthority = useCompletedBassAuthority(projectId || "free");
  const bassErrorMessage = completedBassAuthority?.errorMessage || null;

  // Build seatHudSnapshots from analysisResult.perSeatRp22
  const seatHudSnapshots = useMemo(
    () => buildSeatHudFromAnalysis(analysisResult, seats),
    [analysisResult, seats]
  );

  // Build contributionsByKey from rating
  const contributionsByKey = useMemo(() => {
    if (!rating?.contributions) return null;
    const map = {};
    for (const contrib of rating.contributions) {
      map[contrib.key] = contrib;
    }
    return map;
  }, [rating]);

  const authority = useParameterGridAuthority({
    analysisResult,
    seatHudSnapshots,
    seatingPositions: seats,
    mlpSeatId,
    p15ConstructionLevel: app?.p15ConstructionLevel,
    p21EarlyReflectionPreset: app?.p21EarlyReflectionPreset,
    bassAuthority: completedBassAuthority,
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
    buildP6Presentation,
    lockedSeatId,
  } = authority;

  // Filter parameters
  const filteredParams = useMemo(() => {
    if (activeFilter === "all") return RP22_PARAMS;
    if (activeFilter === "needs") {
      return RP22_PARAMS.filter((p) => {
        const key = `p${p.id}`;
        const contrib = contributionsByKey?.[key];
        return contrib && needsAttention(contrib);
      });
    }
    if (activeFilter === "spatial") return RP22_PARAMS.filter(p => getCategoryForParam(p.id) === "Spatial Resolution");
    if (activeFilter === "dynamic") return RP22_PARAMS.filter(p => getCategoryForParam(p.id) === "Dynamic Range");
    if (activeFilter === "timbre") return RP22_PARAMS.filter(p => getCategoryForParam(p.id) === "Timbre Matching");
    return RP22_PARAMS;
  }, [activeFilter, contributionsByKey]);

  // Scroll expanded detail into view
  const expandedRef = useRef(null);
  useEffect(() => {
    if (expandedParamKey && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedParamKey]);

  const handleRowClick = useCallback((param) => {
    const key = `p${param.id}`;
    if (expandedParamKey === key) {
      onExpandParam(null);
    } else {
      onExpandParam(key);
    }
  }, [expandedParamKey, onExpandParam]);

  if (!analysisResult) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", color: COLORS.muted, fontFamily: FONT_BODY, fontSize: 13 }}>
        Parameter data not available. Open the project in the Room Designer to populate the Parameter Explorer.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Filter bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${COLORS.border}`,
        overflowX: "auto",
      }}>
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              style={{
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontFamily: FONT_BODY,
                color: isActive ? COLORS.primary : COLORS.muted,
                background: isActive ? "#F8F7F5" : "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${COLORS.primary}` : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Compact rows */}
      <div>
        {filteredParams.length === 0 ? (
          <div style={{ padding: "20px 16px", textAlign: "center", color: COLORS.muted, fontFamily: FONT_BODY, fontSize: 12 }}>
            No parameters in this filter.
          </div>
        ) : (
          filteredParams.map((param) => {
            const key = `p${param.id}`;
            const contrib = contributionsByKey?.[key];
            const resultLevel = contrib?.resultLevel || "";
            const band = getWeaknessBand(resultLevel);
            const isExpanded = expandedParamKey === key;
            const humanTitle = getHumanTitleForParam(param.id);
            const category = getCategoryForParam(param.id);

            return (
              <div key={param.id} ref={isExpanded ? expandedRef : null}>
                {/* Compact row */}
                <div
                  onClick={() => handleRowClick(param)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderTop: `1px solid ${COLORS.border}`,
                    cursor: "pointer",
                    background: isExpanded ? "#F8F7F5" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = COLORS.hover; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* P-number */}
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: COLORS.primary,
                    fontFamily: FONT_BODY,
                    minWidth: 28,
                    flexShrink: 0,
                  }}>
                    P{param.id}
                  </span>

                  {/* Title */}
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.primary,
                    fontFamily: FONT_BODY,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {humanTitle}
                  </span>

                  {/* Result level */}
                  <span style={{
                    fontSize: 11,
                    color: COLORS.body,
                    fontFamily: FONT_BODY,
                    whiteSpace: "nowrap",
                  }}>
                    {resultLevel || "—"}
                  </span>

                  {/* Status badge */}
                  {band > 0 ? (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontFamily: FONT_BODY,
                      whiteSpace: "nowrap",
                      ...getSeverityColors(band),
                      border: `1px solid ${getSeverityColors(band).border}`,
                    }}>
                      {getSeverityLabel(band)}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontFamily: FONT_BODY,
                      whiteSpace: "nowrap",
                      color: COLORS.label,
                      background: "#F3F2EF",
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      OK
                    </span>
                  )}
                </div>

                {/* Expanded detail — one at a time, only for expanded row */}
                {isExpanded && (
                  <ExpandedParameterDetail
                    param={param}
                    analysisResult={analysisResult}
                    bassPresentation={bassPresentation}
                    resolveThresholds={resolveThresholds}
                    resolveP12P13DualLevels={resolveP12P13DualLevels}
                    getHudValueForParam={getHudValueForParam}
                    getHudLevelForParam={getHudLevelForParam}
                    buildSeatGridData={buildSeatGridData}
                    buildAsdrFooter={buildAsdrFooter}
                    buildP6Presentation={buildP6Presentation}
                    lockedSeatId={lockedSeatId}
                    category={category}
                    humanTitle={humanTitle}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Expanded parameter detail — renders TechnicalParameterCard with variant="screen". */
function ExpandedParameterDetail({
  param,
  analysisResult,
  contributionsByKey,
  bassPresentation,
  resolveThresholds,
  resolveP12P13DualLevels,
  getHudValueForParam,
  getHudLevelForParam,
  buildSeatGridData,
  buildAsdrFooter,
  buildP6Presentation,
  lockedSeatId,
  category,
  humanTitle,
}) {
  const resolvedThresholds = resolveThresholds(param);
  const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14)
    ? { ...param, thresholds: resolvedThresholds }
    : param;

  const targetBasisNote = (param.id === 12 || param.id === 13)
    ? (() => {
        const v = analysisResult?.gradedParameters?.primary?.[param.id]?.value;
        const dual = resolveP12P13DualLevels(param.id, v);
        return dual ? `Minimum ${dual.minimum} · Recommended ${dual.recommended}` : null;
      })()
    : param.id === 14 ? bassPresentation.parameters.p14.detail : null;

  const isSeatScope = String(param.scope || "").toLowerCase() === "seat";
  const seatGridData = isSeatScope ? buildSeatGridData(param.id) : null;
  const asdrFooter = buildAsdrFooter(param.id);

  let achievedValue = getHudValueForParam(param);
  let lvl = getHudLevelForParam(param);
  let rspLabel = lockedSeatId ? formatSeatLabel(lockedSeatId) : null;

  // P6 special case: worst seat spread
  if (param.id === 6) {
    const p6 = buildP6Presentation();
    achievedValue = p6.achievedValue;
    if (p6.lvl !== null) lvl = p6.lvl;
    rspLabel = null;
  }

  return (
    <div style={{ padding: "8px 14px 16px", background: "#FBFAF8", borderTop: `1px solid ${COLORS.border}` }}>
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
        variant="screen"
      />
    </div>
  );
}