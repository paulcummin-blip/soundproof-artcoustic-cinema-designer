import React from 'react';
import SeatHud from '@/components/room/SeatHud';

export default function RvSeatHudLayer({
  exportMode,
  tooltipData,
  effectiveHoveredSeat,
  hudPosition,
  hudDynamicStyle,
  onHudHeaderMouseDown,
  hudElRef,
  setHudHiddenWhenPinned,
  hudHiddenWhenPinned,
  renderLevelBadge,
  isHudPinned,
}) {
  if (exportMode === 'clean') return null;

  const splPowerW = tooltipData?.splAtSeatMeta?.powerW;
  const splRadiationMode = tooltipData?.splAtSeatMeta?.radiationMode;

  return (
    <SeatHud
      tooltipData={tooltipData}
      effectiveHoveredSeat={effectiveHoveredSeat}
      hudPosition={hudPosition}
      hudDynamicStyle={hudDynamicStyle}
      onHudHeaderMouseDown={onHudHeaderMouseDown}
      hudElRef={hudElRef}
      setHudHiddenWhenPinned={setHudHiddenWhenPinned}
      hudHiddenWhenPinned={hudHiddenWhenPinned}
      renderLevelBadge={renderLevelBadge}
      splPowerW={splPowerW}
      splRadiationMode={splRadiationMode}
      isHudPinned={isHudPinned}
    />
  );
}