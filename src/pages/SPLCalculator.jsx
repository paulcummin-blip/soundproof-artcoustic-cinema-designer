import React, { useMemo, useState, useCallback, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useActiveProjectId } from "@/components/state/project-session";
import { artcousticSpeakers } from "@/components/data/speakerData";
import { useRoomDimensions } from "@/components/hooks/useRoomDimensions";
import { computeSingleSeatSplAtDistance } from "@/components/utils/spl/centralSplEngine";

// ---- brand palette ----
const BRAND = {
  bg: "rgb(248 248 247)",
  panel: "#FFFFFF",
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  green: "#2A6E3F",
  gold: "#B48A3A",
  red: "#7A1E19",
  blue: "#1B4E7A",
};

// ---- RP22 targets ----
const RP22 = {
  LCR: {
    param: 12,
    label: "Parameter 12 — Screen Speakers SPL at RSP (post‑cal EQ, within assigned bandwidth) without clipping",
    levels: [
      { key: "L1", db: 102 },
      { key: "L2", db: 105 },
      { key: "L3", db: 108 },
      { key: "L4", db: 111 },
    ],
  },
  SUR: {
    param: 13,
    label: "Parameter 13 — Non‑screen Speakers SPL at RSP (post‑cal EQ, within assigned bandwidth) without clipping (includes amplifier headroom)",
    levels: [
      { key: "L1", db: 99 },
      { key: "L2", db: 102 },
      { key: "L3", db: 105 },
      { key: "L4", db: 108 },
    ],
  },
};

function isSubwooferEntry(s) {
  if (!s) return false;
  const cat = String(s.type || s.category || "").toLowerCase();
  if (cat.includes("sub")) return true;
  const model = `${s.brand || ""} ${s.model || ""}`.toLowerCase();
  return /\bsub\b|\bsubwoofer\b/.test(model);
}

// ---------- math helpers ----------
function safeNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Legacy helper for 1m SPL capability, used by speaker list rendering.
// Main seat SPL is now computed by computeSingleSeatSplAtDistance, but we
// keep this here so any remaining calls don't crash.
function getSPL1mCapability(speaker, ampPower_W) {
  if (!speaker || !ampPower_W) return null;

  const sens =
    Number(
      speaker.sensitivity_db_1w_1m ??
        speaker.sensitivity ??
        speaker.sensitivity_db_2v83_1m
    ) || 0;

  // Use whichever power field is available as the speaker's limit
  const speakerMaxPower =
    speaker.power_handling_w ?? speaker.max_power ?? ampPower_W;

  const pAvailable = Math.min(ampPower_W, speakerMaxPower);

  if (!sens || !pAvailable || !Number.isFinite(pAvailable)) {
    return null;
  }

  const splAmpLimited = sens + 10 * Math.log10(pAvailable);

  // Continuous 1 m cap if present
  const hardCap =
    speaker.max_spl_cont_db_1m ??
    speaker.max_spl ??
    null;

  const spl1m =
    hardCap != null ? Math.min(splAmpLimited, hardCap) : splAmpLimited;

  return spl1m;
}

// Legacy helper for distance loss, used by speaker list rendering
function getDistanceLoss(speaker, distance_m) {
  if (!Number.isFinite(distance_m) || distance_m <= 0) return { loss: 0, model: "Unknown" };
  const loss = 20 * Math.log10(Math.max(1, distance_m));
  return { loss, model: "Point" };
}

// Helper to safely parse positive watts
function nW(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Round up to next 0.5 dB
function roundUpHalf(raw) {
  if (!Number.isFinite(raw)) return null;
  return Math.ceil(raw * 2) / 2;
}

// Convert 2.83V/1m sensitivity to 1W/1m
function convert2p83VTo1W(sens2p83V, impedanceOhm) {
  if (!Number.isFinite(sens2p83V) || !Number.isFinite(impedanceOhm) || impedanceOhm <= 0) return null;
  const volts = 2.83;
  const wattsAt2p83V = (volts * volts) / impedanceOhm;
  const delta = 10 * Math.log10(wattsAt2p83V / 1);
  return sens2p83V - delta;
}

// Mehlau-style continuous SPL at distance, with our constraints:
// - Sensitivity is 1 W / 1 m in HALF-SPACE
// - Power is limited by amplifier AND speaker max power
// - RadiationMode: 'anechoic' = -6 dB vs half-space
function computeContinuousSplAtDistanceConstrained({
  sensitivityDb1W1m,
  ampPowerW,
  speakerMaxPowerW,
  cf6MaxSpl1m,      // peak CF6 spec at 1 m, e.g. 114 for Evolve 2-1
  distanceM,
  radiationMode,     // 'half-space' | 'anechoic'
  screenLossDb = 0,
}) {
  const sens = Number.isFinite(sensitivityDb1W1m) ? sensitivityDb1W1m : 87;

  const P_amp = Math.max(0, Number(ampPowerW) || 0);
  const P_spk = Math.max(0, Number(speakerMaxPowerW) || 0);
  const P_avail = (P_amp && P_spk) ? Math.min(P_amp, P_spk) : (P_amp || P_spk || 0);

  if (!P_avail) return null;

  // 1) Theoretical half-space SPL @ 1 m from sensitivity + power
  const spl1mTheoreticalHalf = sens + 10 * Math.log10(P_avail);

  // 2) Apply CF6 peak ceiling at 1 m: peak cannot exceed cf6MaxSpl1m
  // If cf6MaxSpl1m is missing, just fall back to theoretical.
  let spl1mPeakHalf = spl1mTheoreticalHalf;
  if (Number.isFinite(cf6MaxSpl1m)) {
    spl1mPeakHalf = Math.min(spl1mTheoreticalHalf, cf6MaxSpl1m);
  }

  // 3) Convert peak CF6 → continuous by subtracting 6 dB crest factor
  let spl1mContHalf = spl1mPeakHalf - 6;

  // 4) Radiation mode: data is half-space; anechoic is -6 dB vs that
  if (radiationMode === "anechoic") {
    spl1mContHalf -= 6;
  }

  // 5) Distance & screen loss
  const dist = Math.max(1, Number(distanceM) || 1);
  const distanceLoss = 20 * Math.log10(dist); // 6 dB per doubling
  const screenLoss = Number(screenLossDb) || 0;

  const splAtSeat = spl1mContHalf - distanceLoss - screenLoss;

  return splAtSeat;
}

// Pure Mehlau-style continuous SPL (no CF6 limit, just power-constrained)
function computeMehlauContinuousSpl({
  sensitivityDb1W1m,
  ampPowerW,
  speakerMaxPowerW,
  distanceM,
  radiationMode,
  screenLossDb = 0,
}) {
  const sens = Number.isFinite(sensitivityDb1W1m) ? sensitivityDb1W1m : 87;
  
  const P_amp = Math.max(0, Number(ampPowerW) || 0);
  const P_spk = Math.max(0, Number(speakerMaxPowerW) || 0);
  const P_avail = (P_amp && P_spk) ? Math.min(P_amp, P_spk) : (P_amp || P_spk || 0);
  
  if (!P_avail) return null;
  
  // SPL at 1m in half-space
  let spl1mHalf = sens + 10 * Math.log10(P_avail);
  
  // Radiation mode adjustment
  if (radiationMode === "anechoic") {
    spl1mHalf -= 6;
  }
  
  // Distance & screen loss
  const dist = Math.max(1, Number(distanceM) || 1);
  const distanceLoss = 20 * Math.log10(dist);
  const screenLoss = Number(screenLossDb) || 0;
  
  return spl1mHalf - distanceLoss - screenLoss;
}


function _LEGACY_getSPL1mCapability(speaker, ampPower_W) {
  const P_amp = nW(ampPower_W);
  const P_spk = nW(speaker.power_handling_w || speaker.max_power);
  
  // Ceiling from speaker (Infinity if unknown, or 0 if 0)
  const P_ceiling_from_speaker = P_spk > 0 ? P_spk : Infinity;
  
  // Available power is minimum of amp and speaker (0 if amp missing or speaker has 0 power handling)
  const P_available = Math.min(P_amp || 0, P_ceiling_from_speaker);
  
  // Get sensitivity in 1W/1m terms (from speakerData.js)
  let sens_1W = safeNum(speaker.sensitivity_db_1w_1m || speaker.sensitivity);
  const sens_2p83V = safeNum(speaker.sensitivity_db_2v83_1m);
  const impedanceOhm = safeNum(speaker.impedance_ohm || speaker.impedance);
  
  // Convert if only 2.83V available
  if (sens_1W === null && sens_2p83V !== null) {
    const assumedZ = impedanceOhm !== null ? impedanceOhm : 8;
    sens_1W = convert2p83VTo1W(sens_2p83V, assumedZ);
  }
  
  // Compute amp-limited SPL: sensitivity + 10·log10(min(ampPower, speakerMaxPower))
  let SPL_1m_amp_limited = null;
  if (sens_1W !== null && P_available > 0) {
    SPL_1m_amp_limited = sens_1W + 10 * Math.log10(P_available);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL: Cap at max_spl_cont_db_1m from speakerData.js
  // This is the speaker's verified continuous max SPL at 1m — the physical limit
  // that cannot be exceeded regardless of amplifier power.
  // ─────────────────────────────────────────────────────────────────────────
  const SPL_1m_max_cont = safeNum(speaker.max_spl_cont_db_1m || speaker.max_spl);
  
  // Legacy RP1 field (fallback for comparators without max_spl_cont_db_1m)
  const SPL_1m_rp1 = safeNum(speaker.rp1_midTermRMS_dBZ_1m);
  
  // Determine the hard cap: prefer max_spl_cont_db_1m, fall back to rp1
  const hardCap = SPL_1m_max_cont !== null ? SPL_1m_max_cont : SPL_1m_rp1;
  
  // Determine capability (minimum of amp-limited and hard cap)
  let SPL_1m_capability = null;
  let method = "Unknown";
  let isVerified = false;
  let formula = null;
  let assumptionNote = null;
  let ampLimitWarning = false;
  
  if (SPL_1m_amp_limited !== null && hardCap !== null) {
    // Both available: use minimum (cap the amp-limited value)
    SPL_1m_capability = Math.min(SPL_1m_amp_limited, hardCap);
    method = SPL_1m_capability === hardCap ? "Max SPL Cap" : "Amp-limited";
    isVerified = SPL_1m_capability === hardCap; // Verified if capped by speaker spec
    if (method === "Amp-limited") {
      formula = `${sens_1W.toFixed(1)} dB + 10·log10(${Math.round(P_available)} W) = ${SPL_1m_capability.toFixed(1)} dB`;
      if (impedanceOhm === null && sens_2p83V !== null) {
        assumptionNote = "Assumed 8 Ω impedance for 2.83V → 1W conversion";
      }
    } else {
      formula = `Capped at speaker max: ${hardCap.toFixed(1)} dB`;
      // If amp power is less than speaker max but we're still hitting the cap, note it
      if (P_amp > 0 && P_spk > 0 && P_amp < P_spk && sens_1W === null) {
        ampLimitWarning = true;
      }
    }
  } else if (SPL_1m_amp_limited !== null) {
    // Only amp-limited available (no hard cap data)
    SPL_1m_capability = SPL_1m_amp_limited;
    method = "Amp-limited";
    isVerified = false;
    formula = `${sens_1W.toFixed(1)} dB + 10·log10(${Math.round(P_available)} W) = ${SPL_1m_capability.toFixed(1)} dB`;
    if (impedanceOhm === null && sens_2p83V !== null) {
      assumptionNote = "Assumed 8 Ω impedance for 2.83V → 1W conversion";
    }
  } else if (hardCap !== null) {
    // Only hard cap available (no sensitivity data for amp calc)
    SPL_1m_capability = hardCap;
    method = "Max SPL Cap";
    isVerified = true;
    formula = `Using speaker max: ${hardCap.toFixed(1)} dB`;
    // Check if amp is smaller than speaker and we can't reflect it
    if (P_amp > 0 && P_spk > 0 && P_amp < P_spk && sens_1W === null) {
      ampLimitWarning = true;
    }
  }
  
  return {
    value: SPL_1m_capability,
    method,
    isVerified,
    formula,
    assumptionNote,
    ampLimitWarning,
    // Expose for debugging/display
    _debug: {
      sens_1W,
      P_available,
      SPL_1m_amp_limited,
      hardCap,
    }
  };
}

// Legacy - no longer used
function _LEGACY_getDistanceLoss(speaker, distance_m) {
  if (!Number.isFinite(distance_m) || distance_m <= 0) return { loss: 0, model: "Unknown" };
  
  // Point source: 6 dB per doubling (20*log10)
  const loss = 20 * Math.log10(Math.max(1, distance_m));
  return { loss, model: "Point" };
}

// Legacy - no longer used
function _LEGACY_computeRequiredPowerForLevel(speaker, targetDb, screenLossDb, distanceLossDb, eqHeadroom_dB = 0) {
  // Get sensitivity in 1W/1m terms
  let sens_1W = safeNum(speaker.sensitivity_db_1w_1m || speaker.sensitivity);
  const sens_2p83V = safeNum(speaker.sensitivity_db_2v83_1m);
  const impedanceOhm = safeNum(speaker.impedance_ohm || speaker.impedance);
  
  // Convert if only 2.83V available
  if (sens_1W === null && sens_2p83V !== null) {
    const assumedZ = impedanceOhm !== null ? impedanceOhm : 8;
    sens_1W = convert2p83VTo1W(sens_2p83V, assumedZ);
  }
  
  if (sens_1W === null || !Number.isFinite(targetDb)) return null;
  
  // EQ headroom increases the required baseline (we need MORE capability to cover the EQ cut)
  const required_1m = targetDb + screenLossDb + distanceLossDb + eqHeadroom_dB;
  const requiredPower_W = Math.pow(10, (required_1m - sens_1W) / 10);
  
  return Number.isFinite(requiredPower_W) ? requiredPower_W : null;
}

// Reference playback level from room volume (A/85 bands)
function getReferencePlaybackLevel(volume_m3) {
  if (!Number.isFinite(volume_m3) || volume_m3 <= 0) return null;
  if (volume_m3 >= 566) return 85;
  if (volume_m3 >= 283) return 82;
  if (volume_m3 >= 142) return 80;
  if (volume_m3 >= 42) return 78;
  return 78; // Default for very small rooms
}

// RP22 level determination
function getRP22Level(splRSP, isScreen) {
  if (!Number.isFinite(splRSP)) return { level: null, label: "—" };
  
  const spec = isScreen ? RP22.LCR : RP22.SUR;
  const levels = spec.levels;
  
  // Find highest level achieved
  for (let i = levels.length - 1; i >= 0; i--) {
    if (splRSP >= levels[i].db) {
      return { level: levels[i].key, label: levels[i].key, db: levels[i].db };
    }
  }
  
  return { level: null, label: "Below L1", db: null };
}

// Status color helper
function rp22ColourStatus(splRSP, targetDb) {
  if (!Number.isFinite(splRSP) || !Number.isFinite(targetDb)) return "red";
  if (splRSP >= targetDb) return "green";
  if (targetDb - splRSP <= 3) return "gold";
  return "red";
}

function tileStyles(status = "neutral") {
  const base = {
    padding: 10,
    borderRadius: 8,
    border: `1px dashed ${BRAND.border}`,
    background: "#FFF",
  };
  if (status === "green") return { ...base, border: `1px solid ${BRAND.green}`, background: "rgba(42,110,63,0.08)" };
  if (status === "gold") return { ...base, border: `1px solid ${BRAND.gold}`, background: "rgba(180,138,58,0.08)" };
  if (status === "red") return { ...base, border: `1px solid ${BRAND.red}`, background: "rgba(122,30,25,0.08)" };
  return base;
}

function pillStyleForRP22(rp22) {
  const base = {
    minWidth: 52,
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  const label = rp22?.label || "—";

  if (label.startsWith("L4") || label === "Level 4") {
    return { ...base, background: "rgba(42,110,63,0.12)", color: BRAND.green, border: `1px solid ${BRAND.green}` };
  }
  if (label.startsWith("L3") || label === "Level 3") {
    return { ...base, background: "rgba(180,138,58,0.10)", color: BRAND.gold, border: `1px solid ${BRAND.gold}` };
  }
  if (label.startsWith("L2") || label === "Level 2") {
    return { ...base, background: "rgba(180,138,58,0.06)", color: BRAND.gold, border: `1px solid ${BRAND.gold}` };
  }
  if (label.startsWith("L1") || label === "Level 1") {
    return { ...base, background: "rgba(122,30,25,0.06)", color: BRAND.red, border: `1px solid ${BRAND.red}` };
  }
  if (label === "Below L1") {
    return { ...base, background: "rgba(122,30,25,0.06)", color: BRAND.red, border: `1px solid ${BRAND.red}` };
  }

  // No data
  return { ...base, background: "#F3F4F6", color: BRAND.subtext, border: `1px solid ${BRAND.border}` };
}


// Helper to format power with units
function formatPower(watts) {
  if (!Number.isFinite(watts)) return "—";
  const rounded = Math.ceil(watts);
  if (rounded >= 1000) {
    return `${(rounded / 1000).toFixed(2)} kW`;
  }
  return `${rounded} W`;
}

// RP22 SPL thresholds at RSP (continuous, post-EQ, no clipping)
function getRp22Thresholds(activeParam) {
  if (activeParam === 'P12') {
    // Parameter 12: Screen speakers
    return {
      L1: 102,
      L2: 105,
      L3: 108,
      L4: 111,
    };
  }
  // Parameter 13: Surrounds / non-screen
  return {
    L1: 99,
    L2: 102,
    L3: 105,
    L4: 108,
  };
}

function classifyRp22Level(activeParam, splAtSeatDb) {
  if (!Number.isFinite(splAtSeatDb)) return 'Below L1';

  const { L1, L2, L3, L4 } = getRp22Thresholds(activeParam);
  const spl = Number(splAtSeatDb);

  if (spl >= L4) return 'Level 4';
  if (spl >= L3) return 'Level 3';
  if (spl >= L2) return 'Level 2';
  if (spl >= L1) return 'Level 1';
  return 'Below L1';
}



// ---------- UI atoms ----------
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function inputStyle() {
  return {
    width: "100%",
    border: `1px solid ${BRAND.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    background: "#FFF",
    color: BRAND.text,
    fontSize: 14,
  };
}
function Button({ children, onClick, disabled, tone = "dark", title, className = "" }) {
  const map = { dark: BRAND.btn, blue: BRAND.blue, green: BRAND.green };
  const bg = map[tone] || BRAND.btn;
  const style = {
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${disabled ? BRAND.border : bg}`,
    background: disabled ? "#A0A0A0" : bg,
    color: BRAND.btnText,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style} title={title} className={className}>
      {children}
    </button>
  );
}

// Info icon with tooltip
function InfoIcon({ tooltip }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span 
      style={{ position: "relative", display: "inline-block", marginLeft: 4, cursor: "help" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BRAND.hint} strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      {showTooltip && tooltip && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginBottom: 8,
          padding: 8,
          borderRadius: 8,
          background: BRAND.text,
          color: "#FFF",
          fontSize: 11,
          whiteSpace: "pre-wrap",
          minWidth: 200,
          maxWidth: 300,
          zIndex: 1000,
          boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
        }}>
          {tooltip}
        </div>
      )}
    </span>
  );
}

// Warning box styles
const warnBox = {
  background: '#F9EDED',
  border: '2px solid #8B0000',
  color: '#1B1A1A',
  borderRadius: 8,
  padding: '10px 12px',
  lineHeight: 1.1,
  marginTop: 8
};
const warnText = { color: '#8B0000' };

// Speaker details panel
function SpeakerDetails({ speaker, showPrices }) {
  if (!speaker) {
    return (
      <div style={{ padding: 12, color: BRAND.subtext }}>
        Select a speaker to see details.
      </div>
    );
  }

  const DetailRow = ({ label, value }) =>
    value ? (
      <div>
        <span style={{ color: BRAND.subtext }}>{label}: </span>
        <span style={{ color: BRAND.text, fontWeight: 500 }}>{value}</span>
      </div>
    ) : null;

  const sensText = [
    speaker.sensitivity ? `${speaker.sensitivity} dB @ 1W/1m` : null,
    speaker.sensitivity_db_2v83_1m ? `(${speaker.sensitivity_db_2v83_1m} dB @ 2.83V)` : null
  ].filter(Boolean).join(" ");

  const powerText = [
    speaker.max_power ? `${speaker.max_power} W` : null,
    speaker.power_handling_vrms ? `(${speaker.power_handling_vrms} Vrms)` : null
  ].filter(Boolean).join(" ");

  const maxSplText = [
    speaker.max_spl_cont_db_1m ? `${speaker.max_spl_cont_db_1m} dB cont` : null,
    speaker.max_spl_peak_db_cf6_1m ? `${speaker.max_spl_peak_db_cf6_1m} dB peak (CF6)` : null
  ].filter(Boolean).join(", ");

  const freqRangeText = Array.isArray(speaker.frequency_range_hz)
    ? `${speaker.frequency_range_hz[0].toLocaleString().replace(",", " ")}–${speaker.frequency_range_hz[1].toLocaleString().replace(",", " ")} Hz`
    : null;
    
  const coverageText = speaker.coverage_deg
    ? `H ${speaker.coverage_deg.horizontal}° / V ${speaker.coverage_deg.vertical}°`
    : null;

  return (
    <div style={{ padding: 12, fontSize: 13, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text, marginBottom: '6px' }}>
        {speaker.brand} {speaker.model}
      </div>
      <DetailRow label="Sensitivity" value={sensText} />
      <DetailRow label="Max Power" value={powerText} />
      <DetailRow label="Max SPL" value={maxSplText} />
      <DetailRow label="Impedance" value={speaker.impedance_ohm ? `${speaker.impedance_ohm} Ω` : null} />
      <DetailRow label="Frequency Range" value={freqRangeText} />
      <DetailRow label="Usable LF (−6 dB)" value={speaker.usable_lf_response_hz_minus6 ? `${speaker.usable_lf_response_hz_minus6} Hz` : null} />
      <DetailRow label="Coverage" value={coverageText} />
      {showPrices && speaker.price != null && <DetailRow label="Price" value={`£${speaker.price.toLocaleString()}`} />}
      {speaker.description && !speaker.transducers && <div style={{ marginTop: 6, color: BRAND.hint, fontStyle: 'italic' }}>{speaker.description}</div>}
    </div>
  );
}

// Logo URL from layout
const ARTCOUSTIC_LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

export default function SPLCalculatorPage() {
  const activeId = useActiveProjectId();

  // Use shared room dimensions hook (read-only mode - no setDims needed)
  const { 
    dims, 
    loadDims, 
    loaded: dimsLoaded,
  } = useRoomDimensions(activeId);

  // Load dimensions on mount
  useEffect(() => {
    if (activeId) {
      loadDims(activeId);
    } else {
      loadDims(null);
    }
  }, [loadDims, activeId]);

  // Build speaker list from dataset
  const artcousticVisible = useMemo(() => {
    if (!Array.isArray(artcousticSpeakers)) {
      console.warn("Speaker dataset not loaded correctly");
      return [];
    }
    return artcousticSpeakers.filter((s) => !isSubwooferEntry(s) && !s.hidden);
  }, []);

  // RP22 mode & level
  const [mode, setMode] = useState("LCR");
  const spec = mode === "LCR" ? RP22.LCR : RP22.SUR;

  // Distance and amplifier power
  const [distance, setDistance] = useState("3.0");
  const [ampPower, setAmpPower] = useState("100");

  // Screen/fabric loss - simplified to single numeric input
  const [screenLoss_dB, setScreenLoss_dB] = useState(0);
  
  // Show prices toggle
  const [showPrices, setShowPrices] = useState(false);

  // Radiation Mode state
  const [radiationMode, setRadiationMode] = useState('half-space');

  // Artcoustic primary
  const [artId, setArtId] = useState("");
  const art = useMemo(() => artcousticVisible.find((s) => s.id === artId) || null, [artId, artcousticVisible]);

  // Auto-select first speaker if current selection is invalid
  useEffect(() => {
    if (artcousticVisible.length > 0) {
      if (!artId || !artcousticVisible.find(s => s.id === artId)) {
        const firstId = artcousticVisible[0].id;
        setArtId(firstId);
      }
    }
  }, [artId, artcousticVisible]);

  // Third‑party comparators (REMOVED isLineSource field)
  const [comparators, setComparators] = useState([
    { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8", max_spl_1m: "" },
  ]);
  const addComparator = () => {
    if (comparators.length >= 2) return;
    setComparators((prev) => [...prev, { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8", max_spl_1m: "" }]);
  };
  const updateComparator = (idx, patch) => setComparators((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const removeComparator = (idx) => setComparators((prev) => prev.filter((_, i) => i !== idx));

  // Parsed inputs (dims now come from shared state, read-only)
  const d = safeNum(distance);
  const P = safeNum(ampPower);
  const screenLossDb = screenLoss_dB || 0;
  const W = dims.width_m || 0;
  const L = dims.length_m || 0;
  const H = dims.height_m || 0;
  const volume_m3 = dims.width_m && dims.length_m && dims.height_m 
    ? dims.width_m * dims.length_m * dims.height_m 
    : 0;

  // Reference playback level
  const referencePlaybackLevel = getReferencePlaybackLevel(volume_m3);

  // Use unified SPL engine for Artcoustic speaker
  const artCalculatedSpl = useMemo(() => {
    if (!art || !d || !P) return null;
    const result = computeSingleSeatSplAtDistance({
      speakerModelId: art.id,
      distance_m: d,
      powerW: P,
      radiationMode,
      screenLoss_dB: screenLossDb,
      eqHeadroom_dB: 0,
    });
    
    // Debug logging
    console.log('[SPLCalc] mode=', radiationMode, 'spl@seat=', result?.spl_continuous_db_at_seat?.toFixed(1), 'peak@seat=', result?.spl_peak_cf6_db_at_seat?.toFixed(1), 'distance=', d, 'power=', P);
    
    return result;
  }, [art, d, P, radiationMode, screenLossDb]);

  const artSPL_RSP = (artCalculatedSpl?.spl_continuous_db_at_seat ?? null) !== null
    ? roundUpHalf(artCalculatedSpl.spl_continuous_db_at_seat)
    : null;

  const artPeakSplAtSeat = (artCalculatedSpl?.spl_peak_cf6_db_at_seat ?? null) !== null
    ? roundUpHalf(artCalculatedSpl.spl_peak_cf6_db_at_seat)
    : null;

  // Collect issues for mini report
  const allIssues = useMemo(() => {
    const issues = [];
    
    // Check Artcoustic speaker
    if (art && artCalculatedSpl) {
      const targetL1 = mode === "LCR" ? 102 : 99;
      const splAtSeat = artCalculatedSpl.spl_continuous_db_at_seat;
      
      if (splAtSeat !== null && splAtSeat < targetL1) {
        issues.push(`${art.brand} ${art.model}: insufficient continuous SPL for Level 1 (${splAtSeat.toFixed(1)} dB < ${targetL1} dB)`);
      }
      
      const powerHandling = safeNum(art.power_handling_w || art.max_power);
      if (Number.isFinite(P) && Number.isFinite(powerHandling) && P > powerHandling) {
        issues.push(`${art.brand} ${art.model}: amplifier power (${Math.ceil(P)} W) exceeds speaker max (${Math.ceil(powerHandling)} W)`);
      }
    }
    
    // Check comparators
    comparators.forEach((c) => {
      if (!c.brand && !c.model) return;

      let sens_1W = null;
      if (c.sensUnit === "1W@1m") {
        sens_1W = safeNum(c.sensitivity);
      } else if (c.sensUnit === "2.83V@1m") {
        const sens2p83V = safeNum(c.sensitivity);
        const impedanceOhm = safeNum(c.nominalOhms) || 8;
        if (sens2p83V !== null) {
          sens_1W = convert2p83VTo1W(sens2p83V, impedanceOhm);
        }
      }

      // Compute unified continuous SPL at seat for comparator
      // max_spl_1m is treated as CF6 peak @ 1m
      const compSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
        sensitivityDb1W1m: sens_1W,
        ampPowerW: P,
        speakerMaxPowerW: safeNum(c.max_power),
        cf6MaxSpl1m: safeNum(c.max_spl_1m),
        distanceM: d,
        radiationMode,
        screenLossDb,
      });

      const targetL1 = mode === "LCR" ? 102 : 99;

      if (compSplContinuousAtSeat !== null && compSplContinuousAtSeat < targetL1) {
        issues.push(`${c.brand} ${c.model}: insufficient continuous SPL for Level 1 (${compSplContinuousAtSeat.toFixed(1)} dB < ${targetL1} dB)`);
      }

      const powerHandling = safeNum(c.max_power);
      if (Number.isFinite(P) && Number.isFinite(powerHandling) && P > powerHandling) {
        issues.push(`${c.brand} ${c.model}: amplifier power (${Math.ceil(P)} W) exceeds speaker max (${Math.ceil(powerHandling)} W)`);
      }
    });
    
    return issues;
  }, [art, artCalculatedSpl, comparators, mode, d, P, radiationMode, screenLossDb]);


  // Export PDF handler
  function handleExportPdf() {
    const oldTitle = document.title;
    const projectName = activeId || 'SPL Report';
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');
    document.title = `SPL Report — ${projectName} — ${yyyy}-${mm}-${dd}`;
    
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = oldTitle; }, 0);
    }, 30);
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Print-only header */}
      <div id="spl-print-header" aria-hidden="true">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <img src={ARTCOUSTIC_LOGO_URL} alt="Artcoustic" style={{ height:18 }} />
            <span style={{ fontSize:12, fontWeight:600 }}>SPL Comparison Report</span>
          </div>
          <div style={{ fontSize:12, textAlign:'right' }}>
            <div>{new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            <div>Project: {activeId || 'Untitled'}</div>
          </div>
        </div>
      </div>

      <div id="spl-printable">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, margin: 0, color: BRAND.text }}>SPL Calculator</h1>
        </div>

        {/* Controls */}
        <div
          style={{
            background: BRAND.panel,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          {/* RP22 selector */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }} className="no-print">
            <button
              onClick={() => setMode("LCR")}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${mode === "LCR" ? BRAND.btn : BRAND.border}`,
                background: mode === "LCR" ? BRAND.btn : "#FFF",
                color: mode === "LCR" ? "#FFF" : BRAND.text,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              LCR (Param 12)
            </button>
            <button
              onClick={() => setMode("SUR")}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${mode === "SUR" ? BRAND.btn : BRAND.border}`,
                background: mode === "SUR" ? BRAND.btn : "#FFF",
                color: mode === "SUR" ? "#FFF" : BRAND.text,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Surrounds (Param 13)
            </button>
          </div>

          {/* Print-only mode indicator */}
          <div style={{ display: 'none', fontSize: 14, fontWeight: 600, marginBottom: 12, color: BRAND.text }} className="print-only-mode">
            Mode: {mode === "LCR" ? "LCR (Parameter 12)" : "Surrounds (Parameter 13)"}
          </div>

          {/* Distance + Amp power */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Listening Distance (m)">
              <input
                inputMode="decimal"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="e.g. 3.0"
                style={inputStyle()}
                className="no-print"
              />
              <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                {d ? `${d.toFixed(2)} m` : '—'}
              </span>
            </Field>
            <div>
              <label style={{ display: "block", fontSize: 13, color: BRAND.subtext, marginBottom: 6 }}>
                Amplifier Power (W)
              </label>
              <input
                inputMode="numeric"
                placeholder="e.g. 100"
                value={ampPower}
                onChange={(e) => setAmpPower(e.target.value)}
                style={inputStyle()}
                aria-label="Amplifier power in watts"
                className="no-print"
              />
              <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                {P ? `${Math.ceil(P)} W` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Inputs & Speaker Selection */}
        <div
          style={{
            background: BRAND.panel,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 18, margin: 0, marginBottom: 12, color: BRAND.text }}>Inputs & Speaker Selection</h2>

          {/* Artcoustic selector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Artcoustic Speaker">
              <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.panel, padding: 6, maxHeight: 320, overflowY: 'auto' }} className="no-print">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {artcousticVisible.map((opt) => {
                    // Compute unified continuous SPL at seat for Artcoustic speaker
                    const optSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                      sensitivityDb1W1m: opt.sensitivity,
                      ampPowerW: P,
                      speakerMaxPowerW: opt.max_power,
                      cf6MaxSpl1m: opt.max_spl_peak_db_cf6_1m,
                      distanceM: d || 3,
                      radiationMode,
                      screenLossDb,
                    });
                    const optSPL_RSP = optSplContinuousAtSeat !== null
                      ? roundUpHalf(optSplContinuousAtSeat)
                      : null;

                    // Compute RP22 level for this option
                    const activeParam = mode === "LCR" ? 'P12' : 'P13';
                    const optRP22Label = classifyRp22Level(activeParam, optSplContinuousAtSeat);
                    const optRP22 = { label: optRP22Label };

                    return (
                      <div
                        key={opt.id}
                        onClick={() => setArtId(opt.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `2px solid ${artId === opt.id ? BRAND.blue : 'transparent'}`,
                          background: artId === opt.id ? 'rgba(27, 78, 122, 0.08)' : BRAND.panel,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.brand} {opt.model}</div>
                          <div style={{ fontSize: 12, color: BRAND.subtext }}>
                            {opt.sensitivity ? `${opt.sensitivity} dB, ` : ""}{opt.max_power} W{showPrices && Number.isFinite(opt.price) ? `, £${opt.price?.toLocaleString()}` : ""}
                          </div>
                        </div>
                        <div style={pillStyleForRP22(optRP22)}>
                          {optRP22.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                {art ? `${art.brand} ${art.model}` : '—'}
              </div>
            </Field>

            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: "#FFF" }}>
               <SpeakerDetails speaker={art} showPrices={showPrices} />
            </div>
          </div>

          {/* Comparators */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Compare Other Speakers</h3>
              <Button onClick={addComparator} disabled={comparators.length >= 2} title="Add another comparator" className="no-print">+ Add</Button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {comparators.map((c, idx) => {
                // Step 1: Compute display sensitivity
                let sens_1W_display = null;
                let sens_1W_for_calc = null;
                
                if (c.sensUnit === "1W@1m") {
                  sens_1W_display = safeNum(c.sensitivity);
                  sens_1W_for_calc = sens_1W_display;
                } else if (c.sensUnit === "2.83V@1m") {
                  const sens2p83V = safeNum(c.sensitivity);
                  const impedanceOhm = safeNum(c.nominalOhms) || 8;
                  if (sens2p83V !== null) {
                    sens_1W_for_calc = convert2p83VTo1W(sens2p83V, impedanceOhm);
                    sens_1W_display = sens2p83V; // Display 2.83V value
                  }
                }

                // Step 2: Build speaker object
                const compSpeaker = {
                  brand: c.brand,
                  model: c.model,
                  sensitivity_db_1w_1m: sens_1W_for_calc,
                  sensitivity_db_2v83_1m: c.sensUnit === "2.83V@1m" ? safeNum(c.sensitivity) : null,
                  impedance_ohm: safeNum(c.nominalOhms),
                  max_power: safeNum(c.max_power),
                  power_handling_w: safeNum(c.max_power),
                  rp1_midTermRMS_dBZ_1m: safeNum(c.max_spl_1m),
                };

                // Compute unified continuous SPL at seat for comparator status indicator
                const compSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                  sensitivityDb1W1m: sens_1W_for_calc,
                  ampPowerW: P,
                  speakerMaxPowerW: safeNum(c.max_power),
                  cf6MaxSpl1m: safeNum(c.max_spl_1m),
                  distanceM: d || 3,
                  radiationMode,
                  screenLossDb,
                });
                
                const compSPL_RSP = compSplContinuousAtSeat !== null
                  ? roundUpHalf(compSplContinuousAtSeat)
                  : null;
                const compRP22Level = compSPL_RSP !== null ? getRP22Level(compSPL_RSP, mode === "LCR").label : "—";

                const compPowerHandling = safeNum(c.max_power);
                const compAmpExceeds = Number.isFinite(P) && Number.isFinite(compPowerHandling) && compPowerHandling > 0 && P > compPowerHandling;

                return (
                  <div key={idx} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                      <Field label="Brand">
                        <input value={c.brand} onChange={(e) => updateComparator(idx, { brand: e.target.value })} style={inputStyle()} placeholder="e.g. OtherBrand" className="no-print" />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {c.brand || '—'}
                        </span>
                      </Field>
                      <Field label="Model">
                        <input value={c.model} onChange={(e) => updateComparator(idx, { model: e.target.value })} style={inputStyle()} placeholder="e.g. X100" className="no-print" />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {c.model || '—'}
                        </span>
                      </Field>
                      <Field label="Sensitivity (dB)">
                        <input value={c.sensitivity} onChange={(e) => updateComparator(idx, { sensitivity: e.target.value })} style={inputStyle()} placeholder="e.g. 90" inputMode="decimal" className="no-print" />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {safeNum(c.sensitivity) ? `${c.sensitivity} dB` : '—'}
                        </span>
                      </Field>
                      <Field label="Max Power (W)">
                        <input value={c.max_power} onChange={(e) => updateComparator(idx, { max_power: e.target.value })} style={inputStyle()} placeholder="e.g. 150" inputMode="decimal" className="no-print" />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {safeNum(c.max_power) ? `${c.max_power} W` : '—'}
                        </span>
                      </Field>
                      <Field label="Price (£)">
                        <input value={c.price} onChange={(e) => updateComparator(idx, { price: e.target.value })} style={inputStyle()} placeholder="e.g. 1500" inputMode="decimal" className="no-print" />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {safeNum(c.price) ? `£${Number(c.price).toLocaleString()}` : '—'}
                        </span>
                      </Field>
                      <Field label="Max SPL @ 1m (CF6 peak, optional)">
                        <input
                          value={c.max_spl_1m || ""}
                          onChange={(e) => updateComparator(idx, { max_spl_1m: e.target.value })}
                          style={inputStyle()}
                          placeholder="e.g. 115"
                          inputMode="decimal"
                          className="no-print"
                          title="Peak SPL @ 1m with CF6 (6 dB crest factor)"
                        />
                        <span className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                          {safeNum(c.max_spl_1m) ? `${c.max_spl_1m} dB` : '—'}
                        </span>
                      </Field>
                    </div>
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} className="no-print">
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>Sensitivity Spec</label>
                        <select value={c.sensUnit} onChange={(e) => updateComparator(idx, { sensUnit: e.target.value })} style={{ ...inputStyle(), padding: "8px 10px" }}>
                          <option value="1W@1m">dB @ 1 W / 1 m</option>
                          <option value="2.83V@1m">dB @ 2.83 V / 1 m</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>Nominal Impedance (Ω)</label>
                        <input inputMode="numeric" value={c.nominalOhms} onChange={(e) => updateComparator(idx, { nominalOhms: e.target.value })} style={{ ...inputStyle(), padding: "8px 10px" }} placeholder="e.g. 8" disabled={c.sensUnit === "1W@1m"} />
                      </div>
                    </div>
                    <div className="print-only-value" style={{ display: 'none', padding: '10px 12px', fontSize: 14 }}>
                        <div style={{display: 'flex', gap: '16px', marginTop: 8}}>
                          <div>Sensitivity Spec: {c.sensUnit === "1W@1m" ? "1W/1m" : "2.83V/1m"}</div>
                          {c.sensUnit === "2.83V@1m" && <div>Nominal Impedance: {c.nominalOhms || '—'} Ω</div>}
                        </div>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }} className="no-print">
                      <Button onClick={() => removeComparator(idx)} title="Remove comparator">Remove</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Comparison Output */}
        <SegmentBoundary name="SPLCalculatorResults">
          <div id="calculator-printable" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 18, margin: 0, marginBottom: 12, color: BRAND.text }}>Comparison</h2>

            {/* Grid header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.5fr", gap: 8, fontSize: 13, marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>Speaker</div>
              <div style={{ fontWeight: 600 }}>Sensitivity</div>
              <div style={{ fontWeight: 600 }}>Max Power</div>
              <div style={{ fontWeight: 600 }}>SPL @ {d || 3}m</div>
              <div style={{ fontWeight: 600 }}>RP22 Level</div>
              <div style={{ fontWeight: 600 }}>Power to RP22</div>
            </div>

            {/* Artcoustic row */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.5fr", gap: 8, alignItems: "stretch" }}>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                <div>
                  {art
                    ? `${art.brand} ${art.model}` + (showPrices && Number.isFinite(art.price) ? ` — £${art.price?.toLocaleString()}` : "")
                    : "—"}
                </div>
              </div>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                {art?.sensitivity ? `${art.sensitivity} dB @1W/1m` : "—"}
              </div>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                {art?.max_power ? `${art.max_power} W` : "—"}
                {art && nW(P) > 0 && nW(art.max_power) > 0 && nW(P) > nW(art.max_power) && (
                  <div style={warnBox} role="alert" aria-live="polite">
                    {`${Math.ceil(P)} W > ${Math.ceil(nW(art.max_power))} W`}
                  </div>
                )}
              </div>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                {(() => {
                  if (!art || !d || !P) return "—";
                  
                  // Unified continuous SPL at seat for Artcoustic (main value for display and RP22)
                  const artSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                    sensitivityDb1W1m: art.sensitivity,
                    ampPowerW: P,
                    speakerMaxPowerW: art.max_power,
                    cf6MaxSpl1m: art.max_spl_peak_db_cf6_1m,
                    distanceM: d,
                    radiationMode,
                    screenLossDb,
                  });
                  
                  // Pure Mehlau (for comparison/debugging if needed)
                  const mehlauSpl = computeMehlauContinuousSpl({
                    sensitivityDb1W1m: art.sensitivity,
                    ampPowerW: P,
                    speakerMaxPowerW: art.max_power,
                    distanceM: d,
                    radiationMode,
                    screenLossDb,
                  });
                  
                  // Peak at seat (CF6 limit with radiation mode)
                  let peakAtSeat = null;
                  if (Number.isFinite(art.max_spl_peak_db_cf6_1m)) {
                    let peak1m = art.max_spl_peak_db_cf6_1m;
                    if (radiationMode === 'anechoic') {
                      peak1m -= 6;
                    }
                    const distLoss = 20 * Math.log10(Math.max(1, d));
                    peakAtSeat = peak1m - distLoss - (screenLossDb || 0);
                  }
                  
                  return (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>
                        {artSplContinuousAtSeat !== null ? `${roundUpHalf(artSplContinuousAtSeat).toFixed(1)} dB(C)` : "—"}
                      </div>
                      {mehlauSpl !== null && artSplContinuousAtSeat !== null && Math.abs(mehlauSpl - artSplContinuousAtSeat) > 0.5 && (
                        <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>
                          Unconstrained: {roundUpHalf(mehlauSpl).toFixed(1)} dB(C)
                        </div>
                      )}
                      {peakAtSeat !== null && (
                        <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 2 }}>
                          Peak (CF6): {roundUpHalf(peakAtSeat).toFixed(1)} dB
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div style={{ padding: 10, border: `2px solid ${BRAND.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(() => {
                  if (!art || !d || !P) return "—";
                  
                  const activeParam = mode === "LCR" ? 'P12' : 'P13';
                  
                  // Unified continuous SPL at seat (same as display above)
                  const artSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                    sensitivityDb1W1m: art.sensitivity,
                    ampPowerW: P,
                    speakerMaxPowerW: art.max_power,
                    cf6MaxSpl1m: art.max_spl_peak_db_cf6_1m,
                    distanceM: d,
                    radiationMode,
                    screenLossDb,
                  });
                  
                  const rp22LevelLabel = classifyRp22Level(activeParam, artSplContinuousAtSeat);
                  
                  return (
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 500,
                        color: '#1B1A1A',
                      }}
                    >
                      {rp22LevelLabel}
                    </div>
                  );
                })()}
              </div>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                {(() => {
                  if (!art || !d || !P) return "—";
                  
                  const activeParam = mode === "LCR" ? 'P12' : 'P13';
                  
                  // Unified continuous SPL at seat (same as display and RP22 level)
                  const artSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                    sensitivityDb1W1m: art.sensitivity,
                    ampPowerW: P,
                    speakerMaxPowerW: art.max_power,
                    cf6MaxSpl1m: art.max_spl_peak_db_cf6_1m,
                    distanceM: d,
                    radiationMode,
                    screenLossDb,
                  });
                  
                  const rp22LevelLabel = classifyRp22Level(activeParam, artSplContinuousAtSeat);
                  
                  const powerToRp22Text =
                    rp22LevelLabel === 'Below L1'
                      ? 'Level 1 not achieved'
                      : `${rp22LevelLabel} achieved`;

                  return <div>{powerToRp22Text}</div>;
                })()}
              </div>
            </div>

            {/* Comparator rows */}
            {comparators.map((c, idx) => {
              // Convert 2.83V sensitivity to 1W if needed
              let sens_1W_display = null;
              let sens_1W_for_calc = null;
              
              if (c.sensUnit === "1W@1m") {
                sens_1W_display = safeNum(c.sensitivity);
                sens_1W_for_calc = sens_1W_display;
              } else if (c.sensUnit === "2.83V@1m") {
                const sens2p83V = safeNum(c.sensitivity);
                const impedanceOhm = safeNum(c.nominalOhms) || 8;
                if (sens2p83V !== null) {
                  sens_1W_for_calc = convert2p83VTo1W(sens2p83V, impedanceOhm);
                  sens_1W_display = sens2p83V;
                }
              }

              const compPowerHandling = safeNum(c.max_power);
              const compAmpExceeds = Number.isFinite(P) && Number.isFinite(compPowerHandling) && compPowerHandling > 0 && P > compPowerHandling;

              // Unified continuous SPL at seat for comparator (main value for display and RP22)
              // max_spl_1m is treated as CF6 peak @ 1m
              const compSplContinuousAtSeat = computeContinuousSplAtDistanceConstrained({
                sensitivityDb1W1m: sens_1W_for_calc,
                ampPowerW: P,
                speakerMaxPowerW: compPowerHandling,
                cf6MaxSpl1m: safeNum(c.max_spl_1m),
                distanceM: d,
                radiationMode,
                screenLossDb,
              });
              
              // Pure Mehlau (for comparison if constrained differs)
              const mehlauSpl = computeMehlauContinuousSpl({
                sensitivityDb1W1m: sens_1W_for_calc,
                ampPowerW: P,
                speakerMaxPowerW: compPowerHandling,
                distanceM: d,
                radiationMode,
                screenLossDb,
              });
              
              // Peak at seat (if max_spl_1m provided as CF6 peak)
              let peakAtSeat = null;
              const maxSpl1mCF6 = safeNum(c.max_spl_1m);
              if (Number.isFinite(maxSpl1mCF6) && d) {
                let peak1m = maxSpl1mCF6;
                if (radiationMode === 'anechoic') {
                  peak1m -= 6;
                }
                const distLoss = 20 * Math.log10(Math.max(1, d));
                peakAtSeat = peak1m - distLoss - (screenLossDb || 0);
              }

              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.5fr", gap: 8, marginTop: 8, alignItems: "stretch" }}>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    <div>
                      {`${c.brand || "—"} ${c.model || ""}`.trim()}
                      {showPrices && Number.isFinite(safeNum(c.price)) ? ` — £${Number(safeNum(c.price)).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    {sens_1W_display !== null ? `${sens_1W_display.toFixed(1)} dB ${c.sensUnit === "1W@1m" ? "@1W/1m" : "@2.83V/1m"}` : "—"}
                  </div>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    {compPowerHandling ? `${compPowerHandling} W` : "—"}
                    {compAmpExceeds && (
                      <div style={warnBox} role="alert" aria-live="polite">
                        {`${Math.ceil(P)} W > ${Math.ceil(compPowerHandling)} W`}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    {(() => {
                      if (compSplContinuousAtSeat === null) return "—";
                      
                      return (
                        <>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {roundUpHalf(compSplContinuousAtSeat).toFixed(1)} dB(C)
                          </div>
                          {mehlauSpl !== null && Math.abs(mehlauSpl - compSplContinuousAtSeat) > 0.5 && (
                            <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>
                              Unconstrained: {roundUpHalf(mehlauSpl).toFixed(1)} dB(C)
                            </div>
                          )}
                          {peakAtSeat !== null && (
                            <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 2 }}>
                              Peak (CF6): {roundUpHalf(peakAtSeat).toFixed(1)} dB
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ padding: 10, border: `2px solid ${BRAND.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(() => {
                      const activeParam = mode === "LCR" ? 'P12' : 'P13';
                      const compRp22LevelLabel = classifyRp22Level(activeParam, compSplContinuousAtSeat);
                      
                      return (
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 500,
                            color: '#1B1A1A',
                          }}
                        >
                          {compRp22LevelLabel}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    {(() => {
                      const activeParam = mode === "LCR" ? 'P12' : 'P13';
                      const compRp22LevelLabel = classifyRp22Level(activeParam, compSplContinuousAtSeat);
                      
                      const compPowerToRp22Text =
                        compRp22LevelLabel === 'Below L1'
                          ? 'Level 1 not achieved'
                          : `${compRp22LevelLabel} achieved`;

                      return <div>{compPowerToRp22Text}</div>;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </SegmentBoundary>

        {/* Attention section */}
        {allIssues.length > 0 && (
          <div
            style={{
              background: BRAND.panel,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 20,
              marginTop: 16,
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0, marginBottom: 8, color: '#8B0000' }}>
              Attention
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
              {allIssues.map((issue, idx) => (
                <li key={idx} style={{ color: '#8B0000' }}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Controls toolbar */}
        <div style={{ marginTop: 16, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24, flexWrap: "wrap" }} className="no-print">
          {/* Show Prices toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.subtext }}>Show Prices</label>
            <button
              type="button"
              onClick={() => setShowPrices(!showPrices)}
              aria-pressed={showPrices ? "true" : "false"}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${showPrices ? BRAND.green : BRAND.border}`,
                background: showPrices ? "rgba(42,110,63,0.08)" : "#FFF",
                color: BRAND.text,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {showPrices ? "On" : "Off"}
            </button>
          </div>

          {/* Radiation Mode control */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.subtext }}>Radiation Mode</label>
            <div style={{ display: "flex", gap: 4, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 2, background: "#FFF" }}>
              <button
                type="button"
                onClick={() => setRadiationMode('half-space')}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: radiationMode === 'half-space' ? BRAND.btn : "transparent",
                  color: radiationMode === 'half-space' ? BRAND.btnText : BRAND.text,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: radiationMode === 'half-space' ? 600 : 400,
                }}
                aria-pressed={radiationMode === 'half-space' ? "true" : "false"}
              >
                Half-Space
              </button>
              <button
                type="button"
                onClick={() => setRadiationMode('anechoic')}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: radiationMode === 'anechoic' ? BRAND.btn : "transparent",
                  color: radiationMode === 'anechoic' ? BRAND.btnText : BRAND.text,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: radiationMode === 'anechoic' ? 600 : 400,
                }}
                aria-pressed={radiationMode === 'anechoic' ? "true" : "false"}
              >
                Anechoic
              </button>
            </div>
          </div>

          {/* Screen Loss control */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: BRAND.subtext }}>Screen Loss</span>
            <div style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: "0 10px",
              height: 34,
              background: "#fff"
            }}>
              <span style={{ color: "#1B1A1A", marginRight: 4 }}>–</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={Number.isFinite(screenLoss_dB) ? screenLoss_dB : 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setScreenLoss_dB(Number.isFinite(v) ? v : 0);
                }}
                style={{
                  width: 60,
                  border: "none",
                  outline: "none",
                  textAlign: "right",
                  fontSize: 14,
                  color: "#1B1A1A",
                  background: "transparent"
                }}
                aria-label="Screen loss in dB"
                placeholder="0.0"
              />
            </div>
            <span style={{ fontSize: 13, color: BRAND.subtext }}>dB</span>
          </div>

          {/* Export PDF button */}
          <button
            type="button"
            className="no-print"
            onClick={handleExportPdf}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn,
              color: BRAND.btnText,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
            title="Export to PDF"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PDF
          </button>
        </div>

        {/* Print-only parameter summary */}
        <div className="print-only-params" style={{ display: 'none', marginTop: 16, marginBottom: 16, padding: 12, border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAF9' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Calculation Parameters</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
            <div>Radiation Mode: {radiationMode === 'half-space' ? 'Half-Space' : 'Anechoic'}</div>
            <div>Screen Loss: –{screenLoss_dB.toFixed(1)} dB</div>
            <div>Distance: {d ? `${d.toFixed(2)} m` : '—'}</div>
            <div>Amplifier Power: {P ? `${Math.ceil(P)} W` : '—'}</div>
            <div>Room Volume: {volume_m3.toFixed(2)} m³</div>
            <div>Calibration: {referencePlaybackLevel} dB(C)</div>
          </div>
        </div>

        {/* RP22 Reference (footer) */}
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: `1px dashed ${BRAND.border}`,
            borderRadius: 8,
            background: "#FFFFFF",
            fontSize: 12,
            color: BRAND.subtext,
            lineHeight: 1.5,
          }}
          data-testid="rp22-reference"
        >
          <div style={{ fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>
            RP22 Reference
          </div>

          <div style={{ fontWeight: 700, color: BRAND.text, marginTop: 8 }}>
            RP22 Parameter 12 (Screen):
          </div>
          <div>
            Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping
          </div>
          <div>
            Levels: L1 102 dB(C), L2 105 dB(C), L3 108 dB(C), L4 111 dB(C).
          </div>

          <div style={{ fontWeight: 700, color: BRAND.text, marginTop: 12 }}>
            RP22 Parameter 13 (Non-screen/Surrounds):
          </div>
          <div>
            Non-screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping
          </div>
          <div>
            Levels: L1 99 dB(C), L2 102 dB(C), L3 105 dB(C), L4 108 dB(C).
          </div>
        </div>
      </div>

      {/* Print-only footer */}
      <div id="spl-print-footer" aria-hidden="true">
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#3E4349' }}>
          <span>Generated by Artcoustic Loudspeakers</span>
          <span className="page-number"></span>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          /* Page setup with 57% scale */
          @page { 
            size: A4 portrait; 
            margin: 12mm;
            scale: 0.57;
          }

          /* Hide interactive UI */
          .no-print,
          .no-print * { 
            display: none !important; 
          }

          /* Hide nav/sidebar */
          #sidebar,
          .sidebar,
          nav,
          aside,
          #main-menu,
          .app-sidebar,
          [data-sidebar],
          .group\\/sidebar-wrapper > [role="complementary"] {
            display: none !important;
            visibility: hidden !important;
          }

          /* Show print-only elements */
          .print-only-mode,
          .print-only-value,
          .print-only-params { 
            display: block !important; 
          }

          /* Show header/footer and position them */
          #spl-print-header,
          #spl-print-footer { 
            display: block !important; 
          }
          
          #spl-print-header {
            position: running(header);
            padding-bottom: 6mm; 
            border-bottom: 1px solid #E5E7EB;
            margin-bottom: 6mm;
          }
          
          #spl-print-footer {
            position: fixed; 
            bottom: 0; 
            left: 0; 
            right: 0; 
            padding-top: 6mm; 
            border-top: 1px solid #E5E7EB;
            width: 100%;
            box-sizing: border-box;
            background-color: white;
          }

          /* Reserve space for header/footer */
          #spl-printable { 
            padding-top: 8mm; 
            padding-bottom: 18mm; 
          }

          /* Tables: repeat headers, avoid splitting rows */
          thead { 
            display: table-header-group; 
          }
          
          tfoot { 
            display: table-footer-group; 
          }
          
          tr, td, th { 
            page-break-inside: avoid; 
          }

          /* Avoid breaking cards/tiles */
          .card, 
          .tile,
          [style*="border"][style*="borderRadius"] { 
            break-inside: avoid; 
            page-break-inside: avoid; 
          }

          /* Neutralize backgrounds for clarity */
          * { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }

          /* Ensure readability */
          body { 
            font-size: 11pt; 
            line-height: 1.4;
          }

          /* Clean up cards for print */
          [style*="background"][style*="border"] {
            background: white !important;
            box-shadow: none !important;
          }

          /* Page numbers in footer */
          .page-number:after { 
            content: "Page " counter(page); 
          }

          /* Remove any max-widths that might constrain content */
          * {
            max-width: none !important;
          }

          /* Ensure comparison grid prints well */
          #calculator-printable > div:first-of-type,
          #calculator-printable > div:nth-of-type(n+2) {
            display: table-row !important;
          }

          #calculator-printable {
            display: table !important;
            width: 100% !important;
            border-spacing: 0;
            border: none !important;
          }

          #calculator-printable > div > div {
            display: table-cell !important;
            padding: 8px 10px !important;
            vertical-align: top;
            border: 1px solid #ddd !important;
            background: white !important;
          }

          /* Ensure Field labels are visible when inputs are hidden */
          .Field > div:first-child {
            display: block !important;
          }

          /* Tables should use full width */
          table {
            width: 100% !important;
          }
        }

        /* Screen only: keep header/footer hidden */
        #spl-print-header, 
        #spl-print-footer { 
          display: none; 
        }
      `}</style>
    </div>
  );
}