/**
 * ParameterExplorer.jsx
 * ----------------------
 * Compact parameter explorer for the Design Review workspace.
 *
 * Reports RP22 Performance Levels as neutral RESULTS — no subjective status
 * (OK / Needs Attention). L1–L4 are legitimate Performance Levels and may be
 * the deliberate project brief. FAIL is the only genuine failure state
 * (parameter does not achieve Level 1).
 *
 * Compact row format:
 *   P-number | TITLE | SCOPE | RESULT
 *
 * RESULT:
 *   - ROOM-scope: the achieved Performance Level (e.g. "L4")
 *   - SEAT-scope: the full distribution (e.g. "1×L4 · 2×L3 · 2×L2")
 *   - N/A or — where a parameter is genuinely not applicable or has no result
 *
 * Filters: ALL · ROOM · SEAT · SPATIAL · DYNAMIC · TIMBRE
 * (ROOM/SEAT use canonical param.scope; SPATIAL/DYNAMIC/TIMBRE use category)
 *
 * Uses the shared useParameterGridAuthority hook — same computation authority
 * as RP22ReportParameterGrid. No parallel parameter grading.
 */

import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { useParameterGridAuthority } from "@/components/report/technical/useParameterGridAuthority.jsx";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";
import ExpandedParameterDetail from "@/components/designreview/ExpandedParameterDetail";
import { normalizeLevel, LEVEL_TEXT_COLORS } from "@/components/designreview/needsAttentionAuthority";

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
  muted: "#77736B",
  hover: "#F8F7F5",
};

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const FILTERS = [
  { key: "all", label: "ALL" },
  { key: "room", label: "ROOM" },
  { key: "seat", label: "SEAT" },
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

/** Neutral coloured level text (identifies the level, no judgement). */
function levelColor(norm) {
  if (!norm) return COLORS.muted;
  return LEVEL_TEXT_COLORS[norm] || COLORS.body;
}

/** Render a single room-scope level as neutral coloured text. */
function RoomLevelText({ param, level, value }) {
  // P8 is N/A when no upfiring / elevation speakers
  if (param.id === 8) {
    if (value === "No" || value === "—" || value === "N/A" || !value) {
      return <span style={{ fontSize: 11, color: COLORS.label, fontFamily: FONT_BODY }}>N/A</span>;
    }
  }
  const norm = normalizeLevel(level);
  if (!norm || norm === "N/A") {
    return <span style={{ fontSize: 11, color: COLORS.label, fontFamily: FONT_BODY }}>N/A</span>;
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: levelColor(norm), fontFamily: FONT_BODY }}>
      {norm}
    </span>
  );
}

/** Render a seat-scope distribution as neutral coloured segments. */
function DistributionText({ gridData }) {
  if (!gridData || !gridData.length) {
    return <span style={{ fontSize: 11, color: COLORS.label, fontFamily: FONT_BODY }}>—</span>;
  }
  const order = ["L4", "L3", "L2", "L1", "FAIL"];
  const counts = { L4: 0, L3: 0, L2: 0, L1: 0, FAIL: 0, NA: 0 };
  for (const row of gridData) {
    for (const seat of row.seats) {
      const norm = normalizeLevel(seat.level);
      if (norm === "N/A") counts.NA++;
      else if (norm && counts[norm] != null) counts[norm]++;
    }
  }
  const parts = order.filter((l) => counts[l] > 0).map((l) => ({ label: l, count: counts[l] }));
  if (!parts.length) {
    return (
      <span style={{ fontSize: 11, color: COLORS.label, fontFamily: FONT_BODY }}>
        {counts.NA > 0 ? "N/A" : "—"}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: FONT_BODY,
        whiteSpace: "nowrap",
      }}
    >
      {parts.map((p, i) => (
        <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <span style={{ color: "#C1B6AD" }}>·</span>}
          <span style={{ color: COLORS.body }}>{p.count}×</span>
          <span style={{ fontWeight: 700, color: levelColor(p.label) }}>{p.label}</span>
        </span>
      ))}
    </span>
  );
}

export default function ParameterExplorer({
  rating,
  analysisResult,
  projectId,
  expandedParamKey,
  onExpandParam,
  activeFilter,
  onFilterChange,
  seatingPositions,
}) {
  const app = useAppState();
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const mlpSeatId = useMemo(() => {
    const primary = seats.find((s) => s?.isPrimary && s?.id);
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
    assumedP15Level: app?.assumedP15Level,
    assumedP21Level: app?.assumedP21Level,
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

  // Filter parameters — ROOM/SEAT use canonical param.scope
  const filteredParams = useMemo(() => {
    if (activeFilter === "all") return RP22_PARAMS;
    if (activeFilter === "room")
      return RP22_PARAMS.filter((p) => String(p.scope || "").toLowerCase() === "room");
    if (activeFilter === "seat")
      return RP22_PARAMS.filter((p) => String(p.scope || "").toLowerCase() === "seat");
    if (activeFilter === "spatial")
      return RP22_PARAMS.filter((p) => getCategoryForParam(p.id) === "Spatial Resolution");
    if (activeFilter === "dynamic")
      return RP22_PARAMS.filter((p) => getCategoryForParam(p.id) === "Dynamic Range");
    if (activeFilter === "timbre")
      return RP22_PARAMS.filter((p) => getCategoryForParam(p.id) === "Timbre Matching");
    return RP22_PARAMS;
  }, [activeFilter]);

  // Pre-compute row result data for every parameter (seat distribution or room level)
  const rowResultData = useMemo(() => {
    const map = {};
    for (const param of RP22_PARAMS) {
      const isSeatScope = String(param.scope || "").toLowerCase() === "seat";
      if (isSeatScope) {
        map[param.id] = { isSeat: true, gridData: buildSeatGridData(param.id) };
      } else {
        map[param.id] = {
          isSeat: false,
          level: getHudLevelForParam(param),
          value: getHudValueForParam(param),
        };
      }
    }
    return map;
  }, [buildSeatGridData, getHudLevelForParam, getHudValueForParam]);

  // Scroll expanded detail into view
  const expandedRef = useRef(null);
  useEffect(() => {
    if (expandedParamKey && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedParamKey]);

  const handleRowClick = useCallback(
    (param) => {
      const key = `p${param.id}`;
      if (expandedParamKey === key) {
        onExpandParam(null);
      } else {
        onExpandParam(key);
      }
    },
    [expandedParamKey, onExpandParam]
  );

  if (!analysisResult) {
    return (
      <div
        style={{
          padding: "24px 16px",
          textAlign: "center",
          color: COLORS.muted,
          fontFamily: FONT_BODY,
          fontSize: 13,
        }}
      >
        Parameter data not available. Open the project in the Room Designer to populate the
        Parameter Explorer.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${COLORS.border}`,
          overflowX: "auto",
        }}
      >
        {FILTERS.map((f) => {
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
                borderBottom: isActive
                  ? `2px solid ${COLORS.primary}`
                  : "2px solid transparent",
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

      <div
        style={{
          padding: "7px 14px",
          borderBottom: `1px solid ${COLORS.border}`,
          color: COLORS.muted,
          fontSize: 10,
          fontFamily: FONT_BODY,
        }}
      >
        Select a parameter to view its detail. SEAT rows open the seating result map.
      </div>

      {/* Compact rows */}
      <div>
        {filteredParams.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              textAlign: "center",
              color: COLORS.muted,
              fontFamily: FONT_BODY,
              fontSize: 12,
            }}
          >
            No parameters in this filter.
          </div>
        ) : (
          filteredParams.map((param) => {
            const key = `p${param.id}`;
            const isExpanded = expandedParamKey === key;
            const humanTitle = getHumanTitleForParam(param.id);
            const category = getCategoryForParam(param.id);
            const scopeLabel = String(param.scope || "").toUpperCase();
            const result = rowResultData[param.id];

            return (
              <div key={param.id} ref={isExpanded ? expandedRef : null}>
                {/* Compact row: P-number | Title | Scope | Result */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} P${param.id} ${humanTitle}${result?.isSeat ? " seat result map" : " details"}`}
                  title={result?.isSeat ? "Open seating result map" : "Open parameter details"}
                  onClick={() => handleRowClick(param)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(param);
                    }
                  }}
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
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = COLORS.hover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {/* P-number */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: COLORS.primary,
                      fontFamily: FONT_BODY,
                      minWidth: 28,
                      flexShrink: 0,
                    }}
                  >
                    P{param.id}
                  </span>

                  {/* Title */}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLORS.primary,
                      fontFamily: FONT_BODY,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {humanTitle}
                  </span>

                  {/* Scope */}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: COLORS.label,
                      letterSpacing: "0.06em",
                      fontFamily: FONT_BODY,
                      minWidth: 42,
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    {scopeLabel}
                  </span>

                  {/* Result */}
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      minWidth: 120,
                      flexShrink: 0,
                    }}
                  >
                    {result?.isSeat ? (
                      <DistributionText gridData={result.gridData} />
                    ) : (
                      <RoomLevelText
                        param={param}
                        level={result?.level}
                        value={result?.value}
                      />
                    )}
                  </span>

                  {/* Explicit expansion affordance — especially important for SEAT maps. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 5,
                      minWidth: 48,
                      flexShrink: 0,
                      color: isExpanded ? COLORS.primary : COLORS.muted,
                      fontFamily: FONT_BODY,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {result?.isSeat ? "MAP" : "DETAIL"}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </span>
                </div>

                {/* Expanded detail — one at a time */}
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
                    seatingPositions={seats}
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