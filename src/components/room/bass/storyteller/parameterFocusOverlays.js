// parameterFocusOverlays.js
//
// Builds graph overlay data for the parameter-focus storyteller.
// When the designer selects P14/P18/P19/P20 or a seat, this module produces
// the ReferenceAreas, ReferenceLines, additional series, curve dimming, and
// explanation text that make the graph visually explain the published result.
//
// This is presentation-only. It never changes calculations, grading, or
// optimiser results. It only controls what the graph emphasises.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { P14_EQ_ASSESSMENT_RANGE_HZ } from "@/components/utils/p14CapabilityAuthority";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

const METRIC_LABELS = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

// ── P14: capability band, target line, headroom, operating response ──
// P14 measures the integrated C-weighted SPL the subwoofer system can sustain
// across the assessment band. The graph must display the same engineering
// quantity: the Operating Response (post-EQ RSP curve) vs the House Target,
// with the capability band and achieved/target levels overlaid.
function buildP14Focus({ p14PresentationData, rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  const targetDb = finite(p14PresentationData?.targetDb) ? Number(p14PresentationData.targetDb) : null;
  const achieved = finite(p14PresentationData?.availableCapability) ? Number(p14PresentationData.availableCapability) : null;
  const headroom = (achieved != null && targetDb != null) ? achieved - targetDb : null;

  const referenceLines = [];
  if (targetDb != null) {
    referenceLines.push({
      y: targetDb,
      stroke: "#213428",
      strokeWidth: 1.5,
      strokeDasharray: "6 4",
      label: `P14 target · ${formatSplDisplay(targetDb)}`,
      labelPosition: "right",
      ifOverflow: "extendDomain",
    });
  }
  if (achieved != null) {
    referenceLines.push({
      y: achieved,
      stroke: "#059669",
      strokeWidth: 1.5,
      strokeDasharray: "4 4",
      label: `Achieved · ${formatSplDisplay(achieved)}`,
      labelPosition: "right",
      ifOverflow: "extendDomain",
    });
  }

  // The same engineering quantity P14 measures: the operating response curve
  // (post-EQ RSP at operating level) and the house target it is integrated
  // against. Showing these on the graph makes the C-weighted capability
  // comparison visible — not just a number on a badge.
  const operatingResponse = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const houseTarget = finalBassResponse?.canonicalTargetCurve || finalBassResponse?.canonicalHouseCurveShape || [];
  const additionalSeries = [];
  if (Array.isArray(operatingResponse) && operatingResponse.length > 0) {
    additionalSeries.push({
      id: "focus-operating-response",
      kind: "focus-operating-response",
      label: "Operating Response",
      tooltipLabel: "Operating Response — the post-EQ RSP curve P14 integrates to measure C-weighted capability",
      color: "#059669",
      strokeWidth: 2.5,
      data: applyBassSmoothing(operatingResponse, smoothingMode || "third"),
    });
  }
  if (Array.isArray(houseTarget) && houseTarget.length > 0) {
    additionalSeries.push({
      id: "focus-house-target",
      kind: "focus-house-target",
      label: "House Target",
      tooltipLabel: "House Target — the normalised target curve the operating response is integrated against",
      color: "#213428",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(houseTarget, smoothingMode || "third"),
    });
  }

  const lines = [];
  if (targetDb != null) lines.push(`Target: ${formatSplDisplay(targetDb)} dBC (${p14PresentationData?.basis || "minimum"} L${p14PresentationData?.levelNum || "?"})`);
  if (achieved != null) lines.push(`Achieved capability: ${formatSplDisplay(achieved)} dBC`);
  if (headroom != null) lines.push(`Headroom: ${headroom >= 0 ? "+" : ""}${headroom.toFixed(1)} dB${headroom < 0 ? " (shortfall)" : ""}`);
  lines.push(`Assessment band: ${P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz}–${P14_EQ_ASSESSMENT_RANGE_HZ.upperHz} Hz (C-weighted integration)`);
  lines.push("Operating Response = the post-EQ RSP curve (green solid)");
  lines.push("House Target = the normalised target curve (dark dashed)");

  return {
    metric: "p14",
    referenceAreas: [{
      x1: P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz,
      x2: P14_EQ_ASSESSMENT_RANGE_HZ.upperHz,
      fill: "#213428",
      fillOpacity: 0.07,
      stroke: "#213428",
      strokeOpacity: 0.3,
      strokeDasharray: "3 3",
      ifOverflow: "extendDomain",
    }],
    referenceLines,
    additionalSeries,
    dimKinds: [],
    explanation: {
      title: "P14 — Bass SPL Capability",
      subtitle: "Integrated C-weighted level the subwoofer system can sustain across the assessment band",
      lines,
    },
  };
}

// ── P18: extension region, F3 line, house target + operating response ──
// P18 measures the lowest frequency the system sustains within -3 dB of the
// reference band (60–200 Hz median). The graph must display the same
// engineering quantity: the Operating Response vs the House Target, so the
// designer can see exactly where the response drops below the -3 dB threshold.
function buildP18Focus({ rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  const f3 = finite(rp22GraphMarkers?.p18FrequencyHz) ? Number(rp22GraphMarkers.p18FrequencyHz) : null;
  const bounded = rp22GraphMarkers?.p18Bounded === true;
  const refBandLabel = "60–200 Hz median";

  // The same engineering quantity P18 measures: the operating response curve
  // vs the house target. The F3 line marks where the operating response drops
  // below -3 dB relative to the reference band — showing these curves makes
  // the extension measurement visually obvious.
  const operatingResponse = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const houseTarget = finalBassResponse?.canonicalTargetCurve || finalBassResponse?.canonicalHouseCurveShape || [];
  const additionalSeries = [];
  if (Array.isArray(operatingResponse) && operatingResponse.length > 0) {
    additionalSeries.push({
      id: "focus-operating-response",
      kind: "focus-operating-response",
      label: "Operating Response",
      tooltipLabel: "Operating Response — the post-EQ RSP curve whose -3 dB point defines the extension",
      color: "#059669",
      strokeWidth: 2.5,
      data: applyBassSmoothing(operatingResponse, smoothingMode || "third"),
    });
  }
  if (Array.isArray(houseTarget) && houseTarget.length > 0) {
    additionalSeries.push({
      id: "focus-house-target",
      kind: "focus-house-target",
      label: "House Target",
      tooltipLabel: "House Target — the reference band (60–200 Hz median) the extension is measured against",
      color: "#213428",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(houseTarget, smoothingMode || "third"),
    });
  }

  const lines = [];
  if (f3 != null) {
    lines.push(`Achieved extension: ${bounded ? "≤" : ""}${Math.floor(f3)} Hz${bounded ? " (bounded by product validity floor)" : ""}`);
    lines.push(`Reference: ${refBandLabel}, -3 dB cutoff`);
    lines.push(`Frequencies below ${Math.floor(f3)} Hz fall outside the assessed extension`);
  } else {
    lines.push("P18 extension not achieved at the selected operating point");
  }
  lines.push("Operating Response = the post-EQ RSP curve (green solid)");
  lines.push("House Target = the reference band (dark dashed)");

  return {
    metric: "p18",
    referenceAreas: f3 != null ? [{
      x1: 20,
      x2: f3,
      fill: "#2563EB",
      fillOpacity: 0.06,
      stroke: "#2563EB",
      strokeOpacity: 0.25,
      strokeDasharray: "3 4",
      ifOverflow: "extendDomain",
      label: {
        value: `P18 extension · ≤${Math.floor(f3)} Hz`,
        position: "insideTop",
        fill: "#2563EB",
        fontSize: 10,
        fontWeight: 600,
      },
    }] : [],
    referenceLines: f3 != null ? [{
      x: f3,
      stroke: "#2563EB",
      strokeWidth: 2.5,
      strokeDasharray: "5 4",
      label: `F3 · ${Math.floor(f3)} Hz`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    dimKinds: [],
    explanation: {
      title: "P18 — Low-Frequency Extension",
      subtitle: "Lowest frequency the system sustains within -3 dB of the reference band",
      lines,
    },
  };
}

// ── P19: selected seat vs RSP Reference EQ, deviation, limiting frequency ──
// P19 measures the maximum deviation between a seat's calibrated response and
// the RSP Reference EQ (the post-EQ RSP curve). The graph must display the
// same engineering quantity: the Selected Seat curve vs the RSP Reference EQ,
// with the deviation between them and the limiting frequency highlighted.
// The House Target is deliberately NOT shown — P19 does not measure against
// the house curve, it measures against the Reference EQ.
function buildP19Focus({ rp22GraphMarkers, finalBassResponse, selectedSeatId, smoothingMode, seatingPositions }) {
  const startHz = finite(rp22GraphMarkers?.p19StartHz) ? Number(rp22GraphMarkers.p19StartHz) : null;
  const endHz = finite(rp22GraphMarkers?.p19EndHz) ? Number(rp22GraphMarkers.p19EndHz) : null;
  const worstFreq = finite(rp22GraphMarkers?.p19WorstFrequencyHz) ? Number(rp22GraphMarkers.p19WorstFrequencyHz) : null;

  const p19Data = finalBassResponse?.finalSeatVariationData?.p19;
  const perSeat = Array.isArray(p19Data?.perSeatResults) ? p19Data.perSeatResults : [];
  const seatId = selectedSeatId && selectedSeatId !== "rsp" ? selectedSeatId : null;
  const seatResult = seatId ? perSeat.find((s) => String(s?.seatId) === String(seatId)) : null;
  const variation = finite(seatResult?.variationDbRaw) ? Number(seatResult.variationDbRaw) : (finite(p19Data?.variationDb) ? Number(p19Data.variationDb) : null);
  const level = seatResult?.level || p19Data?.level || null;

  // Reference EQ = the calibrated RSP post-EQ curve. This is the curve P19
  // actually compares against — NOT the house-curve target.
  const referenceEqCurve = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const additionalSeries = [];

  // Selected Seat curve — the other half of the deviation P19 measures.
  // When a real seat is selected, show its post-EQ curve so the designer can
  // see the deviation from the Reference EQ directly. When RSP is selected,
  // the seat curve IS the Reference EQ, so only one curve is shown.
  if (seatId) {
    const postEqPerSeat = finalBassResponse?.postEqPerSeatCurves || finalBassResponse?.canonicalPostEqSeatResponses || [];
    const seatCurve = postEqPerSeat.find((s) => String(s?.seatId) === String(seatId));
    if (seatCurve?.responseData && Array.isArray(seatCurve.responseData) && seatCurve.responseData.length > 0) {
      additionalSeries.push({
        id: "focus-selected-seat",
        kind: "focus-selected-seat",
        label: `Seat ${seatId}`,
        tooltipLabel: `Selected seat ${seatId} — the calibrated response P19 compares to the Reference EQ`,
        color: "#B45309",
        strokeWidth: 2.5,
        data: applyBassSmoothing(seatCurve.responseData, smoothingMode || "third"),
      });
    }
  }

  if (Array.isArray(referenceEqCurve) && referenceEqCurve.length > 0) {
    additionalSeries.push({
      id: "focus-reference-eq",
      kind: "reference-eq",
      label: "RSP (Reference EQ)",
      tooltipLabel: "Reference EQ — the calibrated RSP response P19 measures against",
      color: "#2563EB",
      strokeWidth: 2.5,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(referenceEqCurve, smoothingMode || "third"),
    });
  }

  const lines = [];
  if (seatId) {
    lines.push(`Selected Seat: ${seatId} (amber solid)`);
    lines.push(`RSP Reference EQ: the calibrated RSP response (blue dashed)`);
  } else {
    lines.push("Seat: RSP (Reference Seat Position)");
    lines.push("RSP Reference EQ: the calibrated RSP response (blue dashed)");
  }
  if (startHz != null && endHz != null) {
    lines.push(`Assessment band: ${Math.round(startHz)}–${Math.round(endHz)} Hz (1/3-octave smoothed)`);
  }
  if (worstFreq != null) {
    lines.push(`Limiting frequency: ${Math.round(worstFreq)} Hz — where the deviation is greatest`);
  }
  if (variation != null) {
    lines.push(`Max deviation: ±${variation.toFixed(1)} dB`);
  }
  if (level) {
    lines.push(`Grade: ${level}`);
  }
  lines.push("P19 = max |Selected Seat − RSP| across the assessment band");

  return {
    metric: "p19",
    referenceAreas: (startHz != null && endHz != null) ? [{
      x1: startHz,
      x2: endHz,
      fill: "#B45309",
      fillOpacity: 0.06,
      stroke: "#B45309",
      strokeOpacity: 0.3,
      strokeDasharray: "3 4",
      ifOverflow: "extendDomain",
      label: {
        value: "P19 assessment band",
        position: "insideTop",
        fill: "#B45309",
        fontSize: 10,
        fontWeight: 600,
      },
    }] : [],
    referenceLines: worstFreq != null ? [{
      x: worstFreq,
      stroke: "#B45309",
      strokeWidth: 2.5,
      strokeDasharray: "4 3",
      label: `P19 worst · ${Math.round(worstFreq)} Hz`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    // Dim the house-curve and raw room response — P19 does not measure against
    // these, so showing them prominently would tell a different engineering story.
    dimKinds: ["room-response", "product-maximum", "maximum-spl", "house-curve", "normalized-target"],
    explanation: {
      title: "P19 — Response Fit vs Reference EQ",
      subtitle: "Maximum deviation between the selected seat's calibrated response and the RSP Reference EQ",
      lines,
    },
  };
}

// ── P20: best/worst seat overlay, variation frequency ──
function buildP20Focus({ rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  const p20Data = finalBassResponse?.finalSeatVariationData?.p20;
  const perSeat = Array.isArray(p20Data?.perSeatResults) ? p20Data.perSeatResults : [];
  const worstFreq = finite(rp22GraphMarkers?.p20WorstFrequencyHz) ? Number(rp22GraphMarkers.p20WorstFrequencyHz) : null;
  const worstSeatId = rp22GraphMarkers?.p20WorstSeatId || p20Data?.worstSeatId || null;

  // Find best and worst seats by variationDbRaw
  let worstSeat = null;
  let bestSeat = null;
  for (const seat of perSeat) {
    if (!finite(seat?.variationDbRaw)) continue;
    if (!worstSeat || Number(seat.variationDbRaw) > Number(worstSeat.variationDbRaw)) worstSeat = seat;
    if (!bestSeat || Number(seat.variationDbRaw) < Number(bestSeat.variationDbRaw)) bestSeat = seat;
  }

  // Add worst and best seat curves as additional series
  const postEqPerSeat = finalBassResponse?.postEqPerSeatCurves || finalBassResponse?.canonicalPostEqSeatResponses || [];
  const seatCurveById = new Map(postEqPerSeat.map((s) => [String(s?.seatId), s]));
  const additionalSeries = [];

  if (worstSeat && seatCurveById.has(String(worstSeat.seatId))) {
    const curve = seatCurveById.get(String(worstSeat.seatId));
    additionalSeries.push({
      id: "focus-worst-seat",
      kind: "focus-worst-seat",
      label: `Worst: ${worstSeat.seatId} (±${Number(worstSeat.variationDbRaw).toFixed(1)} dB)`,
      tooltipLabel: `Worst seat — ${worstSeat.seatId} · ±${Number(worstSeat.variationDbRaw).toFixed(1)} dB`,
      color: "#dc2626",
      strokeWidth: 2.5,
      data: applyBassSmoothing(curve.responseData, smoothingMode || "third"),
    });
  }
  if (bestSeat && bestSeat.seatId !== worstSeat?.seatId && seatCurveById.has(String(bestSeat.seatId))) {
    const curve = seatCurveById.get(String(bestSeat.seatId));
    additionalSeries.push({
      id: "focus-best-seat",
      kind: "focus-best-seat",
      label: `Best: ${bestSeat.seatId} (±${Number(bestSeat.variationDbRaw).toFixed(1)} dB)`,
      tooltipLabel: `Best seat — ${bestSeat.seatId} · ±${Number(bestSeat.variationDbRaw).toFixed(1)} dB`,
      color: "#059669",
      strokeWidth: 2.5,
      data: applyBassSmoothing(curve.responseData, smoothingMode || "third"),
    });
  }

  const lines = [];
  if (worstSeat) {
    lines.push(`Worst seat: ${worstSeat.seatId} (±${Number(worstSeat.variationDbRaw).toFixed(1)} dB)`);
  }
  if (bestSeat && bestSeat.seatId !== worstSeat?.seatId) {
    lines.push(`Best seat: ${bestSeat.seatId} (±${Number(bestSeat.variationDbRaw).toFixed(1)} dB)`);
  }
  if (worstFreq != null) {
    lines.push(`Limiting frequency: ${Math.round(worstFreq)} Hz`);
  }
  if (worstSeat?.level) {
    lines.push(`Grade: ${worstSeat.level}`);
  }
  lines.push("Variation = max |seat − RSP| across the assessment band");

  return {
    metric: "p20",
    referenceAreas: [],
    referenceLines: worstFreq != null ? [{
      x: worstFreq,
      stroke: "#7C3AED",
      strokeWidth: 2.5,
      strokeDasharray: "4 3",
      label: `P20 worst · ${Math.round(worstFreq)} Hz`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    dimKinds: ["room-response", "product-maximum", "maximum-spl", "house-curve"],
    explanation: {
      title: "P20 — Seat-to-Seat Consistency",
      subtitle: "Maximum deviation between any seat and the RSP across the assessment band",
      lines,
    },
  };
}

// ── Seat focus (no metric selected): explain this seat's results ──
function buildSeatFocus({ selectedSeatId, rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  if (!selectedSeatId || selectedSeatId === "rsp") return null;

  const p19Data = finalBassResponse?.finalSeatVariationData?.p19;
  const p20Data = finalBassResponse?.finalSeatVariationData?.p20;
  const p19PerSeat = Array.isArray(p19Data?.perSeatResults) ? p19Data.perSeatResults : [];
  const p20PerSeat = Array.isArray(p20Data?.perSeatResults) ? p20Data.perSeatResults : [];

  const seatP19 = p19PerSeat.find((s) => String(s?.seatId) === String(selectedSeatId));
  const seatP20 = p20PerSeat.find((s) => String(s?.seatId) === String(selectedSeatId));

  // Add Reference EQ for comparison
  const referenceEqCurve = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const additionalSeries = [];
  if (Array.isArray(referenceEqCurve) && referenceEqCurve.length > 0) {
    additionalSeries.push({
      id: "focus-reference-eq",
      kind: "reference-eq",
      label: "Reference EQ (RSP after EQ)",
      tooltipLabel: "Reference EQ — the calibrated RSP response",
      color: "#2563EB",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(referenceEqCurve, smoothingMode || "third"),
    });
  }

  const lines = [];
  lines.push(`Seat: ${selectedSeatId}`);
  if (seatP19) {
    lines.push(`P19: ±${Number(seatP19.variationDbRaw).toFixed(1)} dB at ${Math.round(Number(seatP19.worstFrequencyHz))} Hz (${seatP19.level})`);
  }
  if (seatP20) {
    lines.push(`P20: ±${Number(seatP20.variationDbRaw).toFixed(1)} dB at ${Math.round(Number(seatP20.worstFrequencyHz))} Hz (${seatP20.level})`);
  }

  // Determine which parameter limits this seat
  const p19Var = seatP19 ? Number(seatP19.variationDbRaw) : null;
  const p20Var = seatP20 ? Number(seatP20.variationDbRaw) : null;
  if (p19Var != null && p20Var != null) {
    if (p19Var >= p20Var) {
      lines.push(`Limiting parameter: P19 (response fit vs Reference EQ)`);
    } else {
      lines.push(`Limiting parameter: P20 (seat-to-seat consistency)`);
    }
  }

  const worstFreq = seatP19?.worstFrequencyHz || seatP20?.worstFrequencyHz || null;

  return {
    metric: null,
    seatId: selectedSeatId,
    referenceAreas: [],
    referenceLines: finite(worstFreq) ? [{
      x: Number(worstFreq),
      stroke: "#213428",
      strokeWidth: 2,
      strokeDasharray: "4 3",
      label: `${selectedSeatId} limiting · ${Math.round(Number(worstFreq))} Hz`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    dimKinds: ["room-response", "product-maximum", "maximum-spl"],
    explanation: {
      title: `Seat ${selectedSeatId} — Engineering Explanation`,
      subtitle: "Why this seat received its published grade",
      lines,
    },
  };
}

/**
 * Build the parameter-focus overlay config for the graph.
 *
 * @param {object} params
 * @param {string|null} params.selectedMetric - 'p14' | 'p18' | 'p19' | 'p20' | null
 * @param {string|null} params.selectedSeatId - 'rsp' | '<seatId>' | null
 * @param {object} params.optimisationResult
 * @param {object} params.finalBassResponse
 * @param {object} params.p14PresentationData
 * @param {object} params.rp22GraphMarkers
 * @param {string} params.smoothingMode
 * @returns {object|null} focus config or null
 */
export function buildParameterFocus({
  selectedMetric,
  selectedSeatId,
  optimisationResult,
  finalBassResponse,
  p14PresentationData,
  rp22GraphMarkers,
  smoothingMode,
}) {
  const ctx = {
    selectedMetric,
    selectedSeatId,
    optimisationResult,
    finalBassResponse,
    p14PresentationData,
    rp22GraphMarkers,
    smoothingMode,
  };

  if (selectedMetric === "p14") return buildP14Focus(ctx);
  if (selectedMetric === "p18") return buildP18Focus(ctx);
  if (selectedMetric === "p19") return buildP19Focus(ctx);
  if (selectedMetric === "p20") return buildP20Focus(ctx);

  // No metric selected — if a seat is selected, show seat-focused explanation
  if (selectedSeatId && selectedSeatId !== "rsp") {
    return buildSeatFocus(ctx);
  }

  return null;
}