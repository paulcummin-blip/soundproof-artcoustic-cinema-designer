import React from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
};

const STATUS_COLORS = {
  healthy: "#213428",
  operational: "#213428",
  active: "#213428",
  warning: "#625143",
  setup_required: "#625143",
  offline: "#B23A3A",
  error: "#B23A3A",
};

function StatusBadge({ status }) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "_");
  const color = STATUS_COLORS[key] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 11, fontWeight: 600, color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

/**
 * Reusable admin landing-page card.
 * Props: title, description, status, count, href
 */
export default function AdminSectionCard({ title, description, status, count, href }) {
  return (
    <a
      href={href}
      style={{
        display: "block", textDecoration: "none",
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 14, padding: 22,
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.text }}>{title}</div>
        <StatusBadge status={status} />
      </div>
      <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 16, lineHeight: 1.4 }}>
        {description}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
          {count}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#213428" }}>
          Manage →
        </span>
      </div>
    </a>
  );
}