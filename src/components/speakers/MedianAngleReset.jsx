import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

/**
 * Median Angle Reset for Front Wides
 * Moves LW and RW so they are perfectly positioned at the median azimuth from MLP,
 * resulting in P7 deviation = 0.0° (L4).
 */
export default function MedianAngleReset({ 
  placedSpeakers, 
  mlpPoint, 
  roomDims, 
  setSpeakers,
  disabled = false,
  frontWideOverlay = null
}) {
  const [justReset, setJustReset] = useState(false);

  // Normalize role to handle aliases (same as P7)
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'LW' || r === 'FWL' || r === 'WL' || r === 'LFW') return 'LW';
    if (r === 'RW' || r === 'FWR' || r === 'WR' || r === 'RFW') return 'RW';
    return r;
  };

  // Extract position from any format
  const getPos = (s) => {
    if (!s) return null;
    if (s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y)) 
      return s.position;
    if (s.pos && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y)) 
      return s.pos;
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) 
      return { x: s.x, y: s.y };
    return null;
  };

  // Find front wides
  const findSpeaker = (targetRole) => {
    const spk = (placedSpeakers || []).find(s => normalizeRole(s.role) === targetRole);
    if (!spk) return null;
    const pos = getPos(spk);
    return pos ? { ...spk, position: pos } : null;
  };

  const L = findSpeaker('L') || findSpeaker('FL');
  const R = findSpeaker('R') || findSpeaker('FR');
  const SL = findSpeaker('SL');
  const SR = findSpeaker('SR');
  const LW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'LW');
  const RW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'RW');

  // Check if wides exist
  const hasWides = !!(LW && RW);

  // Check if we can compute the reset
  const canReset = hasWides && mlpPoint && 
    Number.isFinite(mlpPoint.x) && Number.isFinite(mlpPoint.y) &&
    L && R && SL && SR &&
    roomDims && Number.isFinite(roomDims.widthM) && Number.isFinite(roomDims.lengthM);

  const handleReset = () => {
    if (!canReset) return;

    // NEW: Use overlay truth for median positions
    // Check if overlay data is ready
    if (!frontWideOverlay || frontWideOverlay.status !== 'ok' || 
        !frontWideOverlay.left || frontWideOverlay.left.status !== 'ok' ||
        !frontWideOverlay.right || frontWideOverlay.right.status !== 'ok') {
      console.warn('[Median Reset] FW overlay not ready:', frontWideOverlay?.status);
      return;
    }

    // Get median Y positions from overlay truth (already in meters)
    const leftMedianY = frontWideOverlay.left.medianY;
    const rightMedianY = frontWideOverlay.right.medianY;

    // Validate medianY values
    if (!Number.isFinite(leftMedianY) || !Number.isFinite(rightMedianY)) {
      console.warn('[Median Reset] Invalid medianY values:', { leftMedianY, rightMedianY });
      return;
    }

    // Use the same wall inset as the overlay calculation (0.01m)
    const WALL_INSET = 0.01;
    const W = roomDims.widthM;

    // Place LW and RW at the exact overlay median lines
    const newLwPos = {
      x: WALL_INSET,
      y: leftMedianY
    };

    const newRwPos = {
      x: W - WALL_INSET,
      y: rightMedianY
    };

    // Update speakers
    const updated = (placedSpeakers || []).map(s => {
      const canon = normalizeRole(s.role);
      if (canon === 'LW') {
        return { ...s, position: { ...s.position, x: newLwPos.x, y: newLwPos.y } };
      }
      if (canon === 'RW') {
        return { ...s, position: { ...s.position, x: newRwPos.x, y: newRwPos.y } };
      }
      return s;
    });

    setSpeakers(updated);

    // Show "Done" state briefly
    setJustReset(true);
    setTimeout(() => setJustReset(false), 1500);
  };

  if (!hasWides) return null;

  // Debug: Check if overlay truth is usable
  const overlayUsable = frontWideOverlay?.status === 'ok' && 
                        frontWideOverlay?.left?.status === 'ok' && 
                        frontWideOverlay?.right?.status === 'ok';

  return (
    <div className="px-4 py-3 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Individual Control</div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={disabled || !canReset}
          className="text-xs"
        >
          {justReset ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              Done
            </>
          ) : (
            'Median Angle Reset'
          )}
        </Button>
      </div>
      {!canReset && hasWides && (
        <div className="text-xs text-gray-500 mt-1">
          Front Wides not available (missing L, R, SL, SR, or MLP)
        </div>
      )}
    </div>
  );
}