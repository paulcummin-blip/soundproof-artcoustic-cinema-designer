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
  frontWideZones = null,
  roomWidthM = null,
  wallInsetM = 0.01,
  disabled = false
}) {
  const [justReset, setJustReset] = useState(false);

  // Normalize role to handle aliases
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'LW' || r === 'FWL' || r === 'WL' || r === 'LFW') return 'LW';
    if (r === 'RW' || r === 'FWR' || r === 'WR' || r === 'RFW') return 'RW';
    return r;
  };

  // Find front wides
  const LW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'LW');
  const RW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'RW');

  // Check if wides exist
  const hasWides = !!(LW || RW);

  // Check if we can compute the reset using overlay truth
  const hasValidOverlay = frontWideZones?.status === 'ok';
  const hasLeftZone = hasValidOverlay && frontWideZones.left?.status === 'ok' && Number.isFinite(frontWideZones.left.medianY);
  const hasRightZone = hasValidOverlay && frontWideZones.right?.status === 'ok' && Number.isFinite(frontWideZones.right.medianY);
  
  const W = Number(roomWidthM || roomDims?.widthM) || 0;
  
  const canReset = hasWides && W > 0 && (hasLeftZone || hasRightZone);

  const handleReset = () => {
    if (!canReset) return;

    // Use overlay truth: place LW/RW directly on the median Y coordinates from frontWideZones
    const updated = (placedSpeakers || []).map(s => {
      const canon = normalizeRole(s.role);
      const existingZ = s.position?.z ?? 1.2;
      
      if (canon === 'LW' && hasLeftZone) {
        const targetY = frontWideZones.left.medianY;
        if (!Number.isFinite(targetY)) return s; // Safety
        
        return { 
          ...s, 
          position: { 
            x: wallInsetM, 
            y: targetY, 
            z: existingZ 
          } 
        };
      }
      
      if (canon === 'RW' && hasRightZone) {
        const targetY = frontWideZones.right.medianY;
        if (!Number.isFinite(targetY)) return s; // Safety
        
        return { 
          ...s, 
          position: { 
            x: W - wallInsetM, 
            y: targetY, 
            z: existingZ 
          } 
        };
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