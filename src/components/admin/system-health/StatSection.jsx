import React from "react";
import StatCard from "@/components/admin/system-health/StatCard";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349" };

// Reusable section: a titled row of StatCards. Props: title, stats: [{label, value}].
export default function StatSection({ title, stats }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </div>
  );
}