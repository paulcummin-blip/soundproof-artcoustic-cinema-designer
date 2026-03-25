import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function AimLoudspeakerPanel({
  lcrAimMode, setLcrAimMode, isFrozen,
  screenFrontPlaneM,
  aimFrontWidesAtMLP, setAimFrontWidesAtMLP,
  aimSideSurroundsAtMLP, setAimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP, setAimRearSurroundsAtMLP,
  inRoomDepthsCm,
}) {
  const _isNum = (v) => typeof v === "number" && Number.isFinite(v);

  return (
    <details className="mt-4 mb-4 px-4">
      <div className="rounded-lg bg-[#F8F8F7] px-3 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700 list-none flex items-center justify-between">
          <span className="text-[#625143]">Loudspeaker Aiming</span>
          <svg className="w-4 h-4 transition-transform" style={{ transform: 'rotate(0deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="aim-lcr" className="text-sm">Left / Right</Label>
            <Switch
              id="aim-lcr"
              checked={lcrAimMode === "angled"}
              onCheckedChange={(checked) => setLcrAimMode(checked ? "angled" : "flat")}
              disabled={isFrozen('speakers')}
            />
          </div>
          <div className="text-xs text-gray-500 pl-1 pt-1 text-right">
            Front wall → screen: {_isNum(screenFrontPlaneM) ? `${Math.round(screenFrontPlaneM * 100)} cm` : '—'}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="aim-front-wides" className="text-sm">Front Wides</Label>
            <Switch
              id="aim-front-wides"
              checked={aimFrontWidesAtMLP || false}
              onCheckedChange={setAimFrontWidesAtMLP}
              disabled={isFrozen('speakers')}
            />
          </div>
          <div className="text-xs text-gray-500 pl-1 pt-1 text-right">
            In-room depth: {inRoomDepthsCm.frontWides !== null ? `${inRoomDepthsCm.frontWides} cm` : '—'}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="aim-side-surrounds" className="text-sm">Side Surrounds</Label>
            <Switch
              id="aim-side-surrounds"
              checked={aimSideSurroundsAtMLP || false}
              onCheckedChange={setAimSideSurroundsAtMLP}
              disabled={isFrozen('speakers')}
            />
          </div>
          <div className="text-xs text-gray-500 pl-1 pt-1 text-right">
            In-room depth: {inRoomDepthsCm.sideSurrounds !== null ? `${inRoomDepthsCm.sideSurrounds} cm` : '—'}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="aim-rear-surrounds" className="text-sm">Rear Surrounds</Label>
            <Switch
              id="aim-rear-surrounds"
              checked={aimRearSurroundsAtMLP || false}
              onCheckedChange={setAimRearSurroundsAtMLP}
              disabled={isFrozen('speakers')}
            />
          </div>
          <div className="text-xs text-gray-500 pl-1 pt-1 text-right">
            In-room depth: {inRoomDepthsCm.rearSurrounds !== null ? `${inRoomDepthsCm.rearSurrounds} cm` : '—'}
          </div>
        </div>
      </div>
    </details>
  );
}