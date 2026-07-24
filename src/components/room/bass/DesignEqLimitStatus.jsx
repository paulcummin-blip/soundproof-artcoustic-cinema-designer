import React from "react";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/components/AppStateProvider";

export default function DesignEqLimitStatus({ enabled, onChange }) {
  const { splConfig } = useAppState();
  const targetLevel = Math.max(1, Math.min(4, Number(splConfig?.bassTargetLevel) || 4));
  return <div className="flex flex-col gap-1 text-xs text-muted-foreground">
    <div className="flex items-center gap-2"><span className="font-semibold text-foreground">Design EQ</span><Switch checked={!!enabled} onCheckedChange={onChange} /><span>{enabled ? "On" : "Off"}</span></div>
    <span>Target: RP22 L{targetLevel} House Curve</span>
    <span>Limits: +6 dB boost · -15 dB cut · Protected nulls</span>
  </div>;
}