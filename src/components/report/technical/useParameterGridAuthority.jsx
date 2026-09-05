/**
 * useParameterGridAuthority.jsx
 * ------------------------------
 * Shared parameter-grid computation hook extracted from RP22ReportParameterGrid.
 *
 * Used by BOTH:
 *   - RP22ReportParameterGrid (Technical Report — print + screen variants)
 *   - ParameterExplorer (Design Review — screen variant)
 *
 * One authority — no parallel parameter grading.
 * All grading delegates to the same resolveRoomParameterLevel /
 * resolveP12P13DualLevels / resolveParamThresholds from
 * roomParameterLevelAuthority.js.
 */

import React from "react";
import { useAppState } from "@/components/AppStateProvider";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { getP21PresetResult } from "@/components/utils/rp22/levels";
import {
  resolveParamThresholds,
  resolveRoomParameterLevel,
  resolveP12P13DualLevels,
} from "@/components/report/technical/roomParameterLevelAuthority";
import {
  getAssumedP15DisplayValue,
  getAssumedP21DisplayValue,
  isAssumedLevelSet,
} from "@/components/utils/assumedParameterAuthority";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { formatAuthoritativeP20Result, p20LevelText } from "@/components/room/bass/p20SeatPresentation";
import P20SeatBlock from "@/components/room/bass/P20SeatBlock";
import { p19LevelText, formatAuthoritativeP19Result, buildP19SeatRows } from "@/components/room/bass/p19SeatPresentation";
import P19SeatBlock from "@/components/room/bass/P19SeatBlock";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { formatSplDisplay } from "@/components/utils/splDisplayFormatter";

const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

/* ---------- Pure helper functions (shared, no duplication) ---------- */

export const getMetricNumericValue = (metric) => {
  if (!metric || typeof metric !== "object") return null;
  const candidates = [metric.value, metric.valueM, metric.valueDb, metric.valueDeg, metric.valueHz, metric.valueMs, metric.valueS, metric.valuePct, metric.valuePercent, metric.valueRatio];
  for (const v of candidates) { if (Number.isFinite(v)) return v; }
  for (const [k, v] of Object.entries(metric)) { if (k.startsWith("value") && Number.isFinite(v)) return v; }
  return null;
};

export const formatMetricFallback = (n, unit) => {
  if (!Number.isFinite(n)) return "—";
  const u = String(unit || "").trim();
  if (u === "m") return `${n.toFixed(2)}m`;
  if (u === "dB" || u === "± dB") return `${n.toFixed(1)} dB`;
  if (u === "dB SPL (C)") return formatSplDisplay(n);
  if (u === "Hz") return `${Math.round(n)} Hz`;
  if (u === "°") return `${Math.round(n)}°`;
  if (u === "%") return `${Math.round(n)}%`;
  return `${n.toFixed(2)} ${u}`.trim();
};

export const extractSeatIndexInRow = (seat, fallbackIdx) => {
  if (Number.isFinite(Number(seat?.indexInRow))) return Number(seat.indexInRow);
  const sid = String(seat?.id || "");
  const match = sid.match(/^seat-r(\d+)-c(\d+)$/);
  if (match) return parseInt(match[2], 10);
  return fallbackIdx + 1;
};

export const getMetricDisplayState = (metric, paramId = null) => {
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

/* ---------- Main hook ---------- */

/**
 * @param {Object} params
 * @param {Object} params.analysisResult      — from useRP22AnalysisEngine
 * @param {Object} params.seatHudSnapshots    — { [seatId]: snapshot } object
 * @param {Array}  params.seatingPositions    — array of seat objects
 * @param {string} params.mlpSeatId           — id of the RSP/primary seat
 * @param {string} params.assumedP15Level
 * @param {string} params.assumedP21Level
 * @param {Object} params.bassAuthority
 * @param {string} params.bassErrorMessage
 * @param {Object} params.contributionsByKey  — ASDR contributions by key
 */
export function useParameterGridAuthority({
  analysisResult,
  seatHudSnapshots,
  seatingPositions,
  mlpSeatId,
  assumedP15Level,
  assumedP21Level,
  bassAuthority = null,
  bassErrorMessage = null,
  contributionsByKey = null,
}) {
  const appState = useAppState();
  // ── Report project authority (FIX 1) ──────────────────────────────────
  // Pure consumer of the prop-supplied bass authority. No parallel global
  // activeProjectId subscription. Cross-project contamination is impossible.
  const resolvedBassAuthority = React.useMemo(() => bassAuthority || null, [bassAuthority]);
  const resolvedBassError = bassErrorMessage || null;
  const p14Selection = React.useMemo(
    () => resolveP14TargetSelectionState(appState?.splConfig),
    [appState?.splConfig?.selectedP14TargetBasis, appState?.splConfig?.selectedP14Level]
  );
  const bassPresentation = React.useMemo(() => buildComplianceBassPresentation({ completedBassAuthority: resolvedBassAuthority }, resolvedBassError, p14Selection.noP14TargetSelected), [resolvedBassAuthority, resolvedBassError, p14Selection.noP14TargetSelected]);
  const p12Mode = appState?.p12Mode || "minimum";
  const p13Mode = appState?.splConfig?.p13Mode || "minimum";
  const p14Mode = bassPresentation.parameters.p14.targetBasis || appState?.splConfig?.p14Mode || "minimum";
  const p18Mode = bassPresentation.parameters.p18.targetBasis || appState?.splConfig?.p18Mode || "minimum";

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

  /* ----- getHudLevelForParam ----- */
  const getHudLevelForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    if ([14, 18, 19].includes(pid)) return bassPresentation.parameters[`p${pid}`].level;
    if (pid === 20) return bassPresentation.parameters.p20.level;
    const isRoomScope = String(param?.scope || "").toLowerCase() === "room";

    if (isRoomScope) {
      return resolveRoomParameterLevel(pid, {
        analysisResult,
        p12Mode,
        p13Mode,
        p14Mode,
        assumedP15Level,
        assumedP21Level,
        bassPresentation,
      });
    }

    const snap = seatSnapshotsById?.[lockedSeatId] || seatSnapshotsById?.["mlp"] || (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) || null;
    const metric = snap?.rp22?.[`p${pid}`];
    return getMetricDisplayState(metric, pid).level || "—";
  }, [analysisResult, assumedP15Level, assumedP21Level, seatSnapshotsById, lockedSeatId, mlpSeatId, p12Mode, p13Mode, p14Mode, bassPresentation]);

  /* ----- getHudValueForParam ----- */
  const getHudValueForParam = React.useCallback((param, opts = {}) => {
    const isPrintVariant = opts.isPrintVariant || false;
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
        if (typeof v === "number" && Number.isFinite(v)) {
          const paramDef = RP22_PARAMS.find(p => p.id === pid);
          const unit = paramDef?.unit || "";
          if (unit === "dB SPL (C)") return formatSplDisplay(v);
        }

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
      if (pid === 8) return "No";
      if (pid === 11) return "0";
      if (pid === 15) return getAssumedP15DisplayValue(assumedP15Level) || "Not Calculated";
      if (pid === 21) return getAssumedP21DisplayValue(assumedP21Level) || "Not Calculated";
      return "—";
    }

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
  }, [analysisResult, assumedP15Level, assumedP21Level, seatSnapshotsById, lockedSeatId, mlpSeatId, bassPresentation]);

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

  const renderSeatPillGrid = React.useCallback((pId) => {
    if (Number(pId) === 19) {
      const p19Rows = buildP19SeatRows(seats, bassPresentation.perSeatP19Results);
      return <P19SeatBlock rows={p19Rows} publicationVerified={bassPresentation.publicationVerified} authorityStatus={bassPresentation.parameters.p19.status} p14TargetUnselected={bassPresentation.p14TargetUnselected} compact />;
    }
    if (Number(pId) === 20) return <P20SeatBlock seatingPositions={seats} perSeatP20Results={bassPresentation.perSeatP20Results} publicationVerified={bassPresentation.publicationVerified} authorityStatus={bassPresentation.parameters.p20.status} p14TargetUnselected={bassPresentation.p14TargetUnselected} compact />;
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
              const lvl = display.level === 'N/A' || display.text === 'N/A' ? 'N/A' : (display.level || metric?.level || "—");
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
                        minWidth: 24, height: 18, padding: "2px 5px", fontSize: 9, lineHeight: "1",
                        borderRadius: 4, fontWeight: 700, display: "inline-flex", alignItems: "center",
                        justifyContent: "center", border: `1px solid ${compactColors.border}`,
                        background: compactColors.bg, color: compactColors.text, whiteSpace: "nowrap",
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
  }, [rows, denseSeatGrid, getSnapshotForSeat, bassPresentation.perSeatP19Results, bassPresentation.perSeatP20Results, bassPresentation.publicationVerified, bassPresentation.p14TargetUnselected, bassPresentation.parameters.p19.status, bassPresentation.parameters.p20.status, seats]);

  /* ----- Build per-seat grid data for TechnicalParameterCard ----- */
  const buildSeatGridData = React.useCallback((paramId) => {
    if (!rows.length) return null;
    const pKey = `p${Number(paramId)}`;

    if (Number(paramId) === 19) {
      return rows.map(rowObj => ({
        row: rowObj.row,
        seats: rowObj.seats.map((seat, idx) => {
          const result = bassPresentation.perSeatP19Results.find(
            item => String(item?.seatId) === String(seat?.id)
          );
          return {
            id: seat?.id,
            indexInRow: extractSeatIndexInRow(seat, idx),
            level: result ? p19LevelText(result.level) : "—",
            value: result && Number.isFinite(Number(result.variationDbRaw))
              ? formatAuthoritativeP19Result(result)
              : "—",
            isPrimary: !!seat?.isPrimary,
          };
        }),
      }));
    }

    if (Number(paramId) === 20) {
      return rows.map(rowObj => ({
        row: rowObj.row,
        seats: rowObj.seats.map((seat, idx) => {
          const result = bassPresentation.perSeatP20Results.find(
            item => String(item?.seatId) === String(seat?.id)
          );
          return {
            id: seat?.id,
            indexInRow: extractSeatIndexInRow(seat, idx),
            level: result ? p20LevelText(result.level) : "—",
            value: result && Number.isFinite(Number(result.variationDbRaw))
              ? formatAuthoritativeP20Result(result)
              : "—",
            isPrimary: !!seat?.isPrimary,
          };
        }),
      }));
    }

    return rows.map(rowObj => ({
      row: rowObj.row,
      seats: rowObj.seats.map((seat, idx) => {
        const snap = getSnapshotForSeat(seat);
        const metric = snap?.rp22?.[pKey];
        const display = getMetricDisplayState(metric, paramId);
        return {
          id: seat?.id,
          indexInRow: extractSeatIndexInRow(seat, idx),
          level: display.level || metric?.level || "—",
          value: display.text || "—",
          isPrimary: !!seat?.isPrimary,
        };
      }),
    }));
  }, [rows, getSnapshotForSeat, bassPresentation.perSeatP19Results, bassPresentation.perSeatP20Results]);

  /* ----- Build ASDR footer string for a parameter card ----- */
  const buildAsdrFooter = React.useCallback((paramId) => {
    if (!contributionsByKey) return null;
    const key = paramId === "screen" ? "screen" : `p${paramId}`;
    const contrib = contributionsByKey[key];
    if (!contrib) return null;
    const weight = contrib.effectiveWeight;
    const earned = Math.round(contrib.earnedPoints * 100) / 100;
    const maximum = Math.round(contrib.maximumPoints * 100) / 100;
    const isRecommended = contrib.mode === "recommended";
    const isSeatScope = contrib.scope === "seat";
    const parts = ["ASDR"];
    if (isRecommended) parts.push("Recommended");
    parts.push(`Weight ${weight}`);
    if (isSeatScope) {
      parts.push(`Room contribution ${earned} / ${maximum}`);
    } else {
      parts.push(`Score ${earned} / ${maximum}`);
    }
    return parts.join(" · ");
  }, [contributionsByKey]);

  /* ----- Resolve thresholds (mode-aware) ----- */
  const resolveThresholds = React.useCallback((param) => {
    return resolveParamThresholds(param, p12Mode, p13Mode, p14Mode, p18Mode);
  }, [p12Mode, p13Mode, p14Mode, p18Mode]);

  /* ----- Build P6 seat-spread presentation (same as renderPrintCard) ----- */
  const buildP6Presentation = React.useCallback(() => {
    let worstP6Raw = null;
    for (const seat of seats) {
      const snap = getSnapshotForSeat(seat);
      const raw = snap?.rp22?.p6?.maxDeltaRaw;
      if (Number.isFinite(raw) && (worstP6Raw === null || raw > worstP6Raw)) {
        worstP6Raw = raw;
      }
    }
    if (worstP6Raw !== null && Number.isFinite(worstP6Raw)) {
      const worstDesignDb = Math.floor(worstP6Raw);
      const achievedValue = `Seat spread: ${worstDesignDb} dB`;
      let worstLevel;
      if      (worstDesignDb <= 2)  worstLevel = 4;
      else if (worstDesignDb <= 4)  worstLevel = 3;
      else if (worstDesignDb <= 6)  worstLevel = 2;
      else if (worstDesignDb <= 10) worstLevel = 1;
      else                          worstLevel = 0;
      return { achievedValue, lvl: worstLevel };
    }
    return { achievedValue: "Seat spread: —", lvl: null };
  }, [seats, getSnapshotForSeat]);

  return {
    getHudValueForParam,
    getHudLevelForParam,
    buildSeatGridData,
    buildAsdrFooter,
    resolveThresholds,
    resolveP12P13DualLevels,
    bassPresentation,
    rows,
    seats,
    getSnapshotForSeat,
    renderSeatPillGrid,
    buildP6Presentation,
    p12Mode,
    p13Mode,
    p14Mode,
    lockedSeatId,
  };
}