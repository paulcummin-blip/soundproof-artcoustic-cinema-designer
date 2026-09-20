/**
 * engineeringSummaryAuthority.js
 * --------------------------------
 * The ONE canonical engineering summary boundary.
 *
 * The engineering engine publishes a single parameter authority. This helper
 * consumes it once and produces every grouped/scoped/summary view required by
 * the Room Designer, sidebar, Design Review, reports and PDFs.
 *
 * Consumers must read this object. They must not regroup seats, calculate
 * floors, rebuild design ratings, or aggregate parameter results.
 */

import {
  calculateRoomDesignRating,
  calculateScopedRoomDesignRating,
  calculateSeatDesignRating,
} from "@/components/report/technical/artcousticSystemDesignRating";
import {
  getCategoryFloorSummaries,
  getDesignPerformanceIndex,
  getDesignRatingSupportingSentence,
} from "@/components/report/technical/designRatingPresentation";
import { getLowestPerformanceResults } from "@/components/designreview/needsAttentionAuthority";
import { getCategoryForParam } from "@/components/report/technical/technicalParameterMeta";
import { buildRp22SeatCoverageResult } from "@/components/utils/rp22SeatCoverageSentence";
import { getScopedSeatIds, buildSeatPriorityFingerprint } from "@/components/utils/seatScopeAuthority";
import { rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";

export const ENGINEERING_SUMMARY_SCHEMA_VERSION = 1;

const LEVEL_RANK = { FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const RANK_LEVEL = ["FAIL", "L1", "L2", "L3", "L4"];
const SCORECARD_CATEGORY_ORDER = [
  "Spatial Resolution",
  "Dynamic Range",
  "Timbre Matching",
  "Screen / Viewing Geometry",
];

function normalizeLevel(level) {
  const value = String(level ?? "").trim().toUpperCase();
  if (value === "FAIL" || value === "L1" || value === "L2" || value === "L3" || value === "L4") return value;
  return null;
}

function clonePlain(value, seen = new WeakMap()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = clonePlain(child, seen);
  return copy;
}

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.freeze(value);
}

function floorForSeatParameter(parameter, seatIds = null) {
  if (!parameter || parameter.scope !== "seat") return null;
  const includedSeatIds = Array.isArray(seatIds) ? new Set(seatIds.map(String)) : null;
  const levels = Object.entries(parameter.seats || {})
    .filter(([seatId, seat]) => (!includedSeatIds || includedSeatIds.has(String(seatId))) && seat?.state === "scored")
    .map(([, seat]) => normalizeLevel(seat?.level))
    .filter(Boolean);
  if (levels.length === 0) return null;
  const floorRank = Math.min(...levels.map((level) => LEVEL_RANK[level]));
  return RANK_LEVEL[floorRank] || null;
}

function parameterAggregateLevel(parameter, seatIds = null) {
  if (!parameter || parameter.state !== "scored") return null;
  if (parameter.scope !== "seat") return normalizeLevel(parameter.level);
  return floorForSeatParameter(parameter, seatIds);
}

function buildCanonicalRoomResults(parameters, publishedResults) {
  const canonical = { ...(publishedResults || {}) };
  for (const [key, parameter] of Object.entries(parameters || {})) {
    // Every non-seat numeric parameter is project/room authority. Some legacy
    // inputs label this scope "project" rather than "room"; neither may leave a
    // stale pre-summary grade in roomResultsByParameter.
    if (parameter?.scope === "seat") continue;
    const match = String(key).match(/^(?:p)?(\d+)$/i);
    if (!match) continue;
    const parameterNumber = Number(match[1]);
    const existing = canonical[parameterNumber] || canonical[String(parameterNumber)] || {};
    canonical[parameterNumber] = {
      ...existing,
      state: parameter.state || "provisional",
      status: parameter.state || existing.status || null,
      value: parameter.state === "scored" ? (parameter.rawValue ?? existing.value ?? null) : null,
      level: parameter.state === "scored" ? normalizeLevel(parameter.level) : null,
    };
  }
  return canonical;
}

function buildParameterScopeSummary(parameters, seatIds) {
  const summary = {};
  for (const [key, parameter] of Object.entries(parameters || {})) {
    summary[key] = {
      key,
      scope: parameter?.scope || null,
      state: parameter?.state || "provisional",
      level: parameterAggregateLevel(parameter, seatIds),
    };
  }
  return summary;
}

function buildComplianceSummary(parameters) {
  const counts = { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, notVerified: 0 };
  let lowestRank = null;
  let active = 0;
  let unavailable = 0;
  let calculatedSeatParams = 0;
  let seatParamCount = 0;
  const byParameter = {};

  for (const [key, parameter] of Object.entries(parameters || {})) {
    if (key === "screen") continue;
    const level = parameterAggregateLevel(parameter);
    const isSeatScope = parameter?.scope === "seat";
    if (isSeatScope) {
      seatParamCount += 1;
      if (level) calculatedSeatParams += 1;
    }

    byParameter[key] = {
      key,
      scope: parameter?.scope || null,
      state: parameter?.state || "provisional",
      level,
    };

    if (level === "L4") { counts.L4 += 1; active += 1; }
    else if (level === "L3") { counts.L3 += 1; active += 1; }
    else if (level === "L2") { counts.L2 += 1; active += 1; }
    else if (level === "L1") { counts.L1 += 1; active += 1; }
    else if (level === "FAIL") { counts.fail += 1; active += 1; }
    else { counts.notVerified += 1; unavailable += 1; }

    if (level) {
      const rank = LEVEL_RANK[level];
      if (lowestRank == null || rank < lowestRank) lowestRank = rank;
    }
  }

  return {
    counts,
    lowestLabel: lowestRank == null ? "—" : lowestRank === 0 ? "Below L1" : RANK_LEVEL[lowestRank],
    active,
    unavailable,
    calculatedSeatParams,
    seatParamCount,
    byParameter,
  };
}

function buildReportCounts(parameters, seats, seatHudById) {
  const roomLevelCounts = { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, unassessed: 0 };
  const seatParameterEntries = Object.entries(parameters || {})
    .filter(([key, parameter]) => key !== "screen" && parameter?.scope === "seat");
  const roomParameterEntries = Object.entries(parameters || {})
    .filter(([key, parameter]) => key !== "screen" && parameter?.scope === "room");

  for (const [, parameter] of roomParameterEntries) {
    const level = parameterAggregateLevel(parameter);
    if (level === "L4" || level === "L3" || level === "L2" || level === "L1") roomLevelCounts[level] += 1;
    else if (level === "FAIL") roomLevelCounts.fail += 1;
    else roomLevelCounts.unassessed += 1;
  }

  const seatLevelCounts = (Array.isArray(seats) ? seats : []).map((seat) => {
    const counts = { L1: 0, L2: 0, L3: 0, L4: 0 };
    let activeCount = 0;
    let failCount = 0;

    for (const [, parameter] of seatParameterEntries) {
      const seatAuthority = parameter?.seats?.[seat?.id];
      if (seatAuthority?.state !== "scored") continue;
      const level = normalizeLevel(seatAuthority.level);
      if (!level) continue;
      activeCount += 1;
      if (level === "FAIL") failCount += 1;
      else counts[level] += 1;
    }

    return {
      seatId: seat?.id,
      counts,
      activeCount,
      failCount,
      total: seatParameterEntries.length,
    };
  });

  const seatsById = new Map((Array.isArray(seats) ? seats : []).map((seat) => [seat?.id, seat]));
  const rows = new Map();
  for (const result of seatLevelCounts) {
    const seat = seatsById.get(result.seatId) || {};
    const fallbackMatch = String(result.seatId || "").match(/^seat-r(\d+)-c(\d+)$/);
    const rowNum = Number(seat.row ?? seat.rowNumber ?? fallbackMatch?.[1]) || 1;
    const seatNum = Number(seat.indexInRow ?? seat.column ?? fallbackMatch?.[2]) || Number.MAX_SAFE_INTEGER;
    if (!rows.has(rowNum)) rows.set(rowNum, []);
    rows.get(rowNum).push({ ...result, seatNum });
  }
  const seatCountsByRow = Array.from(rows.entries())
    .sort(([a], [b]) => a - b)
    .map(([rowNum, rowSeats]) => ({
      rowNum,
      seats: rowSeats.sort((a, b) => a.seatNum - b.seatNum),
    }));

  // Relative seat-compromise diagnostic. This is calculated once here so
  // reports never compare or rank authoritative seat results independently.
  const bestByParameter = {};
  for (const [key, parameter] of seatParameterEntries) {
    const levels = Object.values(parameter?.seats || {})
      .filter((seatAuthority) => seatAuthority?.state === "scored")
      .map((seatAuthority) => normalizeLevel(seatAuthority.level))
      .filter((level) => level && level !== "FAIL")
      .map((level) => LEVEL_RANK[level]);
    if (levels.length) bestByParameter[key] = Math.max(...levels);
  }
  const seatCompromiseById = {};
  for (const seat of Array.isArray(seats) ? seats : []) {
    let comparableCount = 0;
    let majorGapCount = 0;
    for (const [key, parameter] of seatParameterEntries) {
      const level = normalizeLevel(parameter?.seats?.[seat?.id]?.level);
      if (!level || level === "FAIL" || bestByParameter[key] == null) continue;
      comparableCount += 1;
      if (bestByParameter[key] - LEVEL_RANK[level] >= 2) majorGapCount += 1;
    }
    const majorGapPct = comparableCount > 0 ? majorGapCount / comparableCount : 0;
    seatCompromiseById[seat?.id] = {
      majorGapCount,
      comparableCount,
      majorGapPct,
      isCompromised: majorGapCount >= 4 && majorGapPct >= 0.5,
    };
  }

  const seatResultsByParameter = {};
  const seatResultRowsByParameter = {};
  for (const [key, parameter] of seatParameterEntries) {
    const results = (Array.isArray(seats) ? seats : []).map((seat, fallbackIndex) => {
      const metric = seatHudById?.[seat?.id]?.rp22?.[key] || null;
      const seatAuthority = parameter?.seats?.[seat?.id] || null;
      const fallbackMatch = String(seat?.id || "").match(/^seat-r(\d+)-c(\d+)$/);
      const row = Number(seat?.row ?? seat?.rowNumber ?? fallbackMatch?.[1]) || 1;
      const column = Number(seat?.indexInRow ?? seat?.column ?? fallbackMatch?.[2]) || fallbackIndex + 1;
      return {
        seatId: seat?.id,
        row,
        column,
        priority: String(seat?.priority || "").toLowerCase() === "secondary" ? "secondary" : "primary",
        isPrimary: seat?.isPrimary === true || String(seat?.priority || "").toLowerCase() !== "secondary",
        valueFormatted: metric?.formatted || metric?.hudLabel || "—",
        level: seatAuthority?.state === "scored" ? (normalizeLevel(seatAuthority.level) || "—") : "—",
        status: seatAuthority?.state || metric?.status || null,
        value: seatAuthority?.rawValue ?? metric?.value ?? metric?.valueDb ?? null,
        worstFrequencyHz: metric?.worstFrequencyHz ?? null,
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

  return {
    roomLevelCounts,
    roomCalculatedCount: roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1 + roomLevelCounts.fail,
    roomParameterCount: roomParameterEntries.length,
    seatParameterCount: seatParameterEntries.length,
    seatsEvaluated: seatLevelCounts.length,
    seatCalculatedParamCount: seatLevelCounts.reduce((maximum, seat) => Math.max(maximum, seat.activeCount || 0), 0),
    seatLevelCounts,
    seatCountsByRow,
    seatCompromiseById,
    compromisedSeatCount: Object.values(seatCompromiseById).filter((seat) => seat.isCompromised).length,
    seatResultsByParameter,
    seatResultRowsByParameter,
  };
}

function buildViewingSummary(perSeatRp23, seats, primarySeatIds, secondarySeatIds) {
  const primaryIds = new Set((primarySeatIds || []).map(String));
  const secondaryIds = new Set((secondarySeatIds || []).map(String));
  const perSeat = (Array.isArray(seats) ? seats : []).map((seat) => {
    const engineResult = perSeatRp23?.[seat?.id];
    const angleDeg = Number.isFinite(Number(engineResult?.angleDeg)) ? Number(engineResult.angleDeg) : null;
    return {
      seat_id: seat?.id || null,
      priority: secondaryIds.has(String(seat?.id)) ? "secondary" : primaryIds.has(String(seat?.id)) ? "primary" : null,
      horizontal_angle_deg: angleDeg,
      rp23_level: angleDeg == null ? null : rp23LevelForAngleDeg(angleDeg),
    };
  });

  const floorFor = (seatIds = null) => {
    const included = Array.isArray(seatIds) ? new Set(seatIds.map(String)) : null;
    const levels = perSeat
      .filter((seat) => !included || included.has(String(seat.seat_id)))
      .map((seat) => normalizeLevel(seat.rp23_level))
      .filter(Boolean);
    if (!levels.length) return null;
    return RANK_LEVEL[Math.min(...levels.map((level) => LEVEL_RANK[level]))] || null;
  };

  const angles = perSeat.map((seat) => seat.horizontal_angle_deg).filter(Number.isFinite);
  const available = angles.length > 0;
  const minimum = available ? Math.min(...angles) : null;
  const maximum = available ? Math.max(...angles) : null;

  return {
    available,
    per_seat: available ? perSeat : [],
    primary_floor: available ? floorFor(primarySeatIds) : null,
    secondary_floor: available ? floorFor(secondarySeatIds) : null,
    project_floor: available ? floorFor() : null,
    summary: available
      ? `Viewing angles calculated for ${angles.length} seat${angles.length === 1 ? "" : "s"}. Horizontal viewing angle ranges from ${minimum.toFixed(0)}° to ${maximum.toFixed(0)}°.`
      : "Viewing angles not calculated.",
  };
}

function buildCategorySummary(rating) {
  const available = !!rating && rating.status !== "NOT_ASSESSED" && rating.status !== "NOT_CONFIGURED";
  return {
    available,
    designPerformanceIndex: available ? getDesignPerformanceIndex(rating) : null,
    supportingSentence: available ? getDesignRatingSupportingSentence(rating) : null,
    categories: available ? getCategoryFloorSummaries(rating) : [],
  };
}

function buildScorecard(projectRating) {
  const contributions = Array.isArray(projectRating?.contributions) ? projectRating.contributions : [];
  const byCategory = {};
  for (const contribution of contributions) {
    const category = contribution?.key === "screen"
      ? "Screen / Viewing Geometry"
      : (getCategoryForParam(Number(contribution?.parameter)) || "General");
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(contribution);
  }
  const categories = [
    ...SCORECARD_CATEGORY_ORDER.filter((category) => byCategory[category]),
    ...Object.keys(byCategory).filter((category) => !SCORECARD_CATEGORY_ORDER.includes(category)),
  ];
  const highestPerformanceResults = contributions
    .filter((contribution) => {
      const level = normalizeLevel(contribution?.level);
      return level === "L3" || level === "L4";
    })
    .sort((a, b) => LEVEL_RANK[normalizeLevel(b?.level)] - LEVEL_RANK[normalizeLevel(a?.level)])
    .slice(0, 5);

  return {
    contributions,
    byCategory,
    categories,
    highestPerformanceResults,
    lowestPerformanceResults: getLowestPerformanceResults(contributions),
  };
}

/**
 * Build every derived engineering summary exactly once.
 *
 * @param {Object} params.designRatingAuthority Final authoritative parameter object.
 * @param {Array} params.seats Canonical seating positions carrying priorities.
 * @param {Object} params.seatHudById Canonical per-seat published engineering results.
 * @param {Object} params.roomResultsByParameter Canonical room result presentation.
 * @param {Object|null} params.p19SeatAuthority Canonical P19 seat publication.
 * @param {Object} params.perSeatRp23 Canonical per-seat RP23 result publication.
 */
export function summariseEngineeringResults({
  designRatingAuthority,
  seats,
  seatHudById,
  roomResultsByParameter = {},
  p19SeatAuthority = null,
  perSeatRp23 = {},
}) {
  if (!designRatingAuthority) return null;

  const canonicalSeats = Array.isArray(seats) ? seats : [];
  const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(canonicalSeats);
  const allSeatIds = designRatingAuthority?.seatIds || canonicalSeats.map((seat) => seat?.id).filter(Boolean);

  const projectRating = calculateRoomDesignRating(designRatingAuthority);
  const primaryRating = calculateScopedRoomDesignRating(designRatingAuthority, primarySeatIds);
  const secondaryRating = calculateScopedRoomDesignRating(designRatingAuthority, secondarySeatIds);
  const scopedRatings = { primary: primaryRating, secondary: secondaryRating, all: projectRating };

  const seatDesignRatings = {};
  const seatDesignPerformanceIndexById = {};
  for (const seatId of allSeatIds) {
    const seatRating = calculateSeatDesignRating(designRatingAuthority, seatId);
    seatDesignRatings[seatId] = seatRating;
    seatDesignPerformanceIndexById[seatId] =
      seatRating && seatRating.status !== "NOT_ASSESSED" && seatRating.status !== "NOT_CONFIGURED"
        ? getDesignPerformanceIndex(seatRating)
        : null;
  }

  const seatLevels = {};
  for (const [key, parameter] of Object.entries(designRatingAuthority?.parameters || {})) {
    if (parameter?.scope !== "seat") continue;
    seatLevels[key] = {};
    for (const [seatId, seatAuthority] of Object.entries(parameter.seats || {})) {
      seatLevels[key][seatId] = seatAuthority?.state === "scored" ? seatAuthority.level : null;
    }
  }

  const categoryFloors = {
    primary: buildCategorySummary(primaryRating),
    secondary: buildCategorySummary(secondaryRating),
    project: buildCategorySummary(projectRating),
  };
  const parameterSummaries = {
    primary: buildParameterScopeSummary(designRatingAuthority.parameters, primarySeatIds),
    secondary: buildParameterScopeSummary(designRatingAuthority.parameters, secondarySeatIds),
    project: buildParameterScopeSummary(designRatingAuthority.parameters, allSeatIds),
  };
  const canonicalRoomResultsByParameter = buildCanonicalRoomResults(
    designRatingAuthority.parameters,
    roomResultsByParameter,
  );
  const coverage = buildRp22SeatCoverageResult({
    paramAuthority: designRatingAuthority.parameters,
    seats: canonicalSeats,
  });
  const compliance = buildComplianceSummary(designRatingAuthority.parameters);
  const reportCounts = buildReportCounts(designRatingAuthority.parameters, canonicalSeats, seatHudById || {});
  const scorecard = buildScorecard(projectRating);
  const viewing = buildViewingSummary(perSeatRp23, canonicalSeats, primarySeatIds, secondarySeatIds);

  const summary = {
    schemaVersion: ENGINEERING_SUMMARY_SCHEMA_VERSION,
    seatPriorityFingerprint: buildSeatPriorityFingerprint(canonicalSeats),
    parameterAuthority: designRatingAuthority.parameters,
    roomResultsByParameter: canonicalRoomResultsByParameter,
    seatHudById: seatHudById || {},
    p19SeatAuthority,
    viewing,
    parameterSummaries,
    primary: {
      seatIds: primarySeatIds,
      rating: primaryRating,
      designPerformanceIndex: categoryFloors.primary.designPerformanceIndex,
      supportingSentence: categoryFloors.primary.supportingSentence,
      categories: categoryFloors.primary.categories,
    },
    secondary: {
      seatIds: secondarySeatIds,
      rating: secondaryRating,
      designPerformanceIndex: categoryFloors.secondary.designPerformanceIndex,
      supportingSentence: categoryFloors.secondary.supportingSentence,
      categories: categoryFloors.secondary.categories,
    },
    project: {
      seatIds: allSeatIds,
      rating: projectRating,
      designPerformanceIndex: categoryFloors.project.designPerformanceIndex,
      supportingSentence: categoryFloors.project.supportingSentence,
      categories: categoryFloors.project.categories,
      coverage,
      compliance,
      reportCounts,
      scorecard,
    },
    designRating: {
      rating: projectRating,
      scopedRatings,
      seatDesignRatings,
      seatDesignPerformanceIndexById,
      seatLevels,
      categoryFloors,
    },
  };

  // Freeze an isolated publication. Never freeze live engine objects that the
  // calculation pipeline may still own or update.
  return freezeDeep(clonePlain(summary));
}
