import { useCallback, useEffect, useRef } from "react";

/**
 * useFrontPointerDrag — one Pointer Events drag lifecycle for elevation direct
 * manipulation. It is the single event-plumbing layer shared by the Front
 * Elevation draggable objects (LCR speakers, subwoofers, screen) and is written
 * so the Side Elevation conversion can reuse it unchanged.
 *
 * The hook owns ONLY the event plumbing:
 *   - pointer capture on the target element
 *   - the tap/drag threshold (input-type aware: a slightly larger threshold for
 *     touch so a finger tap does not nudge the object, but precise mouse/Pencil
 *     movement stays easy)
 *   - multi-touch safety: a second pointer while a drag owns the pointer is
 *     ignored — it never becomes a second editing pointer
 *   - cancellation routed separately from commit
 *
 * It NEVER interprets coordinates, limits, snapping or pairing, and it NEVER
 * commits geometry. Those stay in the component, which supplies callbacks that
 * reuse the exact same authoritative transforms, limits and snapping the mouse
 * path used:
 *
 *   onStart(drag)   — threshold crossed; the drag is now active. Begin visual
 *                     preview / highlight here. Not called for a tap.
 *   onMove(drag, e) — live preview during drag. Read clientX/clientY and reuse
 *                     the existing coordinate transform, limits and snapping.
 *   onCommit(drag)  — single commit on a clean pointer release. Called only when
 *                     the pointer actually moved past the threshold.
 *   onCancel(drag)  — cancellation (pointercancel, lostpointercapture, unmount,
 *                     or a second pointer). Restore/retain the last committed
 *                     geometry. NEVER commits an unintended final position.
 *
 * The drag object carried in dragRef.current holds the target fields plus:
 *   pointerId, el, startClientX, startClientY, moved, isTouch, threshold.
 * The component may add its own fields (e.g. axisLocked) to the target object;
 * they are preserved and mutable through dragRef.current.
 */
const DEFAULT_THRESHOLD_PX = 5;
const DEFAULT_TOUCH_THRESHOLD_PX = 10;

export function useFrontPointerDrag(config) {
  // Keep the latest callbacks in a ref so the element handlers stay stable
  // (deps: []) and never close over a stale onMove/onCommit/onCancel.
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const dragRef = useRef(null);

  const releaseCapture = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = drag.el;
    if (el && drag.pointerId != null) {
      try { el.releasePointerCapture(drag.pointerId); } catch (_) { /* already released */ }
    }
    const { isDraggingRef } = cfgRef.current;
    if (isDraggingRef) isDraggingRef.current = false;
    document.body.style.cursor = '';
    dragRef.current = null;
  }, []);

  const finishCommit = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const { onCommit } = cfgRef.current;
    // Commit exactly once, and only when the pointer genuinely moved past the
    // threshold — a tap releases without committing.
    if (drag.moved) {
      try { onCommit?.(drag); } catch (_) { /* bubble-safe */ }
    }
    releaseCapture();
  }, [releaseCapture]);

  const cancel = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const { onCancel } = cfgRef.current;
    try { onCancel?.(drag); } catch (_) { /* bubble-safe */ }
    releaseCapture();
  }, [releaseCapture]);

  // pointerdown factory. Returns a handler bound to a specific drag target.
  const bindPointerDown = useCallback((target) => (e) => {
    const { isDraggingRef, thresholdPx, touchThresholdPx } = cfgRef.current;
    // Mouse: only the primary button starts a drag. Touch/Pencil report button 0.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Multi-touch: a drag is already in progress — a second pointer does not
    // start or hijack the active interaction.
    if (dragRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* capture unsupported */ }

    const isTouch = e.pointerType === 'touch';
    dragRef.current = {
      ...target,
      pointerId: e.pointerId,
      el,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      isTouch,
      threshold: isTouch ? (touchThresholdPx ?? DEFAULT_TOUCH_THRESHOLD_PX) : (thresholdPx ?? DEFAULT_THRESHOLD_PX),
    };
    if (isDraggingRef) isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
  }, []);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { onMove, onStart } = cfgRef.current;
    // Tap/drag threshold in client pixels — distinguishes a tap from an
    // intentional drag without making precise Pencil/mouse movement difficult.
    if (!drag.moved) {
      const dC = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (dC < drag.threshold) return;
      drag.moved = true;
      try { onStart?.(drag); } catch (_) { /* bubble-safe */ }
    }
    try { onMove?.(drag, e); } catch (_) { /* bubble-safe */ }
  }, []);

  const onPointerUp = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    finishCommit();
  }, [finishCommit]);

  const onPointerCancel = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    cancel();
  }, [cancel]);

  // Capture lost without a clean pointerup (system interruption, element
  // removed, etc.) — cancellation, never a commit.
  const onLostPointerCapture = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    cancel();
  }, [cancel]);

  // Unmount safety: an interrupted drag must not leave a stuck drag state.
  useEffect(() => () => { cancel(); }, [cancel]);

  return {
    dragRef,
    bindPointerDown,
    elementHandlers: {
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
    },
  };
}