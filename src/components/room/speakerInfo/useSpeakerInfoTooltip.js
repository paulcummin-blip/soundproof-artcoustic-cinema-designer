import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hover and tap behaviour for the speaker information tooltip, shared by Front
 * Elevation, the Side Elevations and the Plan View.
 *
 * Hover shows the card and moving away dismisses it. A tap or click selects it
 * (so a touch user can read it) and any press elsewhere, or Escape, dismisses a
 * selected card. A press that turns into a speaker drag is never treated as a
 * selection, so the established dragging gestures are untouched.
 *
 * The anchor and the drawing bounds are measured from real elements on every
 * render, so the card stays correctly placed when the drawing is zoomed or panned.
 */
const DRAG_SLOP_PX = 5;

export function useSpeakerInfoTooltip({ containerRef, boundsRef }) {
  const [state, setState] = useState(null); // { el, info, pinned }
  const pressRef = useRef(null);
  const pinnedRef = useRef(false);

  useEffect(() => {
    const onPointerDown = (e) => {
      pressRef.current = { x: e.clientX, y: e.clientY };
      // Any press dismisses a selected card: the click that follows either
      // re-selects the speaker under the pointer or leaves the drawing clear.
      if (pinnedRef.current) {
        pinnedRef.current = false;
        setState(null);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape" && pinnedRef.current) {
        pinnedRef.current = false;
        setState(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const rectInContainer = useCallback(
    (el) => {
      const container = containerRef?.current;
      if (!container || !el) return null;
      const c = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return {
        left: r.left - c.left,
        top: r.top - c.top,
        right: r.right - c.left,
        bottom: r.bottom - c.top,
      };
    },
    [containerRef],
  );

  const hide = useCallback(() => {
    if (pinnedRef.current) return;
    setState(null);
  }, []);

  /**
   * Show the card for the element that was hovered or tapped.
   * `buildInfo` is called at show time so the content and the neighbouring
   * boxes it returns are the ones current for that drawing.
   */
  const show = useCallback((e, buildInfo) => {
    const el = e?.currentTarget || e?.target;
    if (!el) return;

    const isTap = e?.type === "click" || e?.type === "touchstart" || e?.type === "pointerup";
    if (isTap) {
      const press = pressRef.current;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_SLOP_PX) return;
    }

    const info = typeof buildInfo === "function" ? buildInfo() : buildInfo;
    if (!info) return;

    pinnedRef.current = !!isTap;
    setState({ el, info, pinned: !!isTap });
  }, []);

  /** Ready-made handlers for an SVG element in the elevations. */
  const bind = useCallback(
    (buildInfo) => ({
      onMouseEnter: (e) => show(e, buildInfo),
      onMouseLeave: hide,
      onClick: (e) => show(e, buildInfo),
    }),
    [show, hide],
  );

  const dismiss = useCallback(() => {
    pinnedRef.current = false;
    setState(null);
  }, []);

  const anchor = state ? rectInContainer(state.el) : null;
  const bounds = rectInContainer(boundsRef?.current || containerRef?.current);

  return {
    visible: !!(state && anchor && bounds),
    info: state?.info || null,
    anchor,
    bounds,
    pinned: !!state?.pinned,
    bind,
    show,
    hide,
    dismiss,
  };
}