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

  // P18 bounded flag: when the response is still above the -3 dB cutoff at the
  // product validity floor, the extension is bounded (≤ floor), not a measured
  // crossing. The marker sits on the bound — not a fake exact point below valid
  // product data. The authority payload retains the precise crossing when exact.
  const p18Bounded = seatVariation?.p18?.authority?.achievedExtensionBounded === true
    || seatVariation?.p18?.achievedExtensionBounded === true;

  return {
    // P18 is published at favourable whole-Hz resolution. Put the
    // marker on the same authoritative design value used by the pill and
    // grading, while retaining the precise crossing in the authority payload.
    p18FrequencyHz: finite(seatVariation?.p18?.extensionHz)
      ? Math.floor(Number(seatVariation.p18.extensionHz))
      : null,
    p18Bounded,
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