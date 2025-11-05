
// pages/Calculator.js — RP22-first calculator with compare+PDF+project wiring
import React, { useMemo, useState, useCallback } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions, useActiveProjectId } from "@/components/state/project-session";

// ---- brand palette (match Projects) ----
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
  brandCTA: "#2A6E3F",        // Artcoustic brand green (CTA)
  brandCTAHover: "#27633A",   // Slightly darker hover
};

// ---- RP22 targets (Param 12 & 13) ----
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
  const cat = String(s.category || s.type || "").toLowerCase();
  if (cat.includes("sub")) return true; // e.g. "sub", "subwoofer"

  // Heuristic on model/name text
  const model = `${s.brand || ""} ${s.model || ""}`.toLowerCase();
  return /\bsub\b|\bsubwoofer\b/.test(model);
}

// --- Sensitivity normalization ---
// Convert 2.83 V / 1 m sensitivity to 1 W / 1 m using nominal impedance.
// sens_1W = sens_2.83V − 10 * log10( (2.83^2 / Z_ohms) / 1 )
function normalizeTo1W(sensValue, unit, nominalOhms) {
  const s = Number(sensValue);
  if (!Number.isFinite(s)) return null;
  if (unit === "1W@1m") return s; // already normalized
  const Z = Number(nominalOhms);
  if (!Number.isFinite(Z) || Z <= 0) return null; // need impedance to normalize
  const volts = 2.83;
  const wattsAt2p83V = (volts * volts) / Z;
  const delta = 10 * Math.log10(wattsAt2p83V / 1);
  return s - delta;
}

// ------- tone helpers for result tiles -------
function toneForSPL(splValue, targetValue) {
  if (!Number.isFinite(splValue) || !Number.isFinite(targetValue)) return "neutral";
  const delta = splValue - targetValue; // headroom
  if (delta >= 0) return "green";              // meets/exceeds target
  if (delta >= -3) return "amber";             // within 3 dB
  return "red";                                // short by >3 dB
}

// New tone helper for Power Required column
function toneForPowerRequired(powerRequired, maxPower) {
  if (!Number.isFinite(powerRequired) || !Number.isFinite(maxPower)) return "neutral";
  if (powerRequired > maxPower) return "red"; // Required power exceeds max power
  return "green"; // Required power is within or equal to max power
}

function tileStyles(tone = "neutral") {
  const base = {
    padding: 10, // Adjusted from 12 to match comparison grid cells
    borderRadius: 8, // Adjusted from 10 to match comparison grid cells
    border: `1px dashed ${BRAND.border}`,
    background: "#FFF",
  };
  if (tone === "green") {
    return {
      ...base,
      border: `1px solid ${BRAND.green}`,
      background: "rgba(42,110,63,0.08)",
      color: BRAND.text,
    };
  }
  if (tone === "amber") {
    return {
      ...base,
      border: `1px solid ${BRAND.amber}`,
      background: "rgba(147,95,26,0.08)",
      color: BRAND.text,
    };
  }
  if (tone === "red") {
    return {
      ...base,
      border: `1px solid ${BRAND.red}`,
      background: "rgba(122,30,25,0.08)",
      color: BRAND.text,
    };
  }
  return base;
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

// ---- Fallback dataset (keeps page working if import fails) ----
const FALLBACK_SPEAKERS = [
  { id: "ev2-1", brand: "Artcoustic", model: "Evolve 2-1", sensitivity: 93, max_power: 250, price: 1295, description: "Compact LCR with high sensitivity." },
  { id: "sp-a10", brand: "Artcoustic", model: "Spitfire A10", sensitivity: 95, max_power: 300, price: 2495, description: "High output screen channel." },
];

// ✅ Restore the full Artcoustic dataset (falls back safely if missing)
import { artcousticSpeakers } from "@/components/data/speakerData";
const ARTCOUSTIC_ALL = (Array.isArray(artcousticSpeakers) && artcousticSpeakers.length > 0
  ? artcousticSpeakers
  : FALLBACK_SPEAKERS);

const ARTCOUSTIC_VISIBLE = ARTCOUSTIC_ALL.filter((s) => !isSubwooferEntry(s));

// ---------- math helpers ----------
function numOrNull(v) {
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
  const bg = tone === "dark" ? BRAND.btn : (tone === "blue" ? BRAND.blue : (tone === "green" ? BRAND.green : BRAND.btn));
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

// ---------- main ----------
export default function CalculatorPage() {
  const activeId = useActiveProjectId();
  const { setSummaryFor, mergeSummary } = useProjectActions();

  // RP22 mode & level
  const [mode, setMode] = useState("LCR"); // "LCR" | "SUR"
  const [levelKey, setLevelKey] = useState("L2"); // L1..L4
  const spec = mode === "LCR" ? RP22.LCR : RP22.SUR;
  const selectedLevel = spec.levels.find((x) => x.key === levelKey) || spec.levels[1];
  const target_dB = selectedLevel.db;

  // Distance and amplifier power (for "current SPL" preview only)
  const [distance, setDistance] = useState("3.0"); // meters
  const [ampPower, setAmpPower] = useState("100"); // watts (for current SPL readout)

  // Artcoustic primary
  const [artId, setArtId] = useState(ARTCOUSTIC_VISIBLE[0]?.id || "");
  const art = useMemo(() => ARTCOUSTIC_VISIBLE.find((s) => s.id === artId) || null, [artId]);

  // If the selected art speaker is no longer visible (e.g., it was a subwoofer and got filtered out),
  // reset to the first available visible speaker.
  if (!art && ARTCOUSTIC_VISIBLE.length && !ARTCOUSTIC_VISIBLE.find(s => s.id === artId)) {
    setArtId(ARTCOUSTIC_VISIBLE[0].id);
  }

  // Third‑party comparators (up to 2)
  const [comparators, setComparators] = useState([
    { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8" },
  ]);

  const addComparator = () => {
    if (comparators.length >= 2) return;
    setComparators((prev) => [...prev, { brand: "", model: "", sensitivity: "", max_power: "", price: "", sensUnit: "1W@1m", nominalOhms: "8" }]);
  };
  const updateComparator = (idx, patch) => {
    setComparators((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeComparator = (idx) => {
    setComparators((prev) => prev.filter((_, i) => i !== idx));
  };

  // Parsed inputs
  const d = numOrNull(distance);
  const P = numOrNull(ampPower);
  const artSens = numOrNull(art?.sensitivity);
  const artMax = numOrNull(art?.max_power);

  // Artcoustic computations
  const artSPL = calcSPL(artSens, P, d);
  const artPReq = calcPowerRequired(artSens, target_dB, d);
  const artOver = (artPReq != null && Number.isFinite(artMax)) ? artPReq > artMax : false;
  const artHeadroom = (Number.isFinite(artSPL) && Number.isFinite(target_dB)) ? (artSPL - target_dB) : null;

  // PDF export (print the comparison panel)
  const exportPDF = useCallback(() => {
    try {
      const node = document.getElementById("calculator-printable");
      if (!node) return window.print(); // fallback
      const win = window.open("", "_blank", "noopener");
      if (!win) return;
      const html = `
        <html>
          <head>
            <title>Acoustic Calculator — Export</title>
            <style>
              body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: ${BRAND.text}; }
              h1, h2 { margin: 0 0 12px; }
              .panel { border: 1px solid ${BRAND.border}; padding: 16px; border-radius: 12px; background: #fff; }
            </style>
          </head>
          <body>
            <h1>Acoustic Calculator Export</h1>
            <div style="margin:6px 0 16px; font-size: 14px; color:${BRAND.subtext}">
              Mode: ${mode === "LCR" ? "LCR" : "Surrounds"} · RP22 ${mode === "LCR" ? "Param 12" : "Param 13"} · Target: ${target_dB} dB(C) · Distance: ${distance} m
            </div>
            <div class="panel">${node.innerHTML}</div>
            <div style="margin-top:16px; font-size:12px; color:${BRAND.subtext}">
              ${RP22.LCR.label}. Levels: 102/105/108/111 dB(C).<br/>
              ${RP22.SUR.label}. Levels: 99/102/105/108 dB(C).
            </div>
            <script>setTimeout(()=>window.print(), 250);</script>
          </body>
        </html>
      `;
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      window.print();
    }
  }, [mode, target_dB, distance]);

  // Wire selected Artcoustic to project summary
  function useInProject(kind /* "LCR"|"SUR" */) {
    if (!activeId || !art) return alert("Open or create a Project first.");
    const patch =
      kind === "LCR"
        ? { lcrModel: `${art.brand} ${art.model}`, dolbyLayout: undefined, targetSPL_LCR_dB: target_dB }
        : { surroundModel: `${art.brand} ${art.model}` };
    if (typeof setSummaryFor === "function") setSummaryFor(activeId, patch);
    else if (typeof mergeSummary === "function") mergeSummary(patch);
    alert(`${kind} set to ${art.brand} ${art.model} for project ${activeId}.`);
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, margin: 0, color: BRAND.text }}>Acoustic Calculator</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Button tone="green" onClick={() => window.open("https://calendly.com/solutes-impish-0i/artcoustic-showroom", "_blank", "noopener noreferrer")} title="Book a Demo with Artcoustic">Book a Demo</Button>
          <Button tone="blue" onClick={exportPDF} title="Export a printable comparison">Export PDF</Button>
        </div>
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
          {/* Amplifier Power (W) — entry guidance */}
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: BRAND.subtext, marginBottom: 6 }}
            >
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
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: BRAND.hint,
                lineHeight: 1.35,
              }}
            >
              Recommend entering <strong>~50% of quoted amplifier power</strong> (≈ −3&nbsp;dB margin) to reflect continuous, unclipped operation.
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
                {ARTCOUSTIC_VISIBLE.map((opt) => {
                  const spl = calcSPL(opt.sensitivity, P, d);
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
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 24,
                          borderRadius: 3,
                          background: tone,
                          marginRight: 10,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.brand} {opt.model}</div>
                        <div style={{ fontSize: 12, color: BRAND.subtext }}>
                          {opt.sensitivity} dB, {opt.max_power} W{Number.isFinite(opt.price) ? `, £${opt.price?.toLocaleString()}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Field>

          <div>
            <div
              style={{
                border: `1px solid ${BRAND.border}`,
                borderRadius: 10,
                padding: 12,
                background: "#FFF",
                fontSize: 13,
                color: BRAND.text,
              }}
            >
              {art ? (
                <>
                  <div><strong>{art.brand} {art.model}</strong></div>
                  <div>Sensitivity: {art.sensitivity} dB @ 1W/1m</div>
                  <div>Max Power: {art.max_power} W</div>
                  {Number.isFinite(art.price) && <div>Price: £{art.price.toLocaleString()}</div>}
                  <div style={{ marginTop: 6, color: BRAND.hint }}>{art.description || "—"}</div>
                </>
              ) : "Select a speaker"}
            </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                  <Field label="Brand">
                    <input value={c.brand} onChange={(e) => updateComparator(idx, { brand: e.target.value })} style={inputStyle()} placeholder="e.g. OtherBrand" />
                  </Field>
                  <Field label="Model">
                    <input value={c.model} onChange={(e) => updateComparator(idx, { model: e.target.value })} style={inputStyle()} placeholder="e.g. X100" />
                  </Field>
                  <Field label="Sensitivity (dB)">
                    <input
                      value={c.sensitivity}
                      onChange={(e) => updateComparator(idx, { sensitivity: e.target.value })}
                      style={inputStyle()}
                      placeholder="e.g. 90"
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Max Power (W)">
                    <input value={c.max_power} onChange={(e) => updateComparator(idx, { max_power: e.target.value })} style={inputStyle()} placeholder="e.g. 150" inputMode="decimal" />
                  </Field>
                  <Field label="Price (£)">
                    <input value={c.price} onChange={(e) => updateComparator(idx, { price: e.target.value })} style={inputStyle()} placeholder="e.g. 1500" inputMode="decimal" />
                  </Field>
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                        <label style={{ display: "block", fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>Sensitivity Spec</label>
                        <select
                            value={c.sensUnit}
                            onChange={(e) => updateComparator(idx, { sensUnit: e.target.value })}
                            style={{ ...inputStyle(), padding: "8px 10px" }}
                        >
                            <option value="1W@1m">dB @ 1 W / 1 m</option>
                            <option value="2.83V@1m">dB @ 2.83 V / 1 m</option>
                        </select>
                        <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>Anechoic Measurement</div>
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: 12, color: BRAND.subtext, marginBottom: 4 }}>Nominal Impedance (Ω)</label>
                        <input
                            inputMode="numeric"
                            value={c.nominalOhms}
                            onChange={(e) => updateComparator(idx, { nominalOhms: e.target.value })}
                            style={{ ...inputStyle(), padding: "8px 10px" }}
                            placeholder="e.g. 8"
                            disabled={c.sensUnit === '1W@1m'}
                        />
                        <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>Only needed when spec is at 2.83 V.</div>
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
      <SegmentBoundary name="CalculatorResults">
        <div
          id="calculator-printable"
          style={{
            background: BRAND.panel,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, margin: 0, marginBottom: 12, color: BRAND.text }}>Comparison</h2>

          {/* Results for Artcoustic speaker */}
          {art && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0, marginBottom: 8, color: BRAND.text }}>
                {art.brand} {art.model}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ResultTile
                  label={`SPL @ ${distance}m / ${ampPower}W`}
                  valueText={Number.isFinite(artSPL) ? `${artSPL.toFixed(1)} dB` : "—"}
                  valueNum={artSPL}
                  targetNum={target_dB}
                />
                <ResultTile
                  label="Headroom vs target"
                  valueText={Number.isFinite(artHeadroom) ? `${artHeadroom.toFixed(1)} dB` : "—"}
                  valueNum={artSPL}
                  targetNum={target_dB}
                />
              </div>
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
              {art ? `${art.brand} ${art.model}${Number.isFinite(art.price) ? ` — £${art.price}` : ""}` : "—"}
            </div>
            <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
              {Number.isFinite(artSens) ? `${artSens} dB @1W/1m` : "—"}
            </div>
            <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
              {Number.isFinite(artMax) ? `${artMax} W` : "—"}
            </div>
            <div style={{ 
              ...tileStyles(toneForSPL(artSPL, target_dB))
            }}>
              {artSPL != null ? `${artSPL.toFixed(1)} dB` : "—"}
            </div>
            <div
              style={{
                ...tileStyles(toneForPowerRequired(artPReq, artMax))
              }}
              title={artOver && artPReq != null && Number.isFinite(artMax) ? `Required ${artPReq.toFixed(0)} W exceeds max ${artMax} W` : undefined}
            >
              {artPReq != null
                ? Number.isFinite(artMax) && artOver
                  ? `${artPReq.toFixed(0)} W > ${artMax} W`
                  : `${artPReq.toFixed(0)} W`
                : "—"}
            </div>
          </div>

          {/* Comparator rows */}
          {comparators.map((c, idx) => {
            const normalizedSens = normalizeTo1W(c.sensitivity, c.sensUnit, c.nominalOhms);
            const s = numOrNull(normalizedSens);
            const m = numOrNull(c.max_power);
            const spl = calcSPL(s, P, d);
            const preq = calcPowerRequired(s, target_dB, d);
            const over = (preq != null && Number.isFinite(m)) ? preq > m : false;

            return (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginTop: 8, alignItems: "stretch" }}>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {`${c.brand || "—"} ${c.model || ""}`.trim()} {Number.isFinite(numOrNull(c.price)) ? `— £${Number(numOrNull(c.price)).toLocaleString()}` : ""}
                </div>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {Number.isFinite(s) ? `${s.toFixed(1)} dB @1W/1m` : "—"} <span style={{ color: BRAND.subtext }}>(Anechoic)</span>
                </div>
                <div style={{ padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                  {Number.isFinite(m) ? `${m} W` : "—"}
                </div>
                <div style={{ 
                  ...tileStyles(toneForSPL(spl, target_dB))
                }}>
                  {spl != null ? `${spl.toFixed(1)} dB` : "—"}
                </div>
                <div
                  style={{
                    ...tileStyles(toneForPowerRequired(preq, m))
                  }}
                  title={over && preq != null && Number.isFinite(m) ? `Required ${preq.toFixed(0)} W exceeds max ${m} W` : undefined}
                >
                  {preq != null
                    ? Number.isFinite(m) && over
                      ? `${preq.toFixed(0)} W > ${m} W`
                      : `${preq.toFixed(0)} W`
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </SegmentBoundary>

      {/* RP22 footnotes (credibility) */}
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
      >
        <div><strong>RP22 Reference:</strong></div>
        <div style={{ marginTop: 6 }}>
          <strong>Param 12 (Screen):</strong> {RP22.LCR.label}. Levels: L1 102 dB(C), L2 105 dB(C), L3 108 dB(C), L4 111 dB(C).
        </div>
        <div style={{ marginTop: 6 }}>
          <strong>Param 13 (Non‑screen/Surrounds):</strong> {RP22.SUR.label}. Levels: L1 99 dB(C), L2 102 dB(C), L3 105 dB(C), L4 108 dB(C).
        </div>
      </div>

      {/* Always-visible additional notes (subtle) */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: `1px dashed ${BRAND.border}`,
          borderRadius: 8,
          background: BRAND.panel,
          color: BRAND.subtext,
          fontSize: 12,
          lineHeight: 1.5,
        }}
        aria-labelledby="calc-notes-title"
      >
        <div id="calc-notes-title" style={{ fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
          Additional Notes
        </div>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>
            Enter amplifier power as ~50% of the quoted spec to model continuous headroom and avoid clipping artifacts.
          </li>
          <li>
            This guidance aligns with RP22 practice; peak bursts and dynamic headroom are handled by the target level definitions.
          </li>
        </ul>
      </div>
    </div>
  );
}
