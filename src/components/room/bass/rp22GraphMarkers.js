import { deriveP18SelectedTargetExplanation, formatP18MarkerSuffix } from "@/components/room/bass/p18SelectedTargetExplanation";
import { resolveP20SeatDisplay } from "@/components/room/bass/p20DisplayAuthority";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/**
 * Build RP22 graph markers for the bass response graph.
 *
 * @param {object} finalBassResponse - finalOptimisedBassResponse (live or restored)
 * @param {string|null} selectedSeatId - the currently selected seat ID ("rsp" or a real seat)
 *
 * One RSP-derived EQ is applied to every seat. There is no per-seat EQ.
 *
 * P19 marker:
 *   - always the authoritative RSP limiting frequency (post-EQ RSP vs house
 *     target). P19 is RSP-only, so the marker never moves with the selected seat.
 *
 * P20 marker:
 *   - always the overall project-worst seat (post-EQ seat vs post-EQ RSP). A
 *     selected seat's own point is returned separately as secondary detail and
 *     never replaces the official result.
 */
export function buildRp22GraphMarkers(finalBassResponse, selectedSeatId = null) {
  const seatVariation = finalBassResponse?.finalSeatVariationData || {};
  const p20Results = Array.isArray(seatVariation?.p20?.perSeatResults)
    ? seatVariation.p20.perSeatResults
    : [];

  // ── P19 limiting frequency: the authoritative RSP result, always ──
  // P19 is RSP-only: the corrected RSP response measured against the house target
  // below transition. There is no per-seat P19, so this is never resolved from the
  // selected seat — doing so made the marker vanish the moment a seat was clicked,
  // and would have claimed a per-seat result that does not exist.
  const p19WorstFrequencyHz = finite(seatVariation?.p19?.worstFrequencyHz)
    ? Number(seatVariation.p19.worstFrequencyHz)
    : null;

  // ── P20: the official project-worst point, always ──
  // The published P20 result is the worst seat in the project, under one
  // RSP-derived EQ applied to every seat. Selecting a seat adds that seat's own
  // point as secondary detail — it never replaces the official result.
  const officialWorstSeatId = seatVariation?.p20?.worstSeatId ?? null;
  const worstP20 = p20Results.find((seat) => String(seat?.seatId) === String(officialWorstSeatId))
    || p20Results.reduce((worst, seat) => {
      if (!finite(seat?.variationDbRaw)) return worst;
      if (!worst || Number(seat.variationDbRaw) > Number(worst.variationDbRaw)) return seat;
      return worst;
    }, null);
  const p20WorstFrequencyHz = finite(worstP20?.worstFrequencyHz)
    ? Number(worstP20.worstFrequencyHz)
    : null;
  const p20WorstSeatId = worstP20?.seatId ?? officialWorstSeatId;
  // Canonical display for the official result. The marker, the pill and the
  // tooltip all state this same floored value — the marker never formats its own.
  const p20Display = resolveP20SeatDisplay(worstP20, { isAllSeatWorst: true });

  // Secondary detail: the selected seat's own point, presented beside the official
  // result and never in place of it.
  const selectedSeatP20 = selectedSeatId && selectedSeatId !== "rsp"
    ? p20Results.find((seat) => String(seat?.seatId) === String(selectedSeatId)) || null
    : null;
  const p20SelectedDisplay = selectedSeatP20
    ? resolveP20SeatDisplay(selectedSeatP20, { selectedSeatId })
    : null;

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
    // The canonical display object for the official worst seat (exact value,
    // floored display value, grade, limiting frequency, scope). Every P20 surface
    // reads it, so the marker can never disagree with the pill or the tooltip.
    p20WorstDisplay: p20Display,
    // Secondary detail only: the selected seat's own P20 point, shown beside the
    // official project-worst result — never in place of it.
    p20SelectedSeatId: p20SelectedDisplay?.seatId ?? null,
    p20SelectedSeatFrequencyHz: p20SelectedDisplay?.limitingFrequencyHz ?? null,
    p20SelectedSeatDisplay: p20SelectedDisplay,
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