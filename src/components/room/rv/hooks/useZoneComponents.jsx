import { useMemo } from "react";
import { renderOverheadBandsSVG } from "@/components/room/overlays/OverheadZones";

export function useZoneComponents({
  seatingPositions,
  widthM,
  lengthM,
  scale,
  toPx,
  roomRect,
  mlpY_m,
  placedSpeakers,
  heightM,
  screen,
  lcrZoneBlocks,
  ZONE_DEPTH_M,
  frontWideZones,
  renderFrontWideZones,
  mlp,
  getCanonicalRole,
  overheadCount,
  overheadZones,
  overlaysForRendering,
  dolbyLayout,
  FADE_LEN_M,
}) {
  const ZoneComponents = useMemo(() => {
    // LCR Zone Component - Updated to use lcrZoneBlocks
    const LCRZoneComponent = ({ side }) => {
      // Only show LCR zone if floating mode is enabled and lcrZoneBlocks are available
      if (!lcrZoneBlocks) return null;

      const zone = lcrZoneBlocks[side];
      if (!zone) return null;

      // Convert room meter coordinates to canvas pixel coordinates
      const [xStartPx] = toPx(zone.x_start, 0);
      const [x2Px] = toPx(zone.x_end, 0);

      // Y-coordinates are from the front wall (y=0) to ZONE_DEPTH_M
      const yTopPx = (roomRect?.y ?? 0);
      const yBottomPx = (roomRect?.y ?? 0) + (ZONE_DEPTH_M * scale);

      const rectX = Math.min(xStartPx, x2Px);
      const rectWidth = Math.abs(x2Px - xStartPx);
      const rectY = yTopPx;
      const rectHeight = yBottomPx - yTopPx;

      const fill = side === 'left' ? '#4A230F' : '#213428';

      // Apply visual overhang for the display, similar to previous LCRZoneComponent
      const overhangM = 0.50;
      // Calculate extended room bounds in pixels from room's meter dimensions
      const [extendedRoomLeftPx] = toPx(0 - overhangM, 0);
      const [extendedRoomRightPx] = toPx(widthM + overhangM, 0);

      // Clamp the visual rectangle to the extended bounds for display
      const finalX = Math.max(extendedRoomLeftPx, rectX);
      const finalWidth = Math.min(extendedRoomRightPx, rectX + rectWidth) - finalX;

      return (
        <rect
          id={`LCR_ZONE_${side.toUpperCase()}`}
          x={finalX}
          y={rectY}
          width={finalWidth}
          height={rectHeight}
          fill={fill}
          fillOpacity="0.35"
        />
      );
    };

    // Side Surround Zone Component (Corrected positioning and seamless rendering)
    const SideSurroundZoneComponent = ({ side }) => {
      const fadeLen_px = FADE_LEN_M * scale;

      // ROOM BOUNDS
      const roomLeft = (roomRect?.x ?? 0);
      const roomRight = (roomRect?.x ?? 0) + (roomRect?.width ?? 0);
      const roomTop = (roomRect?.y ?? 0);
      const roomBottom = (roomRect?.y ?? 0) + (roomRect?.height ?? 0);

      // CORE POSITIONS
      // Use FRONT ROW (closest-to-screen seats) as the anchor for side surround zones.
      // Front row = smallest seat y. If no seats, fall back to mlpY_m (current behaviour).
      const seatYs_m = Array.isArray(seatingPositions)
        ? seatingPositions.map(s => Number(s?.y)).filter(Number.isFinite)
        : [];

      const frontRowY_m = seatYs_m.length ? Math.min(...seatYs_m) : Number(mlpY_m);
      const [, frontRowY_px_raw] = toPx(0, frontRowY_m);
      const [, rearWallY_px] = toPx(0, lengthM);
      const [, screenWallY_px] = toPx(0, 0);

      const bandW_px = ZONE_DEPTH_M * scale;
      const isLeft = side === "left";
      const fill = isLeft ? '#4A230F' : '#213428';

      // SIDE WALL X (inside room)
      const sideX_px = isLeft ? roomLeft : (roomRight - bandW_px);

      // VERTICAL BAND: Rendered as a single seamless rectangle
      const vTop_px = Math.max(roomTop, screenWallY_px);
      const vBottom_px = Math.min(roomBottom, rearWallY_px);
      const frontRowY_px = Math.max(vTop_px, Math.min(vBottom_px, frontRowY_px_raw));
      const mlpClamped_px = frontRowY_px;

      const fadeEndY_px = mlpClamped_px;
      const fadeStartY_px = Math.max(vTop_px, fadeEndY_px - fadeLen_px);
      const vBandStartY_px = fadeStartY_px;
      const vBandTotalHeight_px = Math.max(0, vBottom_px - vBandStartY_px);

      // HORIZONTAL BAND Y POSITION: Corrected to be inside the room
      const backH_px = bandW_px;
      const backY_px = Math.min(roomBottom, rearWallY_px) - backH_px;

      // HORIZONTAL BAND X extents (logic remains the same)
      const seatXs = seatingPositions.map(s => Number(s.x)).filter(Number.isFinite);
      const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : widthM * 0.35;
      const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : widthM * 0.65;
      const [leftSeat_px] = toPx(leftmostSeatX_m, 0);
      const [rightSeat_px] = toPx(rightmostSeatX_m, 0);

      const backSolidStart_px = isLeft ? roomLeft : Math.max(roomLeft, rightSeat_px);
      const backSolidEnd_px = isLeft ? Math.min(roomRight, leftSeat_px) : roomRight;
      const backSolidW_px = Math.max(0, backSolidEnd_px - backSolidStart_px);

      const backFadeW_px = fadeLen_px;
      const totalBackW_px = backSolidW_px + backFadeW_px;

      const gidV = `grad_side_vertical_${side}`;
      const gidB = `grad_side_back_${side}`;

      // NEW: Pre-calculate offset ratios for clarity and correctness
      const mlpOffsetRatio = vBandTotalHeight_px > 0 ? (mlpClamped_px - vBandStartY_px) / vBandTotalHeight_px : 0;
      const solidOffsetRatio = totalBackW_px > 0 ? backSolidW_px / totalBackW_px : 0;
      const fadeOffsetRatio = totalBackW_px > 0 ? backFadeW_px / totalBackW_px : 0;

      // Handle backRectWidth and backRectX properly for horizontal band
      let backRectWidth = 0;
      let backRectX = 0;
      if (isLeft) {
        backRectX = roomLeft;
        backRectWidth = Math.max(0, leftSeat_px - roomLeft + fadeLen_px);
      } else {
        backRectX = rightSeat_px - fadeLen_px;
        backRectWidth = Math.max(0, roomRight - rightSeat_px + fadeLen_px);
      }

      return (
        <g pointerEvents="none">
          {vBandTotalHeight_px > 0 && (
            <>
              <defs>
                <linearGradient id={gidV} gradientUnits="userSpaceOnUse"
                  x1={sideX_px} y1={vBandStartY_px}
                  x2={sideX_px} y2={vBottom_px}>
                  <stop offset="0" stopColor={fill} stopOpacity="0.0" />
                  <stop offset={mlpOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                  <stop offset="1" stopColor={fill} stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <rect
                x={sideX_px}
                y={vBandStartY_px}
                width={bandW_px}
                height={vBandTotalHeight_px}
                fill={`url(#${gidV})`}
              />
            </>
          )}

          {backRectWidth > 0 && (
            <>
              <defs>
                <linearGradient id={gidB} gradientUnits="userSpaceOnUse"
                  x1={backRectX} y1={backY_px}
                  x2={backRectX + backRectWidth} y2={backY_px}>
                  {isLeft ? (
                    <>
                      <stop offset={solidOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                      <stop offset="1" stopColor={fill} stopOpacity="0" />
                    </>
                  ) : (
                    <>
                      <stop offset="0" stopColor={fill} stopOpacity="0.0" />
                      <stop offset={fadeOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                      <stop offset="1" stopColor={fill} stopOpacity={0.35} />
                    </>
                  )}
                </linearGradient>
              </defs>
              <rect
                x={backRectX}
                y={backY_px}
                width={backRectWidth}
                height={backH_px}
                fill={`url(#${gidB})`}
                pointerEvents="none"
              />
            </>
          )}
        </g>
      );
    };

    // Rear Surround Zone Component
    const RearSurroundZoneComponent = () => {
      // Rule: Do not render if no seats exist.
      if (!seatingPositions || seatingPositions.length === 0) return null;

      const fadeLen_px = FADE_LEN_M * scale;

      // Room bounds and core positions
      const roomLeft = (roomRect?.x ?? 0);
      const roomRight = (roomRect?.x ?? 0) + (roomRect?.width ?? 0);
      const roomTop = (roomRect?.y ?? 0);
      const roomBottom = (roomRect?.y ?? 0) + (roomRect?.height ?? 0);
      const [, rearWallY_px] = toPx(0, lengthM);
      const bandW_px = ZONE_DEPTH_M * scale;

      // Find rearmost seat line (global last-seat line)
      const seatYs = seatingPositions.map(s => Number(s.y)).filter(Number.isFinite);
      const lastSeatY_m = seatYs.length ? Math.max(...seatYs) : mlp.y;
      const [, lastSeatY_px_raw] = toPx(0, lastSeatY_m);
      const lastSeatY_px = Math.max(roomTop, Math.min(roomBottom, lastSeatY_px_raw));

      // Vertical bands: from last-seat line to rear wall
      const vHeight_px = Math.max(0, Math.min(roomBottom, rearWallY_px) - lastSeatY_px);

      // Horizontal bands: use first-seat X positions
      const seatXs = seatingPositions.map(s => Number(s.x)).filter(Number.isFinite);
      const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : widthM * 0.35;
      const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : widthM * 0.65;
      const [leftSeat_px] = toPx(leftmostSeatX_m, 0);
      const [rightSeat_px] = toPx(rightmostSeatX_m, 0);

      // Position horizontal band inside the room
      const backY_px = Math.min(roomBottom, rearWallY_px) - bandW_px;

      const renderBand = (side) => {
        const isLeft = side === 'left';
        const fillColor = isLeft ? '#4A230F' : '#213428';
        const sideX_px = isLeft ? roomLeft : roomRight - bandW_px;

        const verticalRect = vHeight_px > 0 ? (
          <rect
            key={`vert-${side}`}
            x={sideX_px}
            y={lastSeatY_px}
            width={bandW_px}
            height={vHeight_px}
            fill={fillColor}
            opacity={0.35}
          />
        ) : null;

        const solidStartX = isLeft ? roomLeft : Math.max(roomLeft, rightSeat_px);
        const solidEndX = isLeft ? Math.min(roomRight, leftSeat_px) : roomRight;
        const solidW = Math.max(0, solidEndX - solidStartX);
        const backFadeW_px = fadeLen_px;
        const totalW = solidW + backFadeW_px;

        const gidH = `grad_rear_horiz_${side}`;
        const bandX = isLeft ? solidStartX : (solidStartX - backFadeW_px);
        const offsetSolid = totalW > 0 ? solidW / totalW : 0;
        const offsetFade = totalW > 0 ? backFadeW_px / totalW : 0;

        return (
          <g key={side} pointerEvents="none">
            {verticalRect}
            {totalW > 0 && (
              <>
                <defs>
                  <linearGradient
                    id={gidH}
                    gradientUnits="userSpaceOnUse"
                    x1={bandX}
                    y1={backY_px}
                    x2={bandX + totalW}
                    y2={backY_px}
                  >
                    {isLeft ? (
                      <>
                        <stop offset={offsetSolid} stopColor={fillColor} stopOpacity="0.35" />
                        <stop offset="1" stopColor={fillColor} stopOpacity="0" />
                      </>
                    ) : (
                      <>
                        <stop offset="0" stopColor={fillColor} stopOpacity="0.0" />
                        <stop offset={offsetFade} stopColor={fillColor} stopOpacity="0.35" />
                        <stop offset="1" stopColor={fillColor} stopOpacity={0.35} />
                      </>
                    )}
                  </linearGradient>
                </defs>
                <rect
                  x={bandX}
                  y={backY_px}
                  width={totalW}
                  height={bandW_px}
                  fill={`url(#${gidH})`}
                  pointerEvents="none"
                />
              </>
            )}
          </g>
        );
      };

      return (
        <g pointerEvents="none">
          {renderBand('left')}
          {renderBand('right')}
        </g>
      );
    };

    return {
      LCR: (
        <g pointerEvents="none">
          <LCRZoneComponent side="left" />
          <LCRZoneComponent side="right" />
        </g>
      ),
      SIDE_SURROUND: (
        <g pointerEvents="none">
          <SideSurroundZoneComponent side="left" />
          <SideSurroundZoneComponent side="right" />
        </g>
      ),
      REAR_SURROUND: <RearSurroundZoneComponent />,

      OVERHEADS: (() => {
        // Only render when the user has the Overheads overlay toggle enabled
        const showOverheads =
          !!(overlaysForRendering?.OVERHEADS_2 ||
             overlaysForRendering?.OVERHEADS_4 ||
             overlaysForRendering?.OVERHEADS_6);

        if (!showOverheads) return null;

        // Derive overhead config from dolbyLayout (what layout is selected)
        const parts = String(dolbyLayout || "5.1").split(".");
        const ohCount = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
        const config =
          ohCount === 2 ? ".2" :
          ohCount === 4 ? ".4" :
          ohCount === 6 ? ".6" : "off";

        // If layout has no overheads, don't render
        if (config === "off") return null;

        return renderOverheadBandsSVG({
          zones: overheadZones,
          config,
          toPx,
          scale,
          roomRect,
          placedSpeakers,
          getCanonicalRole,
          widthM,
        });
      })(),

      FRONT_WIDE: renderFrontWideZones(),
    };
  }, [seatingPositions, widthM, lengthM, scale, toPx, roomRect, mlpY_m, placedSpeakers, heightM, screen?.mountMode, lcrZoneBlocks, ZONE_DEPTH_M, frontWideZones, renderFrontWideZones, mlp, getCanonicalRole, overheadCount, overheadZones, overlaysForRendering, dolbyLayout, FADE_LEN_M]);

  return ZoneComponents;
}