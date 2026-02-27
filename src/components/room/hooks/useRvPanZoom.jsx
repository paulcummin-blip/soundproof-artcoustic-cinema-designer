import { useState, useRef, useCallback } from "react";

/**
 * Pan + zoom behaviour for the Room Visualisation SVG canvas.
 * Extracted from RoomVisualisation to reduce file size.
 */
export function useRvPanZoom({ planBoundsRef, isDraggingSpeakerRef }) {
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [viewOffsetPx, setViewOffsetPx] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const zoomAtPoint = useCallback((newZoom, clientX, clientY) => {
    if (!planBoundsRef.current) return;
    const rect = planBoundsRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const worldX = (px - panX) / zoom;
    const worldY = (py - panY) / zoom;
    const newPanX = px - worldX * newZoom;
    const newPanY = py - worldY * newZoom;
    const MIN_VISIBLE = 40;
    const maxPanX = rect.width - MIN_VISIBLE;
    const minPanX = -rect.width + MIN_VISIBLE;
    const maxPanY = rect.height - MIN_VISIBLE;
    const minPanY = -rect.height + MIN_VISIBLE;
    setPanX(Math.max(minPanX, Math.min(maxPanX, newPanX)));
    setPanY(Math.max(minPanY, Math.min(maxPanY, newPanY)));
    setZoom(Math.max(0.5, Math.min(2.0, newZoom)));
  }, [zoom, panX, panY, planBoundsRef]);

  const handlePlanClick = useCallback((e, zoomMode) => {
    if (zoomMode === 'off') return;
    if (e.target.tagName === 'ellipse' || e.target.closest('[data-draggable]')) return;
    const step = 0.15;
    const newZoom = zoomMode === 'in' ? zoom + step : zoom - step;
    zoomAtPoint(newZoom, e.clientX, e.clientY);
  }, [zoom, zoomAtPoint]);

  const onPanPointerDown = useCallback((e, dragging) => {
    if (e.defaultPrevented) return;
    if (isDraggingSpeakerRef.current) return;
    if (dragging) return;
    if (zoom <= 1) return;
    if (e.button !== 0) return;
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.currentTarget !== e.target) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, ox: viewOffsetPx.x, oy: viewOffsetPx.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }, [zoom, viewOffsetPx, isDraggingSpeakerRef]);

  const onPanPointerMove = useCallback((e) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setViewOffsetPx({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
  }, []);

  const onPanPointerUp = useCallback((e) => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
  }, []);

  return {
    zoom, panX, panY, viewOffsetPx,
    isPanningRef, lastPointerRef,
    zoomAtPoint, handlePlanClick,
    onPanPointerDown, onPanPointerMove, onPanPointerUp,
  };
}