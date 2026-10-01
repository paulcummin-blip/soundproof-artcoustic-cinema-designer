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
import { formatP18FloorBoundedStatement } from "@/components/room/bass/p18SelectedTargetExplanation";
import { formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { P14_EQ_ASSESSMENT_RANGE_HZ } from "@/components/utils/p14CapabilityAuthority";
import { formatSeatPillLabel } from "@/components/utils/seatLabel";
import { resolveP20SeatDisplay } from "@/components/room/bass/p20DisplayAuthority";
import { formatP19P20DeviationText } from "@/components/utils/rp22/resolveRp22DesignValue";

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
  const houseTarget = finalBassResponse?.canonicalTargetCurve || finalBassResponse?.canonicalHouseCurveShape || finalBassResponse?.productionHouseCurveTarget || [];
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
  const houseTarget = finalBassResponse?.canonicalTargetCurve || finalBassResponse?.canonicalHouseCurveShape || finalBassResponse?.productionHouseCurveTarget || [];
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
    // The result is the calculated -3 dB point. Never a comparator: floor-bounded
    // results carry their meaning on the separate detail line below.
    lines.push(`Achieved extension: ${Math.floor(f3)} Hz`);
    lines.push(`Reference: ${refBandLabel}, -3 dB cutoff`);
    lines.push(`Frequencies below ${Math.floor(f3)} Hz fall outside the assessed extension`);
    if (bounded) {
      // The marker already carries the published whole-Hz point — the caveat
      // states that same figure, never a second rounded one.
      const statement = formatP18FloorBoundedStatement(Math.floor(f3));
      if (statement) lines.push(statement);
    }
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
        value: `P18 extension · ${Math.floor(f3)} Hz`,
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

// ── P19: the corrected RSP vs the house target ──
// P19 is RSP-only. The published result is the corrected RSP response measured
// against the house target below transition, 1/3-octave smoothed. There is one
// RSP-derived EQ, applied to every seat — there is no per-seat EQ and no
// per-seat P19. The graph therefore always shows the RSP after EQ curve against
// the house target, and the marker always sits on the authoritative RSP limiting
// frequency, whichever seat happens to be selected.
function buildP19Focus({ rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  const startHz = finite(rp22GraphMarkers?.p19StartHz) ? Number(rp22GraphMarkers.p19StartHz) : null;
  const endHz = finite(rp22GraphMarkers?.p19EndHz) ? Number(rp22GraphMarkers.p19EndHz) : null;
  const limitingHz = finite(rp22GraphMarkers?.p19WorstFrequencyHz) ? Number(rp22GraphMarkers.p19WorstFrequencyHz) : null;

  // The two curves P19 is measured between: the corrected RSP response and the
  // house target. The house target is part of the P19 story and is never hidden.
  const rspAfterEq = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const houseTarget = finalBassResponse?.canonicalTargetCurve || finalBassResponse?.canonicalHouseCurveShape || finalBassResponse?.productionHouseCurveTarget || [];
  const additionalSeries = [];

  if (Array.isArray(rspAfterEq) && rspAfterEq.length > 0) {
    additionalSeries.push({
      id: "focus-rsp-after-eq",
      kind: "focus-rsp-after-eq",
      label: "RSP after EQ",
      tooltipLabel: "RSP after EQ — the corrected RSP response P19 measures against the house target",
      color: "#2563EB",
      strokeWidth: 2.5,
      data: applyBassSmoothing(rspAfterEq, smoothingMode || "third"),
    });
  }
  if (Array.isArray(houseTarget) && houseTarget.length > 0) {
    additionalSeries.push({
      id: "focus-house-target",
      kind: "focus-house-target",
      label: "House Target",
      tooltipLabel: "House Target — the target curve the corrected RSP response is measured against",
      color: "#213428",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(houseTarget, smoothingMode || "third"),
    });
  }

  // The published P19 result. Never a per-seat value — the RSP is the measured
  // position for P19.
  const p19Data = finalBassResponse?.finalSeatVariationData?.p19;
  const variation = finite(p19Data?.variationDb) ? Number(p19Data.variationDb) : null;
  const level = p19Data?.level || null;

  const lines = [];
  lines.push("P19 = max |post-EQ RSP − house target|");
  if (startHz != null && endHz != null) {
    lines.push(`Assessment band: ${Math.round(startHz)}–${Math.round(endHz)} Hz`);
  }
  if (limitingHz != null) {
    lines.push(`Limiting frequency: ${Math.round(limitingHz)} Hz — where the deviation is greatest`);
  }
  if (variation != null) {
    // P19 deviation: whole number only in design-facing UI.
    lines.push(`Max deviation: ${formatP19P20DeviationText(variation)}`);
  }
  if (level) {
    lines.push(`Grade: ${level}`);
  }
  lines.push("RSP after EQ = the corrected RSP response (blue solid)");
  lines.push("House Target = the target curve (dark dashed)");
  lines.push("Measured at the RSP only — P19 is not a per-seat result");
  lines.push("Official result uses 1/3-octave smoothing");

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
    // The authoritative RSP limiting frequency. Never resolved from the selected
    // seat — P19 has no per-seat result to resolve.
    referenceLines: limitingHz != null ? [{
      x: limitingHz,
      stroke: "#B45309",
      strokeWidth: 2.5,
      strokeDasharray: "4 3",
      limitingFrequencyHz: Math.round(limitingHz),
      label: `P19 limiting · ${Math.round(limitingHz)} Hz (RSP)`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    // Only the raw room response and the product limits are dimmed: P19 does not
    // measure against those. The house target stays visible — it is the reference
    // the corrected RSP is compared with.
    dimKinds: ["room-response", "product-maximum", "maximum-spl"],
    explanation: {
      title: "P19 — The Result",
      subtitle: "RSP after EQ vs house target",
      limitingFrequencyHz: limitingHz != null ? Math.round(limitingHz) : null,
      lines,
    },
  };
}

// ── P20: every seat after the same RSP-derived EQ ──
// P20 measures each seat's corrected response against the post-EQ RSP below
// transition, 1/3-octave smoothed. One RSP-derived EQ is applied to every seat —
// there is no per-seat EQ. The official result is the project-worst seat, and it
// stays on the graph when a seat is selected; the selected seat is added as
// secondary detail only, never in place of the official result.
function buildP20Focus({ rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  const p20Data = finalBassResponse?.finalSeatVariationData?.p20;
  const perSeat = Array.isArray(p20Data?.perSeatResults) ? p20Data.perSeatResults : [];
  const startHz = finite(rp22GraphMarkers?.p19StartHz) ? Number(rp22GraphMarkers.p19StartHz) : null;
  const endHz = finite(rp22GraphMarkers?.p19EndHz) ? Number(rp22GraphMarkers.p19EndHz) : null;

  // Find best and worst seats by variationDbRaw
  let worstSeat = null;
  let bestSeat = null;
  for (const seat of perSeat) {
    if (!finite(seat?.variationDbRaw)) continue;
    if (!worstSeat || Number(seat.variationDbRaw) > Number(worstSeat.variationDbRaw)) worstSeat = seat;
    if (!bestSeat || Number(seat.variationDbRaw) < Number(bestSeat.variationDbRaw)) bestSeat = seat;
  }

  // Canonical display objects. The overlay states the same floored value as the
  // pill, the tooltip and the graph marker — it never rounds a P20 deviation
  // itself, and it never invents a second P20 number. The official result is read
  // from the marker authority so the overlay cannot name a different seat.
  const worstDisplay = rp22GraphMarkers?.p20WorstDisplay || resolveP20SeatDisplay(worstSeat, { isAllSeatWorst: true });
  const bestDisplay = resolveP20SeatDisplay(bestSeat);
  // Secondary detail only: the selected seat's own point, also from the marker
  // authority. It never replaces the official project-worst result.
  const selectedDisplay = rp22GraphMarkers?.p20SelectedSeatDisplay || null;

  const postEqPerSeat = finalBassResponse?.postEqPerSeatCurves || finalBassResponse?.canonicalPostEqSeatResponses || [];
  const seatCurveById = new Map(postEqPerSeat.map((s) => [String(s?.seatId), s]));
  const rspAfterEq = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const additionalSeries = [];

  // The post-EQ RSP is the reference every seat is compared with, so it belongs
  // on the graph: P20 is a comparison against it, not against the house target.
  if (Array.isArray(rspAfterEq) && rspAfterEq.length > 0) {
    additionalSeries.push({
      id: "focus-rsp-reference",
      kind: "focus-rsp-reference",
      label: "RSP after EQ (reference)",
      tooltipLabel: "RSP after EQ — the reference every seat is compared with. The same RSP-derived EQ is applied to every seat.",
      color: "#2563EB",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(rspAfterEq, smoothingMode || "third"),
    });
  }

  if (worstSeat && seatCurveById.has(String(worstSeat.seatId))) {
    const curve = seatCurveById.get(String(worstSeat.seatId));
    additionalSeries.push({
      id: "focus-worst-seat",
      kind: "focus-worst-seat",
      label: `Worst: ${formatSeatPillLabel(worstSeat.seatId)} (${worstDisplay?.displayVariationText ?? "—"})`,
      tooltipLabel: `Worst seat — ${formatSeatPillLabel(worstSeat.seatId)} · ${worstDisplay?.displayVariationText ?? "—"}`,
      color: "#dc2626",
      strokeWidth: 2.5,
      data: applyBassSmoothing(curve.responseData, smoothingMode || "third"),
    });
  }
  if (selectedDisplay && seatCurveById.has(String(selectedDisplay.seatId))) {
    const curve = seatCurveById.get(String(selectedDisplay.seatId));
    additionalSeries.push({
      id: "focus-selected-seat",
      kind: "focus-selected-seat",
      label: `Selected: ${selectedDisplay.seatPillLabel} (${selectedDisplay.displayVariationText})`,
      tooltipLabel: `Selected seat — ${selectedDisplay.seatPillLabel} · ${selectedDisplay.displayVariationText}. Secondary detail: the official P20 result is the overall worst seat.`,
      color: "#B45309",
      strokeWidth: 2,
      strokeDasharray: "6 4",
      data: applyBassSmoothing(curve.responseData, smoothingMode || "third"),
    });
  }
  if (bestSeat && bestSeat.seatId !== worstSeat?.seatId && seatCurveById.has(String(bestSeat.seatId))) {
    const curve = seatCurveById.get(String(bestSeat.seatId));
    additionalSeries.push({
      id: "focus-best-seat",
      kind: "focus-best-seat",
      label: `Best: ${formatSeatPillLabel(bestSeat.seatId)} (${bestDisplay?.displayVariationText ?? "—"})`,
      tooltipLabel: `Best seat — ${formatSeatPillLabel(bestSeat.seatId)} · ${bestDisplay?.displayVariationText ?? "—"}`,
      color: "#059669",
      strokeWidth: 2.5,
      data: applyBassSmoothing(curve.responseData, smoothingMode || "third"),
    });
  }

  const lines = [];
  if (worstDisplay) {
    lines.push(`Overall worst: ${worstDisplay.seatPillLabel} at ${worstDisplay.displayFrequencyText} · ${worstDisplay.displayVariationText}`);
  }
  if (selectedDisplay) {
    lines.push(`Selected seat: ${selectedDisplay.seatPillLabel} at ${selectedDisplay.displayFrequencyText} · ${selectedDisplay.displayVariationText} — secondary detail, the official result is the overall worst seat`);
  }
  if (bestDisplay && bestDisplay.seatId !== worstDisplay?.seatId) {
    lines.push(`Best seat: ${bestDisplay.seatPillLabel} ${bestDisplay.displayVariationText}`);
  }
  if (worstDisplay?.grade && worstDisplay.grade !== "—") {
    lines.push(`Grade: ${worstDisplay.grade}`);
  }
  lines.push("P20 = max |post-EQ seat − post-EQ RSP|");
  if (startHz != null && endHz != null) {
    lines.push(`Assessment band: ${Math.round(startHz)}–${Math.round(endHz)} Hz`);
  }
  lines.push("Every seat receives the same RSP-derived EQ — there is no per-seat EQ");
  lines.push("RSP after EQ = the reference every seat is compared with (blue dashed)");
  lines.push("Official result uses 1/3-octave smoothing");

  const referenceLines = [];
  if (worstDisplay?.limitingFrequencyHz != null) {
    referenceLines.push({
      x: worstDisplay.limitingFrequencyHz,
      stroke: "#7C3AED",
      strokeWidth: 2.5,
      strokeDasharray: "4 3",
      seatPillLabel: worstDisplay.seatPillLabel,
      limitingFrequencyHz: worstDisplay.displayFrequencyHz,
      label: `P20 official worst · ${worstDisplay.seatPillLabel} · ${worstDisplay.displayFrequencyText} · ${worstDisplay.displayVariationText}`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    });
  }
  // The selected seat's own frequency, drawn beside the official result as
  // secondary detail. It is only ever added, never substituted.
  if (selectedDisplay?.limitingFrequencyHz != null
    && selectedDisplay.limitingFrequencyHz !== worstDisplay?.limitingFrequencyHz) {
    referenceLines.push({
      x: selectedDisplay.limitingFrequencyHz,
      stroke: "#B45309",
      strokeWidth: 1.5,
      strokeDasharray: "2 4",
      seatPillLabel: selectedDisplay.seatPillLabel,
      limitingFrequencyHz: selectedDisplay.displayFrequencyHz,
      label: `Selected seat · ${selectedDisplay.seatPillLabel} · ${selectedDisplay.displayFrequencyText}`,
      labelPosition: "insideTopRight",
      ifOverflow: "extendDomain",
    });
  }

  return {
    metric: "p20",
    referenceAreas: [],
    referenceLines,
    additionalSeries,
    // Dim the house-curve and raw room response — P20 measures seat-to-seat
    // consistency against the post-EQ RSP, not against the house target.
    dimKinds: ["room-response", "product-maximum", "maximum-spl", "house-curve", "normalized-target"],
    explanation: {
      title: "P20 — The Consistency",
      subtitle: "Each seat after the same RSP-derived EQ, compared with the post-EQ RSP",
      seatPillLabel: worstDisplay?.seatPillLabel || null,
      limitingFrequencyHz: worstDisplay?.displayFrequencyHz ?? null,
      lines,
    },
  };
}

// ── Seat focus (no metric selected): explain this seat's results ──
function buildSeatFocus({ selectedSeatId, rp22GraphMarkers, finalBassResponse, smoothingMode }) {
  if (!selectedSeatId || selectedSeatId === "rsp") return null;

  const p20Data = finalBassResponse?.finalSeatVariationData?.p20;
  const p20PerSeat = Array.isArray(p20Data?.perSeatResults) ? p20Data.perSeatResults : [];

  // P19 is RSP-only — there is no per-seat P19 to look up, so none is attempted.
  const seatP20 = p20PerSeat.find((s) => String(s?.seatId) === String(selectedSeatId));

  // The RSP after EQ is the reference this seat is compared with — the same
  // RSP-derived EQ is applied to every seat, so it is the shared reference curve.
  const referenceEqCurve = finalBassResponse?.postEqRspCurve || finalBassResponse?.canonicalPostEqRsp || [];
  const additionalSeries = [];
  if (Array.isArray(referenceEqCurve) && referenceEqCurve.length > 0) {
    additionalSeries.push({
      id: "focus-reference-eq",
      kind: "reference-eq",
      label: "RSP after EQ (reference)",
      tooltipLabel: "RSP after EQ — the shared reference every seat is compared with (one RSP-derived EQ, applied to every seat)",
      color: "#2563EB",
      strokeWidth: 2,
      strokeDasharray: "8 4",
      data: applyBassSmoothing(referenceEqCurve, smoothingMode || "third"),
    });
  }

  const seatDisplay = seatP20 ? resolveP20SeatDisplay(seatP20, { selectedSeatId }) : null;
  const worstDisplay = rp22GraphMarkers?.p20WorstDisplay || null;

  const lines = [];
  lines.push(`Seat: ${formatSeatPillLabel(selectedSeatId)}`);
  // P19 is RSP-only: this seat is never given a P19 of its own, and no per-seat
  // P19 lookup is attempted. What this seat carries is its P20 consistency
  // result, measured under the same RSP-derived EQ every seat receives.
  if (seatDisplay) {
    const at = seatDisplay.displayFrequencyText ? ` at ${seatDisplay.displayFrequencyText}` : "";
    lines.push(`P20 (seat consistency): ${seatDisplay.displayVariationText}${at} (${seatDisplay.grade})`);
  }
  if (worstDisplay && worstDisplay.seatId !== String(selectedSeatId)) {
    lines.push(`Project worst: ${worstDisplay.seatPillLabel} ${worstDisplay.displayVariationText} at ${worstDisplay.displayFrequencyText}`);
  }
  lines.push("Every seat receives the same RSP-derived EQ — there is no per-seat EQ");
  lines.push("Official result uses 1/3-octave smoothing");

  const worstFreq = seatDisplay?.limitingFrequencyHz ?? null;

  return {
    metric: null,
    seatId: selectedSeatId,
    referenceAreas: [],
    referenceLines: finite(worstFreq) ? [{
      x: Number(worstFreq),
      stroke: "#213428",
      strokeWidth: 2,
      strokeDasharray: "4 3",
      seatPillLabel: formatSeatPillLabel(selectedSeatId),
      limitingFrequencyHz: Math.round(Number(worstFreq)),
      label: `${formatSeatPillLabel(selectedSeatId)} limiting · ${Math.round(Number(worstFreq))} Hz`,
      labelPosition: "top",
      ifOverflow: "extendDomain",
    }] : [],
    additionalSeries,
    dimKinds: ["room-response", "product-maximum", "maximum-spl"],
    explanation: {
      title: `Seat ${formatSeatPillLabel(selectedSeatId)} — Engineering Explanation`,
      subtitle: "Why this seat received its published grade",
      seatPillLabel: formatSeatPillLabel(selectedSeatId),
      limitingFrequencyHz: finite(worstFreq) ? Math.round(Number(worstFreq)) : null,
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