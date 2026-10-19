import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampAcousticCentreHeight,
  resolveAcousticCentreBounds,
} from "@/components/room/surrounds/surroundAcousticCentreAuthority";

/**
 * Direct dragging of a surround or front-wide speaker in the Side Elevation.
 *
 *   HORIZONTAL drag — the speaker's front-to-back position along its wall (Y)
 *   VERTICAL drag   — its acoustic centre height (Z)
 *
 * The axis is locked from the first few pixels of movement, so a drag is never
 * ambiguous. Both axes write the speaker's own stored coordinates through the
 * same commit the panel uses, so the drawing and the controls cannot diverge.
 * The draft lives in local state for the duration of the drag and one commit is
 * written on release: dragging therefore triggers no calculation work.
 *
 * Extracted from SideElevation so the drawing file stays inside its size limit;
 * behaviour, snapping and clamping are exactly as before, with the horizontal
 * axis added.
 */

export const SURROUND_DRAG_AXES = {
  BOTH: "both",
  HEIGHT_ONLY: "height",
};

const SNAP_M = 0.05;
const AXIS_LOCK_PX = 3;
const WALL_INSET_M = 0.01;

export function useSideSpeakerDrag({
  svgRef,
  SVG_W,
  SVG_H,
  drawW,
  drawH,
  roomL,
  roomH,
  snapTargets = [],
  onCommit = null,
}) {
  const [liveDrag, setLiveDrag] = useState(null); // { role, axis, z, y } | null
  const [activeSnapZ, setActiveSnapZ] = useState(null);

  const dragRef = useRef(null);
  const listenersRef = useRef(null);
  const snapTargetsRef = useRef(snapTargets);
  const commitRef = useRef(onCommit);

  snapTargetsRef.current = Array.isArray(snapTargets) ? snapTargets : [];
  commitRef.current = typeof onCommit === "function" ? onCommit : null;

  // A drag that outlives the component must not leave listeners behind.
  useEffect(() => () => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener("mousemove", listeners.move);
    window.removeEventListener("mouseup", listeners.up);
    listenersRef.current = null;
  }, []);

  const handleSpeakerMouseDown = useCallback((event, role, start = {}) => {
    if (!commitRef.current) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;

    event.preventDefault();
    event.stopPropagation();

    const heightOnly = start?.axes === SURROUND_DRAG_AXES.HEIGHT_ONLY;
    const startZ = Number.isFinite(Number(start?.z)) ? Number(start.z) : null;
    const startY = Number.isFinite(Number(start?.y)) ? Number(start.y) : null;
    const halfWidthM =
      Number.isFinite(Number(start?.halfWidthM)) && Number(start.halfWidthM) > 0
        ? Number(start.halfWidthM)
        : 0.10;
    const bounds = resolveAcousticCentreBounds({
      cabinetHeightM: start?.cabinetHeightM ?? null,
      roomHeightM: roomH,
    });

    dragRef.current = {
      role,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startZ,
      startY,
      axis: null,
      live: { role, axis: null, z: startZ, y: startY },
    };
    setLiveDrag({ role, axis: null, z: startZ, y: startY });

    const move = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      let axis = drag.axis;
      if (!axis) {
        const dx = Math.abs(moveEvent.clientX - drag.startClientX);
        const dy = Math.abs(moveEvent.clientY - drag.startClientY);
        if (dx < AXIS_LOCK_PX && dy < AXIS_LOCK_PX) return;
        axis = !heightOnly && dx > dy ? "y" : "z";
        drag.axis = axis;
      }

      const svgRect = svgEl.getBoundingClientRect();

      if (axis === "y") {
        const scaleX = svgRect.width / SVG_W;
        const deltaY = ((moveEvent.clientX - drag.startClientX) / scaleX / drawW) * roomL;
        const rawY = (drag.startY ?? roomL / 2) + deltaY;
        const y = Math.max(
          halfWidthM + WALL_INSET_M,
          Math.min(roomL - halfWidthM - WALL_INSET_M, rawY)
        );
        drag.live = { role, axis, z: drag.startZ, y };
        setLiveDrag(drag.live);
        return;
      }

      const scaleY = svgRect.height / SVG_H;
      const deltaZ = -((moveEvent.clientY - drag.startClientY) / scaleY / drawH) * roomH;
      const rawZ = clampAcousticCentreHeight((drag.startZ ?? 1.2) + deltaZ, bounds);

      // Magnetic snap to another draggable speaker — same 50 mm threshold as the
      // Front Elevation.
      let snapHit = null;
      (snapTargetsRef.current || []).forEach((other) => {
        if (String(other?.role || "").toUpperCase() === String(role || "").toUpperCase()) return;
        if (!Number.isFinite(Number(other?.z))) return;
        if (Math.abs(rawZ - other.z) >= SNAP_M) return;
        if (snapHit === null || Math.abs(rawZ - other.z) < Math.abs(rawZ - snapHit)) {
          snapHit = Number(other.z);
        }
      });

      setActiveSnapZ(snapHit);
      drag.live = { role, axis, z: snapHit !== null ? snapHit : rawZ, y: drag.startY };
      setLiveDrag(drag.live);
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      listenersRef.current = null;

      const drag = dragRef.current;
      dragRef.current = null;
      setActiveSnapZ(null);
      setLiveDrag(null);

      // A click that never resolved an axis is not a move.
      if (!drag || !drag.axis || !drag.live) return;

      const { axis, z, y } = drag.live;
      const commit = { role };
      if (axis === "z" && Number.isFinite(z)) commit.newZ = Math.round(z * 1000) / 1000;
      if (axis === "y" && Number.isFinite(y)) commit.newY = Math.round(y * 1000) / 1000;
      if (commit.newZ === undefined && commit.newY === undefined) return;
      commitRef.current(commit);
    };

    listenersRef.current = { move, up };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [svgRef, SVG_W, SVG_H, drawW, drawH, roomL, roomH]);

  return { liveDrag, activeSnapZ, handleSpeakerMouseDown };
}

export default useSideSpeakerDrag;