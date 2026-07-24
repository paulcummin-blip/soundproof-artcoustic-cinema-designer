// components/report/RP22ReportParameterGrid.jsx
// 3-column grid of exact Compliance Report tiles for the RP22 Report page.
import React, { useMemo, useCallback } from "react";
import RP22ComplianceParameterTile from "@/components/rp22/RP22ComplianceParameterTile";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useAppState } from "@/components/AppStateProvider";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { getP21PresetResult, levelP21_earlyReflections } from "@/components/utils/rp22/levels";
import P20SeatBlock from "@/components/room/bass/P20SeatBlock";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";

/* ---------- Canonical RP22 parameter definitions ---------- */
const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

/* ---------- P12/P13 mode-aware threshold resolver ---------- */

// Minimum thresholds (RP22 spec defaults)
const P12_THRESHOLDS_MINIMUM = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };
const P12_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 102, L2: 105, L3: 108, L4: 111 };
const P13_THRESHOLDS_MINIMUM = { direction: ">=", L1: 96, L2: 99, L3: 102, L4: 105 };
const P13_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };
const P14_THRESHOLDS_MINIMUM = { direction: ">=", L1: 109, L2: 112, L3: 115, L4: 118 };
const P14_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 114, L2: 117, L3: 120, L4: 123 };

function resolveParamThresholds(param, p12Mode, p13Mode, p14Mode) {
  if (param.id === 12) {
    return p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM;
  }
  if (param.id === 13) {
    return p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM;
  }
  if (param.id === 14) return p14Mode === "recommended" ? P14_THRESHOLDS_RECOMMENDED : P14_THRESHOLDS_MINIMUM;
  return param.thresholds;
}

/* ---------- Data helpers (mirrored from RP22CompliancePanel) ---------- */

const getMetricNumericValue = (metric) => {
  if (!metric || typeof metric !== "object") return null;
  const candidates = [metric.value, metric.valueM, metric.valueDb, metric.valueDeg, metric.valueHz, metric.valueMs, metric.valueS, metric.valuePct, metric.valuePercent, metric.valueRatio];
  for (const v of candidates) { if (Number.isFinite(v)) return v; }
  for (const [k, v] of Object.entries(metric)) { if (k.startsWith("value") && Number.isFinite(v)) return v; }
  return null;
};

const formatMetricFallback = (n, unit) => {
  if (!Number.isFinite(n)) return "—";
  const u = String(unit || "").trim();
  if (u === "m") return `${n.toFixed(2)}m`;
  if (u === "dB" || u === "± dB") return `${n.toFixed(1)} dB`;
  if (u === "Hz") return `${Math.round(n)} Hz`;
  if (u === "°") return `${Math.round(n)}°`;
  if (u === "%") return `${Math.round(n)}%`;
  return `${n.toFixed(2)} ${u}`.trim();
};

const getMetricDisplayState = (metric, paramId = null) => {
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
  const formattedText = String(formatted || '').toLowerCase();
  const treatUnavailableAsNA = Number(paramId) === 10 && (
    ((formatted === '—' || formatted === 'Not Calculated') && (level === '—' || level == null)) ||
    formattedText.includes('insufficient data')
  );

  if (treatUnavailableAsNA) return { text: 'N/A', level: 'N/A' };
  if (formatted === '—') return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
  if (formatted === 'Not Calculated' && !hasRealValue && (level === '—' || level == null)) return { text: 'N/A', level };
  if (formatted) return { text: formatted, level };
  if (metric.hudLabel) return { text: metric.hudLabel, level };

  return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
};

/**
 * Props:
 *   analysisResult      — from useRP22AnalysisEngine
 *   seatHudSnapshots    — { [seatId]: snapshot } object
 *   seatingPositions    — array of seat objects
 *   mlpSeatId           — id of the RSP/primary seat
 *   dolbyLayout         — e.g. "7.1.4"
 *   frontSubsCount      — number
 *   rearSubsCount       — number
 *   p15ConstructionLevel
 *   p21EarlyReflectionPreset
 */
export default function RP22ReportParameterGrid({
  analysisResult,
  seatHudSnapshots,
  seatingPositions,
  mlpSeatId,
  dolbyLayout,
  frontSubsCount,
  rearSubsCount,
  p15ConstructionLevel,
  p21EarlyReflectionPreset,
  bassContract = null,
  bassErrorMessage = null,
}) {
  const appState = useAppState();
  const sharedBassResults = useOptionalSharedBassResults();
  const resolvedBassContract = bassContract || sharedBassResults?.contract || null;
  const resolvedBassError = bassErrorMessage || sharedBassResults?.detailedError || null;
  const bassPresentation = React.useMemo(() => buildComplianceBassPresentation(resolvedBassContract, resolvedBassError), [resolvedBassContract, resolvedBassError]);
  const p12Mode = appState?.p12Mode || "minimum";
  const p13Mode = appState?.splConfig?.p13Mode || "minimum";
  const p14Mode = bassPresentation.parameters.p14.targetBasis || appState?.splConfig?.p14Mode || "minimum";
  /* ----- p2SystemConfig ----- */
  const p2SystemConfig = React.useMemo(() => {
    const preset = dolbyLayout || "5.1";
    const base = String(preset).split(" ")[0];
    const parts = base.split(".");
    const bed = parts[0] || "5";
    const heights = parts[2] || "";
    const totalSubs = Number(frontSubsCount ?? 0) + Number(rearSubsCount ?? 0);
    const systemStr = heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
    const p = systemStr.split(".");
    const bedCount = parseInt(p[0], 10) || 5;
    const overheadCount = parseInt(p[2], 10) || 0;
    const discreteCount = bedCount + overheadCount;
    let p2Level = "L1";
    if (discreteCount >= 15) p2Level = "L4";
    else if (discreteCount >= 11) p2Level = "L2";
    return { discreteSpeakerCount: discreteCount, p2Level };
  }, [dolbyLayout, frontSubsCount, rearSubsCount]);

  /* ----- Seat snapshot lookup ----- */
  const seatSnapshotsById = React.useMemo(() => {
    const cache = (seatHudSnapshots && typeof seatHudSnapshots === "object") ? seatHudSnapshots : {};
    const byId = {};
    for (const [cacheKey, snapshot] of Object.entries(cache)) {
      const seatId = String(cacheKey).split("|")[0];
      if (seatId) byId[seatId] = snapshot;
    }
    return byId;
  }, [seatHudSnapshots]);

  const lockedSeatId = React.useMemo(() => {
    const fromProp = String(mlpSeatId || "").trim();
    if (fromProp && seatSnapshotsById?.[fromProp]) return fromProp;
    const primaryFromSeats = (Array.isArray(seatingPositions) ? seatingPositions : []).find(s => s?.isPrimary && s?.id);
    const primaryId = String(primaryFromSeats?.id || "").trim();
    if (primaryId && seatSnapshotsById?.[primaryId]) return primaryId;
    if (seatSnapshotsById?.["mlp"]) return "mlp";
    return Object.keys(seatSnapshotsById || {})[0] || "";
  }, [mlpSeatId, seatingPositions, seatSnapshotsById]);

  /* ----- getHudLevelForParam (exact logic from RP22CompliancePanel) ----- */
  const getHudLevelForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    if ([14, 18, 19].includes(pid)) return bassPresentation.parameters[`p${pid}`].level;
    if (pid === 20) return bassPresentation.parameters.p20.level;
    const isRoomScope = String(param?.scope || "").toLowerCase() === "room";

    if (isRoomScope) {
      const res = analysisResult?.gradedParameters?.primary?.[pid] || null;

      // P12/P13: re-grade from raw value using the user-selected mode thresholds
      if ((pid === 12 || pid === 13) && res && res.status !== "no_data" && Number.isFinite(res.value)) {
        const thresholds = resolveParamThresholds(param, p12Mode, p13Mode);
        const v = res.value;
        if (v >= thresholds.L4) return "L4";
        if (v >= thresholds.L3) return "L3";
        if (v >= thresholds.L2) return "L2";
        if (v >= thresholds.L1) return "L1";
        return "—";
      }

      if (pid === 21 && res?.status === "error") return "—";
      if (pid === 21 && res && res.status !== "no_data" && res.status !== "fail" && Number.isFinite(res.value)) return levelP21_earlyReflections(res.value).level;
      if (res && res.status !== "no_data" && res.status !== "fail" && res.level != null) return res.level;
      if (pid === 2 && p2SystemConfig) return p2SystemConfig.p2Level;
      if (pid === 3) { const p3 = analysisResult?.gradedParameters?.primary?.[3]; return (p3 && p3.status === "ok") ? p3.level : "—"; }
      if (pid === 8) return "L4";
      if (pid === 11) return "L4";
      if (pid === 15) { const MAP = { standard: "L1", "purpose-built": "L2", reference: "L3", studio: "L4" }; return MAP[p15ConstructionLevel || "standard"] || "—"; }
      if (pid === 21) return getP21PresetResult(p21EarlyReflectionPreset || "l2").level;
      return "—";
    }

    // Seat scope
    const snap = seatSnapshotsById?.[lockedSeatId] || seatSnapshotsById?.["mlp"] || (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) || null;
    const metric = snap?.rp22?.[`p${pid}`];
    return getMetricDisplayState(metric, pid).level || "—";
  }, [analysisResult, p2SystemConfig, p15ConstructionLevel, p21EarlyReflectionPreset, seatSnapshotsById, lockedSeatId, mlpSeatId, p12Mode, p13Mode, bassPresentation]);

  /* ----- getHudValueForParam (exact logic from RP22CompliancePanel) ----- */
  const getHudValueForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    if ([14, 18, 19].includes(pid)) return bassPresentation.parameters[`p${pid}`].valueText;
    if (pid === 20) return bassPresentation.parameters.p20.valueText;
    const isRoomScope = String(param?.scope || "").toLowerCase() === "room";

    if (isRoomScope) {
      const res = analysisResult?.gradedParameters?.primary?.[pid] || null;
      if (pid === 21 && res?.status === "error") return "Analysis error";
      if (pid === 3) {
        const p3 = analysisResult?.gradedParameters?.primary?.[3] || null;
        if (p3?.status === "ok") {
          if (typeof p3.formatted === "string" && p3.formatted.trim()) return p3.formatted;
          if (typeof p3.value === "number" && Number.isFinite(p3.value)) {
            const paramDef = RP22_PARAMS.find(p => p.id === 3);
            const unit = paramDef?.unit || "";
            return unit ? `${Math.round(p3.value)} ${unit}` : String(Math.round(p3.value));
          }
          return "Achieved";
        }
        if (p3?.status === "no_data") return "Not Calculated";
        return "—";
      }
      if (res && res.status !== "no_data" && res.status !== "fail" && res.status !== "error") {
        const v = res.value;
        if (res.formatted) return res.formatted;
        if (v !== null && v !== undefined) {
          if (typeof v === "number" && Number.isFinite(v)) {
            const paramDef = RP22_PARAMS.find(p => p.id === pid);
            const unit = paramDef?.unit || "";
            return unit ? `${v.toFixed(1)} ${unit}` : v.toFixed(1);
          }
          return String(v);
        }
      }
      if (pid === 2 && p2SystemConfig) return `${p2SystemConfig.discreteSpeakerCount} speakers`;
      if (pid === 8) return "No";
      if (pid === 11) return "0";
      if (pid === 15) { const LABEL = { standard: "NCB 26 (standard)", "purpose-built": "NCB 22 (purpose-built)", reference: "NCB 18 (reference)", studio: "NCB 15 (studio)" }; return LABEL[p15ConstructionLevel || "standard"] || "—"; }
      if (pid === 21) return getP21PresetResult(p21EarlyReflectionPreset || "l2").formatted;
      return "—";
    }

    // Seat scope
    const snap = seatSnapshotsById?.[lockedSeatId] || seatSnapshotsById?.["mlp"] || (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) || null;
    const metric = snap?.rp22?.[`p${pid}`];
    if (!metric) return "Not Calculated";
    if (pid === 17) {
      const display = getMetricDisplayState(metric, pid);
      if (display.text === 'N/A' || display.text === 'Not Calculated') return display.text;
      const parts = [];
      if (metric.worstRole) parts.push(String(metric.worstRole));
      const details = [];
      if (Number.isFinite(metric.worstAngleDeg)) details.push(`${Math.round(metric.worstAngleDeg)}°`);
      if (Number.isFinite(metric.worstLossDb)) details.push(`${Number(metric.worstLossDb).toFixed(1)} dB`);
      if (details.length > 0) {
        return parts.length > 0 ? `${parts.join(" ")} (${details.join(" / ")})` : details.join(" / ");
      }
      return parts.length > 0 ? parts.join(" ") : display.text;
    }
    const display = getMetricDisplayState(metric, pid);
    if (display.text && display.text !== '—') return display.text;
    const paramDef = RP22_PARAMS.find(p => p.id === pid);
    const n = getMetricNumericValue(metric);
    if (Number.isFinite(n)) return formatMetricFallback(n, paramDef?.unit || "");
    return "Not Calculated";
  }, [analysisResult, p2SystemConfig, p15ConstructionLevel, p21EarlyReflectionPreset, seatSnapshotsById, lockedSeatId, mlpSeatId, bassPresentation]);

  /* ----- Per-seat pill grid for seat-scoped params ----- */
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];

  const rows = React.useMemo(() => {
    const map = new Map();
    for (const s of seats) {
      const r = Number(s?.row || s?.rowNumber) || 1;
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(s);
    }
    const rowNums = Array.from(map.keys()).sort((a, b) => a - b);
    return rowNums.map((r) => {
      const list = map.get(r) || [];
      const sorted = list.slice().sort((a, b) => (Number(b?.indexInRow) || 0) - (Number(a?.indexInRow) || 0));
      return { row: r, seats: sorted };
    });
  }, [seats]);

  const denseSeatGrid = React.useMemo(() => {
    const totalSeats = seats.length;
    const hasDenseRow = rows.some((rowObj) => rowObj.seats.length > 5);
    return hasDenseRow || totalSeats > 12;
  }, [rows, seats.length]);

  const getSnapshotForSeat = React.useCallback((seat) => {
    if (!seat) return null;
    const sid = String(seat.id || "").trim();
    if (!sid) return null;
    const cache = seatSnapshotsById || {};
    if (cache[sid]) return cache[sid];
    const prefKey = Object.keys(cache).find(k => String(k).startsWith(`${sid}|`));
    if (prefKey) return cache[prefKey];
    const direct = Object.values(cache).find(snap => String(snap?.seatId || "").trim() === sid);
    if (direct) return direct;
    const isPrimary = !!seat?.isPrimary || (String(mlpSeatId || "").trim() && sid === String(mlpSeatId).trim());
    if (isPrimary) {
      if (cache["mlp"]) return cache["mlp"];
      const mlpKey = Object.keys(cache).find(k => String(k).startsWith("mlp|"));
      if (mlpKey) return cache[mlpKey];
      return Object.values(cache).find(snap => String(snap?.seatId || "").trim() === "mlp") || null;
    }
    return null;
  }, [seatSnapshotsById, mlpSeatId]);

  const renderSeatPillGrid = (pId) => {
    if (Number(pId) === 20) return <P20SeatBlock seatingPositions={seats} perSeatP20Results={bassPresentation.perSeatP20Results} compact />;
    if (!rows.length) return null;
    const pKey = `p${Number(pId)}`;
    const getCompactPillState = (lvl) => {
      if (typeof lvl === 'number') {
        if (lvl === 1) return { n: 1, label: 'L1' };
        if (lvl === 2) return { n: 2, label: 'L2' };
        if (lvl === 3) return { n: 3, label: 'L3' };
        if (lvl === 4) return { n: 4, label: 'L4' };
        if (lvl === 0) return { n: 0, label: 'FAIL' };
      }

      const str = String(lvl || '').toUpperCase().trim();

      if (str === '1') return { n: 1, label: 'L1' };
      if (str === '2') return { n: 2, label: 'L2' };
      if (str === '3') return { n: 3, label: 'L3' };
      if (str === '4') return { n: 4, label: 'L4' };

      if (str === 'L1') return { n: 1, label: 'L1' };
      if (str === 'L2') return { n: 2, label: 'L2' };
      if (str === 'L3') return { n: 3, label: 'L3' };
      if (str === 'L4') return { n: 4, label: 'L4' };
      if (str === 'FAIL') return { n: 0, label: 'FAIL' };
      if (str === 'N/A') return { n: -2, label: 'N/A' };

      return { n: -1, label: '—' };
    };
    return (
      <div style={{ display: "grid", gap: denseSeatGrid ? 3 : 6 }}>
        {rows.map(rowObj => (
          <div key={`row-${rowObj.row}`} style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "min-content", justifyContent: "end", gap: denseSeatGrid ? 3 : 6 }}>
            {rowObj.seats.map(seat => {
              const snap = getSnapshotForSeat(seat);
              const metric = snap?.rp22?.[pKey];
              const display = getMetricDisplayState(metric, pId);
              const lvl =
                display.level === 'N/A' || display.text === 'N/A'
                  ? 'N/A'
                  : (display.level || metric?.level || "—");
              const isPrimary = !!seat?.isPrimary;
              const compact = getCompactPillState(lvl);
              const compactColors = (compact.n === -1 || compact.n === -2)
                ? { bg: '#F3F4F6', border: '#E5E7EB', text: '#9CA3AF' }
                : getLevelColors(compact.n);
              return (
                <span
                  key={`seat-${seat?.id || `${rowObj.row}-${seat?.indexInRow || ""}`}`}
                  title={`${seat?.id || ""}  Row ${seat?.row || seat?.rowNumber || 1} Seat ${seat?.indexInRow || ""}${isPrimary ? " (RSP)" : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: isPrimary ? "0 0 0 2px rgba(33,52,40,0.10)" : "none", borderRadius: denseSeatGrid ? 4 : 6 }}
                >
                  {denseSeatGrid ? (
                    <span
                      style={{
                        minWidth: 24,
                        height: 18,
                        padding: "2px 5px",
                        fontSize: 9,
                        lineHeight: "1",
                        borderRadius: 4,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `1px solid ${compactColors.border}`,
                        background: compactColors.bg,
                        color: compactColors.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {compact.label}
                    </span>
                  ) : (
                    <RP22GradingPill level={lvl} />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {RP22_PARAMS.map(param => {
        const resolvedThresholds = resolveParamThresholds(param, p12Mode, p13Mode, p14Mode);
        const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14)
          ? { ...param, thresholds: resolvedThresholds }
          : param;
        const targetBasisNote =
          param.id === 12 ? `Target basis: ${p12Mode === "recommended" ? "Recommended" : "Minimum"}` :
          param.id === 13 ? `Target basis: ${p13Mode === "recommended" ? "Recommended" : "Minimum"}` :
          param.id === 14 ? bassPresentation.parameters.p14.detail :
          null;
        return (
          <div key={param.id} className="rp22-card-wrap print-avoid-break" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
            <RP22ComplianceParameterTile
              param={resolvedParam}
              achievedValue={getHudValueForParam(param)}
              lvl={getHudLevelForParam(param)}
              seatPillGrid={String(param.scope || "").toLowerCase() === "seat" ? renderSeatPillGrid(param.id) : null}
              targetBasisNote={targetBasisNote}
            />
          </div>
        );
      })}
    </div>
  );
}