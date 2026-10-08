/**
 * Read-only parameter-grid adapter for the canonical engineering summary.
 *
 * This hook performs no grading, floor calculation, seat grouping, worst-seat
 * selection, or bass reconstruction. Every engineering value comes directly
 * from summariseEngineeringResults().
 */

import React from "react";
import { readReportParameter } from '@/components/report/reportParameterEvidence';
import { resolveParamThresholds } from "@/components/report/technical/roomParameterLevelAuthority";
import { formatP7Degrees, isP7Number } from "@/components/utils/rp22/p7DisplayAuthority";
import { firstStatedPrimitive } from "@/components/utils/renderSafe";

function roomResultFor(engineeringSummary, paramId) {
  return engineeringSummary?.roomResultsByParameter?.[Number(paramId)] || null;
}

function seatRowsFor(engineeringSummary, paramId) {
  return engineeringSummary?.project?.reportCounts?.seatResultRowsByParameter?.[`p${Number(paramId)}`] || [];
}

function formatAsdrInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : null;
}

/**
 * Adapt the published per-seat rows onto the seat-layout map's shape, carrying
 * each seat's room position so the map can lay the row out in its physical order
 * (the map itself does that ordering). No value, level or priority is altered.
 */
function adaptSeatRows(rows, positionsById) {
  return rows.map((row) => ({
    row: row.row,
    seats: (row.seats || []).map((seat) => {
      const placed = positionsById?.get(String(seat.seatId)) || null;
      const x = Number(placed?.x);
      return {
        id: seat.seatId,
        indexInRow: seat.column,
        level: seat.level,
        value: seat.valueFormatted,
        isPrimary: seat.isPrimary,
        priority: seat.priority,
        x: Number.isFinite(x) ? x : null,
      };
    }),
  }));
}

export function useParameterGridAuthority({
  engineeringSummary,
  contributionsByKey = null,
  seatingPositions = null,
}) {
  // Physical seat positions, so a seat-layout result map can place each seat
  // where it actually is in the room instead of in seat-id order.
  const positionsById = React.useMemo(() => {
    const map = new Map();
    for (const seat of (Array.isArray(seatingPositions) ? seatingPositions : [])) {
      if (seat?.id) map.set(String(seat.id), seat);
    }
    return map;
  }, [seatingPositions]);

  const primarySeatId = engineeringSummary?.primary?.seatIds?.[0]
    ?? engineeringSummary?.project?.seatIds?.[0]
    ?? "";
  const reportCounts = engineeringSummary?.project?.reportCounts || {};
  const parameterSummaries = engineeringSummary?.parameterSummaries?.project || {};
  const scorecardContributions = engineeringSummary?.project?.scorecard?.contributions || [];

  const canonicalContributionsByKey = React.useMemo(() => {
    if (contributionsByKey) return contributionsByKey;
    const out = {};
    for (const contribution of scorecardContributions) {
      if (contribution?.key) out[contribution.key] = contribution;
    }
    return out;
  }, [contributionsByKey, scorecardContributions]);

  const getHudLevelForParam = React.useCallback((param) => (
    readReportParameter(engineeringSummary, Number(param?.id)).level
  ), [engineeringSummary]);

  const getHudValueForParam = React.useCallback((param) => (
    readReportParameter(engineeringSummary, Number(param?.id)).value
  ), [engineeringSummary]);

  const buildSeatGridData = React.useCallback((paramId) => {
    // P19 is RSP-only: it has no per-seat result, so no seat grid is ever built
    // for it, whatever a legacy publication stores against it.
    if (Number(paramId) === 19) return [];
    return adaptSeatRows(seatRowsFor(engineeringSummary, paramId), positionsById);
  }, [engineeringSummary, positionsById]);

  const buildAsdrFooter = React.useCallback((paramId) => {
    const key = paramId === "screen" ? "screen" : `p${paramId}`;
    const contribution = canonicalContributionsByKey?.[key];
    if (!contribution) return null;
    const scoreText = contribution.scope === "seat" ? "Room contribution" : "Score";
    return [
      "ASDR",
      contribution.mode === "recommended" ? "Recommended" : null,
      contribution.effectiveWeight != null ? `Weight ${formatAsdrInteger(contribution.effectiveWeight)}` : null,
      contribution.earnedPoints != null && contribution.maximumPoints != null
        ? `${scoreText} ${formatAsdrInteger(contribution.earnedPoints)} / ${formatAsdrInteger(contribution.maximumPoints)}`
        : null,
    ].filter(Boolean).join(" · ");
  }, [canonicalContributionsByKey]);

  const p12Mode = roomResultFor(engineeringSummary, 12)?.targetBasis || "minimum";
  const p13Mode = roomResultFor(engineeringSummary, 13)?.targetBasis || "minimum";
  const p14Mode = roomResultFor(engineeringSummary, 14)?.targetBasis || "minimum";
  const p18Mode = roomResultFor(engineeringSummary, 18)?.targetBasis || "minimum";

  const resolveThresholds = React.useCallback((param) => (
    resolveParamThresholds(param, p12Mode, p13Mode, p14Mode, p18Mode)
  ), [p12Mode, p13Mode, p14Mode, p18Mode]);

  const buildP6Presentation = React.useCallback(() => {
    const level = parameterSummaries.p6?.level || null;
    const primaryResult = (reportCounts.seatResultsByParameter?.p6 || [])
      .find((seat) => String(seat.seatId) === String(primarySeatId));
    return {
      achievedValue: firstStatedPrimitive([primaryResult?.valueFormatted, primaryResult?.value], "Seat results"),
      lvl: level,
    };
  }, [parameterSummaries, reportCounts, primarySeatId]);

  const makeBassParam = (id) => {
    const result = roomResultFor(engineeringSummary, id);
    // P19 and P20 carry no room-level result of their own — P19 is RSP-scoped and
    // P20 is assessed seat by seat — so they state the same published value the
    // parameter grid states, rather than an empty box, wherever they were
    // calculated. P14 and P18 are room results and are unchanged.
    const scopedFallback = (id === 19 || id === 20) ? getHudValueForParam({ id }) : null;
    return {
      // P14 and P18 are room results: the published room result is the single
      // authority for the grade, so no summary row may override it. P19 and P20
      // have no room result of their own and still read the published summary.
      level: (id === 18 && result?.level)
        || parameterSummaries[`p${id}`]?.level
        || result?.level
        || "—",
      valueText: firstStatedPrimitive([result?.formatted, result?.value, scopedFallback], "—"),
      detail: result?.detail || null,
      targetBasis: result?.targetBasis || null,
    };
  };

  const bassPresentation = {
    publicationVerified: !!engineeringSummary,
    p14TargetUnselected: false,
    parameters: {
      p14: makeBassParam(14),
      p18: makeBassParam(18),
      p19: makeBassParam(19),
      p20: makeBassParam(20),
    },
    perSeatP20Results: reportCounts.seatResultsByParameter?.p20 || [],
  };

  return {
    getHudValueForParam,
    getHudLevelForParam,
    buildSeatGridData,
    buildAsdrFooter,
    resolveThresholds,
    resolveP12P13DualLevels: () => null,
    bassPresentation,
    rows: reportCounts.seatCountsByRow || [],
    seats: engineeringSummary?.project?.seatIds || [],
    getSnapshotForSeat: (seat) => engineeringSummary?.seatHudById?.[seat?.id] || null,
    renderSeatPillGrid: () => null,
    buildP6Presentation,
    p12Mode,
    p13Mode,
    p14Mode,
    lockedSeatId: primarySeatId,
  };
}