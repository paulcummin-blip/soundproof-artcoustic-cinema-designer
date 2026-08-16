const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

export function buildRp22GraphMarkers(finalBassResponse) {
  const seatVariation = finalBassResponse?.finalSeatVariationData || {};
  const p20Results = Array.isArray(seatVariation?.p20?.perSeatResults)
    ? seatVariation.p20.perSeatResults
    : [];
  const worstSeatId = seatVariation?.p20?.worstSeatId ?? null;
  const worstP20 = p20Results.find((seat) => String(seat?.seatId) === String(worstSeatId))
    || p20Results.reduce((worst, seat) => {
      if (!finite(seat?.variationDbRaw)) return worst;
      if (!worst || Number(seat.variationDbRaw) > Number(worst.variationDbRaw)) return seat;
      return worst;
    }, null);

  return {
    p18FrequencyHz: finite(seatVariation?.p18?.extensionHz)
      ? Number(seatVariation.p18.extensionHz)
      : null,
    p19StartHz: finite(finalBassResponse?.assessmentStartHz)
      ? Number(finalBassResponse.assessmentStartHz)
      : null,
    p19EndHz: finite(finalBassResponse?.assessmentEndHz)
      ? Number(finalBassResponse.assessmentEndHz)
      : null,
    p19WorstFrequencyHz: finite(seatVariation?.p19?.worstFrequencyHz)
      ? Number(seatVariation.p19.worstFrequencyHz)
      : null,
    p20WorstFrequencyHz: finite(worstP20?.worstFrequencyHz)
      ? Number(worstP20.worstFrequencyHz)
      : null,
    p20WorstSeatId: worstP20?.seatId ?? worstSeatId,
  };
}
