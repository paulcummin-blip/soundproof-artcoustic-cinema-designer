
// components/rp22/RP22CompliancePanel.jsx
import React from "react";
import { computeScreenMetrics } from "@/components/utils/screenMetrics";
import { renderPrimitive } from "@/components/utils/renderSafe";

/* ---------- Helpers ---------- */

// Horizontal FOV → distance (m)
function distanceForFov(widthM, fovDeg) {
  const r = (fovDeg * Math.PI) / 180;
  return (widthM / 2) / Math.tan(r / 2);
}

// Compare achieved value against thresholds
function levelFor(value, t) {
  if (!t) return 0;

  // '=' exact-match mode (strings like "Yes"/"No" or numeric 0)
  if (t.direction === "=") {
    if (value == null) return 0;
    const v = String(value).toLowerCase();
    if (String(t.L4 ?? "").toLowerCase() === v) return 4;
    if (String(t.L3 ?? "").toLowerCase() === v) return 3;
    if (String(t.L2 ?? "").toLowerCase() === v) return 2;
    if (String(t.L1 ?? "").toLowerCase() === v) return 1;
    return 0;
  }

  // '<=' or '>=' numeric comparison
  const pass = (k) => {
    const trg = t[k];
    if (trg == null || value == null || Number.isNaN(Number(value))) return false;
    const v = Number(value);
    const n = Number(trg);
    return t.direction === "<=" ? v <= n : v >= n;
  };

  if (pass("L4")) return 4;
  if (pass("L3")) return 3;
  if (pass("L2")) return 2;
  if (pass("L1")) return 1;
  return 0;
}

const levelText = { 0: "Fail", 1: "L1", 2: "L2", 3: "L3", 4: "L4" };

const pillStyle = (lvl) => {
  const base = {
    border: "1px solid #C1B6AD",
    borderRadius: "9999px",
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
  };
  if (lvl === 4) return { ...base, background: "#F6F3EE", color: "#213428" };
  if (lvl === 3) return { ...base, background: "#E9ECEF", color: "#3E4349" };
  if (lvl === 2) return { ...base, background: "#EFEAE4", color: "#625143" };
  return { ...base, background: "#FBE9E7", color: "#A7302F" }; // L1/Fail
};

const chip = {
  background: "#F6F3EE",
  border: "1px solid #C1B6AD",
  color: "#1B1A1A",
  padding: "2px 8px",
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

// Small tokens
const card  = { border: "1px solid #DCDBD6", background: "#fff", borderRadius: 8 };
const head  = { padding: "12px 12px 0 12px" };
const title = { fontSize: 14, fontWeight: 700, color: "#1B1A1A" };
const sub   = { fontSize: 12, color: "#625143", marginTop: 4 };
const body  = { padding: "8px 12px 12px 12px" };
const row   = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };
const keyTx = { fontSize: 12, color: "#3E4349" };

/* ---------- Canonical RP22 Parameters (FULL, with scope) ---------- */
const RP22_PARAMS = [
  {
    id: 1,
    title: "Minimum distance between the listening area and the room walls (dsw, dbw)",
    scope: "Seat",
    short: "Avoids seats too near boundaries. Measure from each listener head center to nearest wall or protruding baffle.",
    unit: "m",
    thresholds: { direction: ">=", L1: 0.5, L2: 0.8, L3: 1.2, L4: 1.5 },
    valueFromAnalysis: (a) => a?.p1_minSeatToWall_m,
  },
  {
    id: 2,
    title: "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers",
    scope: "Room",
    short: "Includes all listener-level and upper discrete processor outputs; exact locations depend on design.",
    unit: "speakers",
    thresholds: { direction: ">=", L1: 5, L2: 11, L3: 15, L4: 15 },
    valueFromAnalysis: (a) => a?.p2_discreteCount,
  },
  {
    id: 3,
    title: "Number of screen wall speakers allowed outside of recommended zonal locations",
    scope: "Room",
    short: "Screen speaker locations are zones (not fixed angles). Count of screen speakers outside their zones.",
    unit: "speakers",
    thresholds: { direction: "=", L1: 0, L2: 0, L3: 0, L4: 0 },
    valueFromAnalysis: (a) => a?.p3_screenOutsideZones_count,
  },
  {
    id: 4,
    title: "Maximum SPL difference between screen wall speakers",
    scope: "Seat",
    short: "Per seat, max predicted SPL difference (anechoic propagation) between any two screen speakers.",
    unit: "dB",
    thresholds: { direction: "<=", L1: 6, L2: 5, L3: 4, L4: 2 },
    valueFromAnalysis: (a) => a?.p4_screenSPLdiff_max_dB,
  },
  {
    id: 5,
    title: "Maximum allowable horizontal angle between adjacent surround speakers",
    scope: "Seat",
    short: "Ensures smooth panning/localization. Max horizontal angle between adjacent surrounds at the seat.",
    unit: "°",
    thresholds: { direction: "<=", L1: null, L2: 80, L3: 60, L4: 50 },
    valueFromAnalysis: (a) => a?.p5_surroundAdjAngle_max_deg,
  },
  {
    id: 6,
    title: "Maximum SPL difference between surround speakers",
    scope: "Seat",
    short: "Per seat, max predicted SPL difference (anechoic) between any two listener-level surrounds.",
    unit: "dB",
    thresholds: { direction: "<=", L1: 10, L2: 6, L3: 4, L4: 2 },
    valueFromAnalysis: (a) => a?.p6_surroundSPLdiff_max_dB,
  },
  {
    id: 7,
    title: "Wide speakers (if implemented) maximum allowable horizontal deviation from median angle",
    scope: "Room",
    short: "Max horizontal angular deviation allowed from ideal median angular location for wide fronts.",
    unit: "°",
    thresholds: { direction: "<=", L1: 10, L2: 7, L3: 5, L4: 2 },
    valueFromAnalysis: (a) => a?.p7_wideMedianDeviation_deg,
  },
  {
    id: 8,
    title: "Upfiring/elevation speakers allowed?",
    scope: "Room",
    short: "If tops can't be installed, upfiring/elevation speakers may be used; must be suitably designed.",
    unit: "Yes/No",
    thresholds: { direction: "=", L1: "Yes", L2: "Yes", L3: "No", L4: "No" },
    valueFromAnalysis: (a) => (a?.p8_upfiringAllowed ? "Yes" : "No"),
  },
  {
    id: 9,
    title: "Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers",
    scope: "Seat",
    short: "Ensures smooth vertical panning. Excludes top-middle-center / height-center. (L1: >80.1°)",
    unit: "°",
    thresholds: { direction: "<=", L1: null, L2: 80, L3: 60, L4: 50 },
    valueFromAnalysis: (a) => a?.p9_upperAdjVertAngle_max_deg,
  },
  {
    id: 10,
    title: "Maximum SPL difference between upper speakers",
    scope: "Seat",
    short: "Per seat, max predicted SPL difference (anechoic) between any two height/upper speakers.",
    unit: "dB",
    thresholds: { direction: "<=", L1: 12, L2: 8, L3: 5, L4: 2 },
    valueFromAnalysis: (a) => a?.p10_upperSPLdiff_max_dB,
  },
  {
    id: 11,
    title: "Number of surround/wide/upper speakers allowed outside of zonal recommendation locations",
    scope: "Room",
    short: "Count of surround/wide/upper speakers outside their recommended zones.",
    unit: "speakers",
    thresholds: { direction: "=", L1: null, L2: 0, L3: 0, L4: 0 },
    valueFromAnalysis: (a) => a?.p11_swUpperOutsideZones_count,
  },
  {
    id: 12,
    title: "Screen speakers SPL capability at RSP (post-EQ, within assigned bandwidth) without clipping",
    scope: "Room",
    short: "Minimum long-term SPL at RSP (AES75/CTA-2034 guidance). Allow for bass contour & +EQ headroom.",
    unit: "dB",
    thresholds: { direction: ">=", L1: 102, L2: 105, L3: 108, L4: 111 },
    valueFromAnalysis: (a) => a?.p12_screenSPL_capability_dB,
  },
  {
    id: 13,
    title: "Non-screen speakers SPL capability at RSP (post-EQ, within assigned bandwidth) without clipping",
    scope: "Room",
    short: "Minimum long-term SPL at RSP for non-screen channels. Includes amplifier headroom.",
    unit: "dB",
    thresholds: { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 },
    valueFromAnalysis: (a) => a?.p13_nonScreenSPL_capability_dB,
  },
  {
    id: 14,
    title: "LFE frequencies total SPL capability at RSP (+ bass management if used) (post-EQ) without clipping",
    scope: "Room",
    short: "Total system SPL capability at LFE; can include boundary/room gain and multi-sub summation.",
    unit: "dB",
    thresholds: { direction: ">=", L1: 114, L2: 117, L3: 120, L4: 123 },
    valueFromAnalysis: (a) => a?.p14_LFE_capability_dB,
  },
  {
    id: 15,
    title: "Background noise floor (all AV + mechanical/building services ON, nominal temps)",
    scope: "Room",
    short: "Noise floor with systems running while no content is playing (e.g., pause/menu).",
    unit: "NCB",
    thresholds: { direction: "<=", L1: 26, L2: 22, L3: 18, L4: 15 },
    valueFromAnalysis: (a) => a?.p15_noiseFloor_NCB,
  },
  {
    id: 16,
    title: "Seat-to-seat frequency response variance across all screen wall speakers (500 Hz–16 kHz, 1-oct smoothing)",
    scope: "Seat",
    short: "Similarity across seats; consider alignment, off-axis response (H&V), and room effects.",
    unit: "± dB",
    thresholds: { direction: "<=", L1: 5, L2: 3, L3: 1.5, L4: 1.5 },
    valueFromAnalysis: (a) => a?.p16_screenVariance_dB,
  },
  {
    id: 17,
    title: "Seat-to-seat FR variance across all wide/surround/upper speakers (500 Hz–16 kHz, 1-oct smoothing)",
    scope: "Room",
    short: "Similarity across seats for wide/surround/upper; consider alignment, off-axis (H&V), room.",
    unit: "± dB",
    thresholds: { direction: "<=", L1: null, L2: null, L3: 3, L4: 1.5 },
    valueFromAnalysis: (a) => a?.p17_swUpperVariance_dB,
  },
  {
    id: 18,
    title: "In-room bass extension -3 dB cutoff frequency point",
    scope: "Room",
    short: "Predicted in-room -3 dB extension with no audible distortion/resonance at the SPL of Param 14.",
    unit: "Hz",
    thresholds: { direction: "<=", L1: 30, L2: 25, L3: 18, L4: 15 },
    valueFromAnalysis: (a) => a?.p18_bassExtension_Hz,
  },
  {
    id: 19,
    title: "Frequency response below the room's transition frequency at RSP relative to target (1/3-oct smoothing) - \"The Result\"",
    scope: "Room",
    short: "Predicts smooth response at RSP relative to target curve.",
    unit: "± dB",
    thresholds: { direction: "<=", L1: 5, L2: 4, L3: 3, L4: 2 },
    valueFromAnalysis: (a) => a?.p19_belowTransition_atRSP_dB,
  },
  {
    id: 20,
    title: "Seat-to-seat FR relative to measured RSP below transition frequency per seat (1/3-oct) - \"The Consistency\"",
    scope: "Seat",
    short: "Predicts similarity across seats below transition.",
    unit: "± dB",
    thresholds: { direction: "<=", L1: null, L2: 4, L3: 3, L4: 2 },
    valueFromAnalysis: (a) => a?.p20_belowTransition_seatToSeat_dB,
  },
  {
    id: 21,
    title: "Level of early reflections relative to direct sound (0–15 ms, 1–8 kHz)",
    scope: "Room",
    short: "Manage early reflections for optimum direct/reflected balance.",
    unit: "dB",
    thresholds: { direction: "<=", L1: null, L2: -8, L3: -10, L4: -12 },
    valueFromAnalysis: (a) => a?.p21_earlyReflections_dB,
  },
];

/* ---------- Panel ---------- */

export default function RP22CompliancePanel({ analysisResult, screen }) {
  // RP23 range (50–65°)
  const rp23 = React.useMemo(() => {
    const { viewWm } = computeScreenMetrics(
      screen?.visibleWidthInches || 100,
      screen?.aspectRatio || "16:9"
    );
    const d50 = distanceForFov(viewWm, 50);
    const d65 = distanceForFov(viewWm, 65);
    return {
      viewWm,
      dMin: Math.min(d50, d65),
      dMax: Math.max(d50, d65),
      size: screen?.visibleWidthInches || 100,
      ar: screen?.aspectRatio || "16:9",
    };
  }, [screen]);

  return (
    <div>
      {/* RP23 Screen Size Guide */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={head}>
          <div style={title}>RP23 Screen Size Guide</div>
          <div style={sub}>
            {rp23.size}" {rp23.ar} — targeting 57.5° FOV
          </div>
        </div>
        <div style={body}>
          <div style={row}>
            <span style={keyTx}>Recommended distance (50°–65°)</span>
            <span style={chip}>
              {rp23.dMin.toFixed(2)} m – {rp23.dMax.toFixed(2)} m
            </span>
          </div>
          <div style={row}>
            <span style={keyTx}>Screen width</span>
            <span style={chip}>{rp23.viewWm.toFixed(2)} m</span>
          </div>
        </div>
      </div>

      {/* RP22 Parameters (1–21) */}
      <div style={{ display: "grid", gap: 12 }}>
        {RP22_PARAMS.map((p) => {
          const val =
            typeof p.valueFromAnalysis === "function"
              ? p.valueFromAnalysis(analysisResult)
              : null;

          // pretty-value formatting
          const pretty = (function () {
              if (val == null) return "n/a";
              if (typeof val === "number") {
                const dp = (p.unit === "± dB" || p.unit === "dB") ? 1 : (p.unit === "Hz" ? 0 : 2);
                return `${val.toFixed(dp)}${p.unit === "°" ? "°" : ""}`;
              }
              return renderPrimitive(val);
            })();

          const lvl = levelFor(
            typeof val === "string" ? val : typeof val === "number" ? val : null,
            p.thresholds
          );

          return (
            <div key={p.id} style={card}>
              <div style={head}>
                <div style={title}>
                  {p.id}. {p.title}
                </div>
                <div style={{ ...sub, display: "flex", gap: 8, alignItems: "center" }}>
                  <span>{p.short}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#3E4349" }}>
                    SCOPE: <strong>{p.scope.toUpperCase()}</strong>
                  </span>
                </div>
              </div>

              <div style={body}>
                <div style={{ ...row, marginTop: 0 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#625143" }}>Achieved</span>
                    <span
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                        fontSize: 12,
                        color: "#3E4349",
                      }}
                    >
                      {pretty}
                      {typeof val === "number" && p.unit && !["Yes/No", "speakers"].includes(p.unit)
                        ? p.unit === "± dB"
                          ? " dB"
                          : p.unit === "dB"
                          ? " dB"
                          : p.unit === "Hz"
                          ? " Hz"
                          : p.unit === "°"
                          ? "°"
                          : p.unit === "m"
                          ? " m"
                          : ""
                        : ""}
                    </span>
                  </div>
                  <span style={pillStyle(lvl)}>{levelText[lvl]}</span>
                </div>

                {/* thresholds grid */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EFEA" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      textAlign: "center",
                      gap: 8,
                    }}
                  >
                    {["L4", "L3", "L2", "L1"].map((k) => {
                      const trg = p.thresholds[k];
                      const isEq = p.thresholds.direction === "=";
                      return (
                        <div key={k} style={{ fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color: "#3E4349" }}>{k}</div>
                          <div
                            style={{
                              color: "#625143",
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                            }}
                          >
                            {trg == null
                              ? "–"
                              : isEq
                              ? String(trg)
                              : `${p.thresholds.direction} ${trg}${
                                  p.unit === "°"
                                    ? "°"
                                    : p.unit === "Hz"
                                    ? " Hz"
                                    : p.unit === "± dB" || p.unit === "dB"
                                    ? " dB"
                                    : p.unit === "m"
                                    ? " m"
                                    : ""
                                }`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
