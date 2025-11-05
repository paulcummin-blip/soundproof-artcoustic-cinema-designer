import React from "react";
import { rp22Parameters } from "@/components/data/rp22Parameters";

export default function RP22ParameterAddendum() {
  const BRAND = {
    text: "#1B1A1A",
    subtext: "#3E4349",
    border: "#DCDBD6",
    panel: "#FFFFFF",
  };

  const p12 = rp22Parameters.find((p) => p.number === 12);
  const p13 = rp22Parameters.find((p) => p.number === 13);

  return (
    <div
      style={{
        marginTop: 16,
        borderTop: `1px solid ${BRAND.border}`,
        paddingTop: 12,
        color: BRAND.subtext,
        fontSize: 13,
        lineHeight: 1.5,
      }}
      aria-label="RP22 parameter addendum"
    >
      {p12 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>
            RP22 Parameter {p12.number}
          </div>
          <div style={{ marginBottom: 4 }}>{p12.name}</div>
          <div style={{ fontSize: 12 }}>{p12.description}</div>
        </div>
      )}

      {p13 && (
        <div>
          <div style={{ fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>
            RP22 Parameter {p13.number}
          </div>
          <div style={{ marginBottom: 4 }}>{p13.name}</div>
          <div style={{ fontSize: 12 }}>{p13.description}</div>
        </div>
      )}
    </div>
  );
}