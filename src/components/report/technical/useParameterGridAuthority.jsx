/**
 * Read-only parameter-grid adapter for the canonical engineering summary.
 *
 * This hook performs no grading, floor calculation, seat grouping, worst-seat
 * selection, or bass reconstruction. Every engineering value comes directly
 * from summariseEngineeringResults().
 */

import React from "react";
import { resolveParamThresholds } from "@/components/report/technical/roomParameterLevelAuthority";

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

function adaptSeatRows(rows) {
  return rows.map((row) => ({
    row: row.row,
    seats: (row.seats || []).map((seat) => ({
      id: seat.seatId,
      indexInRow: seat.column,
      level: seat.level,
      value: seat.valueFormatted,
      isPrimary: seat.isPrimary,
      priority: seat.priority,
    })),
  }));
}

export function useParameterGridAuthority({
  engineeringSummary,
  contributionsByKey = null,
}) {
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

  const getHudLevelForParam = React.useCallback((param) => {
    const id = Number(param?.id);
    const key = `p${id}`;
    const room = roomResultFor(engineeringSummary, id);
    return parameterSummaries[key]?.level || room?.level || "—";
  }, [engineeringSummary, parameterSummaries]);

  const getHudValueForParam = React.useCallback((param) => {
    const id = Number(param?.id);
    const key = `p${id}`;
    const room = roomResultFor(engineeringSummary, id);
    if (room) return room.formatted || room.hudLabel || (room.value ?? "—");

    if (id === 19) {
      return engineeringSummary?.p19SeatAuthority?.project?.coverageSummary
        ?? engineeringSummary?.project?.coverage?.sentence
        ?? "NOT CALCULATED";
    }

    const primaryResult = (reportCounts.seatResultsByParameter?.[key] || [])
      .find((seat) => String(seat.seatId) === String(primarySeatId));
    return primaryResult?.valueFormatted || "Seat results";
  }, [engineeringSummary, reportCounts, primarySeatId]);

  const buildSeatGridData = React.useCallback((paramId) => {
    return adaptSeatRows(seatRowsFor(engineeringSummary, paramId));
  }, [engineeringSummary]);

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
      achievedValue: primaryResult?.valueFormatted || "Seat results",
      lvl: level,
    };
  }, [parameterSummaries, reportCounts, primarySeatId]);

  const makeBassParam = (id) => {
    const result = roomResultFor(engineeringSummary, id);
    return {
      level: parameterSummaries[`p${id}`]?.level || result?.level || "—",
      valueText: result?.formatted || "—",
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
