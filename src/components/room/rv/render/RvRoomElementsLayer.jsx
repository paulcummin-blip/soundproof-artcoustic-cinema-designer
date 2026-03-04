"use client";

export default function RvRoomElementsLayer({
  hasRoomRect,
  roomElements,
  widthM,
  lengthM,
  scale,
  meterToCanvasX,
  meterToCanvasY,
  placedSpeakers,
  getModelDimsM
}) {
  if (!hasRoomRect) return null;

  const LABEL_INSET_M = 0.10;   // 10cm inside the room

  const normalizeElement = (el) => {
    const wallRaw = String(el?.wall || el?.side || 'front').toLowerCase();
    const wall =
      wallRaw === 'back' ? 'rear' :
      wallRaw === 'rear' ? 'rear' :
      wallRaw === 'front' ? 'front' :
      wallRaw === 'left' ? 'left' :
      wallRaw === 'right' ? 'right' : 'front';

    // Support BOTH schemas:
    // - old: width, height, x_position, z_position
    // - new: length_m, thickness_m, x_m/y_m, label
    const lengthMVal =
      Number(el?.length_m) ||
      Number(el?.lengthM) ||
      Number(el?.width) ||          // old "door" uses width as length along wall
      0.9;

    const thicknessM =
      Number(el?.thickness_m) ||
      Number(el?.thicknessM) ||
      0.05;

    // Wall offset (distance from wall into room)
    const offsetM = Math.max(0, Number(el?.wall_offset_m) || 0);

    // Position along the wall (metres):
    // IMPORTANT: for LEFT/RIGHT walls, position is measured DOWN from the FRONT wall (so use Y fields first).
    // For FRONT/REAR walls, position is measured RIGHT from the LEFT wall (so use X fields first).
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

    const posFrontRear =
      n(el?.pos_m) ??
      n(el?.x_m) ??
      n(el?.x_position) ??
      n(el?.y_m) ??           // fallback if old saves used the wrong field
      n(el?.y_position) ??
      0;

    const posLeftRight =
      n(el?.pos_m) ??
      n(el?.y_m) ??
      n(el?.y_position) ??
      n(el?.x_m) ??           // fallback if old saves used the wrong field
      n(el?.x_position) ??
      0;

    const posM = (wall === 'left' || wall === 'right') ? posLeftRight : posFrontRear;

    const label = String(el?.label || '').trim();

    return {
      ...el,
      wall,
      __lengthM: lengthMVal,
      __thicknessM: thicknessM,
      __posM: posM,
      __offsetM: offsetM,
      __label: label,
    };
  };

  if (!Array.isArray(roomElements) || roomElements.length === 0) return null;

  // Build a collision list that matches what is actually RENDERED.
  // This prevents "phantom" LW/RW (front wides) from triggering warnings when FW are not enabled.
  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // Filter speakers for collision detection
  const speakersForCollision = rawSpeakers.map(s => {
    // This is a simplified filter - just get speaker AABB
    return s;
  }).filter(s => s?.position);

  return (
    <g data-layer="room-elements" pointerEvents="none">
      {roomElements.map((element, idx) => {
        const e = normalizeElement(element);

        // Build element rectangle in METRES (then convert via scale/toPx)
        const L = Math.max(0.01, Number(e.__lengthM) || 0.9);
        const T = Math.max(0.01, Number(e.__thicknessM) || 0.05);
        const offset = Math.max(0, Number(e.__offsetM) || 0);
        
        // Position along the wall (clamped so the element always stays on that wall)
        const rawP = Number(e.__posM) || 0;

        const maxP =
          (e.wall === 'left' || e.wall === 'right')
            ? Math.max(0, lengthM - L)
            : Math.max(0, widthM - L);

        const p = Math.max(0, Math.min(rawP, maxP));

        // NOTE: origin is top-left (0,0). Position is measured from the FRONT wall for Y, and LEFT wall for X.
        // So for LEFT/RIGHT walls, p is distance DOWN from front wall.
        // For FRONT/REAR walls, p is distance RIGHT from left wall.

        let rectM = { x: 0, y: 0, w: 0, h: 0 };

        if (e.wall === 'front') {
          rectM = { x: p, y: offset, w: L, h: T };
        } else if (e.wall === 'rear') {
          rectM = { x: p, y: lengthM - T - offset, w: L, h: T };
        } else if (e.wall === 'left') {
          rectM = { x: offset, y: p, w: T, h: L };
        } else if (e.wall === 'right') {
          rectM = { x: widthM - T - offset, y: p, w: T, h: L };
        }

        // 5cm warning buffer
        const WARN_M = 0.05;
        const warnRectM = {
          x: rectM.x - WARN_M,
          y: rectM.y - WARN_M,
          w: rectM.w + 2 * WARN_M,
          h: rectM.h + 2 * WARN_M,
        };

        // AABB intersect (metres)
        const intersects = (a, b) =>
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;

        const getSpeakerAabbM = (sp) => {
          if (!sp?.position) return null;
          const x = Number(sp.position.x);
          const y = Number(sp.position.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

          const dims = getModelDimsM?.(sp.model) || {};
          const w = Math.max(0.01, Number(dims.widthM) || 0.2);
          const d = Math.max(0.01, Number(dims.depthM) || 0.2);

          return { x: x - w / 2, y: y - d / 2, w, h: d };
        };

        const isNearSpeaker = speakersForCollision
          .map(getSpeakerAabbM)
          .filter(Boolean)
          .some((aabb) => intersects(warnRectM, aabb));

        // Colours (consistent for ALL element types)
        const NORMAL_FILL = 'rgba(220,219,214,0.45)';   // based on #DCDBD6
        const NORMAL_STROKE = 'rgba(27,26,26,0.55)';    // based on #1B1A1A

        // warning dark orange
        const WARN_FILL = 'rgba(199,106,27,0.28)';
        const WARN_STROKE = '#C76A1B';

        const fill = isNearSpeaker ? WARN_FILL : NORMAL_FILL;
        const stroke = isNearSpeaker ? WARN_STROKE : NORMAL_STROKE;

        // Label anchor point (in metres)
        let labelXM = 0;
        let labelYM = 0;

        if (e.wall === 'front') {
          labelXM = rectM.x + 0.02; // tiny nudge
          labelYM = rectM.y + T + LABEL_INSET_M;
        } else if (e.wall === 'rear') {
          labelXM = rectM.x + 0.02;
          labelYM = rectM.y - LABEL_INSET_M; // inside the room (upwards)
        } else if (e.wall === 'left') {
          labelXM = rectM.x + T + LABEL_INSET_M;
          labelYM = rectM.y + 0.18; // slight down so it doesn't sit on the top edge
        } else if (e.wall === 'right') {
          // 10 cm extra inset so the last letter stays inside the room
          labelXM = rectM.x - LABEL_INSET_M - 0.10;
          labelYM = rectM.y + 0.18;
        }

        // Convert to canvas pixels
        const xPx = meterToCanvasX(rectM.x);
        const yPx = meterToCanvasY(rectM.y);
        const wPx = rectM.w * scale;
        const hPx = rectM.h * scale;

        const labelXpx = meterToCanvasX(labelXM);
        const labelYpx = meterToCanvasY(labelYM);

        const label = String(e.__label || `Element ${idx + 1}`);

        return (
          <g key={String(element?.id ?? `el-${idx}`)}>
            <rect
              x={xPx}
              y={yPx}
              width={Math.max(0, wPx)}
              height={Math.max(0, hPx)}
              fill={fill}
              stroke={stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={labelXpx}
              y={labelYpx}
              fill="#1B1A1A"
              fillOpacity={0.9}
              fontSize={11}
              fontWeight={700}
              style={{ userSelect: 'none' }}
              textAnchor="end"
              dominantBaseline="hanging"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}