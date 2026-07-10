// components/rp22/RP22CompliancePanel.jsx
import React, { useMemo, useCallback } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { computeScreenMetrics } from "@/components/utils/screenMetrics";
import { renderPrimitive } from "@/components/utils/renderSafe";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const levelText = (lvl) => {
  const str = String(lvl).toUpperCase();
  if (str === "L4" || lvl === 4) return "L4";
  if (str === "L3" || lvl === 3) return "L3";
  if (str === "L2" || lvl === 2) return "L2";
  if (str === "L1" || lvl === 1) return "L1";
  if (str === "FAIL" || lvl === 0) return "Fail";
  return str; // Return as-is for "—", "N/A", etc.
};

// Format inequality symbols for display (proper Unicode glyphs)
const fmtIneq = (dir) => {
  if (dir === ">=") return "≥";
  if (dir === "<=") return "≤";
  if (dir === ">") return ">";
  if (dir === "<") return "<";
  if (dir === "=") return "=";
  return String(dir || "");
};

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
  
  // Handle string levels ("L4", "L3", "L2", "L1", "FAIL", "N/A", "—")
  const lvlStr = String(lvl).toUpperCase();
  if (lvlStr === "L4" || lvl === 4) return { ...base, background: "#F6F3EE", color: "#213428" };
  if (lvlStr === "L3" || lvl === 3) return { ...base, background: "#E9ECEF", color: "#3E4349" };
  if (lvlStr === "L2" || lvl === 2) return { ...base, background: "#EFEAE4", color: "#625143" };
  if (lvlStr === "L1" || lvl === 1) return { ...base, background: "#FBE9E7", color: "#A7302F" };
  if (lvlStr === "FAIL" || lvl === 0) return { ...base, background: "#FBE9E7", color: "#A7302F" };
  if (lvlStr === "N/A" || lvlStr === "—" || lvlStr === "-" || lvlStr === "NO DATA") return { ...base, background: "#F0F0F0", color: "#999" };
  
  return { ...base, background: "#FBE9E7", color: "#A7302F" }; // Default to fail/L1
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

const getMetricDisplayState = (metric) => {
  if (!metric || typeof metric !== "object") return { text: "Not Calculated", level: "—" };

  const hasRealValue = Object.keys(metric).some((key) => (
    key !== 'formatted' &&
    key !== 'level' &&
    key !== 'hudLabel' &&
    key !== 'notes' &&
    key !== 'debug' &&
    key !== 'details' &&
    key !== 'perSpeaker' &&
    key !== 'worstRole' &&
    key !== 'worstAngleDeg' &&
    key !== 'worstLossDb' &&
    key !== 'worstLossLabel' &&
    key !== 'worstGroup' &&
    key !== 'p17HasNaAngles' &&
    metric[key] != null
  ));

  const formatted = metric.formatted;
  const level = metric.level;

  if (formatted === '—') return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
  if (formatted === 'Not Calculated' && !hasRealValue && (level === '—' || level == null)) return { text: 'N/A', level };
  if (formatted) return { text: formatted, level };
  if (metric.hudLabel) return { text: metric.hudLabel, level };

  return { text: hasRealValue ? 'Not Calculated' : 'N/A', level };
};

// Small tokens
const card  = { border: "1px solid #DCDBD6", background: "#fff", borderRadius: 8 };
const head  = { padding: "12px 12px 0 12px" };
const title = { fontSize: 14, fontWeight: 700, color: "#1B1A1A" };
const sub   = { fontSize: 12, color: "#625143", marginTop: 4 };
const body  = { padding: "8px 12px 12px 12px" };
const row   = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };
const keyTx = { fontSize: 12, color: "#3E4349" };

const buildP16DebugText = (metric) => {
  const perSpeaker = metric?.debug?.perSpeaker;
  if (!perSpeaker || Object.keys(perSpeaker).length === 0) return "";
  return Object.entries(perSpeaker).map(([role, sp]) => {
    const isWorst = role === String(metric.debug?.worst?.role);
    const seatAz = Number.isFinite(sp?.seatAzDeg) ? sp.seatAzDeg.toFixed(1) : '—';
    const aim = Number.isFinite(sp?.aimDegRaw) ? sp.aimDegRaw.toFixed(1) : '—';
    const offAxis = Number.isFinite(sp?.offAxisRaw) ? sp.offAxisRaw.toFixed(1) : '—';
    const angle = Number.isFinite(sp?.angleDeg) ? sp.angleDeg : '—';
    const seat = Number.isFinite(sp?.continuousLossAtSeat) ? sp.continuousLossAtSeat.toFixed(2) : '—';
    const rsp = Number.isFinite(sp?.continuousLossAtRsp) ? sp.continuousLossAtRsp.toFixed(2) : '—';
    const delta = Number.isFinite(sp?.normalizedDelta) ? sp.normalizedDelta.toFixed(1) : '—';
    return `${isWorst ? '[worst] ' : ''}${role} seatAz=${seatAz} aim=${aim} offAxis=${offAxis} angle=${angle} | seat ${seat} dB | rsp ${rsp} dB | delta ${delta} dB`;
  }).join('\n');
};

const buildP17DebugText = (metric) => {
  if (!metric?.perSpeaker || metric.perSpeaker.length === 0) return "";
  const lines = [];
  const speakerLine = metric.perSpeaker
    .slice()
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((s) => {
      const displayAngle = Number.isFinite(s?.rawAngleDeg) ? s.rawAngleDeg : s?.angleDeg;
      const angle = Number.isFinite(displayAngle) ? String(Math.floor(Math.abs(displayAngle) + 1e-9)) : '—';
      const rawLoss = Number.isFinite(s?.lossDb) ? Number(s.lossDb) : null;
      let lossText = '—';
      if (s?.isBeyondNonLcrLimit) lossText = 'N/A';
      else if (rawLoss == null) lossText = '—';
      else if (rawLoss <= 0.0) lossText = '0.0 dB';
      else if (rawLoss <= 1.5) lossText = '1.5 dB';
      else if (rawLoss <= 3.0) lossText = '3.0 dB';
      else lossText = '>3.0 dB';
      const text = `${s.role} ${angle}° / ${lossText}`;
      return metric?.worstRole === s.role ? `[worst] ${text}` : text;
    })
    .join(', ');
  lines.push(speakerLine);

  if (metric?.worstRole && Number.isFinite(metric?.worstAngleDeg) && Number.isFinite(metric?.worstLossDb)) {
    const raw = Number(metric.worstLossDb);
    const worstLossText = raw <= 0.0 ? '0.0 dB' : raw <= 1.5 ? '1.5 dB' : raw <= 3.0 ? '3.0 dB' : '>3.0 dB';
    lines.push(`(worst: ${metric.worstRole} ${String(Math.floor(Math.abs(metric.worstAngleDeg) + 1e-9))}° / ${worstLossText})`);
  }

  if (metric.p17HasNaAngles) {
    lines.push('N/A = >41° off-axis; RP22 Level 2 limit');
  }

  const BED_DEBUG_ROLES = ['SBL', 'SBR', 'SL', 'SR', 'LW', 'RW'];
  const debugSpeakers = metric.perSpeaker.filter(s => BED_DEBUG_ROLES.includes(s.role) && s.debug);
  if (debugSpeakers.length) {
    const formatDbgVal = (v) => Number.isFinite(v) ? v.toFixed(1) : '—';
    debugSpeakers.forEach((s) => {
      lines.push(`${s.role} dbg: seatAz=${formatDbgVal(s.debug.seatAzDeg)} ref=${formatDbgVal(s.debug.referenceDeg ?? s.debug.aimDegRaw)} offAxis=${formatDbgVal(s.debug.offAxisDegComputed)}`);
    });
  }

  return lines.join('\n');
};

const getMetricDebugText = (paramId, metric) => {
  if (!metric) return "";
  if (paramId === 9) return metric?.debugText || "";
  if (paramId === 16) return buildP16DebugText(metric);
  if (paramId === 17) return buildP17DebugText(metric);
  return "";
};

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
    scope: "Seat",
    short: "Similarity across seats for wide/surround/upper; consider alignment, off-axis (H&V), room.",
    unit: "± dB",
    thresholds: { direction: "<=", L1: null, L2: null, L3: 3, L4: 1.5 },
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

/* ---------- P12/P13 mode-aware threshold constants ---------- */
const P12_THRESHOLDS_MINIMUM     = { direction: ">=", L1: 99,  L2: 102, L3: 105, L4: 108 };
const P12_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 102, L2: 105, L3: 108, L4: 111 };
const P13_THRESHOLDS_MINIMUM     = { direction: ">=", L1: 96,  L2: 99,  L3: 102, L4: 105 };
const P13_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 99,  L2: 102, L3: 105, L4: 108 };

function resolveParamThresholds(param, p12Mode, p13Mode) {
  if (param.id === 12) return p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM;
  if (param.id === 13) return p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM;
  return param.thresholds;
}

/* ---------- Panel ---------- */

export default function RP22CompliancePanel({
  analysisResult,
  screen,
  seatingPositions,
  seatHudSnapshots,
  roomHudSnapshot,
  mlpSeatId,
  dolbyLayout,
  frontSubsCount,
  rearSubsCount,
  p15ConstructionLevel,
  p21EarlyReflectionPreset,
  freeMoveLcr = false,
}) {
  const appState = useAppState();
  const p12Mode = appState?.p12Mode || "minimum";
  const p13Mode = appState?.splConfig?.p13Mode || "minimum";
  // Match pages/RP22Report.jsx fallback for P2
  const p2SystemConfig = React.useMemo(() => {
    const preset = dolbyLayout || "5.1";
    const base = String(preset).split(" ")[0];
    const parts = base.split(".");
    const bed = parts[0] || "5";
    const heights = parts[2] || "";

    const frontCount = Number(frontSubsCount ?? 0);
    const rearCount = Number(rearSubsCount ?? 0);
    const totalSubs = frontCount + rearCount;

    const systemConfigStr = heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;

    const p = systemConfigStr.split(".");
    const bedCount = parseInt(p[0], 10) || 5;
    const overheadCount = parseInt(p[2], 10) || 0;

    const discreteCount = bedCount + overheadCount;

    let p2Level = "L1";
    if (discreteCount >= 15) p2Level = "L4";
    else if (discreteCount >= 11) p2Level = "L2";
    else p2Level = "L1";

    return { discreteSpeakerCount: discreteCount, p2Level };
  }, [dolbyLayout, frontSubsCount, rearSubsCount]);

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

  // --- Seat layout pill grids (HUD-matched) ---
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];

  const seatHudSnapshotsCache = seatHudSnapshots || {};

  const getSnapshotForSeat = React.useCallback((seat) => {
    if (!seat) return null;

    const sid = String(seat.id || "").trim();
    if (!sid) return null;

    const cache = seatHudSnapshotsCache || {};

    // 0) exact key match (fast path)
    if (cache[sid]) return cache[sid];

    // 1) common key pattern: "seatId|sig"
    const prefKey = Object.keys(cache).find((k) => String(k).startsWith(`${sid}|`));
    if (prefKey) return cache[prefKey];

    // 2) fallback: search values by snapshot.seatId (handles "mlp", etc.)
    const values = Object.values(cache);
    const direct = values.find((snap) => String(snap?.seatId || "").trim() === sid);
    if (direct) return direct;

    // 3) Primary seat fallback: if this seat is the primary seat, also accept "mlp"
    const isPrimarySeat =
      (!!seat?.isPrimary) ||
      (String(mlpSeatId || "").trim() && sid === String(mlpSeatId).trim());

    if (isPrimarySeat) {
      if (cache["mlp"]) return cache["mlp"];

      const mlpKey = Object.keys(cache).find((k) => String(k).startsWith(`mlp|`));
      if (mlpKey) return cache[mlpKey];

      const mlpDirect = values.find((snap) => String(snap?.seatId || "").trim() === "mlp");
      if (mlpDirect) return mlpDirect;
    }

    return null;
  }, [seatHudSnapshotsCache, mlpSeatId]);

  const rows = React.useMemo(() => {
    // Group by row number (fallback: 1)
    const map = new Map();
    for (const s of seats) {
      const r = Number(s?.row || s?.rowNumber) || 1;
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(s);
    }

    // Sort rows front-to-back: Row 1, Row 2, ...
    const rowNums = Array.from(map.keys()).sort((a, b) => a - b);

    // Within a row: show Seat 1 on the RIGHT (so indexInRow DESC for display)
    return rowNums.map((r) => {
      const list = map.get(r) || [];
      const sorted = list.slice().sort((a, b) => {
        const ia = Number(a?.indexInRow) || 0;
        const ib = Number(b?.indexInRow) || 0;
        return ib - ia;
      });
      return { row: r, seats: sorted };
    });
  }, [seats]);

  const renderSeatPillGridForParam = (pId) => {
    if (!rows.length) return null;

    const pKey = `p${Number(pId)}`; // "p1" etc

    return (
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((rowObj) => (
          <div
            key={`row-${rowObj.row}`}
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "min-content",
              justifyContent: "end",
              gap: 6,
            }}
          >
            {rowObj.seats.map((seat) => {
              const snap = getSnapshotForSeat(seat);
              const metric = snap?.rp22?.[pKey];
              const display = getMetricDisplayState(metric);
              const lvl = display.text === 'N/A' ? 'N/A' : (metric?.level || "—");
              const isPrimary = !!seat?.isPrimary;

              return (
                <span
                  key={`seat-${seat?.id || `${rowObj.row}-${seat?.indexInRow || ""}`}`}
                  title={`${seat?.id || ""}  Row ${seat?.row || seat?.rowNumber || 1} Seat ${
                    seat?.indexInRow || ""
                  }${isPrimary ? " (RSP)" : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    // Primary seat highlight (keep your existing idea, just applied around the standard pill)
                    boxShadow: isPrimary ? "0 0 0 2px rgba(33,52,40,0.10)" : "none",
                    borderRadius: 6,
                  }}
                >
                  <RP22GradingPill level={lvl} />
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // Build simple seat ID map from cache (cache keys are "seatId|signature")
  const seatSnapshotsById = React.useMemo(() => {
    const cache = (seatHudSnapshots && typeof seatHudSnapshots === "object") ? seatHudSnapshots : {};
    const byId = {};
    
    for (const [cacheKey, snapshot] of Object.entries(cache)) {
      const seatId = String(cacheKey).split('|')[0];
      if (seatId) {
        byId[seatId] = snapshot;
      }
    }
    
    return byId;
  }, [seatHudSnapshots]);



  const defaultSeatKey = React.useMemo(() => {
    // Always prefer synthetic mlp if present
    if (seatSnapshotsById["mlp"]) return "seat:mlp";
    if (mlpSeatId && seatSnapshotsById[mlpSeatId]) return `seat:${mlpSeatId}`;
    const first = Object.keys(seatSnapshotsById)[0];
    return first ? `seat:${first}` : "room";
  }, [seatSnapshotsById, mlpSeatId]);

  // Always drive Compliance Report from the RSP/primary seat snapshot.
  // Priority:
  // 1) mlpSeatId (passed from RoomDesigner)
  // 2) any seat flagged isPrimary in seatingPositions
  // 3) "mlp" if present in cache
  // 4) first available seat in cache
  const lockedSeatId = React.useMemo(() => {
    const fromProp = String(mlpSeatId || "").trim();
    if (fromProp && seatSnapshotsById?.[fromProp]) return fromProp;

    const primaryFromSeats = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .find(s => s?.isPrimary && s?.id);
    const primaryId = String(primaryFromSeats?.id || "").trim();
    if (primaryId && seatSnapshotsById?.[primaryId]) return primaryId;

    if (seatSnapshotsById?.["mlp"]) return "mlp";

    const first = Object.keys(seatSnapshotsById || {})[0];
    return first || "";
  }, [mlpSeatId, seatingPositions, seatSnapshotsById]);

  const reportSource = React.useMemo(() => {
    return lockedSeatId ? `seat:${lockedSeatId}` : "room";
  }, [lockedSeatId]);

  // Pull a usable numeric value out of HUD metric objects.
  // Metrics often store numbers as valueM/valueDb/valueDeg/etc (not metric.value).
  const getMetricNumericValue = (metric) => {
    if (!metric || typeof metric !== "object") return null;

    const candidates = [
      metric.value,          // generic (rare in this app)
      metric.valueM,
      metric.valueDb,
      metric.valueDeg,
      metric.valueHz,
      metric.valueMs,
      metric.valueS,
      metric.valuePct,
      metric.valuePercent,
      metric.valueRatio,
    ];

    for (const v of candidates) {
      if (Number.isFinite(v)) return v;
    }

    // Last resort: first finite numeric in an object key starting with "value"
    for (const [k, v] of Object.entries(metric)) {
      if (k.startsWith("value") && Number.isFinite(v)) return v;
    }

    return null;
  };

  // Format fallback numeric values when formatted/hudLabel are missing.
  const formatMetricFallback = (n, unit) => {
    if (!Number.isFinite(n)) return "—";
    const u = String(unit || "").trim();

    if (u === "m") return `${n.toFixed(2)}m`;
    if (u === "dB" || u === "± dB") return `${n.toFixed(1)} dB`;
    if (u === "Hz") return `${Math.round(n)} Hz`;
    if (u === "°") return `${Math.round(n)}°`;
    if (u === "%") return `${Math.round(n)}%`;

    // Default: keep a sensible precision without inventing meaning
    return `${n.toFixed(2)} ${u}`.trim();
  };

  // Grade a value against RP22 thresholds (returns "L1".."L4" or "—")
  const gradeByThresholds = (thresholds, v) => {
    if (!thresholds || !Number.isFinite(v)) return "—";

    const dir = String(thresholds.direction || "").trim();
    const L1 = Number(thresholds.L1);
    const L2 = Number(thresholds.L2);
    const L3 = Number(thresholds.L3);
    const L4 = Number(thresholds.L4);

    const okNum = (n) => typeof n === "number" && Number.isFinite(n);

    if (dir === "<=") {
      if (okNum(L4) && v <= L4) return "L4";
      if (okNum(L3) && v <= L3) return "L3";
      if (okNum(L2) && v <= L2) return "L2";
      if (okNum(L1) && v <= L1) return "L1";
      return "—";
    }

    // default >=
    if (okNum(L4) && v >= L4) return "L4";
    if (okNum(L3) && v >= L3) return "L3";
    if (okNum(L2) && v >= L2) return "L2";
    if (okNum(L1) && v >= L1) return "L1";
    return "—";
  };

  const getHudLevelForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    const scope = String(param?.scope || "").toLowerCase();
    const isRoomScope = scope === "room";

    // Room-level: prefer RP22 engine result; fallback to valueFromAnalysis + thresholds
    if (isRoomScope) {
      const res = analysisResult?.gradedParameters?.primary?.[pid] || null;

      // P12/P13: re-grade from raw value using the user-selected mode thresholds
      if ((pid === 12 || pid === 13) && res && res.status !== "no_data" && Number.isFinite(res.value)) {
        const thresholds = pid === 12
          ? (p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM)
          : (p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM);
        const v = res.value;
        if (v >= thresholds.L4) return "L4";
        if (v >= thresholds.L3) return "L3";
        if (v >= thresholds.L2) return "L2";
        if (v >= thresholds.L1) return "L1";
        return "—";
      }

      // P14: show FAIL pill when a live P14 value is below L1 (114 dB).
      // "—" only when there is genuinely no calculated P14 data.
      if (pid === 14) {
        if (res && res.status === "no_data") return "—";
        if (res && Number.isFinite(res.value) && res.value < 114) return "FAIL";
        if (res && res.status !== "no_data" && res.status !== "fail" && res.level != null) {
          return res.level;
        }
        return "—";
      }

      // P19: a valid calculated deviation above L1 is FAIL, not missing data.
      if (pid === 19) {
        if (!res || res.status === "no_data" || !Number.isFinite(res.value)) return "—";
        if (res.status === "fail" || String(res.level).toUpperCase() === "FAIL") return "FAIL";
        return res.level ?? "—";
      }

      // If engine gave a usable level, use it
      if (res && res.status !== "no_data" && res.status !== "fail" && res.level != null) {
        return res.level; // may be "L1".."L4" or numeric
      }

      // Report-page fallback rules
      if (pid === 2 && p2SystemConfig) return p2SystemConfig.p2Level; // "L1".."L4"
      if (pid === 3) {
        const p3 = analysisResult?.gradedParameters?.primary?.[3];
        return (p3 && p3.status === "ok") ? p3.level : "—";
      }
      if (pid === 8) return "L4";
      if (pid === 11) return "L4";

      if (pid === 15) {
        const MAP = { standard: "L1", "purpose-built": "L2", reference: "L3", studio: "L4" };
        return MAP[p15ConstructionLevel || "standard"] || "—";
      }

      if (pid === 21) {
        const MAP = { l1: "L1", l2: "L2", l3: "L3", l4: "L4" };
        return MAP[p21EarlyReflectionPreset || "l2"] || "—";
      }

      return "—";
    }

    // Seat-level
    if (String(reportSource).startsWith("seat:")) {
      const seatId = String(reportSource).split(":")[1];
      const snap =
        seatSnapshotsById?.[seatId] ||
        seatSnapshotsById?.["mlp"] ||
        (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) ||
        // Fallback: if seatId is "mlp", read directly from analysisResult.perSeatRp22["mlp"]
        (seatId === "mlp" ? analysisResult?.perSeatRp22?.["mlp"] : null) ||
        null;

      const key = `p${pid}`;
      const metric = snap?.rp22?.[key];
      return getMetricDisplayState(metric).level || "—";
    }

    return "—";
  }, [reportSource, seatSnapshotsById, roomHudSnapshot, analysisResult, mlpSeatId, defaultSeatKey]);

  const getHudValueForParam = React.useCallback((param) => {
    const pid = Number(param?.id);
    const scope = String(param?.scope || "").toLowerCase();
    const isRoomScope = scope === "room";

    // Room-level: prefer RP22 engine result; fallback to valueFromAnalysis
    if (isRoomScope) {
      const res = analysisResult?.gradedParameters?.primary?.[pid] || null;

      // Engine value if present
      if (res && res.status !== "no_data" && res.status !== "fail") {
        const v = res.value;

        // P3 must always show a whole-speaker count, never the engine's preformatted decimal string
        if (pid === 3 && v !== null && v !== undefined && typeof v === "number" && Number.isFinite(v)) {
          const paramDef = RP22_PARAMS.find(p => p.id === pid);
          const unit = paramDef?.unit || "";
          return unit ? `${Math.round(v)} ${unit}` : String(Math.round(v));
        }

        // P14: display ceil'd achieved SPL (e.g. 111.4 → "112 dB"). Display only.
        if (pid === 14 && typeof v === "number" && Number.isFinite(v)) {
          return `${Math.ceil(v)} dB`;
        }

        if (res.formatted) return res.formatted;

        if (v !== null && v !== undefined) {
          if (typeof v === "number" && Number.isFinite(v)) {
            const paramDef = RP22_PARAMS.find(p => p.id === pid);
            const unit = paramDef?.unit || "";
            return unit ? `${v.toFixed(1)} ${unit}` : v.toFixed(1);
          }
          return String(v);
        }
      }

      // Report-page fallback values where needed
      if (pid === 2 && p2SystemConfig) return `${p2SystemConfig.discreteSpeakerCount} speakers`;
      if (pid === 3) {
        const p3 = analysisResult?.gradedParameters?.primary?.[3];
        if (p3 && p3.status === "ok" && p3.formatted) return p3.formatted;
        return "—";
      }
      if (pid === 8) return "No";
      if (pid === 11) return "0";

      // P15 / P21 are effectively "selection-driven" on the report page; show their chosen value
      if (pid === 15) {
        const LABEL = {
          standard: "NCB 26 (standard)",
          "purpose-built": "NCB 22 (purpose-built)",
          reference: "NCB 18 (reference)",
          studio: "NCB 15 (studio)",
        };
        return LABEL[p15ConstructionLevel || "standard"] || "—";
      }

      if (pid === 21) {
        return String(p21EarlyReflectionPreset || "l2").toUpperCase();
      }

      return "—";
    }

    // Seat-level
    if (String(reportSource).startsWith("seat:")) {
      const seatId = String(reportSource).split(":")[1];
      const snap =
        seatSnapshotsById?.[seatId] ||
        seatSnapshotsById?.["mlp"] ||
        (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) ||
        // Fallback: if seatId is "mlp", read directly from analysisResult.perSeatRp22["mlp"]
        (seatId === "mlp" ? analysisResult?.perSeatRp22?.["mlp"] : null) ||
        null;

      const key = `p${pid}`;
      const metric = snap?.rp22?.[key];
      if (!metric) return "Not Calculated";

      if (pid === 17) {
        const display = getMetricDisplayState(metric);
        if (display.text === 'N/A' || display.text === 'Not Calculated') return display.text;
        const parts = [];
        if (metric.worstRole) parts.push(String(metric.worstRole));
        const details = [];
        if (Number.isFinite(metric.worstAngleDeg)) details.push(`${Math.round(metric.worstAngleDeg)}°`);
        if (Number.isFinite(metric.worstLossDb)) details.push(`${Number(metric.worstLossDb).toFixed(1)} dB`);
        if (details.length > 0) {
          return parts.length > 0 ? `${parts.join(" ")} (${details.join(" / ")})` : details.join(" / ");
        }
        return parts.length > 0 ? parts.join(" ") : display.text;
      }

      const display = getMetricDisplayState(metric);
      if (display.text && display.text !== '—') return display.text;

      const param = RP22_PARAMS.find(p => p.id === pid);
      const unit = param?.unit || "";

      const n = getMetricNumericValue(metric);
      if (Number.isFinite(n)) return formatMetricFallback(n, unit);
      
      return "Not Calculated";
    }

    return "—";
  }, [reportSource, seatSnapshotsById, roomHudSnapshot, analysisResult, mlpSeatId, defaultSeatKey]);

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
            <span style={keyTx}>Recommended distance from screen (50°–65°)</span>
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
          const lvl = getHudLevelForParam(p);
          const achievedValue = getHudValueForParam(p);
          const isSeatScope = String(p.scope || "").toLowerCase() === "seat";
          const resolvedParam = (p.id === 12 || p.id === 13)
            ? { ...p, thresholds: resolveParamThresholds(p, p12Mode, p13Mode) }
            : p;
          const p14Result = p.id === 14 ? analysisResult?.gradedParameters?.primary?.[14] : null;
          const targetBasisNote =
            p.id === 12 ? `Target basis: ${p12Mode === "recommended" ? "Recommended" : "Minimum"}` :
            p.id === 13 ? `Target basis: ${p13Mode === "recommended" ? "Recommended" : "Minimum"}` :
            p14Result ? `Design EQ: ${p14Result.designEqEnabled ? "On" : "Off"} (cut -10 dB / boost +6 dB) — ${p14Result.note || "Post-EQ design estimate at RSP using selected subwoofer product data."}` :
            null;
          const debugMetric = String(reportSource).startsWith("seat:")
            ? (() => {
                const seatId = String(reportSource).split(":")[1];
                const snap =
                  seatSnapshotsById?.[seatId] ||
                  seatSnapshotsById?.["mlp"] ||
                  (mlpSeatId ? seatSnapshotsById?.[mlpSeatId] : null) ||
                  (seatId === "mlp" ? analysisResult?.perSeatRp22?.["mlp"] : null) ||
                  null;
                return snap?.rp22?.[`p${p.id}`] || null;
              })()
            : null;
          const debugText = getMetricDebugText(p.id, debugMetric);

          return (
            <div key={p.id} style={card}>
              <div style={head}>
                <div style={{ ...title, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{p.id}. {p.title}</span>
                  {debugText ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Debug info for parameter ${p.id}`}
                            style={{
                              border: "1px solid #C1B6AD",
                              background: "#F6F3EE",
                              color: "#625143",
                              borderRadius: 9999,
                              width: 18,
                              height: 18,
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "help",
                              flex: "0 0 auto",
                            }}
                          >
                            i
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="start"
                          className="max-w-[420px] whitespace-pre-wrap break-words rounded-md border border-[#C1B6AD] bg-white px-3 py-2 text-[#1B1A1A] shadow-lg"
                        >
                          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace", fontSize: 11, lineHeight: 1.5 }}>
                            {debugText}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>
                <div style={{ ...sub, display: "flex", gap: 8, alignItems: "center" }}>
                  <span>{p.short}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#3E4349" }}>
                    SCOPE: <strong>{p.scope.toUpperCase()}</strong>
                  </span>
                </div>
                {/* Achieved value line */}
                <div style={{ fontSize: 11, color: "#1B1A1A", marginTop: 6, fontWeight: 600 }}>
                  {isSeatScope ? "Achieved (RSP): " : "Achieved: "}
                  <span style={{ color: "#213428" }}>{achievedValue}</span>
                </div>
                {targetBasisNote && (
                  <div style={{ fontSize: 10, color: "#9B8E82", marginTop: 4, fontStyle: "italic" }}>
                    {targetBasisNote}
                  </div>
                )}
              </div>

              <div style={body}>
                <div style={{ ...row, marginTop: 0 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#625143" }}>
                      {isSeatScope ? "Per-seat levels" : "Level"}
                    </span>
                  </div>
                  {(() => {
                    // ROOM scope: use same pill as HUD + RP22 Report
                    if (!isSeatScope) {
                      return <RP22GradingPill level={lvl} />;
                    }

                    // SEAT scope: NO overall pill, only per-seat pill grid
                    return (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        {renderSeatPillGridForParam(p.id)}
                      </div>
                    );
                  })()}
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
                      const trg = resolvedParam.thresholds[k];
                      const isEq = resolvedParam.thresholds.direction === "=";
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
                              : `${fmtIneq(resolvedParam.thresholds.direction)} ${trg}${
                                  resolvedParam.unit === "°"
                                    ? "°"
                                    : resolvedParam.unit === "Hz"
                                    ? " Hz"
                                    : resolvedParam.unit === "± dB" || resolvedParam.unit === "dB"
                                    ? " dB"
                                    : resolvedParam.unit === "m"
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