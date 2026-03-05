import { useCallback } from "react";

export function useCanvasZoomHandlers({
  zoom,
  zoomMode,
  planBoundsRef,
  panX,
  panY,
  setPanX,
  setPanY,
  setZoom,
}) {
  // Zoom at point helper
  const zoomAtPoint = useCallback((newZoom, clientX, clientY) => {
    if (!planBoundsRef.current) return;
    
    const rect = planBoundsRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    
    // Keep world point under cursor fixed
    const worldX = (px - panX) / zoom;
    const worldY = (py - panY) / zoom;
    
    const newPanX = px - worldX * newZoom;
    const newPanY = py - worldY * newZoom;
    
    // Clamp pan to keep plan visible (at least 40px of roomRect within viewport)
    const MIN_VISIBLE = 40;
    const maxPanX = rect.width - MIN_VISIBLE;
    const minPanX = -rect.width + MIN_VISIBLE;
    const maxPanY = rect.height - MIN_VISIBLE;
    const minPanY = -rect.height + MIN_VISIBLE;
    
    setPanX(Math.max(minPanX, Math.min(maxPanX, newPanX)));
    setPanY(Math.max(minPanY, Math.min(maxPanY, newPanY)));
    setZoom(Math.max(0.5, Math.min(2.0, newZoom)));
  }, [zoom, panX, panY, setPanX, setPanY, setZoom, planBoundsRef]);

  // Handle plan click for zoom
  const handlePlanClick = useCallback((e) => {
    if (zoomMode === 'off') return;
    
    // Don't zoom if clicking on draggable elements
    if (e.target.tagName === 'ellipse' || e.target.closest('[data-draggable]')) return;
    
    const step = 0.15;
    const newZoom = zoomMode === 'in' ? zoom + step : zoom - step;
    
    zoomAtPoint(newZoom, e.clientX, e.clientY);
  }, [zoomMode, zoom, zoomAtPoint]);

  return {
    handlePlanClick,
    zoomAtPoint,
  };
}