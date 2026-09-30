/**
 * rvPointerToRoom
 *
 * ONE canonical pointer conversion for every drag in the room plan:
 *
 *   screen/client pixels
 *     -> the draggable zoom group's local SVG coordinates
 *     -> room metres (the basis stored object centres and room dimensions use)
 *
 * The visual and hitbox layers are rendered inside RvZoomGroup, whose transform
 * is `translate(panX + viewOffsetPx.x, panY + viewOffsetPx.y) scale(zoom)`.
 * Converting a screen point with the ROOT svg's getScreenCTM() therefore leaves
 * pan, view offset and zoom un-undone, and the room position drifts as soon as
 * the plan is zoomed or panned.
 *
 * Reading the zoom group's own getScreenCTM().inverse() reverses pan, view
 * offset and zoom exactly once, so the result is in the same basis as
 * `toPx` / `roomToCanvas` / `canvasToRoom` at the default view.
 */

/** Marker attribute set by RvZoomGroup so the zoom group can be found by one selector. */
export const RV_ZOOM_GROUP_SELECTOR = '[data-rv-zoom-group]';

/**
 * The single zoom transform, expressed once so the zoom group and every
 * unclipped guide group that must travel with it stay byte-identical.
 */
export function rvZoomTransform({ panX, panY, viewOffsetPx, zoom }) {
  const tx = (Number(panX) || 0) + (Number(viewOffsetPx?.x) || 0);
  const ty = (Number(panY) || 0) + (Number(viewOffsetPx?.y) || 0);
  const z = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  return `translate(${tx}, ${ty}) scale(${z})`;
}

/**
 * Resolve which CTM the pointer must be converted with.
 * @returns {{ element: any, zoomGroupLocal: boolean }}
 */
export function resolveZoomTarget(svgElement) {
  const group = (typeof svgElement?.querySelector === 'function')
    ? svgElement.querySelector(RV_ZOOM_GROUP_SELECTOR)
    : null;
  return group
    ? { element: group, zoomGroupLocal: true }
    : { element: svgElement, zoomGroupLocal: false };
}

/** Zoom-group-local pixels -> room metres. Pan, view offset and zoom are already undone. */
export function localPointToRoom({ point, roomRect, scale }) {
  return {
    x: (point.x - (roomRect?.x ?? 0)) / scale,
    y: (point.y - (roomRect?.y ?? 0)) / scale,
  };
}

/** Root-svg user-space pixels -> room metres (the legacy basis, used only when no zoom group exists). */
export function canvasPointToRoom({ point, roomRect, scale, viewOffsetPx }) {
  return {
    x: (point.x - (roomRect?.x ?? 0) - (viewOffsetPx?.x ?? 0)) / scale,
    y: (point.y - (roomRect?.y ?? 0) - (viewOffsetPx?.y ?? 0)) / scale,
  };
}

/**
 * Convert a client (screen) pointer position to room metres.
 * @returns {{ x: number, y: number }|null} null when the geometry is not ready.
 */
export function clientToRoom({ svgElement, clientX, clientY, roomRect, scale, viewOffsetPx }) {
  if (!svgElement || !Number.isFinite(scale) || scale === 0) return null;
  if (!Number.isFinite(roomRect?.x) || !Number.isFinite(roomRect?.y)) return null;
  if (typeof svgElement.createSVGPoint !== 'function') return null;

  const target = resolveZoomTarget(svgElement);
  const ctm = target.element?.getScreenCTM?.();
  if (!ctm || typeof ctm.inverse !== 'function') return null;

  const point = svgElement.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  if (!Number.isFinite(local?.x) || !Number.isFinite(local?.y)) return null;

  return target.zoomGroupLocal
    ? localPointToRoom({ point: local, roomRect, scale })
    : canvasPointToRoom({ point: local, roomRect, scale, viewOffsetPx });
}

/** Pointer-to-object-centre offset, captured ONCE at drag start, in room metres. */
export function captureDragOffsetRoom({ pointerRoom, objectRoom }) {
  return {
    x: (Number(objectRoom?.x) || 0) - (Number(pointerRoom?.x) || 0),
    y: (Number(objectRoom?.y) || 0) - (Number(pointerRoom?.y) || 0),
  };
}

/**
 * The one place the offset is applied: final target room position.
 * Object handlers receive this directly and must never add the offset again.
 */
export function computeDragTargetRoom({ pointerRoom, dragOffsetRoom }) {
  return {
    x: (Number(pointerRoom?.x) || 0) + (Number(dragOffsetRoom?.x) || 0),
    y: (Number(pointerRoom?.y) || 0) + (Number(dragOffsetRoom?.y) || 0),
  };
}