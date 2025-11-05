
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions, useActiveProjectId } from "@/components/state/project-session";

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
  amber: "#935F1A",
  red: "#7A1E19",
  blue: "#1B4E7A",
};

// ---- RP22 targets ----
const RP22 = {
  LCR: {
    param: 12,
    label:
      "Parameter 12 — Screen Speakers SPL at RSP (post‑cal EQ, within assigned bandwidth) without clipping",
    levels: [
      { key: "L1", db: 102 },
      { key: "L2", db: 105 },
      { key: "L3", db: 108 },
      { key: "L4", db: 111 },
    ],
  },
  SUR: {
    param: 13,
    label:
      "Parameter 13 — Non‑screen Speakers SPL at RSP (post‑cal EQ, within assigned bandwidth) without clipping (includes amplifier headroom)",
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

// ---- FALLBACK DATA ----
const FALLBACK_SPEAKERS = [
  { id: "ev2-1", brand: "Artcoustic", model: "Evolve 2-1", sensitivity: 93, max_power: 250, price: 1295, description: "Compact LCR with high sensitivity." },
  { id: "sp-a10", brand: "Artcoustic", model: "Spitfire A10", sensitivity: 95, max_power: 300, price: 2495, description: "High output screen channel." },
];

// ---------- math helpers ----------
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// Treat empty strings and whitespace as null (not 0).
function safeNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function calcSPL(sensitivity_dB_1W1m, power_W, distance_m) {
  if (!Number.isFinite(sensitivity_dB_1W1m) || !Number.isFinite(power_W) || !Number.isFinite(distance_m)) return null;
  if (power_W <= 0 || distance_m <= 0) return null;
  return sensitivity_dB_1W1m + 10 * Math.log10(power_W) - 20 * Math.log10(distance_m);
}
function calcPowerRequired(sensitivity_dB_1W1m, target_dB, distance_m) {
  if (!Number.isFinite(sensitivity_dB_1W1m) || !Number.isFinite(target_dB) || !Number.isFinite(distance_m) || distance_m <= 0) return null;
  const exp = (target_dB - sensitivity_dB_1W1m + 20 * Math.log10(distance_m)) / 10;
  return Math.pow(10, exp);
}

// ---- Max SPL helpers ----
function splAtDistanceFrom1m(spl1m, distance_m) {
  if (!Number.isFinite(spl1m) || !Number.isFinite(distance_m) || distance_m <= 0) return null;
  return spl1m - 20 * Math.log10(distance_m);
}
function thermalMaxSPL1m(sensitivity_dB_1W1m, max_power_W) {
  if (!Number.isFinite(sensitivity_dB_1W1m) || !Number.isFinite(max_power_W) || max_power_W <= 0) return null;
  return sensitivity_dB_1W1m + 10 * Math.log10(max_power_W);
}
function bestMaxSPL1m({ sensitivity_dB_1W1m, max_power_W, excursionMax1m }) {
  const th = thermalMaxSPL1m(sensitivity_dB_1W1m, max_power_W);
  const candidates = [th, excursionMax1m].filter(Number.isFinite);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}
function powerRequiredWithCeiling(sensitivity_dB_1W1m, target_dB_at_distance, distance_m, maxSPL1m_limit) {
  if (!Number.isFinite(sensitivity_dB_1W1m) || !Number.isFinite(target_dB_at_distance) || !Number.isFinite(distance_m) || distance_m <= 0) {
    return { powerW: null, note: "BAD_INPUT", maxAchievable_dB: null };
  }
  const neededAt1m = target_dB_at_distance + 20 * Math.log10(distance_m);
  if (Number.isFinite(maxSPL1m_limit) && neededAt1m > maxSPL1m_limit + 1e-9) {
    const maxAtDistance = splAtDistanceFrom1m(maxSPL1m_limit, distance_m);
    return { powerW: null, note: "EXCEEDS_CEILING", maxAchievable_dB: maxAtDistance };
  }
  const exp = (target_dB_at_distance - sensitivity_dB_1W1m + 20 * Math.log10(distance_m)) / 10;
  const p = Math.pow(10, exp);
  return { powerW: p, note: "OK", maxAchievable_dB: Number.isFinite(maxSPL1m_limit) ? splAtDistanceFrom1m(maxSPL1m_limit, distance_m) : null };
}
// Clamp predicted SPL at distance to the physical ceiling if present
function clampToCeiling(predictedSPL_atD, maxSPL1m_limit, distance_m) {
  if (!Number.isFinite(predictedSPL_atD)) return predictedSPL_atD;
  if (!Number.isFinite(maxSPL1m_limit) || !Number.isFinite(distance_m) || distance_m <= 0) {
    return predictedSPL_atD;
  }
  const ceilingAtD = splAtDistanceFrom1m(maxSPL1m_limit, distance_m);
  return Number.isFinite(ceilingAtD) ? Math.min(predictedSPL_atD, ceilingAtD) : predictedSPL_atD;
}

// ------- tone helpers -------
function toneForSPL(splValue, targetValue) {
  if (!Number.isFinite(splValue) || !Number.isFinite(targetValue)) return "neutral";
  const delta = splValue - targetValue;
  if (delta >= 0) return "green";
  if (delta >= -3) return "amber";
  return "red";
}
function tileStyles(tone = "neutral") {
  const base = {
    padding: 10,
    borderRadius: 8,
    border: `1px dashed ${BRAND.border}`,
    background: "#FFF",
  };
  if (tone === "green") return { ...base, border: `1px solid ${BRAND.green}`, background: "rgba(42,110,63,0.08)" };
  if (tone === "amber") return { ...base, border: `1px solid ${BRAND.amber}`, background: "rgba(147,95,26,0.08)" };
  if (tone === "red") return { ...base, border: `1px solid ${BRAND.red}`, background: "rgba(122,30,25,0.08)" };
  return base;
}
const statusColors = {
  green: BRAND.green,
  amber: BRAND.amber,
  red: BRAND.red,
};
function toneForPowerRequired(powerRequired, maxPower) {
  if (!Number.isFinite(powerRequired)) return "neutral";
  if (!Number.isFinite(maxPower)) return "neutral";
  return powerRequired > maxPower ? "red" : "green";
}

// --- local, dependency-free PDF/print export ---
function exportPanelToPDF({ nodeId, title, mode, target_dB, distance }) {
  try {
    const node = document.getElementById(nodeId);
    const modeLabel = mode === "LCR" ? "LCR (Param 12)" : "Surrounds (Param 13)";
    const win = window.open("", "_blank", "noopener");
    if (!win) return;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            :root {
              --bg: rgb(248,248,247);
              --panel: #ffffff;
              --border: #DCDBD6;
              --text: #1B1A1A;
              --sub: #3E4349;
            }
            * { box-sizing: border-box; }
            body {
              margin: 24px;
              background: var(--bg);
              color: var(--text);
              font-family: "Didact Gothic","Century Gothic",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            }
            h1,h2,h3 { margin: 0 0 12px; }
            .meta { margin: 6px 0 16px; font-size: 14px; color: var(--sub); }
            .panel { border: 1px solid var(--border); padding: 16px; border-radius: 12px; background: var(--panel); }
            .foot { margin-top: 16px; font-size: 12px; color: var(--sub); line-height: 1.5; }
            @media print { body { margin: .8in; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">Mode: ${modeLabel} &middot; Target: ${target_dB} dB(C) &middot; Distance: ${distance} m</div>
          <div class="panel">${node ? node.innerHTML : "<em>No content</em>"}</div>
          <div class="foot">
            <strong>RP22 Reference</strong><br/>
            Param 12 (Screen): Screen Speakers SPL at RSP (post-cal EQ, within assigned bandwidth) without clipping &mdash; Levels L1 102 dB(C), L2 105 dB(C), L3 108 dB(C), L4 111 dB(C).<br/>
            Param 13 (Non-screen): Non-screen Speakers SPL at RSP (post-cal EQ, within assigned bandwidth) without clipping (includes amplifier headroom) &mdash; Levels L1 99 dB(C), L2 102 dB(C), L3 105 dB(C), L4 108 dB(C).
          </div>
          <script>setTimeout(() => window.print(), 250);</script>
        </body>
      </html>
    `;
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch {
    window.print();
  }
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
function Button({ children, onClick, disabled, tone = "dark", title }) {
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
    <button type="button" onClick={onClick} disabled={disabled} style={style} title={title}>
      {children}
    </button>
  );
}
function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? BRAND.btn : BRAND.border}`,
        background: active ? BRAND.btn : "#FFF",
        color: active ? "#FFF" : BRAND.text,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
function ResultTile({ label, valueText, valueNum, targetNum }) {
  const tone = toneForSPL(valueNum, targetNum);
  return (
    <div style={tileStyles(tone)}>
      <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{valueText}</div>
    </div>
  );
}

export default function SPLCalculatorV2Page() {
  const activeId = useActiveProjectId();
  const { setSummaryFor, mergeSummary } = useProjectActions();

  // Global Show Prices toggle (hidden by default)
  const [showPrices, setShowPrices] = useState(false);

  // Safe speaker dataset with dynamic import fallback
  const [artcousticAll, setArtcousticAll] = useState(FALLBACK_SPEAKERS);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("@/components/data/speakerData");
        const src =
          (mod && Array.isArray(mod.artcousticSpeakers) && mod.artcousticSpeakers) ||
          (mod?.default && Array.isArray(mod.default?.artcousticSpeakers) && mod.default.artcousticSpeakers) ||
          null;
        if (mounted && Array.isArray(src) && src.length > 0) {
          setArtcousticAll(src);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("⚠️ Falling back to local Artcoustic dataset");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const artcousticVisible = useMemo(
    () => (artcousticAll || []).filter((s) => !isSubwooferEntry(s)),
    [artcousticAll]
  );

  // RP22 mode & level
  const [mode, setMode] = useState("LCR");
  const [levelKey, setLevelKey] = useState("L2");
  const spec = mode === "LCR" ? RP22.LCR : RP22.SUR;
  const selectedLevel = spec.levels.find((x) => x.key === levelKey) || spec.levels[1];
  const target_dB = selectedLevel.db;

  // Distance and amplifier power
  const [distance, setDistance] = useState("3.0");
  const [ampPower, setAmpPower] = useState("100");

  // Artcoustic primary (use visible list)
  const [artId, setArtId] = useState(artcousticVisible[0]?.id || "");
  const art = useMemo(() => artcousticVisible.find((s) => s.id === artId) || null, [artId, artcousticVisible]);
  useEffect(() => {
    if (!art && artcousticVisible.length) {
      setArtId(artcousticVisible[0].id);
    }
  }, [art, artcousticVisible]);

  // Third‑party comparator
  const [comparators, setComparators] = useState([
    { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8", max_spl_1m: "" },
  ]);
  const addComparator = () => {
    if (comparators.length >= 2) return;
    setComparators((prev) => [...prev, { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8", max_spl_1m: "" }]);
  };
  const updateComparator = (idx, patch) => setComparators((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const removeComparator = (idx) => setComparators((prev) => prev.filter((_, i) => i !== idx));

  // Parsed inputs (use safeNum so blanks don't become 0)
  const d = safeNum(distance);
  const P = safeNum(ampPower);

  // Artcoustic parsed numbers (safe)
  const artSens = safeNum(art?.sensitivity);
  const artMax = safeNum(art?.max_power);

  // Artcoustic computations (with excursion/ceiling support)
  const artMaxSPL1m_exc = safeNum(art?.max_spl_1m);
  const artMaxSPL1m_best = bestMaxSPL1m({
    sensitivity_dB_1W1m: artSens,
    max_power_W: artMax,
    excursionMax1m: artMaxSPL1m_exc,
  });
  const artMaxAtD = splAtDistanceFrom1m(artMaxSPL1m_best, d);

  const artSPL_raw = calcSPL(artSens, P, d);
  const artSPL = clampToCeiling(artSPL_raw, artMaxSPL1m_best, d); // preview SPL (clamped)

  // Always compute watts; ceiling is only a secondary warning
  const artPReq = calcPowerRequired(artSens, target_dB, d);
  const artHeadroom = (Number.isFinite(artSPL) && Number.isFinite(target_dB)) ? (artSPL - target_dB) : null;
  const artExceedsCeiling = (() => {
    if (!Number.isFinite(artMaxSPL1m_best)) return false;
    const neededAt1m = (Number.isFinite(target_dB) && Number.isFinite(d)) ? target_dB + 20 * Math.log10(d) : null;
    return Number.isFinite(neededAt1m) && neededAt1m > artMaxSPL1m_best;
  })();
  const artPowerTone = toneForPowerRequired(artPReq, artMax);

  // Normalization utility for 2.83V to 1W using impedance
  function normalizeTo1W(sensValue, unit, nominalOhms) {
    if (sensValue === "" || sensValue === null || sensValue === undefined) return null;
    const s = Number(sensValue);
    if (!Number.isFinite(s)) return null;
    if (unit === "1W@1m") return s;
    if (nominalOhms === "" || nominalOhms === null || nominalOhms === undefined) return null;
    const Z = Number(nominalOhms);
    if (!Number.isFinite(Z) || Z <= 0) return null;
    const volts = 2.83;
    const wattsAt2p83V = (volts * volts) / Z;
    const delta = 10 * Math.log10(wattsAt2p83V / 1);
    return s - delta;
  }

  // Use in Project
  function useInProject(kind) {
    if (!activeId || !art) return alert("Open or create a Project first.");
    const patch =
      kind === "LCR"
        ? { lcrModel: `${art.brand} ${art.model}`, dolbyLayout: undefined, targetSPL_LCR_dB: target_dB }
        : { surroundModel: `${art.brand} ${art.model}` };
    if (typeof setSummaryFor === "function") setSummaryFor(activeId, patch);
    else if (typeof mergeSummary === "function") mergeSummary(patch);
    alert(`${kind} set to ${art.brand} ${art.model} for project ${activeId}.`);
  }

  // Export (print) current panel
  const exportNow = useCallback(() => {
    exportPanelToPDF({
      nodeId: "calculator-printable",
      title: "SPL Calculator — Artcoustic Comparison",
      mode,
      target_dB,
      distance,
    });
  }, [mode, target_dB, distance]);

  // Register a page-level export function for the Layout header
  useEffect(() => {
    const handler = () => exportNow();
    if (typeof window !== "undefined") {
      window.__PAGE_EXPORT = handler;
    }
    return () => {
      if (typeof window !== "undefined" && window.__PAGE_EXPORT === handler) {
        window.__PAGE_EXPORT = undefined;
      }
    };
  }, [exportNow]);

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
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
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <Chip active={mode === "LCR"} onClick={() => setMode("LCR")}>LCR (Param 12)</Chip>
          <Chip active={mode === "SUR"} onClick={() => setMode("SUR")}>Surrounds (Param 13)</Chip>
        </div>

        {/* Target level chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {spec.levels.map((lvl) => (
            <Chip key={lvl.key} active={lvl.key === levelKey} onClick={() => setLevelKey(lvl.key)}>
              {lvl.key}: {lvl.db} dB(C)
            </Chip>
          ))}
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
            />
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
            />
            <div style={{ marginTop: 6, fontSize: 12, color: BRAND.hint, lineHeight: 1.35 }}>
              Recommend entering ~50% of quoted amplifier power (≈ −3 dB) for continuous, unclipped operation.
            </div>
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
            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.panel, padding: 6, maxHeight: 320, overflowY: 'auto' }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {artcousticVisible.map((opt) => {
                  const spl_raw = calcSPL(opt.sensitivity, P, d);
                  const optMaxSPL1m_exc = safeNum(opt.max_spl_1m);
                  const optMaxSPL1m_best = bestMaxSPL1m({
                    sensitivity_dB_1W1m: safeNum(opt.sensitivity),
                    max_power_W: safeNum(opt.max_power),
                    excursionMax1m: optMaxSPL1m_exc,
                  });
                  const spl = clampToCeiling(spl_raw, optMaxSPL1m_best, d);

                  let tone = BRAND.red;
                  if (Number.isFinite(spl)) {
                    if (spl >= target_dB) tone = BRAND.green;
                    else if (spl >= target_dB - 3) tone = BRAND.amber;
                  }
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
                      <div style={{ width: 6, height: 24, borderRadius: 3, background: tone, marginRight: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.brand} {opt.model}</div>
                        <div style={{ fontSize: 12, color: BRAND.subtext }}>
                          {opt.sensitivity} dB, {opt.max_power} W
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status legend/key */}
            <div style={{ fontSize: "0.85rem", marginTop: "0.5rem", color: BRAND.subtext }}>
              <strong style={{ color: BRAND.text }}>Status Key:</strong>
              <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    backgroundColor: statusColors.green,
                    borderRadius: "3px"
                  }} />
                  Pass (≥ target)
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    backgroundColor: statusColors.amber,
                    borderRadius: "3px"
                  }} />
                  Close (within 3 dB)
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    backgroundColor: statusColors.red,
                    borderRadius: "3px"
                  }} />
                  Fail (&lt; target − 3 dB)
                </div>
              </div>
            </div>
          </Field>

          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12, background: "#FFF", fontSize: 13, color: BRAND.text }}>
            {art ? (
              <>
                <div><strong>{art.brand} {art.model}</strong></div>
                <div>Sensitivity: {art.sensitivity} dB @ 1W/1m</div>
                <div>Max Power: {art.max_power} W</div>
                {showPrices && Number.isFinite(art.price) && <div>Price: £{art.price.toLocaleString()}</div>}
                <div style={{ marginTop: 6, color: BRAND.hint }}>{art.description || "—"}</div>
              </>
            ) : "Select a speaker"}
          </div>
        </div>

        {/* Comparators */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Compare Other Speakers</h3>
            <Button onClick={addComparator} disabled={comparators.length >= 2} title="Add another comparator">+ Add</Button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {comparators.map((c, idx) => (
              <div key={idx} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                  <Field label="Brand"><input value={c.brand} onChange={(e) => updateComparator(idx, { brand: e.target.value })} style={inputStyle()} placeholder="e.g. OtherBrand" /></Field>
                  <Field label="Model"><input value={c.model} onChange={(e) => updateComparator(idx, { model: e.target.value })} style={inputStyle()} placeholder="e.g. X100" /></Field>
                  <Field label="Sensitivity (dB)"><input value={c.sensitivity} onChange={(e) => updateComparator(idx, { sensitivity: e.target.value })} style={inputStyle()} placeholder="e.g. 90" inputMode="decimal" /></Field>
                  <Field label="Max Power (W)"><input value={c.max_power} onChange={(e) => updateComparator(idx, { max_power: e.target.value })} style={inputStyle()} placeholder="e.g. 150" inputMode="decimal" /></Field>
                  <Field label="Price (£)"><input value={c.price} onChange={(e) => updateComparator(idx, { price: e.target.value })} style={inputStyle()} placeholder="e.g. 1500" inputMode="decimal" /></Field>
                  <Field label="Max SPL @ 1m (x‑max ceiling, dB, optional)">
                    <input
                      value={c.max_spl_1m || ""}
                      onChange={(e) => updateComparator(idx, { max_spl_1m: e.target.value })}
                      style={inputStyle()}
                      placeholder="e.g. 115"
                      inputMode="decimal"
                    />
                  </Field>
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <Button onClick={() => removeComparator(idx)} title="Remove comparator">Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Use in Project */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button onClick={() => useInProject("LCR")} title="Set primary as LCR in active project">Use in Project (LCR)</Button>
          <Button onClick={() => useInProject("SUR")} title="Set primary as Surrounds in active project">Use in Project (Surrounds)</Button>
        </div>
      </div>

      {/* Comparison Output */}
      <SegmentBoundary name="SPLCalculatorResults">
        <div id="calculator-printable" style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 18, margin: 0, marginBottom: 12, color: BRAND.text }}>Comparison</h2>

          {/* Results for Artcoustic speaker */}
          {art && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0, marginBottom: 8, color: BRAND.text }}>{art.brand} {art.model}</h3>
              {Number.isFinite(artMaxAtD) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <ResultTile label={`SPL @ ${distance}m / ${ampPower}W`} valueText={Number.isFinite(artSPL) ? `${artSPL.toFixed(1)} dB` : "—"} valueNum={artSPL} targetNum={target_dB} />
                  <ResultTile label="Headroom vs target" valueText={Number.isFinite(artHeadroom) ? `${artHeadroom.toFixed(1)} dB` : "—"} valueNum={artSPL} targetNum={target_dB} />
                  <div style={tileStyles(artMaxAtD >= target_dB ? "green" : (artMaxAtD >= target_dB - 3 ? "amber" : "red"))}>
                    <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>Max Achievable @ {distance}m</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{artMaxAtD.toFixed(1)} dB</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <ResultTile label={`SPL @ ${distance}m / ${ampPower}W`} valueText={Number.isFinite(artSPL) ? `${artSPL.toFixed(1)} dB` : "—"} valueNum={artSPL} targetNum={target_dB} />
                  <ResultTile label="Headroom vs target" valueText={Number.isFinite(artHeadroom) ? `${artHeadroom.toFixed(1)} dB` : "—"} valueNum={artSPL} targetNum={target_dB} />
                </div>
              )}
            </div>
          )}

          {/* Grid header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Speaker</div>
            <div style={{ fontWeight: 600 }}>Sensitivity</div>
            <div style={{ fontWeight: 600 }}>Max Power</div>
            <div style={{ fontWeight: 600 }}>SPL @ {distance}m / {ampPower}W</div>
            <div style={{ fontWeight: 600 }}>Power Required (target {target_dB} dB)</div>
          </div>

          {/* Artcoustic row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, alignItems: "stretch" }}>
            <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
              {art
                ? `${art.brand} ${art.model}` + (showPrices && Number.isFinite(art.price) ? ` — £${art.price.toLocaleString()}` : "")
                : "—"}
            </div>
            <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>{Number.isFinite(artSens) ? `${artSens} dB @1W/1m` : "—"}</div>
            <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>{Number.isFinite(artMax) ? `${artMax} W` : "—"}</div>
            <div style={{ ...tileStyles(toneForSPL(artSPL, target_dB)) }}>{artSPL != null ? `${artSPL.toFixed(1)} dB` : "—"}</div>
            <div
              style={{ ...tileStyles(artPowerTone) }}
              title={
                Number.isFinite(artPReq) && Number.isFinite(artMax) && artPReq > artMax
                  ? `Required ${artPReq.toFixed(0)} W exceeds max ${artMax} W`
                  : undefined
              }
            >
              {Number.isFinite(artPReq) ? (
                <>
                  {Number.isFinite(artMax) && artPReq > artMax
                    ? `${artPReq.toFixed(0)} W > ${artMax} W`
                    : `${artPReq.toFixed(0)} W`}
                  {artExceedsCeiling && Number.isFinite(artMaxAtD) && (
                    <div style={{ fontSize: 11, color: "#625143", marginTop: 4 }}>
                      Ceiling @ {distance}m: {artMaxAtD.toFixed(1)} dB
                    </div>
                  )}
                </>
              ) : "—"}
            </div>
          </div>

          {/* Comparator rows */}
          {comparators.map((c, idx) => {
            const normalizedSens = normalizeTo1W(c.sensitivity, c.sensUnit, c.nominalOhms);
            const s = safeNum(normalizedSens);
            const m = safeNum(c.max_power);
            const x = safeNum(c.max_spl_1m);

            const cMaxSPL1m_best = bestMaxSPL1m({
              sensitivity_dB_1W1m: s,
              max_power_W: m,
              excursionMax1m: x,
            });

            const splRaw = calcSPL(s, P, d);
            const spl = clampToCeiling(splRaw, cMaxSPL1m_best, d);

            const preq = calcPowerRequired(s, target_dB, d);

            const exceedsCeiling = (Number.isFinite(x) && Number.isFinite(d) && Number.isFinite(target_dB))
              ? (target_dB + 20 * Math.log10(d)) > x
              : false;
            const cMaxAtD = (Number.isFinite(x) && Number.isFinite(d)) ? splAtDistanceFrom1m(x, d) : null;

            const powerTone = toneForPowerRequired(preq, m);

            return (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginTop: 8, alignItems: "stretch" }}>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {`${c.brand || "—"} ${c.model || ""}`.trim()}
                  {showPrices && Number.isFinite(safeNum(c.price)) ? ` — £${Number(safeNum(c.price)).toLocaleString()}` : ""}
                </div>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {Number.isFinite(s) ? `${s.toFixed(1)} dB @1W/1m` : "—"}
                </div>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {Number.isFinite(m) ? `${m} W` : "—"}
                </div>
                <div style={{ ...tileStyles(toneForSPL(spl, target_dB)) }}>
                  {spl != null ? `${spl.toFixed(1)} dB` : "—"}
                </div>
                <div
                  style={{ ...tileStyles(powerTone) }}
                  title={
                    Number.isFinite(m) && Number.isFinite(preq) && preq > m
                      ? `Required ${preq.toFixed(0)} W exceeds max ${m} W`
                      : undefined
                  }
                >
                  {Number.isFinite(preq)
                    ? (
                      <>
                        {Number.isFinite(m) && preq > m
                          ? `${preq.toFixed(0)} W > ${m} W`
                          : `${preq.toFixed(0)} W`}
                        {exceedsCeiling && Number.isFinite(cMaxAtD) && (
                          <div style={{ fontSize: 11, color: "#625143", marginTop: 4 }}>
                            Ceiling @ {distance}m: {cMaxAtD.toFixed(1)} dB
                          </div>
                        )}
                      </>
                    )
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </SegmentBoundary>

      {/* Show Prices toggle (bottom, above RP22 footer) */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
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
          RP22 Parameter 12 (Screen) (recommended):
        </div>
        <div>
          Screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping
        </div>
        <div>
          Levels: L1 102 dB(C), L2 105 dB(C), L3 108 dB(C), L4 111 dB(C).
        </div>
        <div style={{ marginTop: 6 }}>
          Min SPL per AES75-2022 or ANSI-CTA-2034-A; includes headroom for bass contours and +EQ.
        </div>

        <div style={{ fontWeight: 700, color: BRAND.text, marginTop: 12 }}>
          RP22 Parameter 13 (Non-screen/Surrounds) (recommended):
        </div>
        <div>
          Non-screen speakers SPL capability at RSP (post calibration EQ, within assigned bandwidth) without clipping
        </div>
        <div>
          Levels: L1 99 dB(C), L2 102 dB(C), L3 105 dB(C), L4 108 dB(C).
        </div>
        <div style={{ marginTop: 6 }}>
          Includes amplifier headroom; same SPL spec logic as parameter 12.
        </div>
      </div>
    </div>
  );
}
