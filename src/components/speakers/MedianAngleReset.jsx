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
  disabled = false
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

    // Compute median azimuth (same logic as P7)
    const getAngle = (vec) => {
      if (!vec || vec.x === 0 && vec.y === 0) return 0;
      return (Math.atan2(vec.x, vec.y) * 180 / Math.PI + 360) % 360;
    };

    // Compute median point (midpoint of L-SL and R-SR bisectors)
    const lwAz = getAngle({ x: L.position.x - mlpPoint.x, y: L.position.y - mlpPoint.y });
    const slAz = getAngle({ x: SL.position.x - mlpPoint.x, y: SL.position.y - mlpPoint.y });
    const rwAz = getAngle({ x: R.position.x - mlpPoint.x, y: R.position.y - mlpPoint.y });
    const srAz = getAngle({ x: SR.position.x - mlpPoint.x, y: SR.position.y - mlpPoint.y });

    // Median angle for LW (between L and SL)
    const lwMedianAz = (lwAz + slAz) / 2;
    
    // Median angle for RW (between R and SR)
    const rwMedianAz = (rwAz + srAz) / 2;

    // Helper: intersect ray with room bounds
    const rayIntersect = (azDeg) => {
      const azRad = azDeg * Math.PI / 180;
      const dx = Math.sin(azRad);
      const dy = Math.cos(azRad);

      const W = roomDims.widthM;
      const L = roomDims.lengthM;
      const inset = 0.05; // 5cm from walls

      let tMin = Infinity;

      // Intersect with x = inset
      if (dx < 0) {
        const t = (inset - mlpPoint.x) / dx;
        if (t > 0) {
          const y = mlpPoint.y + t * dy;
          if (y >= inset && y <= L - inset) tMin = Math.min(tMin, t);
        }
      }

      // Intersect with x = W - inset
      if (dx > 0) {
        const t = (W - inset - mlpPoint.x) / dx;
        if (t > 0) {
          const y = mlpPoint.y + t * dy;
          if (y >= inset && y <= L - inset) tMin = Math.min(tMin, t);
        }
      }

      // Intersect with y = inset
      if (dy < 0) {
        const t = (inset - mlpPoint.y) / dy;
        if (t > 0) {
          const x = mlpPoint.x + t * dx;
          if (x >= inset && x <= W - inset) tMin = Math.min(tMin, t);
        }
      }

      // Intersect with y = L - inset
      if (dy > 0) {
        const t = (L - inset - mlpPoint.y) / dy;
        if (t > 0) {
          const x = mlpPoint.x + t * dx;
          if (x >= inset && x <= W - inset) tMin = Math.min(tMin, t);
        }
      }

      if (tMin === Infinity) {
        // Fallback: place near MLP
        return { x: mlpPoint.x + dx * 0.5, y: mlpPoint.y + dy * 0.5 };
      }

      // Place slightly inside the boundary
      const safeT = tMin * 0.95;
      return {
        x: mlpPoint.x + safeT * dx,
        y: mlpPoint.y + safeT * dy
      };
    };

    // Compute new positions
    const newLwPos = rayIntersect(lwMedianAz);
    const newRwPos = rayIntersect(rwMedianAz);

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