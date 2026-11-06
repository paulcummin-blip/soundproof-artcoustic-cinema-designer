// previewSeatCurveAuthority.js
// ---------------------------------------------------------------------------
// Presentation-only helper for the placement preview on the Bass Response graph.
//
// The preview engine already computes a curve for every listener (RSP + each
// seat) and returns them as seatCurves. This module decides which preview curve
// the graph draws: the RSP preview curve by default, or the focused seat's own
// preview curve when one exists.
//
// ADVISORY ONLY. It changes no calculations, no bass maths, no optimiser, no
// RP22 grading, no publication authority, no target bank and no restore flow.

export const RSP_PREVIEW_SCOPE = "rsp";

/**
 * Active preview scope, using the SAME seat authority as the graph markers:
 * the interaction-selected seat (e.g. a P20 seat pill) wins, otherwise a single
 * selected seat pill, otherwise the RSP.
 *
 * @returns {string|null} seat id, or null for the RSP scope
 */
export function resolvePreviewSeatId({ interactionSeatId = null, selectedSeatIds = [] } = {}) {
  if (interactionSeatId && interactionSeatId !== RSP_PREVIEW_SCOPE) return interactionSeatId;
  if (Array.isArray(selectedSeatIds) && selectedSeatIds.length === 1 && selectedSeatIds[0] !== RSP_PREVIEW_SCOPE) {
    return selectedSeatIds[0];
  }
  return null;
}

/** Canonical seat identity used across the designer: id, else x-y. */
export function seatIdentity(seat) {
  if (!seat) return null;
  return seat.id || `${seat.x}-${seat.y}`;
}

/**
 * Find the focused seat's preview curve in the preview result's seatCurves:
 * originalSeatId first, then seatKey, then an index fallback used only when the
 * seat set carries no ids.
 */
export function resolvePreviewSeatCurve({ seatCurves = [], previewSeatId = null, seatingPositions = [] } = {}) {
  if (!previewSeatId) return null;
  const curves = Array.isArray(seatCurves) ? seatCurves : [];

  const byId = curves.find((curve) => curve?.originalSeatId && curve.originalSeatId === previewSeatId);
  if (byId?.responseData?.length) return byId;

  const byKey = curves.find((curve) => curve?.seatKey && curve.seatKey === previewSeatId);
  if (byKey?.responseData?.length) return byKey;

  const positions = Array.isArray(seatingPositions) ? seatingPositions : [];
  const index = positions.findIndex((seat) => seatIdentity(seat) === previewSeatId);
  if (index < 0) return null;
  const byIndex = curves.find((curve) => curve?.seatIndex === index);
  return byIndex?.responseData?.length ? byIndex : null;
}

/**
 * The curve the preview series should draw, plus the two flags the UI needs.
 * When a seat is focused but the preview carries no curve for it, the RSP
 * preview is kept and `seatUnavailable` is true.
 */
export function resolvePreviewCurve({ previewResult = null, previewSeatId = null, seatingPositions = [] } = {}) {
  const seatCurve = resolvePreviewSeatCurve({
    seatCurves: previewResult?.seatCurves,
    previewSeatId,
    seatingPositions,
  });
  const data = seatCurve?.responseData?.length ? seatCurve.responseData : previewResult?.rspCurve;
  return {
    data: data?.length ? data : null,
    seatCurveUsed: !!seatCurve,
    seatUnavailable: !!previewSeatId && !seatCurve,
  };
}

/**
 * Build the simultaneous all-seats preview overlay: one graph series per real
 * listening position, each carrying that seat's OWN preview curve verbatim.
 *
 * No averaging, summing, normalising or other combination is performed — every
 * series is the preview engine's own per-seat responseData, placed on the graph
 * with its own colour and label. Seats the preview result carries no curve for
 * are omitted (they contribute no line). The RSP reference position is NOT
 * included here; it has its own dedicated button and is never substituted for a
 * seat curve.
 *
 * Pure/presentation-only — changes no calculation, no optimiser, no RP22 grading.
 *
 * @param {object} previewResult - preview engine result with seatCurves
 * @param {Array} orderedSeats - ordered real listening positions
 * @param {Array} seatingPositions - raw seating positions (index fallback)
 * @param {Function} getSeatColor - seatId → colour string
 * @param {Function} formatLabel - seatId → display label
 * @returns {Array} graph series objects (id, color, data, kind, label)
 */
export function buildAllSeatsPreviewSeries({
  previewResult = null,
  orderedSeats = [],
  seatingPositions = [],
  getSeatColor = () => "#213428",
  formatLabel = (id) => id,
} = {}) {
  const seatCurves = previewResult?.seatCurves || [];
  if (!seatCurves.length) return [];
  return orderedSeats
    .map((seat) => {
      const sid = seatIdentity(seat);
      const curve = resolvePreviewSeatCurve({ seatCurves, previewSeatId: sid, seatingPositions });
      return {
        id: sid,
        color: getSeatColor(sid),
        data: curve?.responseData || [],
        kind: "room-response-preview",
        label: formatLabel(sid),
      };
    })
    .filter((series) => series.data.length > 0);
}