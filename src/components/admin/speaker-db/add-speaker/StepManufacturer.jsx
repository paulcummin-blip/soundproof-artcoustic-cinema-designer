// StepManufacturer.jsx — Step 1: Select an Active manufacturer

import React from "react";
import { Building2, Check } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
};

export default function StepManufacturer({ manufacturers, selected, onSelect }) {
  const active = manufacturers.filter((m) => m.status === "Active");

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Select Manufacturer</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Only Active manufacturers are shown. If the manufacturer is not listed, add it first in the Manufacturers tab.
        </p>
      </div>

      {active.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext, background: BRAND.bg, borderRadius: 10, border: `1px solid ${BRAND.border}` }}>
          No active manufacturers found. Add a manufacturer first.
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {active.map((m) => {
            const isSelected = selected?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className="flex items-center gap-3 p-4 rounded-lg text-left transition-all"
                style={{
                  border: `2px solid ${isSelected ? BRAND.green : BRAND.border}`,
                  background: isSelected ? BRAND.green + "08" : BRAND.card,
                  cursor: "pointer",
                }}
              >
                <Building2 className="w-5 h-5 flex-shrink-0" style={{ color: isSelected ? BRAND.green : BRAND.subtext }} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{m.name}</div>
                  {m.website && (
                    <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.website}
                    </div>
                  )}
                </div>
                {isSelected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.green }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}