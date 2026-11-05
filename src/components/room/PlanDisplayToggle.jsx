import React from "react";
import { Switch } from "@/components/ui/switch";

/**
 * Shared On/Off row toggle for Plan View display options.
 * Used by "Show room dimensions" and "Speaker Positions"
 * so both controls share identical typography, sizing and layout.
 *
 * `tooltip` — optional concise help text shown next to the label when the
 * control is disabled (e.g. "Available in Plan View"). Renders as a muted
 * inline note so the user understands the option exists but is unavailable
 * in the current drawing view.
 */
export default function PlanDisplayToggle({ label, checked, onChange, disabled, tooltip }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span
          className={`text-sm font-medium ${
            disabled ? "text-[#9CA3AF]" : "text-[#3E4349]"
          }`}
        >
          {label}
        </span>
        {disabled && tooltip ? (
          <span className="text-[11px] text-[#9CA3AF]" style={{ marginTop: 2 }}>
            {tooltip}
          </span>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}