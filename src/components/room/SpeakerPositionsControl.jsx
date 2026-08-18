import React from "react";
import { Switch } from "@/components/ui/switch";

/**
 * On/Off toggle for speaker position measurements on the Plan View.
 * On  -> 'plan'  (measurements shown on Plan View only)
 * Off -> 'off'   (no measurements shown)
 * Legacy 'both' migrates to 'plan'; legacy 'table' migrates to 'off'.
 */
export default function SpeakerPositionsControl({ value, onChange }) {
  const checked = value === "plan";
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium text-[#3E4349]">Speaker Positions</div>
      <Switch
        checked={checked}
        onCheckedChange={(next) => onChange(next ? "plan" : "off")}
      />
    </div>
  );
}