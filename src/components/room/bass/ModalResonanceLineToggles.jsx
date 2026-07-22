import React from "react";
import { Switch } from "@/components/ui/switch";
import { ROOM_MODE_STYLES } from "@/components/room/bass/roomModePresentation";

export default function ModalResonanceLineToggles({ show, onShowChange, toggles, onToggle }) {
  return <div className="mt-2 border-t border-border pt-2">
    <div className="flex items-center gap-2 text-xs font-medium text-foreground">
      <Switch id="show-room-modes" checked={show} onCheckedChange={onShowChange} />
      <label htmlFor="show-room-modes">Show room modes</label>
    </div>
    {show && <div className="mt-2 flex flex-wrap gap-3">
      {Object.entries(ROOM_MODE_STYLES).map(([key, style]) => <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={toggles[key] !== false} onChange={() => onToggle(key)} />
        <span className="inline-block h-0.5 w-5" style={{ backgroundColor: style.color }} />
        {style.label}
      </label>)}
    </div>}
  </div>;
}