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
    0: { background: "#FBE9E7", color: "#A7302F", text: "Fail" },
  };
  const pal = map[level ?? 0];
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
        let p18Debug = null;
        if (isP18) {
          try {
            const src = rp22?.gradedParameters?.primary?.[18] ?? null;
            const dbg = rp22?.__p18Debug ?? null;
            const splAt = dbg?.splAtFreqs ?? {};
            p18Debug = (
              <div style={{
                marginTop: 8, paddingTop: 8, borderTop: "1px dashed #C1B6AD",
                fontSize: 10, lineHeight: 1.35, color: "#625143",
                fontFamily: "monospace", wordBreak: "break-all",
              }}>
                <div><b>source:</b> gradedParameters.primary[18]</div>
                <div><b>value:</b> {String(src?.value)}</div>
                <div><b>formatted:</b> {String(src?.formatted)}</div>
                <div><b>level:</b> {String(src?.level)}</div>
                <div><b>responseData source seatId:</b> {String(dbg?.rspSeatId)}</div>
                <div><b>responseData first point:</b> {dbg?.sorted0 ? JSON.stringify(dbg.sorted0) : "n/a"}</div>
                <div><b>responseData @15Hz:</b> {String(splAt[15])}</div>
                <div><b>responseData @20Hz:</b> {String(splAt[20])}</div>
                <div><b>responseData @22Hz:</b> {String(splAt[22])}</div>
                <div><b>responseData @25Hz:</b> {String(splAt[25])}</div>
                <div><b>responseData @40Hz:</b> {String(splAt[40])}</div>
                <div><b>responseData @60Hz:</b> {String(splAt[60])}</div>
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
            {p18Debug}
          </div>
        );
      })}
    </div>
  );
}