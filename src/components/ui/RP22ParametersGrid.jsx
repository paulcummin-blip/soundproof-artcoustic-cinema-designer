import React from "react";
import { rp22Parameters } from "@/components/data/rp22Parameters";

// tiny pill using inline styles only
function Pill({ level }) {
  const base = {
    border: "1px solid #C1B6AD",
    borderRadius: 10,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  const map = {
    4: { background: "#F6F3EE", color: "#213428", text: "L4" },
    3: { background: "#E9ECEF", color: "#3E4349", text: "L3" },
    2: { background: "#EFEAE4", color: "#625143", text: "L2" },
    1: { background: "#FBE9E7", color: "#A7302F", text: "L1" },
    0: { background: "#FBE9E7", color: "#A7302F", text: "FAIL" },
    [-1]: { background: "#F3F4F6", color: "#9CA3AF", text: "—" },
  };
  const pal = map[level ?? -1];
  return <span style={{ ...base, ...pal }}>{pal.text}</span>;
}

// Build the displayed list from the official parameter definitions,
// sorted by parameter number/id — no second source of truth.
const PARAM_LABELS = rp22Parameters
  .slice()
  .sort((a, b) => a.number - b.number)
  .map((p) => `${p.number}. ${p.name}`);

export default function RP22ParametersGrid({ rp22 }) {
  // Normalize the graded parameters into a simple array of levels
  const levels = React.useMemo(() => {
    const graded = rp22?.gradedParameters?.primary || {};
    return PARAM_LABELS.map((_, i) => {
      const paramId = i + 1;
      const paramData = graded[paramId];

      // P14: level is stored as a string "L1".."L4" or null. Distinguish
      // "no data" (—) from "below L1" (FAIL) using the status field.
      if (paramId === 14) {
        if (!paramData || paramData.status === "no_data") return -1; // "—"
        const m = String(paramData?.level ?? "").match(/^L(\d)$/i);
        if (m) return Math.max(0, Math.min(4, parseInt(m[1], 10)));
        return 0; // valid calc but below L1 → FAIL
      }

      const lvl = typeof paramData?.level === "number" ? paramData.level : 0;
      return Math.max(0, Math.min(4, lvl));
    });
  }, [rp22]);

  const cardStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #C1B6AD",
    borderRadius: 12,
    padding: 12,
  };

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
  };

  const labelStyle = { color: "#3E4349", fontSize: 12, fontFamily: 'Didact Gothic, sans-serif' };

  if (!rp22 || !rp22.gradedParameters) {
    return (
      <div style={cardStyle}>
        <div style={{ color: "#625143", fontSize: 12, fontFamily: 'Didact Gothic, sans-serif' }}>
          RP22 analysis not available yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {PARAM_LABELS.map((label, i) => {
        const isP18 = i === 17; // Parameter 18 (1-based id = i+1)
        const isP14 = i === 13; // Parameter 14 (1-based id = i+1)

        let p14Display = null;
        if (isP14) {
          try {
            const p14src = rp22?.gradedParameters?.primary?.[14] ?? null;
            const rawVal = typeof p14src?.value === "number" ? p14src.value : null;
            const hasData = p14src && p14src.status !== "no_data" && rawVal != null;
            const displayVal = hasData ? Math.ceil(rawVal) : null;
            p14Display = hasData ? (
              <div style={{
                marginTop: 8, paddingTop: 8, borderTop: "1px dashed #C1B6AD",
                fontSize: 11, lineHeight: 1.4, color: "#3E4349",
                fontFamily: "Didact Gothic, sans-serif",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#625143", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                  Achieved SPL (rounded up)
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#213428" }}>
                  {displayVal} dB
                </div>
              </div>
            ) : null;
          } catch (e) {
            p14Display = null;
          }
        }

        let p18Debug = null;
        if (isP18) {
          try {
            const src = rp22?.gradedParameters?.primary?.[18] ?? null;
            const dbg = rp22?.__p18Debug ?? null;
            const splAt = dbg?.splAtFreqs ?? {};
            const targets = Array.isArray(src?.targets) ? src.targets : [];
            const officialLevel = src?.officialCoupledLevel ?? null;

            const capabilityRows = targets.length > 0
              ? targets.map((t) => {
                  const extText = !t.achievable || t.extensionHz == null
                    ? "Not achievable"
                    : t.bounded
                      ? `≤ ${Math.round(t.extensionHz)} Hz`
                      : `${Math.round(t.extensionHz)} Hz`;
                  const passes = t.achievable && t.extensionHz != null && t.passesFrequency;
                  return (
                    <div key={t.level} style={{
                      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8,
                      alignItems: "center", padding: "2px 0",
                    }}>
                      <span style={{ fontWeight: 600, color: "#3E4349" }}>{t.targetSplDb} dB</span>
                      <span style={{ textAlign: "center", color: "#625143" }}>→</span>
                      <span style={{
                        fontWeight: 600,
                        color: !t.achievable ? "#A7302F" : passes ? "#213428" : "#625143",
                      }}>{extText}</span>
                    </div>
                  );
                })
              : null;

            const officialRow = (
              <div style={{
                marginTop: 6, paddingTop: 6, borderTop: "1px solid #C1B6AD",
                fontSize: 12, fontWeight: 600, color: "#213428",
                fontFamily: "Didact Gothic, sans-serif",
              }}>
                Official coupled RP22 result: {officialLevel ?? "No level achieved"}
              </div>
            );

            p18Debug = (
              <div style={{
                marginTop: 8, paddingTop: 8, borderTop: "1px dashed #C1B6AD",
                fontSize: 11, lineHeight: 1.4, color: "#3E4349",
                fontFamily: "Didact Gothic, sans-serif",
              }}>
                {capabilityRows && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#625143", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                      Bass capability by SPL
                    </div>
                    {capabilityRows}
                  </div>
                )}
                {officialRow}
                <div style={{
                  marginTop: 8, paddingTop: 8, borderTop: "1px dashed #C1B6AD",
                  fontSize: 10, lineHeight: 1.35, color: "#625143",
                  fontFamily: "monospace", wordBreak: "break-all",
                }}>
                  <div><b>source:</b> gradedParameters.primary[18]</div>
                  <div><b>value:</b> {String(src?.value)}</div>
                  <div><b>formatted:</b> {String(src?.formatted)}</div>
                  <div><b>level:</b> {String(src?.level)}</div>
                  <div><b>officialCoupledLevel:</b> {String(officialLevel)}</div>
                  <div><b>p14Value:</b> {String(dbg?.p14Value)}</div>
                  <div><b>responseData source seatId:</b> {String(dbg?.rspSeatId)}</div>
                  <div><b>responseData @15Hz:</b> {String(splAt[15])}</div>
                  <div><b>responseData @20Hz:</b> {String(splAt[20])}</div>
                  <div><b>responseData @22Hz:</b> {String(splAt[22])}</div>
                  <div><b>responseData @25Hz:</b> {String(splAt[25])}</div>
                  <div><b>responseData @40Hz:</b> {String(splAt[40])}</div>
                  <div><b>responseData @60Hz:</b> {String(splAt[60])}</div>
                </div>
              </div>
            );
          } catch (e) {
            p18Debug = <div style={{ fontSize: 10, color: "#A7302F", marginTop: 8 }}>P18 debug render error: {String(e)}</div>;
          }
        }
        return (
          <div key={i} style={cardStyle}>
            <div style={rowStyle}>
              <div style={labelStyle}>{label}</div>
              <Pill level={levels[i]} />
            </div>
            {p14Display}
            {p18Debug}
          </div>
        );
      })}
    </div>
  );
}