import React from "react";

// Display-only control: shows/hides modal resonance ReferenceLines on the Bass Response
// graph by family. Does not touch bass calculation, SPL response, or mode generation.
const FAMILIES = [
  { key: "axialLength", label: "Axial Length" },
  { key: "axialWidth", label: "Axial Width" },
  { key: "axialHeight", label: "Axial Height" },
  { key: "tangentialLW", label: "Tangential Length/Width" },
  { key: "tangentialLH", label: "Tangential Length/Height" },
  { key: "tangentialWH", label: "Tangential Width/Height" },
  { key: "oblique", label: "Oblique" },
];

export default function ModalResonanceLineToggles({ toggles, onToggle, onSetAll }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #EFEDE8" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#625143", fontFamily: "monospace", fontWeight: 700 }}>
          Modal Resonance Line Toggles
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onSetAll(true)}
            style={{ height: 22, padding: "0 8px", borderRadius: 4, border: "1px solid #DCDBD6", background: "#F8F8F7", fontSize: 10, fontFamily: "monospace", cursor: "pointer", color: "#1B1A1A" }}
          >
            All on
          </button>
          <button
            onClick={() => onSetAll(false)}
            style={{ height: 22, padding: "0 8px", borderRadius: 4, border: "1px solid #DCDBD6", background: "#F8F8F7", fontSize: 10, fontFamily: "monospace", cursor: "pointer", color: "#1B1A1A" }}
          >
            All off
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {FAMILIES.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#3E4349", fontFamily: "monospace", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!toggles[key]}
              onChange={() => onToggle(key)}
              style={{ cursor: "pointer" }}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}