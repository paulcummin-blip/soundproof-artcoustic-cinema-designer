import React from "react";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/components/AppStateProvider";

export default function DesignEqLimitStatus({ enabled, onChange }) {
  const { splConfig } = useAppState();
  const rawLevel = splConfig?.selectedP14Level ?? splConfig?.bassTargetLevel;
  // Explicit null guard: Number(null) === 0, which would coerce to L1 via `|| 4`.
  const targetLevel = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const targetBasis = splConfig?.selectedP14TargetBasis === "recommended" ? "Recommended" : "Minimum";
  return <div className="flex flex-col gap-1 text-xs text-muted-foreground">
    <div className="flex items-center gap-2"><span className="font-semibold text-foreground">Design EQ</span><Switch checked={!!enabled} onCheckedChange={onChange} /><span>{enabled ? "On" : "Off"}</span></div>
    <span>Target: {targetLevel != null ? `RP22 ${targetBasis} L${targetLevel} House Curve` : "Select Bass Target"}</span>
    <span>Limits: +6 dB boost · -15 dB cut · Protected nulls</span>
  </div>;
}