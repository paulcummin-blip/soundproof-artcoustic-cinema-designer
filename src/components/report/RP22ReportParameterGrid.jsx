// components/report/RP22ReportParameterGrid.jsx
// 3-column grid of exact Compliance Report tiles for the RP22 Report page.
import React, { useMemo, useCallback } from "react";
import RP22ComplianceParameterTile from "@/components/rp22/RP22ComplianceParameterTile";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useAppState } from "@/components/AppStateProvider";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { getP21PresetResult } from "@/components/utils/rp22/levels";
import { resolveParamThresholds, resolveRoomParameterLevel, resolveP12P13DualLevels } from "@/components/report/technical/roomParameterLevelAuthority";
import P20SeatBlock from "@/components/room/bass/P20SeatBlock";
import { formatAuthoritativeP20Result, p20LevelText } from "@/components/room/bass/p20SeatPresentation";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import TechnicalParameterCard from "@/components/report/technical/TechnicalParameterCard";
import TechnicalParameterPage from "@/components/report/technical/TechnicalParameterPage";
import { getCategoryForParam, getHumanTitleForParam } from "@/components/report/technical/technicalParameterMeta";

/* ---------- Canonical RP22 parameter definitions ---------- */
const RP22_PARAMS = RP22_PRESENTATION_PARAMETERS;

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
  if (u === "dB SPL (C)") return `${Math.round(n)} dBC`;
  if (u === "Hz") return `${Math.round(n)} Hz`;
  if (u === "°") return `${Math.round(n)}°`;
  if (u === "%") return `${Math.round(n)}%`;
  return `${n.toFixed(2)} ${u}`.trim();
};

/**
 * Extract the canonical 1-based seat column index within its row.
 * Prefers seat.indexInRow if canonically set; otherwise parses the
 * column from the seat ID pattern "seat-r{row}-c{col}"; falls back to
 * 1-based array index within the row.
 */
const extractSeatIndexInRow = (seat, fallbackIdx) => {
  if (Number.isFinite(Number(seat?.indexInRow))) return Number(seat.indexInRow);
  const sid = String(seat?.id || "");
  const match = sid.match(/^seat-r(\d+)-c(\d+)$/);
  if (match) return parseInt(match[2], 10);
  return fallbackIdx + 1;
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
  p15ConstructionLevel,
  p21EarlyReflectionPreset,
  bassAuthority = null,
  bassErrorMessage = null,
  variant = "screen",
  contributionsByKey = null,
}) {
  const isPrintVariant = variant === "print";
  const MASKED_PARAM_IDS = [14, 18, 19, 20];
  const appState = useAppState();
  const sharedBassResults = useOptionalSharedBassResults();
  const resolvedBassAuthority = React.useMemo(() => bassAuthority || (sharedBassResults ? {
    contract: sharedBassResults?.contract || null,
    authoritative: false,
    publicationRejectionReason: null,
    errorMessage: sharedBassResults?.detailedError || null,
  } : null), [bassAuthority, sharedBassResults]);
  const resolvedBassError = bassErrorMessage || sharedBassResults?.detailedError || null;
  const bassPresentation = React.useMemo(() => buildComplianceBassPresentation({ completedBassAuthority: resolvedBassAuthority }, resolvedBassError), [resolvedBassAuthority, resolvedBassError]);
  const p12Mode = appState?.p12Mode || "minimum";
  const p13Mode = appState?.splConfig?.p13Mode || "minimum";
  const p14Mode = bassPresentation.parameters.p14.targetBasis || appState?.splConfig?.p14Mode || "minimum";

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
      return resolveRoomParameterLevel(pid, {
        analysisResult,
        p12Mode,
        p13Mode,
        p14Mode,
        p15ConstructionLevel,
        p21EarlyReflectionPreset,
        bassPresentation,
      });
    }

    // Seat scope
    const snap = seatSnapshotsById?.[lockedSeatId] || seatSnapshotsById?.["mlp"] || (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) || null;
    const metric = snap?.rp22?.[`p${pid}`];
    return getMetricDisplayState(metric, pid).level || "—";
  }, [analysisResult, p15ConstructionLevel, p21EarlyReflectionPreset, seatSnapshotsById, lockedSeatId, mlpSeatId, p12Mode, p13Mode, p14Mode, bassPresentation]);

  /* ----- getHudValueForParam (exact logic from RP22CompliancePanel) ----- */
  const getHudValueForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    if (isPrintVariant && MASKED_PARAM_IDS.includes(pid)) return "–";
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
            const unitStr = unit === "dB SPL (C)" ? "dBC" : unit;
            return unit ? `${v.toFixed(1)} ${unitStr}` : v.toFixed(1);
          }
          return String(v);
        }
      }
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
  }, [analysisResult, p15ConstructionLevel, p21EarlyReflectionPreset, seatSnapshotsById, lockedSeatId, mlpSeatId, bassPresentation, isPrintVariant]);

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

  const renderCard = (param) => {
    const resolvedThresholds = resolveParamThresholds(param, p12Mode, p13Mode, p14Mode);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14)
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
  };

  /* ----- Build per-seat grid data for the redesigned Technical Report cards ----- */
  const buildSeatGridData = React.useCallback((paramId) => {
    if (!rows.length) return null;
    const pKey = `p${Number(paramId)}`;

    // P20 special case — extract from bassPresentation.perSeatP20Results
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

    // Standard case — extract from seat HUD snapshots
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
  }, [rows, getSnapshotForSeat, bassPresentation.perSeatP20Results]);

  /* ----- Build ASDR footer string for a parameter card (only when participating) ----- */
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

  /* ----- Render a single redesigned Technical Report parameter card ----- */
  const renderPrintCard = (param) => {
    const resolvedThresholds = resolveParamThresholds(param, p12Mode, p13Mode, p14Mode);
    const resolvedParam = (param.id === 12 || param.id === 13 || param.id === 14)
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

    // P6 presentation: show worst seat spread across all seats, omit RSP label.
    // P6 is normalised to the green RSP (0 dB by definition); showing a fallback
    // real seat as "RSP" is misleading. The per-seat grid below shows individual levels.
    let achievedValue = getHudValueForParam(param);
    let lvl = getHudLevelForParam(param);
    let rspLabel = lockedSeatId ? formatSeatLabel(lockedSeatId) : null;

    if (param.id === 6) {
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
        achievedValue = `Worst seat spread: ${worstDesignDb} dB`;
        let worstLevel;
        if      (worstDesignDb <= 2)  worstLevel = 4;
        else if (worstDesignDb <= 4)  worstLevel = 3;
        else if (worstDesignDb <= 6)  worstLevel = 2;
        else if (worstDesignDb <= 10) worstLevel = 1;
        else                          worstLevel = 0;
        lvl = worstLevel;
      } else {
        achievedValue = "Worst seat spread: —";
      }
      rspLabel = null;
    }

    return (
      <TechnicalParameterCard
        key={param.id}
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