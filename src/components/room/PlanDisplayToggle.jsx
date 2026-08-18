import React from "react";
import { Switch } from "@/components/ui/switch";

/**
 * Shared On/Off row toggle for Plan View display options.
 * Used by "Show room dimensions on plan" and "Speaker Positions"
 * so both controls share identical typography, sizing and layout.
 */
export default function PlanDisplayToggle({ label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[#3E4349]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}