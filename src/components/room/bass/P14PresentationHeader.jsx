import React from "react";

const formatDb = (value, digits = 1) =>
  Number.isFinite(value) ? Number(value).toFixed(digits) : "—";

export default function P14PresentationHeader({
  selectedP14TargetDb,
  selectedP14Level,
  selectedP14TargetBasis,
  availableP14CapabilityDb,
  achievedP19VariationDb,
  achievedP19Level,
}) {
  const targetDb = Number.isFinite(selectedP14TargetDb) ? Math.round(selectedP14TargetDb) : null;
  const basisLabel = selectedP14TargetBasis === "recommended" ? "Recommended" : "Minimum";
  const levelNum = Math.max(1, Math.min(4, Math.round(Number(selectedP14Level) || 1)));
  const capabilityDb = Number.isFinite(availableP14CapabilityDb) ? availableP14CapabilityDb : null;
  const headroomDb = capabilityDb != null && targetDb != null ? capabilityDb - targetDb : null;
  const p19Variation = Number.isFinite(achievedP19VariationDb) ? achievedP19VariationDb : null;
  const p19Available = p19Variation != null && Number.isFinite(achievedP19Level);
  const p19Pass = p19Available && achievedP19Level >= 1;

  const cardStyle = {
    flex: "1 1 220px",
    minWidth: 200,
    border: "1px solid #DCDBD6",
    borderRadius: 8,
    background: "#F8F8F7",
    padding: "10px 14px",
  };

  const titleStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
  };

  const valueStyle = (color) => ({
    fontSize: 22,
    fontWeight: 700,
    color,
    marginTop: 2,
  });

  const subtitleStyle = (color) => ({
    fontSize: 11,
    color,
    marginTop: 2,
    fontWeight: 600,
  });

  const captionStyle = {
    fontSize: 10,
    color: "#8B7F76",
    marginTop: 2,
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      {/* P14 Total LFE Target */}
      <div style={cardStyle}>
        <div style={titleStyle}>P14 Total LFE Target</div>
        <div style={valueStyle("#213428")}>{targetDb != null ? `${targetDb} dBC` : "—"}</div>
        <div style={subtitleStyle("#3E4349")}>{basisLabel} Level {levelNum}</div>
        <div style={captionStyle}>Integrated across the P14 assessment band</div>
      </div>

      {/* Available P14 Capability */}
      <div style={cardStyle}>
        <div style={titleStyle}>Available P14 Capability</div>
        <div style={valueStyle("#213428")}>{capabilityDb != null ? `${formatDb(capabilityDb)} dBC` : "—"}</div>
        <div style={subtitleStyle(headroomDb != null && headroomDb >= 0 ? "#213428" : "#b45309")}>
          {headroomDb != null ? `${formatDb(headroomDb)} dB headroom after EQ` : "—"}
        </div>
        <div style={captionStyle}>Product capability, not frequency-response conformity</div>
      </div>

      {/* P19 Response Fit */}
      {p19Available && (
        <div style={cardStyle}>
          <div style={titleStyle}>P19 Response Fit</div>
          <div style={valueStyle(p19Pass ? "#213428" : "#b45309")}>±{formatDb(p19Variation)} dB</div>
          <div style={subtitleStyle(p19Pass ? "#213428" : "#b45309")}>{p19Pass ? "PASS" : "FAIL"}</div>
          <div style={captionStyle}>Response deviation from house target</div>
        </div>
      )}
    </div>
  );
}