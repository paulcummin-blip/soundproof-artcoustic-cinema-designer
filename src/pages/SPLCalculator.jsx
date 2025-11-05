
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions, useActiveProjectId } from "@/components/state/project-session";
import { artcousticSpeakers } from "@/components/data/speakerData";
import { useRoomDimensions } from "@/components/hooks/useRoomDimensions";
import { createPageUrl } from "@/utils"; // Fixed import path

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

// Compute SPL at 1m capability considering speaker specs and amplifier power
function getSPL1mCapability(speaker, ampPower_W) {
  const P_amp = nW(ampPower_W);
  const P_spk = nW(speaker.power_handling_w || speaker.max_power);
  
  // Ceiling from speaker (Infinity if unknown, or 0 if 0)
  const P_ceiling_from_speaker = P_spk > 0 ? P_spk : Infinity;
  
  // Available power is minimum of amp and speaker (0 if amp missing or speaker has 0 power handling)
  const P_available = Math.min(P_amp || 0, P_ceiling_from_speaker);
  
  // Get sensitivity in 1W/1m terms
  let sens_1W = safeNum(speaker.sensitivity_db_1w_1m || speaker.sensitivity);
  const sens_2p83V = safeNum(speaker.sensitivity_db_2v83_1m);
  const impedanceOhm = safeNum(speaker.impedance_ohm || speaker.impedance);
  
  // Convert if only 2.83V available
  if (sens_1W === null && sens_2p83V !== null) {
    const assumedZ = impedanceOhm !== null ? impedanceOhm : 8;
    sens_1W = convert2p83VTo1W(sens_2p83V, assumedZ);
  }
  
  // Compute amp-limited SPL
  let SPL_1m_amp_limited = null;
  if (sens_1W !== null && P_available > 0) {
    SPL_1m_amp_limited = sens_1W + 10 * Math.log10(P_available);
  }
  
  // Get RP1 capability if available
  const SPL_1m_rp1 = safeNum(speaker.rp1_midTermRMS_dBZ_1m);
  
  // Determine capability (minimum of both constraints)
  let SPL_1m_capability = null;
  let method = "Unknown";
  let isVerified = false;
  let formula = null;
  let assumptionNote = null;
  let ampLimitWarning = false;
  
  if (SPL_1m_amp_limited !== null && SPL_1m_rp1 !== null) {
    // Both available: use minimum
    SPL_1m_capability = Math.min(SPL_1m_amp_limited, SPL_1m_rp1);
    method = SPL_1m_capability === SPL_1m_rp1 ? "RP1" : "Amp-limited";
    isVerified = SPL_1m_capability === SPL_1m_rp1;
    if (method === "Amp-limited") {
      formula = `${sens_1W.toFixed(1)} dB + 10·log10(${Math.round(P_available)} W) = ${SPL_1m_capability.toFixed(1)} dB`;
      if (impedanceOhm === null && sens_2p83V !== null && sens_1W === null) { // This case should be covered by sens_1W = null check earlier
        assumptionNote = "Assumed 8 Ω impedance for 2.83V → 1W conversion";
      }
    } else { // RP1 method
      // If RP1 is chosen, but amp is less than speaker max, warn if we can't calculate amp-limited
      if (P_amp > 0 && P_spk > 0 && P_amp < P_spk && sens_1W === null) {
        ampLimitWarning = true;
      }
    }
  } else if (SPL_1m_amp_limited !== null) {
    // Only amp-limited available
    SPL_1m_capability = SPL_1m_amp_limited;
    method = "Amp-limited";
    isVerified = false;
    formula = `${sens_1W.toFixed(1)} dB + 10·log10(${Math.round(P_available)} W) = ${SPL_1m_capability.toFixed(1)} dB`;
    if (impedanceOhm === null && sens_2p83V !== null) {
      assumptionNote = "Assumed 8 Ω impedance for 2.83V → 1W conversion";
    }
  } else if (SPL_1m_rp1 !== null) {
    // Only RP1 available
    SPL_1m_capability = SPL_1m_rp1;
    method = "RP1";
    isVerified = true;
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
    ampLimitWarning
  };
}

// Compute distance loss - UNIFIED POINT SOURCE MODEL (6 dB per doubling)
function getDistanceLoss(speaker, distance_m) {
  if (!Number.isFinite(distance_m) || distance_m <= 0) return { loss: 0, model: "Unknown" };
  
  // Point source: 6 dB per doubling (20*log10)
  const loss = 20 * Math.log10(Math.max(1, distance_m));
  return { loss, model: "Point" };
}

// Helper to compute required power for a given RP22 level
function computeRequiredPowerForLevel(speaker, targetDb, screenLossDb, distanceLossDb, eqHeadroom_dB = 0) {
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


// Helper to format power with units
function formatPower(watts) {
  if (!Number.isFinite(watts)) return "—";
  const rounded = Math.ceil(watts);
  if (rounded >= 1000) {
    return `${(rounded / 1000).toFixed(2)} kW`;
  }
  return `${rounded} W`;
}

// Helper to get achievable RP22 levels for a speaker
function getAchievableLevels(speaker, isScreen, screenLossDb, distanceLossDb, eqHeadroom_dB = 0) {
  const powerHandling = safeNum(speaker.power_handling_w || speaker.max_power);
  if (!Number.isFinite(powerHandling) || powerHandling <= 0) return [];
  
  const thresholds = isScreen 
    ? [{ key: "L1", db: 102 }, { key: "L2", db: 105 }, { key: "L3", db: 108 }, { key: "L4", db: 111 }]
    : [{ key: "L1", db: 99 }, { key: "L2", db: 102 }, { key: "L3", db: 105 }, { key: "L4", db: 108 }];
  
  const achievable = [];
  
  for (const level of thresholds) {
    const requiredPower = computeRequiredPowerForLevel(speaker, level.db, screenLossDb, distanceLossDb, eqHeadroom_dB);
    if (requiredPower !== null && requiredPower <= powerHandling) {
      achievable.push({ level: level.key, power: requiredPower });
    }
  }
  
  return achievable;
}

// Helper to detect issues for mini report (updated for amp power)
function detectIssues(speaker, group, baseline, distanceLoss, screenLossDb, distance_m, ampPower_W, eqHeadroom_dB = 0) {
  const issues = [];
  const targetL1 = group === "screen" ? 102 : 99;
  const label = `${speaker.brand || "Unknown"} ${speaker.model || ""}`.trim();
  
  const P_amp = nW(ampPower_W);
  const P_spk = nW(speaker.power_handling_w || speaker.max_power);
  
  // Check for amplifier power exceeding speaker max
  if (P_amp > 0 && P_spk > 0 && P_amp > P_spk) {
    issues.push(
      `${label}: amplifier power exceeds speaker max (AMP ${Math.ceil(P_amp)} W > MAX ${Math.ceil(P_spk)} W)`
    );
  }
  
  // Check for amp limit warning (RP1 only, amp < speaker, no sensitivity)
  if (baseline && baseline.ampLimitWarning) {
    issues.push(
      `${label}: cannot reflect amplifier limit (needs sensitivity); showing RP1 capability`
    );
  }
  
  // Check if Level 1 is achievable based on speaker power handling (with EQ headroom)
  if (distanceLoss && Number.isFinite(targetL1) && P_spk > 0) {
    const requiredPowerL1 = computeRequiredPowerForLevel(speaker, targetL1, screenLossDb, distanceLoss.loss, eqHeadroom_dB);
    if (requiredPowerL1 !== null && requiredPowerL1 > P_spk) {
      issues.push(
        `${label}: Level 1 not achieved (requires ${formatPower(requiredPowerL1)} > max ${formatPower(P_spk)})`
      );
    }
  }

  // Compute required baseline for Level 1 (capability check with EQ headroom)
  if (baseline && distanceLoss && Number.isFinite(targetL1)) {
    const required_1m_L1 = targetL1 + screenLossDb + distanceLoss.loss + eqHeadroom_dB;
    if (baseline.value !== null && baseline.value < required_1m_L1) {
      issues.push(
        `${label}: insufficient capability for Level 1 (needs ≥${roundUpHalf(required_1m_L1).toFixed(1)} dB @1 m, has ${roundUpHalf(baseline.value).toFixed(1)} dB @1 m)`
      );
    }
  }
  
  // Missing or weak data
  if (baseline && !baseline.isVerified) {
    if (!P_spk || P_spk <= 0) {
      issues.push(`${label}: missing power handling — calculated estimate may be inaccurate`);
    }
    
    const impedanceOhm = safeNum(speaker.impedance_ohm || speaker.impedance);
    const sens_2p83V = safeNum(speaker.sensitivity_db_2v83_1m);
    if (!impedanceOhm && sens_2p83V !== null && !baseline.ampLimitWarning) { // Only warn if not already covered by ampLimitWarning
      issues.push(`${label}: impedance not specified — assumed 8 Ω for sensitivity conversion`);
    }
  }
  
  // No data at all
  if (!baseline || baseline.value === null) {
    issues.push(`${label}: no SPL capability data available`);
  }
  
  return issues;
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
  const { setSummaryFor, mergeSummary } = useProjectActions();

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

  // EQ Headroom state
  const [eqHeadroom_dB, setEqHeadroom_dB] = useState(0);

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

  // Artcoustic computations with amplifier power
  const artBaseline = useMemo(() => {
    if (!art) return null;
    return getSPL1mCapability(art, P);
  }, [art, P]);

  const artDistanceLoss = useMemo(() => {
    if (!art || !d) return null;
    // Point source: 6 dB per doubling (20 * log10)
    const loss = 20 * Math.log10(Math.max(1, d));
    return { loss, model: "Point" };
  }, [art, d]);

  const artSPL_RSP_raw = useMemo(() => {
    if (!artBaseline || artBaseline.value === null || !artDistanceLoss || artDistanceLoss.loss === null) {
      return null;
    }
    // Apply EQ headroom deduction
    return artBaseline.value - screenLossDb - artDistanceLoss.loss - eqHeadroom_dB;
  }, [artBaseline, artDistanceLoss, screenLossDb, eqHeadroom_dB]);

  const artSPL_RSP = useMemo(() => {
    return roundUpHalf(artSPL_RSP_raw);
  }, [artBaseline, artDistanceLoss, screenLossDb, eqHeadroom_dB, artSPL_RSP_raw]);

  // Collect issues for mini report (now includes amp power)
  const allIssues = useMemo(() => {
    const issues = [];
    
    // Check Artcoustic speaker
    if (art) {
      const group = mode === "LCR" ? "screen" : "non-screen";
      issues.push(...detectIssues(art, group, artBaseline, artDistanceLoss, screenLossDb, d, P, eqHeadroom_dB));
    }
    
    // Check comparators
    comparators.forEach((c, idx) => {
      if (!c.brand && !c.model) return;
      
      const compSpeaker = {
        brand: c.brand,
        model: c.model,
        sensitivity: safeNum(c.sensitivity),
        sensitivity_db_1w_1m: c.sensUnit === "1W@1m" ? safeNum(c.sensitivity) : null,
        sensitivity_db_2v83_1m: c.sensUnit === "2.83V@1m" ? safeNum(c.sensitivity) : null,
        impedance_ohm: safeNum(c.nominalOhms),
        max_power: safeNum(c.max_power),
        power_handling_w: safeNum(c.max_power),
        rp1_midTermRMS_dBZ_1m: safeNum(c.max_spl_1m),
      };
      
      const compBaseline = getSPL1mCapability(compSpeaker, P);
      // Point source distance loss
      const compDistLoss = d ? { loss: 20 * Math.log10(Math.max(1, d)), model: "Point" } : null;
      const group = mode === "LCR" ? "screen" : "non-screen";
      
      issues.push(...detectIssues(compSpeaker, group, compBaseline, compDistLoss, screenLossDb, d, P, eqHeadroom_dB));
    });
    
    return issues;
  }, [art, artBaseline, artDistanceLoss, comparators, mode, screenLossDb, d, P, eqHeadroom_dB]);

  // Detect if any speaker uses non-RP1 data (updated to use getSPL1mCapability)
  const hasNonRp1 = useMemo(() => {
    // Check Artcoustic
    if (art && artBaseline && !artBaseline.isVerified) {
      return true;
    }
    
    // Check comparators
    for (const c of comparators) {
      if (!c.brand && !c.model) continue;
      
      const compSpeaker = {
        brand: c.brand,
        model: c.model,
        sensitivity_db_1w_1m: c.sensUnit === "1W@1m" ? safeNum(c.sensitivity) : null,
        sensitivity_db_2v83_1m: c.sensUnit === "2.83V@1m" ? safeNum(c.sensitivity) : null,
        impedance_ohm: safeNum(c.nominalOhms),
        max_power: safeNum(c.max_power),
        power_handling_w: safeNum(c.max_power),
        rp1_midTermRMS_dBZ_1m: safeNum(c.max_spl_1m),
      };
      
      const compBaseline = getSPL1mCapability(compSpeaker, P);
      if (compBaseline && !compBaseline.isVerified) {
        return true;
      }
    }
    
    return false;
  }, [art, artBaseline, comparators, P]);


  // Use in Project
  function handleUseInProject(kind) {
    if (!activeId || !art) return alert("Open or create a Project first.");
    const patch =
      kind === "LCR"
        ? { lcrModel: `${art.brand} ${art.model}`, dolbyLayout: undefined }
        : { surroundModel: `${art.brand} ${art.model}` };
    if (typeof setSummaryFor === "function") setSummaryFor(activeId, patch);
    else if (typeof mergeSummary === "function") mergeSummary(patch);
    alert(`${kind} set to ${art.brand} ${art.model} for project ${activeId}.`);
  }

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
                    const optBaseline = getSPL1mCapability(opt, P); // Use getSPL1mCapability
                    const optDistLoss = getDistanceLoss(opt, d || 3);
                    const optSPL_RSP_raw = (optBaseline?.value !== null && optDistLoss?.loss !== null)
                      ? optBaseline.value - screenLossDb - optDistLoss.loss - eqHeadroom_dB
                      : null;
                    const optSPL_RSP = roundUpHalf(optSPL_RSP_raw);

                    const targetDb = mode === "LCR" ? RP22.LCR.levels[1].db : RP22.SUR.levels[1].db; // Use L2 for color indication
                    const status = optSPL_RSP !== null ? rp22ColourStatus(optSPL_RSP, targetDb) : "neutral";
                    const statusColor = status === 'green' ? BRAND.green : status === 'gold' ? BRAND.gold : BRAND.red;

                    return (
                      <div
                        key={opt.id}
                        onClick={() => setArtId(opt.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `2px solid ${artId === opt.id ? BRAND.blue : 'transparent'}`,
                          background: artId === opt.id ? 'rgba(27, 78, 122, 0.08)' : BRAND.panel,
                        }}
                      >
                        <div style={{ width: 6, height: 24, borderRadius: 3, background: statusColor, marginRight: 10, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.brand} {opt.model}</div>
                          <div style={{ fontSize: 12, color: BRAND.subtext }}>
                            {opt.sensitivity ? `${opt.sensitivity} dB, ` : ""}{opt.max_power} W{showPrices && Number.isFinite(opt.price) ? `, £${opt.price?.toLocaleString()}` : ""}
                          </div>
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

                // Step 3: Compute SPL capability with amp power
                const compBaseline = getSPL1mCapability(compSpeaker, P);
                const compDistLoss = d ? { loss: 20 * Math.log10(Math.max(1, d)), model: "Point" } : null;
                
                // Apply EQ headroom deduction
                const compSPL_RSP_raw = (compBaseline?.value !== null && compDistLoss?.loss !== null)
                  ? compBaseline.value - screenLossDb - compDistLoss.loss - eqHeadroom_dB
                  : null;
                const compSPL_RSP = roundUpHalf(compSPL_RSP_raw);
                const compRP22Level = compSPL_RSP !== null ? getRP22Level(compSPL_RSP, mode === "LCR").label : "—";

                const compPowerHandling = safeNum(c.max_power);
                const compAmpExceeds = Number.isFinite(P) && Number.isFinite(compPowerHandling) && compPowerHandling > 0 && P > compPowerHandling;

                // Compute achievable levels with EQ headroom
                const achievableLevels = compDistLoss 
                  ? getAchievableLevels(compSpeaker, mode === "LCR", screenLossDb, compDistLoss.loss, eqHeadroom_dB)
                  : [];
                const highestLevel = achievableLevels.length > 0 ? achievableLevels[achievableLevels.length - 1].level : null;

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
                      <Field label="Max SPL @ 1m (optional)">
                        <input
                          value={c.max_spl_1m || ""}
                          onChange={(e) => updateComparator(idx, { max_spl_1m: e.target.value })}
                          style={inputStyle()}
                          placeholder="e.g. 115"
                          inputMode="decimal"
                          className="no-print"
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

          {/* Use in Project */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }} className="no-print">
            <Button onClick={() => handleUseInProject("LCR")} title="Set primary as LCR in active project">Use in Project (LCR)</Button>
            <Button onClick={() => handleUseInProject("SUR")} title="Set primary as Surrounds in active project">Use in Project (Surrounds)</Button>
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
                {artSPL_RSP !== null ? `${artSPL_RSP.toFixed(1)} dB(C)` : "—"}
              </div>
              <div style={{ padding: 10, border: `2px solid ${BRAND.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {artSPL_RSP !== null ? (
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: '#1B1A1A',
                    }}
                  >
                    {getRP22Level(artSPL_RSP, mode === "LCR").label}
                  </div>
                ) : "—"}
              </div>
              <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                {(() => {
                  if (!art || !artDistanceLoss) return "—";
                  const achievable = getAchievableLevels(art, mode === "LCR", screenLossDb, artDistanceLoss.loss, eqHeadroom_dB);
                  const highest = achievable.length > 0 ? achievable[achievable.length - 1].level : null;
                  
                  if (achievable.length === 0) {
                    // Check if we can compute but just can't achieve
                    const targetL1Db = (mode === "LCR" ? RP22.LCR : RP22.SUR).levels[0].db;
                    const requiredL1 = computeRequiredPowerForLevel(
                      art, 
                      targetL1Db,
                      screenLossDb, 
                      artDistanceLoss.loss,
                      eqHeadroom_dB
                    );
                    if (requiredL1 !== null) {
                      return <div>Level 1 not achieved</div>;
                    }
                    return "—";
                  }
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {achievable.map(({ level, power }) => {
                        const isHighest = level === highest;
                        const label = `${level} requires ${formatPower(power)}`;
                        return (
                          <div
                            key={level}
                            style={isHighest ? { color: '#213428', textTransform: 'uppercase', fontWeight: 600 } : undefined}
                          >
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Comparator rows */}
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

              // Step 3: Compute SPL capability with amp power
              const compBaseline = getSPL1mCapability(compSpeaker, P);
              const compDistLoss = d ? { loss: 20 * Math.log10(Math.max(1, d)), model: "Point" } : null;
              
              // Apply EQ headroom deduction
              const compSPL_RSP_raw = (compBaseline?.value !== null && compDistLoss?.loss !== null)
                ? compBaseline.value - screenLossDb - compDistLoss.loss - eqHeadroom_dB
                : null;
              const compSPL_RSP = roundUpHalf(compSPL_RSP_raw);
              const compRP22Level = compSPL_RSP !== null ? getRP22Level(compSPL_RSP, mode === "LCR").label : "—";

              const compPowerHandling = safeNum(c.max_power);
              const compAmpExceeds = Number.isFinite(P) && Number.isFinite(compPowerHandling) && compPowerHandling > 0 && P > compPowerHandling;

              // Compute achievable levels with EQ headroom
              const achievableLevels = compDistLoss 
                ? getAchievableLevels(compSpeaker, mode === "LCR", screenLossDb, compDistLoss.loss, eqHeadroom_dB)
                : [];
              const highestLevel = achievableLevels.length > 0 ? achievableLevels[achievableLevels.length - 1].level : null;

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
                    {compSPL_RSP !== null ? `${compSPL_RSP.toFixed(1)} dB(C)` : "—"}
                  </div>
                  <div style={{ padding: 10, border: `2px solid ${BRAND.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {compRP22Level !== "—" ? (
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 500,
                          color: '#1B1A1A',
                        }}
                      >
                        {compRP22Level}
                      </div>
                    ) : "—"}
                  </div>
                  <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                    {(() => {
                      if (!compDistLoss) return "—";
                      
                      if (achievableLevels.length === 0) {
                        const targetL1Db = (mode === "LCR" ? RP22.LCR : RP22.SUR).levels[0].db;
                        const requiredL1 = computeRequiredPowerForLevel(
                          compSpeaker, 
                          targetL1Db,
                          screenLossDb, 
                          compDistLoss.loss,
                          eqHeadroom_dB
                        );
                        if (requiredL1 !== null) {
                          return <div>Level 1 not achieved</div>;
                        }
                        return "—";
                      }
                      
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {achievableLevels.map(({ level, power }) => {
                            const isHighest = level === highestLevel;
                            const label = `${level} requires ${formatPower(power)}`;
                            return (
                              <div
                                key={level}
                                style={isHighest ? { color: '#213428', textTransform: 'uppercase', fontWeight: 600 } : undefined}
                              >
                                {label}
                              </div>
                            );
                          })}
                        </div>
                      );
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

          {/* EQ Headroom control */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.subtext }}>EQ Headroom</label>
            <div style={{ display: "flex", gap: 4, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 2, background: "#FFF" }}>
              <button
                type="button"
                onClick={() => setEqHeadroom_dB(0)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: eqHeadroom_dB === 0 ? BRAND.btn : "transparent",
                  color: eqHeadroom_dB === 0 ? BRAND.btnText : BRAND.text,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: eqHeadroom_dB === 0 ? 600 : 400,
                }}
                aria-pressed={eqHeadroom_dB === 0 ? "true" : "false"}
              >
                Off
              </button>
              <button
                type="button"
                onClick={() => setEqHeadroom_dB(3)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: eqHeadroom_dB === 3 ? BRAND.btn : "transparent",
                  color: eqHeadroom_dB === 3 ? BRAND.btnText : BRAND.text,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: eqHeadroom_dB === 3 ? 600 : 400,
                }}
                aria-pressed={eqHeadroom_dB === 3 ? "true" : "false"}
              >
                –3 dB
              </button>
              <button
                type="button"
                onClick={() => setEqHeadroom_dB(6)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: eqHeadroom_dB === 6 ? BRAND.btn : "transparent",
                  color: eqHeadroom_dB === 6 ? BRAND.btnText : BRAND.text,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: eqHeadroom_dB === 6 ? 600 : 400,
                }}
                aria-pressed={eqHeadroom_dB === 6 ? "true" : "false"}
              >
                –6 dB
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
            <div>EQ Headroom: {eqHeadroom_dB === 0 ? 'Off' : `–${eqHeadroom_dB} dB`}</div>
            <div>Screen Loss: –{screenLoss_dB.toFixed(1)} dB</div>
            <div>Distance: {d ? `${d.toFixed(2)} m` : '—'}</div>
            <div>Amplifier Power: {P ? `${Math.ceil(P)} W` : '—'}</div>
            <div>Room Volume: {volume_m3.toFixed(2)} m³</div>
            <div>Calibration: {referencePlaybackLevel} dB(C)</div>
            <div>Propagation Model: Point Source</div>
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
