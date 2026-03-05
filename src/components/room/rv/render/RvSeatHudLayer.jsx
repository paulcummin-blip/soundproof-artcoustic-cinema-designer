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
}) {
  if (exportMode === 'clean') return null;

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
    />
  );
}