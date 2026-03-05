import { SpeakerRect } from "@/components/room/rv/RenderPrimitives";
import { hasPos } from "@/components/room/rv/RenderPrimitives";

/**
 * RvSubwooferLayer
 * Renders rear (and front-fallback) subwoofers as draggable SVG elements.
 * Extracted from RoomVisualisation.jsx Layer 8.
 */
export default function RvSubwooferLayer({
  widthM,
  lengthM,
  scale,
  toPx,
  getModelDimsM,
  exportMode,
  dragging,
  draggedItemId,
  draftFrontSubsRef,
  draftRearSubsRef,
  frontSubs,
  rearSubs,
  frontSubsCfg,
  rearSubsCfg,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
}) {
  const isExportDims = exportMode === "dimensions";

  const getPinnedY = (wall, model) => {
    const EPS = 0.01;
    const lengthM_safe = Number(lengthM) || 6.0;
    let d = 0.30;
    try {
      const dims = getModelDimsM?.(model) || {};
      const dd = Number(dims?.depthM);
      if (Number.isFinite(dd) && dd > 0) d = dd;
    } catch (_) {}
    const halfD = d / 2;
    if (wall === "front") return halfD + EPS;
    if (wall === "rear") return Math.max(halfD + EPS, lengthM_safe - halfD - EPS);
    return halfD + EPS;
  };

  const buildFallbackLine = (qty, model, wall) => {
    const W = Number(widthM) || 4.5;
    const qtyN = Math.max(0, Math.min(8, Number(qty) || 0));
    if (!model || qtyN <= 0) return [];
    const y = getPinnedY(wall, model);
    const margin = W * 0.15;
    const span = Math.max(0.01, W - margin * 2);
    return Array.from({ length: qtyN }, (_, i) => ({
      id: `export-sub-${wall}-${i + 1}`,
      model,
      position: {
        x: qtyN === 1 ? W * 0.5 : margin + span * (i / (qtyN - 1)),
        y,
        z: 0,
      },
    }));
  };

  const frontLive = (dragging && Array.isArray(draftFrontSubsRef.current))
    ? draftFrontSubsRef.current
    : frontSubs;
  const rearLive = (dragging && Array.isArray(draftRearSubsRef.current))
    ? draftRearSubsRef.current
    : rearSubs;

  const frontFallback = isExportDims && (!Array.isArray(frontLive) || frontLive.length === 0)
    ? buildFallbackLine(frontSubsCfg?.count, frontSubsCfg?.model, "front")
    : frontLive;

  const rearFallback = isExportDims && (!Array.isArray(rearLive) || rearLive.length === 0)
    ? buildFallbackLine(rearSubsCfg?.count, rearSubsCfg?.model, "rear")
    : rearLive;

  if (!Array.isArray(rearFallback) || rearFallback.length === 0) return null;

  return (
    <g data-layer="rear-subwoofers">
      {rearFallback.map((sub, i) => {
        if (!hasPos(sub)) return null;
        const { widthM: subWm, depthM: subDm } = getModelDimsM(sub.model);
        const subId = sub.id || `rear-sub-${i}`;
        const [cx, cy] = toPx(sub.position.x, sub.position.y);
        const w = subWm * scale;
        const d = subDm * scale;

        const handlePointerDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          handleMouseDown(e, subId, "sub");
        };

        const handlePointerMove = (e) => {
          if (!dragging || draggedItemId !== subId) return;
          e.preventDefault();
          e.stopPropagation();
          handleMouseMove(e);
        };

        const handlePointerUp = (e) => {
          e.preventDefault();
          e.stopPropagation();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          handleMouseUp(e);
        };

        return (
          <g
            key={subId}
            style={{
              cursor: dragging && draggedItemId === subId ? "grabbing" : "grab",
              pointerEvents: "all",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <rect
              x={cx - w / 2}
              y={cy - d / 2}
              width={w}
              height={d}
              fill="transparent"
              pointerEvents="all"
            />
            <SpeakerRect
              speaker={sub}
              widthM={subWm}
              depthM={subDm}
              opacity={0.8}
              scale={scale}
              toPx={toPx}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}