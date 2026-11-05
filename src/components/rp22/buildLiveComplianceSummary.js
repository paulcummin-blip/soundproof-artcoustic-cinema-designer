/**
 * buildLiveComplianceSummary.js
 * -----------------------------
 * Live Room Designer Compliance adapter.
 *
 * The Room Designer Compliance panel (RP22CompliancePanel) reads a published
 * `engineeringSummary` shape (roomResultsByParameter, seatHudById, reportCounts,
 * project.compliance, parameterSummaries, …). That shape is normally produced
 * from the completed, validated engineering publication — so while a design is
 * still being built the panel shows nothing (or "Not verified" for everything).
 *
 * The seat HUD, by contrast, reads the live `useRP22AnalysisEngine` result
 * (`analysisResult.perSeatRp22` / `analysisResult.gradedParameters.primary`)
 * and shows valid RP22 results as soon as the inputs for a parameter exist.
 *
 * This adapter is the smallest reliable bridge: it reads the SAME live
 * `analysisResult` the seat HUD reads and projects it into the exact
 * `engineeringSummary` shape RP22CompliancePanel consumes. No calculation is
 * duplicated — every level, value and formatted string is the engine's own
 * output. Grading thresholds and calculation methods are unchanged.
 *
 * Scope is preserved:
 *   - Room/RSP parameters take their live room result.
 *   - Seat parameters take their live per-seat result (the seat distinction is
 *     kept; a selected seat's result is never turned into a room-wide result).
 *
 * Parameters whose inputs do not yet exist resolve to a neutral dash / N/A, and
 * are never described as failed or "Not verified".
 *
 * This is a LIVE Room Designer presentation only. The Technical Report, Project
 * Report and published engineering snapshot keep using the existing completed,
 * validated publication authority — nothing here is published or frozen.
 */
import { RP22_PRESENTATION_PARAMETERS, isSeatScopedParameterKey } from "@/components/utils/rp22ParameterPresentation";
import { firstStatedPrimitive } from "@/components/utils/renderSafe";
import {
  canonicalBassLevel as normalizeLevel,
  BASS_LEVEL_RANK as LEVEL_RANK,
  BASS_RANK_LEVEL as RANK_LEVEL,
} from "@/components/utils/rp22/bassGradingAuthority";
import { getScopedSeatIds } from "@/components/utils/seatScopeAuthority";
import { resolveAssumedParameterResult } from "@/components/utils/assumedParameterAuthority";
import { P8_NUMBER, buildP8RoomResult } from "@/components/utils/rp22/p8Authority";

const ASSUMED_PARAM_KEYS = new Set(["p8", "p15", "p21"]);
const isAssumedKey = (key) => ASSUMED_PARAM_KEYS.has(key);

// Catalogue parameter numbers that are NOT seat-scoped (room / RSP scope).
const isSeatParamNumber = (num) => isSeatScopedParameterKey(`p${num}`);

const seatRowColumn = (seat, fallbackIndex) => {
  const fallbackMatch = String(seat?.id || "").match(/^seat-r(\d+)-c(\d+)$/);
  const row = Number(seat?.row ?? seat?.rowNumber ?? fallbackMatch?.[1]) || 1;
  const column = Number(seat?.indexInRow ?? seat?.column ?? fallbackMatch?.[2]) || fallbackIndex + 1;
  return { row, column };
};

// Normalise a live engine metric level to the canonical "L4"/"L3"/…/"FAIL"
// string the panel's pills and summary already expect. Returns null when the
// engine produced no level (neutral dash — never "Not verified").
const liveLevel = (metric) => {
  if (!metric) return null;
  const lvl = normalizeLevel(metric.level);
  return lvl;
};

// Detect an overhead-only / not-applicable seat metric (P9/P10/P11) so the
// panel can show N/A rather than a blank dash.
const isNaMetric = (metric) => {
  if (!metric) return false;
  const status = String(metric.status || "").toLowerCase();
  if (status === "not_applicable") return true;
  const formatted = String(metric.formatted ?? metric.hudLabel ?? "").toUpperCase();
  return formatted === "N/A" || formatted.includes("N/A (");
};

export function buildLiveComplianceSummary({ analysisResult, seats, assumedP15Level = null, assumedP21Level = null } = {}) {
  const canonicalSeats = Array.isArray(seats) ? seats : [];
  const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(canonicalSeats);
  const allSeatIds = canonicalSeats.map((s) => s?.id).filter(Boolean);

  // ── seatHudById: live per-seat metrics, numeric keys → string keys ──
  // Same source as the seat HUD (analysisResult.perSeatRp22). P20 is preserved
  // per seat from the engine; P19 is RSP-scoped and lives in roomResults below.
  const seatHudById = {};
  const perSeatRp22 = analysisResult?.perSeatRp22 || {};
  for (const seat of canonicalSeats) {
    if (!seat?.id) continue;
    const srcRp22 = perSeatRp22?.[seat.id]?.rp22 || {};
    const rp22 = {};
    for (const [numKey, strKey] of Object.entries(SEAT_PARAM_KEY_MAP)) {
      const metric = srcRp22[numKey];
      if (metric != null) rp22[strKey] = metric;
    }
    seatHudById[seat.id] = { seatId: seat.id, rp22 };
  }

  // ── roomResultsByParameter: live room/RSP results ──
  const gradedPrimary = analysisResult?.gradedParameters?.primary || {};
  const roomResultsByParameter = {};
  for (const p of RP22_PRESENTATION_PARAMETERS) {
    const pid = p.id;
    const key = `p${pid}`;
    if (isSeatParamNumber(pid)) continue; // seat-scoped: no room headline

    if (pid === P8_NUMBER) {
      roomResultsByParameter[pid] = buildP8RoomResult(roomResultsByParameter[pid]);
      continue;
    }
    if (pid === 15 || pid === 21) {
      const measured = gradedPrimary[pid] || null;
      const assumed = resolveAssumedParameterResult(pid, measured);
      roomResultsByParameter[pid] = assumed;
      continue;
    }

    const metric = gradedPrimary[pid];
    if (!metric) {
      roomResultsByParameter[pid] = { level: null, formatted: null, value: null, status: "no_data" };
      continue;
    }
    roomResultsByParameter[pid] = {
      ...metric,
      level: liveLevel(metric),
      formatted: firstStatedPrimitive([metric.formatted, metric.hudLabel, metric.value], "—"),
    };
  }

  // ── reportCounts: per-seat result rows for the seat pill grid ──
  const seatResultsByParameter = {};
  const seatResultRowsByParameter = {};
  for (const p of RP22_PRESENTATION_PARAMETERS) {
    if (!isSeatParamNumber(p.id)) continue;
    const key = `p${p.id}`;
    const results = canonicalSeats.map((seat, fallbackIndex) => {
      const metric = seatHudById?.[seat.id]?.rp22?.[key] || null;
      const { row, column } = seatRowColumn(seat, fallbackIndex);
      const rawValue = metric?.value ?? metric?.valueDb ?? metric?.valueM ?? metric?.valueDeg ?? null;
      const isBassDeviation = (key === "p20") && Number.isFinite(Number(rawValue));
      const level = liveLevel(metric)
        || (isNaMetric(metric) ? "N/A" : "—");
      return {
        seatId: seat?.id,
        row,
        column,
        priority: String(seat?.priority || "").toLowerCase() === "secondary" ? "secondary" : "primary",
        isPrimary: seat?.isPrimary === true || String(seat?.priority || "").toLowerCase() !== "secondary",
        valueFormatted: isBassDeviation
          ? `±${Number(rawValue).toFixed(1)} dB`
          : firstStatedPrimitive([metric?.formatted, metric?.hudLabel, rawValue], "—"),
        level,
        status: metric?.status || null,
        value: rawValue,
      };
    });
    seatResultsByParameter[key] = results;

    const groupedRows = new Map();
    for (const result of results) {
      if (!groupedRows.has(result.row)) groupedRows.set(result.row, []);
      groupedRows.get(result.row).push(result);
    }
    seatResultRowsByParameter[key] = Array.from(groupedRows.entries())
      .sort(([a], [b]) => a - b)
      .map(([row, rowSeats]) => ({
        row,
        seats: rowSeats.sort((a, b) => b.column - a.column),
      }));
  }

  const reportCounts = {
    seatResultsByParameter,
    seatResultRowsByParameter,
  };

  // ── parameterSummaries.project: per-parameter level for headline fallback ──
  const parameterSummaries = { project: {} };
  for (const p of RP22_PRESENTATION_PARAMETERS) {
    const key = `p${p.id}`;
    let level = null;
    if (isSeatParamNumber(p.id)) {
      // Worst (lowest) assessed seat level for this parameter.
      const seatLevels = (seatResultsByParameter[key] || [])
        .map((r) => normalizeLevel(r.level))
        .filter(Boolean);
      if (seatLevels.length) {
        level = seatLevels
          .map((l) => LEVEL_RANK[l] ?? 99)
          .reduce((min, r) => (r < min ? r : min), 99);
        level = Number.isFinite(level) ? RANK_LEVEL[level] : null;
      }
    } else {
      level = roomResultsByParameter[p.id]?.level || null;
    }
    parameterSummaries.project[key] = { key, scope: p.scope, state: level ? "scored" : "provisional", level };
  }

  // ── project.compliance: counts + per-parameter presentation status ──
  const counts = { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, notVerified: 0, notApplicable: 0 };
  let lowestRank = null;
  let active = 0;
  let unavailable = 0;
  let calculatedSeatParams = 0;
  let seatParamCount = 0;
  const byParameter = {};

  for (const p of RP22_PRESENTATION_PARAMETERS) {
    const key = `p${p.id}`;
    const seatScoped = isSeatParamNumber(p.id);
    let level = null;
    let state = "provisional";

    if (seatScoped) {
      seatParamCount += 1;
      const seatLevels = (seatResultsByParameter[key] || [])
        .map((r) => normalizeLevel(r.level))
        .filter(Boolean);
      if (seatLevels.length) {
        level = seatLevels
          .map((l) => LEVEL_RANK[l] ?? 99)
          .reduce((min, r) => (r < min ? r : min), 99);
        level = Number.isFinite(level) ? RANK_LEVEL[level] : null;
        if (level) { calculatedSeatParams += 1; state = "scored"; }
      } else {
        // All seats N/A (e.g. overhead-only with no overhead layer) → not_applicable.
        const allNa = (seatResultsByParameter[key] || []).length > 0
          && (seatResultsByParameter[key] || []).every((r) => r.level === "N/A");
        if (allNa) state = "na";
      }
    } else {
      level = roomResultsByParameter[p.id]?.level || null;
      if (level) state = "scored";
      else if (roomResultsByParameter[p.id]?.status === "not_applicable") state = "na";
    }

    const presentationStatus = state === "scored"
      ? (isAssumedKey(key) ? "assumed" : "calculated")
      : state === "na"
        ? "not_applicable"
        : "not_verified";

    byParameter[key] = { key, scope: p.scope, state, presentationStatus, level };

    if (level === "L4") { counts.L4 += 1; active += 1; }
    else if (level === "L3") { counts.L3 += 1; active += 1; }
    else if (level === "L2") { counts.L2 += 1; active += 1; }
    else if (level === "L1") { counts.L1 += 1; active += 1; }
    else if (level === "FAIL") { counts.fail += 1; active += 1; }
    else if (state === "na") { counts.notApplicable += 1; }
    else { counts.notVerified += 1; unavailable += 1; }

    if (level) {
      const rank = LEVEL_RANK[level];
      if (lowestRank == null || rank < lowestRank) lowestRank = rank;
    }
  }

  const compliance = {
    counts,
    lowestLabel: lowestRank == null ? "—" : lowestRank === 0 ? "Below L1" : RANK_LEVEL[lowestRank],
    active,
    unavailable,
    calculatedSeatParams,
    seatParamCount,
    byParameter,
  };

  // ── P19 (RSP-scoped) coverage sentence for the headline value ──
  const p19Metric = gradedPrimary[19];
  const p19Sentence = p19Metric?.formatted
    ?? p19Metric?.hudLabel
    ?? "NOT CALCULATED";

  return {
    // Live flag so consumers can distinguish this from a frozen publication.
    __live: true,
    roomResultsByParameter,
    seatHudById,
    reportCounts,
    parameterSummaries,
    p19SeatAuthority: { project: { coverageSummary: p19Sentence } },
    primary: { seatIds: primarySeatIds },
    secondary: { seatIds: secondarySeatIds },
    project: {
      seatIds: allSeatIds,
      compliance,
      coverage: { sentence: p19Sentence },
      reportCounts,
    },
  };
}

// Numeric RP22 key → string ("p1") key, for the seat-scoped parameters the
// engine publishes in perSeatRp22[seatId].rp22 (numeric keys).
const SEAT_PARAM_KEY_MAP = (() => {
  const map = {};
  for (const p of RP22_PRESENTATION_PARAMETERS) {
    if (isSeatScopedParameterKey(`p${p.id}`)) {
      map[String(p.id)] = `p${p.id}`;
    }
  }
  return map;
})();