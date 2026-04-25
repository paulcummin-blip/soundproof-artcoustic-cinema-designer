import React, { useMemo } from "react";
import AimLoudspeakerPanel from "@/components/roomdesigner/AimLoudspeakerPanel";
import buildAimSplAtRsp from "@/components/roomdesigner/utils/buildAimSplAtRsp";

export default function AimLoudspeakerControls({
  lcrAimMode,
  setLcrAimMode,
  isFrozen,
  screenFrontPlaneM,
  aimFrontWidesAtMLP,
  setAimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  setAimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  setAimRearSurroundsAtMLP,
  inRoomDepthsCm,
  allSeatSplMetrics,
  primarySeatingPosition,
}) {
  const splAtRsp = useMemo(() => buildAimSplAtRsp({
    allSeatSplMetrics,
    primarySeatingPosition,
  }), [allSeatSplMetrics, primarySeatingPosition]);

  return (
    <AimLoudspeakerPanel
      lcrAimMode={lcrAimMode}
      setLcrAimMode={setLcrAimMode}
      isFrozen={isFrozen}
      screenFrontPlaneM={screenFrontPlaneM}
      aimFrontWidesAtMLP={aimFrontWidesAtMLP}
      setAimFrontWidesAtMLP={setAimFrontWidesAtMLP}
      aimSideSurroundsAtMLP={aimSideSurroundsAtMLP}
      setAimSideSurroundsAtMLP={setAimSideSurroundsAtMLP}
      aimRearSurroundsAtMLP={aimRearSurroundsAtMLP}
      setAimRearSurroundsAtMLP={setAimRearSurroundsAtMLP}
      inRoomDepthsCm={inRoomDepthsCm}
      splAtRsp={splAtRsp}
    />
  );
}