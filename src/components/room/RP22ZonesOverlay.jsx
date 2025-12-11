// components/room/RP22ZonesOverlay.jsx
import React from 'react';

const OVERLAY_STYLE = {
  sideSurround: {
    stroke: "rgba(33, 52, 40, 0.3)",
    strokeWidth: 20,
    median: "rgba(33, 52, 40, 0.5)",
    labelColor: "rgba(33, 52, 40, 0.7)",
    bandPx: 15.560416666666667,
    bandFill: 'rgba(33,52,40,0.12)',
    bandFillRight: 'rgba(33,52,40,0.12)', // Same as default for now, can be customized
    bandStroke: 'rgba(33,52,40,0.25)',
    opacity: 0.35,
  },
};

// Helper: compute angle from MLP to a Y position
function elevationAngleFromMLP(yPos_m, mlpY_m, deltaH_m) {
  const horizontalDist = Math.abs(yPos_m - mlpY_m);
  if (horizontalDist < 0.001 || deltaH_m < 0.001) return 0;
  return Math.atan2(deltaH_m, horizontalDist) * (180 / Math.PI);
}

export default function RP22ZonesOverlay(props) {
  const {
    overlays,
    toPx,
    dimensions,
    roomClipId,
    placedSpeakers,
    seatingPositions,
    mlpPoint,
  } = props || {};

  const elements = [];

  // --- FRONT-WIDE (match Side Surround band style) ---
  const fw = overlays?.FRONT_WIDE ?? null;
  const fwEnabled = !!overlays?.enableFrontWides;

  if (fwEnabled && fw && fw.status === 'ok') {
    const W = Number(dimensions?.width) || 0;
    const bandPx = OVERLAY_STYLE?.sideSurround?.bandPx ?? 15.560416666666667;
    const bandFillLeft  = 'rgba(74,35,15,0.12)';
    const bandFillRight = 'rgba(33,52,40,0.12)';
    const midStroke = OVERLAY_STYLE?.sideSurround?.median ?? 'rgba(33,52,40,0.5)';

    const innerLeftXM  = 0;
    const innerRightXM = W;

    const toMeters = (y) => {
      const Lm = Number(dimensions?.length) || 0;
      const n = Number(y);
      if (!isFinite(n)) return 0;
      return n > Math.max(20, Lm * 1.5) ? n / 100 : n;
    };

    const children = [];

    // LEFT band
    if (fw.left?.status === 'ok') {
      const [xL, yL1] = toPx(innerLeftXM,  toMeters(fw.left.yMin));
      const [,   yL2] = toPx(innerLeftXM,  toMeters(fw.left.yMax));
      const [,   yLm] = toPx(innerLeftXM,  toMeters(fw.left.medianY));
      const hL = Math.max(1, yL2 - yL1);

      children.push(
        <rect
          key="fw-band-L"
          x={xL}
          y={yL1}
          width={bandPx}
          height={hL}
          fill={bandFillLeft}
          stroke="none"
          pointerEvents="none"
        />
      );

      children.push(
        <line
          key="fw-median-L"
          x1={xL}
          y1={yLm}
          x2={xL + bandPx}
          y2={yLm}
          stroke={midStroke}
          strokeWidth={2}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      );
    }

    // RIGHT band
    if (fw.right?.status === 'ok') {
      const [xR, yR1] = toPx(innerRightXM, toMeters(fw.right.yMin));
      const [,   yR2] = toPx(innerRightXM, toMeters(fw.right.yMax));
      const [,   yRm] = toPx(innerRightXM, toMeters(fw.right.medianY));
      const hR = Math.max(1, yR2 - yR1);
      const xBandR = xR - bandPx;

      children.push(
        <rect
          key="fw-band-R"
          x={xBandR}
          y={yR1}
          width={bandPx}
          height={hR}
          fill={bandFillRight}
          stroke="none"
          pointerEvents="none"
        />
      );

      children.push(
        <line
          key="fw-median-R"
          x1={xBandR}
          y1={yRm}
          x2={xR}
          y2={yRm}
          stroke={midStroke}
          strokeWidth={2}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      );
    }

    elements.push(
      <g
        key="front-wide-layer"
        data-overlay="front-wide"
        clipPath="url(#room-inner-clip)"
        pointerEvents="none"
      >
        {children}
      </g>
    );
  }

  // --- OVERHEADS .2 (unified style with symmetric left-edge anchoring) ---
  const oh2 = overlays?.OVERHEADS_2;
  if (!!oh2) {
    const W = Number(dimensions?.width) || 0;
    const L = Number(dimensions?.length) || 0;
    
    // --- Lateral lane setup (shared by L/R) ---
    
    // exact band width from style (px)
    const BAND_PX = OVERLAY_STYLE?.sideSurround?.bandPx ?? 18;
    
    // px-per-meter (from toPx)
    const px0 = toPx(0, 0)[0];
    const px1 = toPx(1, 0)[0];
    const PX_PER_M = Math.max(1, px1 - px0);
    
    // convert visual band width to meters
    const BAND_M = BAND_PX / PX_PER_M;
    
    // seating extents (m)
    const seatXs = (seatingPositions || []).map(s => s.x).filter(x => typeof x === 'number');
    const leftmostSeatX_m  = seatXs.length ? Math.min(...seatXs) : W * 0.35;
    const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : W * 0.65;
    
    // FL/FR (m)
    const canonical = r => String(r || '').toUpperCase();
    const fl = (placedSpeakers || []).find(s => canonical(s.role) === 'FL');
    const fr = (placedSpeakers || []).find(s => canonical(s.role) === 'FR');
    const flX_m = fl?.position?.x ?? W * 0.25;
    const frX_m = fr?.position?.x ?? W * 0.75;
    
    // intersection: inside room, >= seating span, <= LCR span
    // (take outer-left and inner-right limits)
    const leftLimitM  = Math.max(0, Math.max(leftmostSeatX_m, Math.min(flX_m, frX_m)));
    const rightLimitM = Math.min(W, Math.min(rightmostSeatX_m, Math.max(flX_m, frX_m)));
    const laneSpanM   = Math.max(0, rightLimitM - leftLimitM);
    
    // shrink band if the intersection is tighter than the visual width
    const usableBandM = Math.min(BAND_M, laneSpanM);
    
    // final left-edge anchors for each side (meters)
    const leftBandLeft_m  = leftLimitM;
    const rightBandLeft_m = Math.max(leftLimitM, rightLimitM - usableBandM);
    
    // pixel clamps for safety
    const roomLeftPx  = toPx(0, 0)[0];
    const roomRightPx = toPx(W, 0)[0];

    // ----- DIAGNOSTICS (TEMP) -----
    if (typeof window !== 'undefined') {
      window.OH_DIAG = window.OH_DIAG || {};
      const _modeKey = 'OH2';
      window.OH_DIAG[_modeKey] = {
        BAND_PX,
        PX_PER_M,
        BAND_M,
        usableBandM,
        leftLimitM,
        rightLimitM,
        laneSpanM,
        leftBandLeft_m,
        rightBandLeft_m,
        leftmostSeatX_m,
        rightmostSeatX_m,
        flX_m,
        frX_m,
      };
    }

    const children = [];

    const bands = { middle: oh2 };

    function renderBand(bandType, side) {
      const band = bands[bandType];
      if (!band) return;

      const isLeft = (side === 'L');

      // choose the precomputed *left edge* anchor (in meters)
      const xM = isLeft ? leftBandLeft_m : rightBandLeft_m;

      // convert to px
      const [xPxRaw, yMin] = toPx(xM, band.yMin);
      const [, yMax] = toPx(xM, band.yMax);
      const [, yMed] = toPx(xM, band.medianY);
      const h = Math.max(1, yMax - yMin);

      // clamp so the rect never escapes the room
      const xPx = Math.max(roomLeftPx, Math.min(roomRightPx - BAND_PX, xPxRaw));

      const fill  = isLeft ? 'rgba(74,35,15,0.12)' : 'rgba(33,52,40,0.12)';
      const dashC = OVERLAY_STYLE.sideSurround.median ?? 'rgba(33, 52, 40, 0.5)';

      children.push(
        <rect
          key={`oh-${bandType}-${side}`}
          data-oh={bandType}
          data-oh-side={side}
          x={xPx}
          y={yMin}
          width={BAND_PX}
          height={h}
          fill={fill}
          stroke="none"
          pointerEvents="none"
        />
      );

      // median tick (same style both sides)
      children.push(
        <line
          key={`oh-${bandType}-${side}-median`}
          x1={xPx}
          x2={xPx + BAND_PX}
          y1={yMed}
          y2={yMed}
          stroke={dashC}
          strokeWidth={2}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      );
    }

    // Render middle bands (L/R)
    renderBand('middle', 'L');
    renderBand('middle', 'R');

    elements.push(
      <g
        key="overheads-2"
        data-overlay="overheads-2"
        clipPath="url(#room-inner-clip)"
        pointerEvents="none"
      >
        {children}
      </g>
    );
  }

  // --- OVERHEADS .4 (symmetric left-edge anchoring) ---
  const oh4 = overlays?.OVERHEADS_4;
  if (!!oh4) {
    const W = Number(dimensions?.width) || 0;
    const L = Number(dimensions?.length) || 0;
    
    // --- Lateral lane setup (shared by L/R) ---
    
    // exact band width from style (px)
    const BAND_PX = OVERLAY_STYLE?.sideSurround?.bandPx ?? 18;
    
    // px-per-meter (from toPx)
    const px0 = toPx(0, 0)[0];
    const px1 = toPx(1, 0)[0];
    const PX_PER_M = Math.max(1, px1 - px0);
    
    // convert visual band width to meters
    const BAND_M = BAND_PX / PX_PER_M;
    
    // seating extents (m)
    const seatXs = (seatingPositions || []).map(s => s.x).filter(x => typeof x === 'number');
    const leftmostSeatX_m  = seatXs.length ? Math.min(...seatXs) : W * 0.35;
    const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : W * 0.65;
    
    // FL/FR (m)
    const canonical = r => String(r || '').toUpperCase();
    const fl = (placedSpeakers || []).find(s => canonical(s.role) === 'FL');
    const fr = (placedSpeakers || []).find(s => canonical(s.role) === 'FR');
    const flX_m = fl?.position?.x ?? W * 0.25;
    const frX_m = fr?.position?.x ?? W * 0.75;
    
    // intersection: inside room, >= seating span, <= LCR span
    const leftLimitM  = Math.max(0, Math.max(leftmostSeatX_m, Math.min(flX_m, frX_m)));
    const rightLimitM = Math.min(W, Math.min(rightmostSeatX_m, Math.max(flX_m, frX_m)));
    const laneSpanM   = Math.max(0, rightLimitM - leftLimitM);
    
    // shrink band if the intersection is tighter than the visual width
    const usableBandM = Math.min(BAND_M, laneSpanM);
    
    // final left-edge anchors for each side (meters)
    const leftBandLeft_m  = leftLimitM;
    const rightBandLeft_m = Math.max(leftLimitM, rightLimitM - usableBandM);
    
    // pixel clamps for safety
    const roomLeftPx  = toPx(0, 0)[0];
    const roomRightPx = toPx(W, 0)[0];

    // ----- DIAGNOSTICS (TEMP) -----
    if (typeof window !== 'undefined') {
      window.OH_DIAG = window.OH_DIAG || {};
      const _modeKey = 'OH4';
      window.OH_DIAG[_modeKey] = {
        BAND_PX,
        PX_PER_M,
        BAND_M,
        usableBandM,
        leftLimitM,
        rightLimitM,
        laneSpanM,
        leftBandLeft_m,
        rightBandLeft_m,
        leftmostSeatX_m,
        rightmostSeatX_m,
        flX_m,
        frX_m,
      };
    }

    const children = [];

    const bands = { front: oh4.front, rear: oh4.rear };

    function renderBand(bandType, side) {
      const band = bands[bandType];
      if (!band) return;

      const isLeft = (side === 'L');

      // choose the precomputed *left edge* anchor (in meters)
      const xM = isLeft ? leftBandLeft_m : rightBandLeft_m;

      // convert to px
      const [xPxRaw, yMin] = toPx(xM, band.yMin);
      const [, yMax] = toPx(xM, band.yMax);
      const [, yMed] = toPx(xM, band.medianY);
      const h = Math.max(1, yMax - yMin);

      // clamp so the rect never escapes the room
      const xPx = Math.max(roomLeftPx, Math.min(roomRightPx - BAND_PX, xPxRaw));

      const fill  = isLeft ? 'rgba(74,35,15,0.12)' : 'rgba(33,52,40,0.12)';
      const dashC = OVERLAY_STYLE.sideSurround.median ?? 'rgba(33, 52, 40, 0.5)';

      children.push(
        <rect
          key={`oh-${bandType}-${side}`}
          data-oh={bandType}
          data-oh-side={side}
          x={xPx}
          y={yMin}
          width={BAND_PX}
          height={h}
          fill={fill}
          stroke="none"
          pointerEvents="none"
        />
      );

      // median tick
      children.push(
        <line
          key={`oh-${bandType}-${side}-median`}
          x1={xPx}
          x2={xPx + BAND_PX}
          y1={yMed}
          y2={yMed}
          stroke={dashC}
          strokeWidth={2}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      );
    }

    // Render front and rear bands (L/R)
    renderBand('front', 'L');
    renderBand('front', 'R');
    renderBand('rear', 'L');
    renderBand('rear', 'R');

    elements.push(
      <g
        key="overheads-4"
        data-overlay="overheads-4"
        clipPath="url(#room-inner-clip)"
        pointerEvents="none"
      >
        {children}
      </g>
    );
  }

  // --- OVERHEADS .6 (symmetric left-edge anchoring) ---
  const oh6 = overlays?.OVERHEADS_6;
  if (!!oh6) {
    const W = Number(dimensions?.width) || 0;
    const L = Number(dimensions?.length) || 0;
    
    // --- Lateral lane setup (shared by L/R) ---
    
    // exact band width from style (px)
    const BAND_PX = OVERLAY_STYLE?.sideSurround?.bandPx ?? 18;
    
    // px-per-meter (from toPx)
    const px0 = toPx(0, 0)[0];
    const px1 = toPx(1, 0)[0];
    const PX_PER_M = Math.max(1, px1 - px0);
    
    // convert visual band width to meters
    const BAND_M = BAND_PX / PX_PER_M;
    
    // seating extents (m)
    const seatXs = (seatingPositions || []).map(s => s.x).filter(x => typeof x === 'number');
    const leftmostSeatX_m  = seatXs.length ? Math.min(...seatXs) : W * 0.35;
    const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : W * 0.65;
    
    // FL/FR (m)
    const canonical = r => String(r || '').toUpperCase();
    const fl = (placedSpeakers || []).find(s => canonical(s.role) === 'FL');
    const fr = (placedSpeakers || []).find(s => canonical(s.role) === 'FR');
    const flX_m = fl?.position?.x ?? W * 0.25;
    const frX_m = fr?.position?.x ?? W * 0.75;
    
    // intersection: inside room, >= seating span, <= LCR span
    const leftLimitM  = Math.max(0, Math.max(leftmostSeatX_m, Math.min(flX_m, frX_m)));
    const rightLimitM = Math.min(W, Math.min(rightmostSeatX_m, Math.max(flX_m, frX_m)));
    const laneSpanM   = Math.max(0, rightLimitM - leftLimitM);
    
    // shrink band if the intersection is tighter than the visual width
    const usableBandM = Math.min(BAND_M, laneSpanM);
    
    // final left-edge anchors for each side (meters)
    const leftBandLeft_m  = leftLimitM;
    const rightBandLeft_m = Math.max(leftLimitM, rightLimitM - usableBandM);
    
    // pixel clamps for safety
    const roomLeftPx  = toPx(0, 0)[0];
    const roomRightPx = toPx(W, 0)[0];

    // ----- DIAGNOSTICS (TEMP) -----
    if (typeof window !== 'undefined') {
      window.OH_DIAG = window.OH_DIAG || {};
      const _modeKey = 'OH6';
      window.OH_DIAG[_modeKey] = {
        BAND_PX,
        PX_PER_M,
        BAND_M,
        usableBandM,
        leftLimitM,
        rightLimitM,
        laneSpanM,
        leftBandLeft_m,
        rightBandLeft_m,
        leftmostSeatX_m,
        rightmostSeatX_m,
        flX_m,
        frX_m,
      };
    }

    const children = [];

    const bands = { front: oh6.front, middle: oh6.middle, rear: oh6.rear };

    function renderBand(bandType, side) {
      const band = bands[bandType];
      if (!band) return;

      const isLeft = (side === 'L');

      // choose the precomputed *left edge* anchor (in meters)
      const xM = isLeft ? leftBandLeft_m : rightBandLeft_m;

      // convert to px
      const [xPxRaw, yMin] = toPx(xM, band.yMin);
      const [, yMax] = toPx(xM, band.yMax);
      const [, yMed] = toPx(xM, band.medianY);
      const h = Math.max(1, yMax - yMin);

      // clamp so the rect never escapes the room
      const xPx = Math.max(roomLeftPx, Math.min(roomRightPx - BAND_PX, xPxRaw));

      const fill  = isLeft ? 'rgba(74,35,15,0.12)' : 'rgba(33,52,40,0.12)';
      const dashC = OVERLAY_STYLE.sideSurround.median ?? 'rgba(33, 52, 40, 0.5)';

      children.push(
        <rect
          key={`oh-${bandType}-${side}`}
          data-oh={bandType}
          data-oh-side={side}
          x={xPx}
          y={yMin}
          width={BAND_PX}
          height={h}
          fill={fill}
          stroke="none"
          pointerEvents="none"
        />
      );

      // median tick
      children.push(
        <line
          key={`oh-${bandType}-${side}-median`}
          x1={xPx}
          x2={xPx + BAND_PX}
          y1={yMed}
          y2={yMed}
          stroke={dashC}
          strokeWidth={2}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      );
    }

    // Render front, middle, and rear bands (L/R)
    renderBand('front', 'L');
    renderBand('front', 'R');
    renderBand('middle', 'L');
    renderBand('middle', 'R');
    renderBand('rear', 'L');
    renderBand('rear', 'R');

    elements.push(
      <g
        key="overheads-6"
        data-overlay="overheads-6"
        clipPath="url(#room-inner-clip)"
        pointerEvents="none"
      >
        {children}
      </g>
    );
  }

  return <g data-overlay="rp22-zones">{elements}</g>;
}