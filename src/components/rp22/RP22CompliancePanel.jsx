// components/rp22/RP22CompliancePanel.jsx
import React, { useMemo, useCallback } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { computeScreenMetrics } from "@/components/utils/screenMetrics";
import { renderPrimitive } from "@/components/utils/renderSafe";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import { resolveParamThresholds, resolveP12P13DualLevels } from "@/components/report/technical/roomParameterLevelAuthority";
import ComplianceParameterMatrix from "@/components/rp22/ComplianceParameterMatrix";
import { getOfficialRp22Title } from "@/components/utils/rp22OfficialTitles";
import P15P21AssumptionControl from "@/components/report/P15P21AssumptionControl";
import {
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  resolveAssumedP15Level,
  resolveAssumedP21Level,
  normalizeAssumedLevel,
} from "@/components/utils/assumedParameterAuthority";

/* ---------- Helpers */

// Horizontal FOV → distance (m)
function distanceForFov(widthM, fovDeg) {
  const r = (fovDeg * Math.PI) / 180;
  return (widthM / 2) / Math.tan(r / 2);
}

// Compare achieved value against thresholds
function levelFor(value, t) {
  if (!t) return 0;

  // '=' exact-match mode (strings like "Yes"/"No" or numeric 0)
  if (t.direction === "=") {
    if (value == null) return 0;
    const v = String(value).toLowerCase();
    if (String(t.L4 ?? "").toLowerCase() === v) return 4;
    if (String(t.L3 ?? "").toLowerCase() === v) return 3;
    if (String(t.L2 ?? "").toLowerCase() === v) return 2;
    if (String(t.L1 ?? "").toLowerCase() === v) return 1;
    return 0;
  }

  // '<=' or '>=' numeric comparison
  const pass = (k) => {
    const trg = t[k];
    if (trg == null || value == null || Number.isNaN(Number(value))) return false;
    const v = Number(value);
    const n = Number(trg);
    return t.direction === "<=" ? v <= n : v >= n;
  };

  if (pass("L4")) return 4;
  if (pass("L3")) return 3;
  if (pass("L2")) return 2;
  if (pass("L1")) return 1;
  return 0;
}

const levelText = (lvl) => {
  const str = String(lvl).toUpperCase();
  if (str === "L4" || lvl === 4) return "L4";
  if (str === "L3" || lvl === 3) return "L3";
  if (str === "L2" || lvl === 2) return "L2";
  if (str === "L1" || lvl === 1) return "L1";
  if (str === "FAIL" || lvl === 0) return "Fail";
  return str; // Return as-is for "—", "N/A", etc.
};

// Format inequality symbols for display (proper Unicode glyphs)
const fmtIneq = (dir) => {
  if (dir === ">=") return "≥";
  if (dir === "<=") return "≤";
  if (dir === ">") return ">";
  if (dir === "<") return "<";
  if (dir === "=") return "=";
  return String(dir || "");
};

const pillStyle = (lvl) => {
  const base = {
    border: "1px solid #C1B6AD",
    borderRadius: "9999px",
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
  };
  
  // Handle string levels ("L4", "L3", "L2", "L1", "FAIL", "N/A", "—")
  const lvlStr = String(lvl).toUpperCase();
  if (lvlStr === "L4" || lvl === 4) return { ...base, background: "#F6F3EE", color: "#213428" };
  if (lvlStr === "L3" || lvl === 3) return { ...base, background: "#E9ECEF", color: "#3E4349" };
  if (lvlStr === "L2" || lvl === 2) return { ...base, background: "#EFEAE4", color: "#625143" };
  if (lvlStr === "L1" || lvl === 1) return { ...base, background: "#FBE9E7", color: "#A7302F" };
  if (lvlStr === "FAIL" || lvl === 0) return { ...base, background: "#FBE9E7", color: "#A7302F" };
  if (lvlStr === "N/A" || lvlStr === "—" || lvlStr === "-" || lvlStr === "NO DATA") return { ...base, background: "#F0F0F0", color: "#999" };
  
  return { ...base, background: "#FBE9E7", color: "#A7302F" }; // Default to fail/L1
};

const chip = {
  background: "#F6F3EE",
  border: "1px solid #C1B6AD",
  color: "#1B1A1A",
  padding: "2px 8px",
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

const getMetricDisplayState = (metric) => {
  if (!metric || typeof metric !== "object") return { text: "Not Calculated", level: "—" };

  const hasRealValue = Object.keys(metric).some((key) => (
    key !== 'formatted' &&
    key !== 'level' &&
    key !== 'hudLabel' &&
    key !== 'notes' &&
    key !== 'debug' &&
    key !== 'details' &&
    key !== 'perSpeaker' &&
    key !== 'worstRole' &&
    key !== 'worstAngleDeg' &&
    key !== 'worstLossDb' &&
    key !== 'worstLossLabel' &&
    key !== 'worstGroup' &&
    key !== 'p17HasNaAngles' &&
    metric[key] != null
  ));

  const formatted = metric.formatted;
  const level = metric.level;

  if (formatted === '—') return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
  if (formatted === 'Not Calculated' && !hasRealValue && (level === '—' || level == null)) return { text: 'N/A', level };
  if (formatted) return { text: formatted, level };
  if (metric.hudLabel) return { text: metric.hudLabel, level };

  return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
};

// Small tokens
const card  = { border: "1px solid #DCDBD6", background: "#fff", borderRadius: 8 };
const head  = { padding: "12px 12px 0 12px" };
const title = { fontSize: 14, fontWeight: 700, color: "#1B1A1A" };
const sub   = { fontSize: 12, color: "#625143", marginTop: 4 };
const body  = { padding: "8px 12px 12px 12px" };
const row   = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };
const keyTx = { fontSize: 12, color: "#3E4349" };

const buildP16DebugText = (metric) => {
  const perSpeaker = metric?.debug?.perSpeaker;
  if (!perSpeaker || Object.keys(perSpeaker).length === 0) return "";
  return Object.entries(perSpeaker).map(([role, sp]) => {
    const isWorst = role === String(metric.debug?.worst?.role);
    const seatAz = Number.isFinite(sp?.seatAzDeg) ? sp.seatAzDeg.toFixed(1) : '—';
    const aim = Number.isFinite(sp?.aimDegRaw) ? sp.aimDegRaw.toFixed(1) : '—';
    const offAxis = Number.isFinite(sp?.offAxisRaw) ? sp.offAxisRaw.toFixed(1) : '—';
    const angle = Number.isFinite(sp?.angleDeg) ? sp.angleDeg : '—';
    const seat = Number.isFinite(sp?.continuousLossAtSeat) ? sp.continuousLossAtSeat.toFixed(2) : '—';
    const rsp = Number.isFinite(sp?.continuousLossAtRsp) ? sp.continuousLossAtRsp.toFixed(2) : '—';
    const delta = Number.isFinite(sp?.normalizedDelta) ? sp.normalizedDelta.toFixed(1) : '—';
    return `${isWorst ? '[worst] ' : ''}${role} seatAz=${seatAz} aim=${aim} offAxis=${offAxis} angle=${angle} | seat ${seat} dB | rsp ${rsp} dB | delta ${delta} dB`;
  }).join('\n');
};

const buildP17DebugText = (metric) => {
  if (!metric?.perSpeaker || metric.perSpeaker.length === 0) return "";
  const lines = [];
  // Engine P17 per-speaker quantity = seat-vs-RSP response delta (s.lossDb). Display the
  // actual numeric delta so the worst value matches the final raw P17 variation before
  // integer grading. No stepped buckets or placeholder 0.0 dB values.
  const speakerLine = metric.perSpeaker
    .slice()
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((s) => {
      const displayAngle = Number.isFinite(s?.rawAngleDeg) ? s.rawAngleDeg : s?.angleDeg;
      const angle = Number.isFinite(displayAngle) ? String(Math.floor(Math.abs(displayAngle) + 1e-9)) : '—';
      const rawDelta = Number.isFinite(s?.lossDb) ? Number(s.lossDb) : null;
      const deltaText = rawDelta == null ? '—' : `${rawDelta.toFixed(1)} dB`;
      const text = `${s.role} ${angle}° / ${deltaText}`;
      return metric?.worstRole === s.role ? `[worst] ${text}` : text;
    })
    .join(', ');
  lines.push(speakerLine);

  if (metric?.worstRole && Number.isFinite(metric?.worstAngleDeg) && Number.isFinite(metric?.worstLossDb)) {
    const worstDelta = Number(metric.worstLossDb);
    lines.push(`(worst: ${metric.worstRole} ${String(Math.floor(Math.abs(metric.worstAngleDeg) + 1e-9))}° / ${worstDelta.toFixed(1)} dB)`);
  }

  if (metric.p17HasNaAngles) {
    lines.push('N/A = >41° off-axis; RP22 Level 2 limit');
  }

  return lines.join('\n');
};

const getMetricDebugText = (paramId, metric) => {
  if (!metric) return "";
  if (paramId === 9) return metric?.debugText || "";
  if (paramId === 16) return buildP16DebugText(metric);
  if (paramId === 17) return buildP17DebugText(metric);
  return "";
};

/* ---------- Canonical RP22 Parameters (FULL, with scope) ---------- */
const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

/* ---------- Panel ---------- */

export default function RP22CompliancePanel({
  analysisResult,
  engineeringSummary = null,
  screen,
  seatingPositions,
  seatHudSnapshots,
  roomHudSnapshot,
  mlpSeatId,
  dolbyLayout,
  frontSubsCount,
  rearSubsCount,
  assumedP15Level,
  assumedP21Level,
  freeMoveLcr = false,
}) {
  const appState = useAppState();
  // Threshold presentation follows the same target basis published with the
  // authoritative engineering result; this panel never resolves modes locally.
  const p12Mode = engineeringSummary?.roomResultsByParameter?.[12]?.targetBasis || "minimum";
  const p13Mode = engineeringSummary?.roomResultsByParameter?.[13]?.targetBasis || "minimum";
  const p14Mode = engineeringSummary?.roomResultsByParameter?.[14]?.targetBasis || "minimum";

  // RP23 range (50–65°)
  const rp23 = React.useMemo(() => {
    const { viewWm } = computeScreenMetrics(
      screen?.visibleWidthInches || 100,
      screen?.aspectRatio || "16:9"
    );
    const d50 = distanceForFov(viewWm, 50);
    const d65 = distanceForFov(viewWm, 65);
    return {
      viewWm,
      dMin: Math.min(d50, d65),
      dMax: Math.max(d50, d65),
      size: screen?.visibleWidthInches || 100,
      ar: screen?.aspectRatio || "16:9",
    };
  }, [screen]);

  // --- Canonical engineering publication reads ---
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const reportCounts = engineeringSummary?.project?.reportCounts || {};
  const projectParameterSummaries = engineeringSummary?.parameterSummaries?.project || {};
  const lockedSeatId = engineeringSummary?.primary?.seatIds?.[0]
    ?? engineeringSummary?.project?.seatIds?.[0]
    ?? null;
  const reportSource = lockedSeatId ? `seat:${lockedSeatId}` : "room";

  const resolveSeatMetric = React.useCallback((seatId, paramKey) => (
    engineeringSummary?.seatHudById?.[seatId]?.rp22?.[paramKey] || null
  ), [engineeringSummary]);

  const renderSeatPillGridForParam = (pId) => {
    const rows = reportCounts.seatResultRowsByParameter?.[`p${Number(pId)}`] || [];
    if (!rows.length) return null;
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((rowObj) => (
          <div
            key={`row-${rowObj.row}`}
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "min-content",
              justifyContent: "end",
              gap: 6,
            }}
          >
            {(rowObj.seats || []).map((seat) => (
              <span
                key={seat.seatId}
                title={`${seat.seatId || ""}  Row ${seat.row} Seat ${seat.column}${seat.isPrimary ? " (RSP)" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: seat.isPrimary ? "0 0 0 2px rgba(33,52,40,0.10)" : "none",
                  borderRadius: 6,
                }}
              >
                <RP22GradingPill level={seat.level || "—"} />
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const getHudLevelForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    const key = `p${pid}`;
    const roomResult = engineeringSummary?.roomResultsByParameter?.[pid] || null;
    if (roomResult) return roomResult.level || projectParameterSummaries[key]?.level || "—";
    const selectedSeat = (reportCounts.seatResultsByParameter?.[key] || [])
      .find((seat) => String(seat.seatId) === String(lockedSeatId));
    return selectedSeat?.level || projectParameterSummaries[key]?.level || "—";
  }, [engineeringSummary, projectParameterSummaries, reportCounts, lockedSeatId]);

  const getHudValueForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    const key = `p${pid}`;
    const roomResult = engineeringSummary?.roomResultsByParameter?.[pid] || null;
    if (roomResult) {
      return roomResult.formatted || roomResult.hudLabel || (roomResult.value ?? "—");
    }
    if (pid === 19) {
      return engineeringSummary?.p19SeatAuthority?.project?.coverageSummary
        ?? engineeringSummary?.project?.coverage?.sentence
        ?? "NOT CALCULATED";
    }
    const selectedSeat = (reportCounts.seatResultsByParameter?.[key] || [])
      .find((seat) => String(seat.seatId) === String(lockedSeatId));
    return selectedSeat?.valueFormatted || "Seat results";
  }, [engineeringSummary, reportCounts, lockedSeatId]);

  // Full per-parameter detail card (title, description, achieved, scope, thresholds,
  // per-seat pills, notes, debug). Rendered only when a matrix row is expanded.
  // Lifted verbatim from the previous always-on card stack — no logic changed.
  const renderParamDetailCard = (p) => {
    const lvl = getHudLevelForParam(p);
    const achievedValue = getHudValueForParam(p);
    const isSeatScope = String(p.scope || "").toLowerCase() === "seat";
    const resolvedParam = (p.id === 12 || p.id === 13 || p.id === 14)
      ? { ...p, thresholds: resolveParamThresholds(p, p12Mode, p13Mode, p14Mode) }
      : p;
    const targetBasisNote =
      engineeringSummary?.roomResultsByParameter?.[p.id]?.targetBasisNote
      ?? engineeringSummary?.roomResultsByParameter?.[p.id]?.detail
      ?? null;
    const debugMetric = String(reportSource).startsWith("seat:")
      ? (() => {
          const seatId = String(reportSource).split(":")[1];
          return resolveSeatMetric(seatId, `p${p.id}`);
        })()
      : null;
    const debugText = getMetricDebugText(p.id, debugMetric);

    return (
      <div key={p.id} style={card}>
        <div style={head}>
          <div style={{ ...title, display: "flex", alignItems: "center", gap: 6 }}>
            {[19, 20].includes(p.id) ? (
              <BassRp22ParameterTooltip parameterKey={`p${p.id}`}>
                <span className="cursor-help underline decoration-dotted underline-offset-2">P{p.id}</span>
              </BassRp22ParameterTooltip>
            ) : <span>{p.id}. {getOfficialRp22Title(p.id)}</span>}
            {debugText ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Debug info for parameter ${p.id}`}
                      style={{
                        border: "1px solid #C1B6AD",
                        background: "#F6F3EE",
                        color: "#625143",
                        borderRadius: 9999,
                        width: 18,
                        height: 18,
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "help",
                        flex: "0 0 auto",
                      }}
                    >
                      i
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    className="max-w-[420px] whitespace-pre-wrap break-words rounded-md border border-[#C1B6AD] bg-white px-3 py-2 text-[#1B1A1A] shadow-lg"
                  >
                    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace", fontSize: 11, lineHeight: 1.5 }}>
                      {debugText}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          <div style={{ ...sub, display: "flex", gap: 8, alignItems: "center" }}>
            <span>{p.short}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#3E4349" }}>
              SCOPE: <strong>{p.scope.toUpperCase()}</strong>
            </span>
          </div>
          {/* Achieved value line — Room-scoped only. Seat-scoped parameters show
              no aggregate/RSP result in the headline; per-seat results are below. */}
          <div style={{ fontSize: 11, color: "#1B1A1A", marginTop: 6, fontWeight: 600 }}>
            {isSeatScope ? (
              <span style={{ color: "#625143", fontStyle: "italic" }}>Per-seat evaluation — see individual seat results below</span>
            ) : (
              <>{(p.id === 15 || p.id === 21) ? "Assumed: " : "Achieved: "}<span style={{ color: "#213428" }}>{achievedValue}</span></>
            )}
          </div>
          {targetBasisNote && (
            <div style={{ fontSize: 10, color: "#9B8E82", marginTop: 4, fontStyle: "italic" }}>
              {targetBasisNote}
            </div>
          )}
        </div>

        <div style={body}>
          {/* For P15/P21 the L1–L4 selector below IS the level indicator —
              no duplicate Level pill row here. All other params show it. */}
          {!(p.id === 15 || p.id === 21) && (
          <div style={{ ...row, marginTop: 0 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#625143" }}>
                {isSeatScope ? "Per-seat levels" : "Level"}
              </span>
            </div>
            {(() => {
              // ROOM scope: use same pill as HUD + RP22 Report
              if (!isSeatScope) {
                return <RP22GradingPill level={lvl} />;
              }

              // SEAT scope: NO overall pill, only per-seat pill grid
              return (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {renderSeatPillGridForParam(p.id)}
                </div>
              );
            })()}
          </div>
          )}

          {/* thresholds grid */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EFEA" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                textAlign: "center",
                gap: 8,
              }}
            >
              {["L4", "L3", "L2", "L1"].map((k) => {
                const trg = resolvedParam.thresholds[k];
                const isEq = resolvedParam.thresholds.direction === "=";
                return (
                  <div key={k} style={{ fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#3E4349" }}>{k}</div>
                    <div
                      style={{
                        color: "#625143",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                      }}
                    >
                      {trg == null
                        ? "–"
                        : isEq
                        ? String(trg)
                        : `${fmtIneq(resolvedParam.thresholds.direction)} ${trg}${
                            resolvedParam.unit === "°"
                              ? "°"
                              : resolvedParam.unit === "Hz"
                              ? " Hz"
                              : resolvedParam.unit === "± dB" || resolvedParam.unit === "dB"
                              ? " dB"
                              : resolvedParam.unit === "dB SPL (C)"
                              ? " dBC"
                              : resolvedParam.unit === "m"
                              ? " m"
                              : ""
                          }`}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
            </div>
            {(p.id === 15 || p.id === 21) && (
            <P15P21AssumptionControl
            paramId={p.id}
            value={p.id === 15 ? assumedP15Level : assumedP21Level}
            onChange={p.id === 15 ? appState?.setAssumedP15LevelSafe : appState?.setAssumedP21LevelSafe}
            variant="screen"
            />
            )}
            </div>
            );
            };

            return (
    <div>
      {/* RP23 Screen Size Guide */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={head}>
          <div style={title}>RP23 Screen Size Guide</div>
          <div style={sub}>
            {rp23.size}" {rp23.ar} — targeting 57.5° FOV
          </div>
        </div>
        <div style={body}>
          <div style={row}>
            <span style={keyTx}>Recommended distance from screen (50°–65°)</span>
            <span style={chip}>
              {rp23.dMin.toFixed(2)} m – {rp23.dMax.toFixed(2)} m
            </span>
          </div>
          <div style={row}>
            <span style={keyTx}>Screen width</span>
            <span style={chip}>{rp23.viewWm.toFixed(2)} m</span>
          </div>
        </div>
      </div>

      {/* RP22 Parameters (1–21) — compact matrix with expandable detail */}
      <ComplianceParameterMatrix
        parameters={RP22_PARAMS}
        getLevelForParam={getHudLevelForParam}
        getValueForParam={getHudValueForParam}
        renderDetailCard={renderParamDetailCard}
        seatCount={seats.length}
        summary={engineeringSummary?.project?.compliance || null}
      />
    </div>
  );
}