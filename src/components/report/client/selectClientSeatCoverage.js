/**
 * selectClientSeatCoverage
 * ------------------------
 * Pure selector: maps discrete seat geometry + canonical P4/P6/P10 values
 * from the engine's perSeatRp22 structure.
 *
 * Reads analysisResult.perSeatRp22[seatId].rp22 ONLY.
 * No interpolation, no regrading, no local SPL recomputation.
 *
 * @param {Object} analysisResult - from useRP22AnalysisEngine
 * @param {Array}  seatingPositions - discrete seat array from app state
 * @returns {Array} per-seat coverage entries
 */
export function selectClientSeatCoverage(analysisResult, seatingPositions) {
  if (!analysisResult || !Array.isArray(seatingPositions)) return [];

  const perSeat = analysisResult.perSeatRp22 || {};

  return seatingPositions
    .filter((s) => s && s.id != null)
    .map((seat) => {
      const seatData = perSeat[seat.id];
      const rp22 = seatData?.rp22 || {};

      return {
        seatId: seat.id,
        seat: {
          x: Number(seat.x) || 0,
          y: Number(seat.y) || 0,
          z: Number(seat.z) || 1.2,
          isPrimary: seat.isPrimary === true,
        },
        p4: normalizeSeatParam(rp22[4]),
        p6: normalizeSeatParam(rp22[6]),
        p10: normalizeSeatParam(rp22[10]),
      };
    });
}

function normalizeSeatParam(raw) {
  if (!raw) return null;
  const value = raw.value != null ? raw.value : raw.valueDb != null ? raw.valueDb : null;
  return {
    value: Number.isFinite(value) ? value : null,
    formatted: raw.formatted ?? null,
    level: raw.level ?? null,
    status: raw.status ?? (value != null ? "ok" : "no_data"),
  };
}