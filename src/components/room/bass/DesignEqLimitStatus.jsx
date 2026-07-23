import React from "react";
import { Switch } from "@/components/ui/switch";

export default function DesignEqLimitStatus({ enabled, onChange }) {
  const limits = "balanced profile limits, capability-limited";
  return <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{ fontSize: 11, color: "#625143", fontFamily: "monospace" }}>Design EQ for P14:</span>
    <Switch checked={!!enabled} onCheckedChange={onChange} />
    <span style={{ fontSize: 10, color: "#8B7F76", fontFamily: "monospace" }}>{enabled ? "On" : "Off"} ({limits})</span>
  </div>;
}