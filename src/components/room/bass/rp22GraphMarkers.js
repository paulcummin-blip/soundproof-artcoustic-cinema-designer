import { deriveP18SelectedTargetExplanation, formatP18MarkerSuffix } from "@/components/room/bass/p18SelectedTargetExplanation";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/**
 * Build RP22 graph markers for the bass response graph.
 *
 * @param {object} finalBassResponse - finalOptimisedBassResponse (live or restored)
 * @param {string|null} selectedSeatId - the currently selected seat ID ("rsp" or a real seat)
 *
 * P19 marker:
 *   - RSP selected → RSP P19 worst frequency (the authoritative assessment position)
 *   - Individual seat selected → that seat's canonical P19 worst frequency
 *
 * P20 marker:
 *   - RSP selected → overall worst seat P20 (established RSP presentation)
 *   - Individual seat selected → that seat's P20 worst frequency
 */
export function buildRp22GraphMarkers(finalBassResponse, selectedSeatId = null) {
  const seatVariation = finalBassResponse?.finalSeatVariationData || {};
  const p19PerSeat = Array.isArray(seatVariation?.p19?.perSeatResults)
    ? seatVariation.p19.perSeatResults
    : [];
  const p20Results = Array.isArray(seatVariation?.p20?.perSeatResults)
    ? seatVariation.p20.perSeatResults
    : [];

  // ── P19 worst frequency: selected seat or RSP ──
  let p19WorstFrequencyHz = null;
  if (selectedSeatId && selectedSeatId !== "rsp") {
    const seatP19 = p19PerSeat.find((seat) => String(seat?.seatId) === String(selectedSeatId));
    p19WorstFrequencyHz = seatP19 && finite(seatP19.worstFrequencyHz)
      ? Number(seatP19.worstFrequencyHz)
      : null;
  } else {
    p19WorstFrequencyHz = finite(seatVariation?.p19?.worstFrequencyHz)
      ? Number(seatVariation.p19.worstFrequencyHz)
      : null;
  }

  // ── P20 worst frequency: selected seat or overall worst (RSP) ──
  let p20WorstFrequencyHz = null;
  let p20WorstSeatId = null;
  if (selectedSeatId && selectedSeatId !== "rsp") {
    const seatP20 = p20Results.find((seat) => String(seat?.seatId) === String(selectedSeatId));
    if (seatP20 && finite(seatP20.worstFrequencyHz)) {
      p20WorstFrequencyHz = Number(seatP20.worstFrequencyHz);
      p20WorstSeatId = seatP20.seatId;
    }
  } else {
    // RSP: established presentation — overall worst seat P20 marker.
    const worstSeatId = seatVariation?.p20?.worstSeatId ?? null;
    const worstP20 = p20Results.find((seat) => String(seat?.seatId) === String(worstSeatId))
      || p20Results.reduce((worst, seat) => {
        if (!finite(seat?.variationDbRaw)) return worst;
        if (!worst || Number(seat.variationDbRaw) > Number(worst.variationDbRaw)) return seat;
        return worst;
      }, null);
    p20WorstFrequencyHz = finite(worstP20?.worstFrequencyHz)
      ? Number(worstP20.worstFrequencyHz)
      : null;
    p20WorstSeatId = worstP20?.seatId ?? worstSeatId;
  }

  // P18 bounded flag: when the response is still above the -3 dB cutoff at the
  // product validity floor, the published point is the lowest valid frequency,
  // not a measured crossing. The marker sits on that point — never a fake exact
  // crossing below valid product data. Floor-bounded meaning is carried in the
  // detail line, never as a comparator beside the result. The authority payload
  // retains the precise crossing when it is exact.
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
    // Display-only explanation of the marker: the LFE output target it was
    // measured at and the branch that limited it. Null when the payload has no
    // branch data, in which case the marker keeps its existing wording.
    p18Explanation: deriveP18SelectedTargetExplanation(seatVariation?.p18 || null),
    p19StartHz: finite(finalBassResponse?.assessmentStartHz)
      ? Number(finalBassResponse.assessmentStartHz)
      : null,
    p19EndHz: finite(finalBassResponse?.assessmentEndHz)
      ? Number(finalBassResponse.assessmentEndHz)
      : null,
    p19WorstFrequencyHz,
    p20WorstFrequencyHz,
    p20WorstSeatId,
  };
}

/**
 * Format the P18 marker label for the graph legend.
 *
 * The label states the calculated -3 dB point with no greater-than or
 * less-than wording. When the response is still above the -3 dB cutoff at the
 * lower analysis boundary (bounded), the detail line states that the exact
 * crossing sits below the calculated range — never a fake measured point.
 * When the -3 dB crossing genuinely occurs inside the calculated frequency
 * array, the normal measured crossing presentation is preserved.
 *
 * @param {object} markers - output of buildRp22GraphMarkers
 * @returns {{short: string, detail: string|null}|null}
 */
export function formatP18MarkerLabel(markers) {
  if (!finite(markers?.p18FrequencyHz)) return null;
  const p18Rp22Hz = Math.floor(Number(markers.p18FrequencyHz));
  // Selected-target suffix: names the LFE output target the extension was
  // measured at and the branch that limited it. Absent when the payload has no
  // branch data, leaving the established wording untouched.
  const suffix = formatP18MarkerSuffix(markers?.p18Explanation);
  const clause = suffix ? ` · ${suffix}` : "";
  if (markers.p18Bounded) {
    return {
      short: `P18 achieved extension · ${p18Rp22Hz} Hz${clause}`,
      detail: suffix
        ? `Exact -3 dB crossing is below the calculated range · response and capability both bounded at the validity floor.`
        : `Exact -3 dB crossing is below the calculated range.`,
    };
  }
  const measured = Number(markers.p18FrequencyHz).toFixed(1);
  return {
    short: `P18 achieved extension · ${p18Rp22Hz} Hz RP22 (${measured} Hz measured)${clause}`,
    detail: suffix
      ? `Measured ${measured} Hz · response branch ${finite(markers?.p18Explanation?.responseTargetF3Hz) ? `${Math.round(Number(markers.p18Explanation.responseTargetF3Hz))} Hz` : "n/a"} · capability branch ${finite(markers?.p18Explanation?.capabilityTargetF3Hz) ? `${Math.round(Number(markers.p18Explanation.capabilityTargetF3Hz))} Hz` : "n/a"}.`
      : null,
  };
}