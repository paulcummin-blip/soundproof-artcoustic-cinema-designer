// RecentInvestigationsList.jsx
// The previous 3–5 investigations before the current active one. Collapsed by
// default; each row shows title, creation date/time, and status, and expands
// individually on click. Nothing inside loads until expanded.

import React from "react";
import LazyInvestigationRow from "@/components/room/bass/investigations/LazyInvestigationRow";

export default function RecentInvestigationsList({ items }) {
  if (!items.length) return null;

  return (
    <div style={{ marginBottom: 14, border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb", padding: "10px 12px" }}>
      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 8 }}>
        RECENT INVESTIGATIONS ({items.length})
      </div>
      {items.map((item) => (
        <LazyInvestigationRow key={item.key} item={item} />
      ))}
    </div>
  );
}