/**
 * BassExtensionScale
 * ------------------
 * The P18 low-frequency extension scale for the Visual Report.
 *
 * The screen preview and the printed PDF render this same component, so the
 * marker always sits in the same place against the same scale in both.
 *
 * The achieved extension is a deliberate, larger dot in the Sound Proof green,
 * labelled beside the scale so the number can be read on a printed page. The
 * label sits above the track, follows the marker, and clamps inward at the ends
 * of the scale so it can never run off the page or over the scale.
 *
 * Presentation only — the achieved frequency and the grading boundaries are
 * still read from the canonical bass authority exactly as before.
 */

import React from "react";
import { P18_THRESHOLDS_BY_BASIS } from "@/components/utils/p18ExtensionAuthority";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';

/** The Sound Proof green used for the achieved-extension marker. */
export const SOUND_PROOF_GREEN = "#4A7560";

const SCALE_MIN = 15;
const SCALE_MAX = 35;
const TICK_MARKS = [15, 20, 25, 30, 35];

// The printed page is smaller than the screen preview, so the marker stays
// generous on the PDF but never crowds the scale it sits on.
const VARIANT_GEOMETRY = {
  screen: {
    maxWidth: 500,
    padding: "0 12px",
    marginTop: 20,
    labelRowHeight: 26,
    labelFontSize: 13,
    gap: 10,
    dotSize: 20,
    dotBorder: 3,
    trackHeight: 3,
    boundaryHeight: 12,
    tickRowHeight: 18,
    tickFontSize: 10,
  },
  print: {
    maxWidth: 430,
    padding: "0 10px",
    marginTop: 18,
    labelRowHeight: 22,
    labelFontSize: 11,
    gap: 8,
    dotSize: 16,
    dotBorder: 2.5,
    trackHeight: 2,
    boundaryHeight: 10,
    tickRowHeight: 14,
    tickFontSize: 8,
  },
};

/** Keeps the label beside the marker without pushing it off either end. */
function markerLabelTransform(pct) {
  if (pct <= 12) return "translateX(0)";
  if (pct >= 88) return "translateX(-100%)";
  return "translateX(-50%)";
}

export default function BassExtensionScale({ achievedHz, targetBasis, variant = "screen" }) {
  const geometry = VARIANT_GEOMETRY[variant] || VARIANT_GEOMETRY.screen;
  const basis = targetBasis === "recommended" ? "recommended" : "minimum";
  const thresholds = P18_THRESHOLDS_BY_BASIS[basis];

  const hz = Number(achievedHz);
  const hasHz = Number.isFinite(hz) && hz > 0;

  const pctFor = (frequencyHz) => ((frequencyHz - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  // Position the achieved marker (clamped to the scale range)
  const achievedPct = hasHz
    ? Math.max(0, Math.min(100, pctFor(Math.min(hz, SCALE_MAX))))
    : null;
  const markerLabel = hasHz ? `${Math.floor(hz)} Hz` : null;

  // Boundary positions for the selected basis
  const boundaryMarks = Object.entries(thresholds).map(([level, thresholdHz]) => ({
    level,
    pct: pctFor(thresholdHz),
  }));

  return (
    <div style={{
      width: "100%",
      maxWidth: geometry.maxWidth,
      marginTop: geometry.marginTop,
      padding: geometry.padding,
      boxSizing: "border-box",
    }}>
      {/* Marker label — sits above the scale, never over it */}
      <div style={{ position: "relative", height: geometry.labelRowHeight }}>
        {markerLabel && (
          <div style={{
            position: "absolute",
            left: `${achievedPct}%`,
            bottom: 0,
            transform: markerLabelTransform(achievedPct),
            fontFamily: HEADING_FONT,
            fontWeight: 600,
            fontSize: geometry.labelFontSize,
            color: "#213428",
            whiteSpace: "nowrap",
          }}>
            {markerLabel}
          </div>
        )}
      </div>

      {/* Track, grading boundaries and the achieved marker */}
      <div style={{ position: "relative", height: geometry.dotSize + geometry.gap }}>
        <div style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: geometry.trackHeight,
          background: "#DCDBD6",
          borderRadius: 2,
          transform: "translateY(-50%)",
        }} />
        {boundaryMarks.map((mark) => (
          <div key={mark.level} style={{
            position: "absolute",
            top: "50%",
            left: `${mark.pct}%`,
            width: 1,
            height: geometry.boundaryHeight,
            background: "#B3A89B",
            transform: "translate(-0.5px, -50%)",
          }} />
        ))}
        {achievedPct != null && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: `${achievedPct}%`,
            width: geometry.dotSize,
            height: geometry.dotSize,
            boxSizing: "border-box",
            borderRadius: "50%",
            background: SOUND_PROOF_GREEN,
            border: `${geometry.dotBorder}px solid #FFFFFF`,
            boxShadow: "0 0 0 1px rgba(74,117,96,0.35), 0 1px 4px rgba(33,52,40,0.28)",
            transform: "translate(-50%, -50%)",
            zIndex: 2,
          }} />
        )}
      </div>

      {/* Tick labels */}
      <div style={{ position: "relative", height: geometry.tickRowHeight, marginTop: 2 }}>
        {TICK_MARKS.map((tick) => (
          <div key={tick} style={{
            position: "absolute",
            left: `${pctFor(tick)}%`,
            transform: tick === SCALE_MIN ? "translateX(0)" : tick === SCALE_MAX ? "translateX(-100%)" : "translateX(-50%)",
            fontSize: geometry.tickFontSize,
            color: "#8A8580",
            fontFamily: BODY_FONT,
            whiteSpace: "nowrap",
          }}>
            {tick}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 2,
        textAlign: "right",
        fontSize: geometry.tickFontSize,
        color: "#8A8580",
        fontFamily: BODY_FONT,
      }}>
        Frequency (Hz)
      </div>
    </div>
  );
}