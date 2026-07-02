import React from "react";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349", border: "#DCDBD6" };

// Reusable, self-contained metric tile. Props: label, value.
export default function StatCard({ label, value }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: 10,
      padding: "14px 16px", minWidth: 140,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text }}>{value}</div>
      <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>{label}</div>
    </div>
  );
}