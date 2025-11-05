import React from "react";

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

// minimal list of 21 parameter labels (keep order stable)
const PARAM_LABELS = [
  "1. Minimum distance between listener area and walls",
  "2. Decoder/renderer capability & discrete zones",
  "3. Screen wall speakers outside zonal locations",
  "4. Max SPL difference between screen speakers",
  "5. Max horizontal angle between surround speakers",
  "6. Surround vertical placement",
  "7. Surround to listener distance",
  "8. Surround to screen level consistency",
  "9. Bass management & sub placement",
  "10. Sub coverage consistency",
  "11. Seat-to-seat response variance",
  "12. Boundary interference mitigation",
  "13. Reverberation time (broadband)",
  "14. Reverberation time (bands)",
  "15. Noise floor",
  "16. Speaker directivity suitability",
  "17. Amplifier headroom",
  "18. Screen gain / brightness balance",
  "19. Seat sightlines",
  "20. Acoustic isolation target",
  "21. Calibration completeness",
];

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
      {PARAM_LABELS.map((label, i) => (
        <div key={i} style={cardStyle}>
          <div style={rowStyle}>
            <div style={labelStyle}>{label}</div>
            <Pill level={levels[i]} />
          </div>
        </div>
      ))}
    </div>
  );
}