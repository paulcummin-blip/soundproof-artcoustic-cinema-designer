// BassCalculationsPage.jsx
// ---------------------------------------------------------------------------
// One A4 portrait report page: four saved bass-calculation graphs in a 2 × 2
// layout.
//
//   01  Raw Bass Response        — roomResponseCurve
//   02  Selected Subwoofers      — sourceCapabilityCurves (product capability)
//   03  Selected Subwoofers In-Room — physicalRawResponseCurve
//   04  Final EQ Response        — postEqRspCurve (+ target)
//
// Every curve is read from the SAME saved completed bass contract via
// bassCalculationsAuthority. All four response curves use the SAME 1/3-octave
// power-domain display smoothing the P19 response graph uses — display only;
// the saved samples and full calculation precision are preserved, and the
// target curve is never smoothed. Nothing is recalculated or reconstructed
// from RP22 scores. When the saved contract is missing, stale or not
// authoritative, the page states that plainly and draws no graph.

import React, { useMemo } from "react";

import {
  REPORT_FONT_BODY,
  REPORT_FONT_HEADING,
  reportSectionHeadingStyle,
} from "@/components/report/typography/reportTypography";
import { buildBassCalculationsData } from "./bassCalculationsAuthority";
import BassCalculationPlot from "./BassCalculationPlot";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const PRIMARY_COLOR = "#7D6A5D";  // brown — raw, in-room, subwoofer capability
const FINAL_COLOR = "#2D7D68";    // green — final EQ
const TARGET_COLOR = "#9B9890";   // muted — target/house curve
const SUB_ALT_COLORS = ["#7D6A5D", "#8C7868", "#6B5A4D"];

const PANELS = [
  { key: "raw", label: "01 · Raw Bass Response", subtitle: "Untreated room response" },
  { key: "subs", label: "02 · Selected Subwoofers", subtitle: "Individual subwoofer product capability" },
  { key: "inRoom", label: "03 · Selected Subwoofers In-Room", subtitle: "Predicted pre-EQ response at the RSP" },
  { key: "final", label: "04 · Final EQ Response", subtitle: "Predicted post-EQ response at the RSP" },
];

/** Display smoothing — the same 1/3-octave power-domain method the P19
 *  response graph uses (applyBassSmoothing with mode "third"). Display only:
 *  the saved contract curves are untouched; the function returns the curve
 *  as-is when it has fewer than three samples, so sparse product capability
 *  curves are never distorted or extrapolated beyond their available data. */
const SMOOTHING_MODE = "third";
const smoothForDisplay = (curve) => applyBassSmoothing(curve, SMOOTHING_MODE);

/** Shared frequency axis across all four panels. Widens to 300 Hz only when a
 *  plotted curve genuinely runs past 200 Hz, matching the report's wide domain. */
const REPORT_X_DOMAIN = [15, 200];
const REPORT_X_DOMAIN_WIDE = [15, 300];

function computeSharedXDomain(graphs) {
  const allCurves = [graphs.raw, ...graphs.subs, graphs.inRoom, graphs.final, graphs.target];
  const beyond = allCurves.some((curve) => (curve || []).some((p) => p?.frequency > 200));
  return beyond ? REPORT_X_DOMAIN_WIDE : REPORT_X_DOMAIN;
}

/** Comparable SPL scale for the three room-response panels (raw, in-room and
 *  final EQ share the same SPL reference). Computed from the raw saved curves
 *  so the smoothed display data always fits. The subwoofer capability panel
 *  uses its own auto-detected scale — a different quantity. */
function computeRoomResponseYDomain(graphs) {
  const curves = [graphs.raw, graphs.inRoom, graphs.final, graphs.target];
  let min = Infinity;
  let max = -Infinity;
  for (const curve of curves) {
    for (const p of curve || []) {
      if (Number.isFinite(p?.spl)) {
        if (p.spl < min) min = p.spl;
        if (p.spl > max) max = p.spl;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lo = Math.floor((min - 5) / 10) * 10;
  const hi = Math.ceil((max + 5) / 10) * 10;
  return hi - lo < 20 ? [lo - 10, hi + 10] : [lo, hi];
}

const ROOM_RESPONSE_PANELS = new Set(["raw", "inRoom", "final"]);

function panelSeries(panelKey, graphs) {
  if (panelKey === "raw") {
    return [{ id: "raw", label: "Raw", color: PRIMARY_COLOR, width: 2, data: smoothForDisplay(graphs.raw) }];
  }
  if (panelKey === "subs") {
    return graphs.subs.map((data, i) => ({
      id: `sub-${i}`,
      label: `Sub ${i + 1}`,
      color: SUB_ALT_COLORS[i % SUB_ALT_COLORS.length],
      width: 1.8,
      data: smoothForDisplay(data),
    }));
  }
  if (panelKey === "inRoom") {
    return [{ id: "inRoom", label: "In-Room", color: PRIMARY_COLOR, width: 2, data: smoothForDisplay(graphs.inRoom) }];
  }
  // final — response is smoothed for display; the target is not.
  const series = [{ id: "final", label: "Final EQ", color: FINAL_COLOR, width: 2.2, data: smoothForDisplay(graphs.final) }];
  if (graphs.target.length > 0) {
    series.push({ id: "target", label: "Target", color: TARGET_COLOR, width: 1.6, dash: "6 4", data: graphs.target });
  }
  return series;
}

/**
 * @param {object} props
 * @param {object|null} props.contract - saved completed bass contract
 * @param {boolean} [props.authoritative]
 * @param {string|null} [props.currentFingerprint]
 */
export default function BassCalculationsPage({
  contract = null,
  authoritative = false,
  currentFingerprint = null,
}) {
  const data = useMemo(
    () => buildBassCalculationsData({ contract, authoritative, currentFingerprint }),
    [contract, authoritative, currentFingerprint],
  );
  const sharedXDomain = useMemo(
    () => (data.ready ? computeSharedXDomain(data.graphs) : REPORT_X_DOMAIN),
    [data],
  );
  const roomResponseYDomain = useMemo(
    () => (data.ready ? computeRoomResponseYDomain(data.graphs) : null),
    [data],
  );

  return (
    <section
      id="pdf-bass-calculations"
      className="report-page-block"
      data-report-block="bass-calculations"
      data-report-page-start="true"
      style={{
        background: "#FFFFFF",
        color: "#1B1A1A",
        fontFamily: REPORT_FONT_BODY,
        boxSizing: "border-box",
        breakBefore: "page",
        pageBreakBefore: "always",
        padding: "0",
      }}
    >
      <header
        data-report-section-heading="true"
        style={{ borderBottom: "1px solid #DCDBD6", paddingBottom: "3mm", marginBottom: "4mm" }}
      >
        <div style={reportSectionHeadingStyle("15pt", { color: "#1B1A1A" })}>
          BASS CALCULATIONS
        </div>
        <div style={{ fontSize: "9pt", color: "#625143", marginTop: "2mm" }}>
          Predicted low-frequency performance · four stages from the initial response to the final design
        </div>
      </header>

      {!data.ready ? (
        <div style={{ padding: "20mm 10mm", textAlign: "center", color: "#625143", fontSize: "11pt", lineHeight: 1.6 }}>
          <p>The saved bass calculation is not available for this version.</p>
          <p style={{ fontSize: "9pt", color: "#9B9890", marginTop: "4mm" }}>
            {data.reason ? `Reason: ${data.reason}` : "Run the bass analysis in the Room Designer, then regenerate the report."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm" }}>
          {PANELS.map((panel) => {
            const series = panelSeries(panel.key, data.graphs);
            return (
              <div key={panel.key} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "10pt", fontWeight: 700, color: "#1B1A1A", fontFamily: REPORT_FONT_HEADING }}>
                  {panel.label}
                </div>
                <div style={{ fontSize: "8pt", color: "#625143", marginBottom: "2mm" }}>
                  {panel.subtitle}
                </div>
                <BassCalculationPlot
                  series={series}
                  xDomain={sharedXDomain}
                  yDomain={ROOM_RESPONSE_PANELS.has(panel.key) ? roomResponseYDomain : null}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}