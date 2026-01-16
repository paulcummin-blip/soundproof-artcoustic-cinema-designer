import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { computeFrontWideMedianData } from '@/components/utils/frontWideMedian';

/**
 * Median Angle Reset for Front Wides
 * Uses canonical RP22 median angle calculation.
 * Moves LW and RW to exact median positions, resulting in P7 deviation = 0.0° (L4).
 */
export default function MedianAngleReset({ 
  placedSpeakers, 
  mlpPoint, 
  roomDims, 
  setSpeakers,
  disabled = false
}) {
  const [justReset, setJustReset] = useState(false);

  // Normalize role to handle aliases
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'LW' || r === 'FWL' || r === 'WL' || r === 'LFW') return 'LW';
    if (r === 'RW' || r === 'FWR' || r === 'WR' || r === 'RFW') return 'RW';
    return null;
  };

  // Check if wides exist
  const LW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'LW');
  const RW = (placedSpeakers || []).find(s => normalizeRole(s.role) === 'RW');
  const hasWides = !!(LW && RW);

  // Compute canonical median data
  const medianData = computeFrontWideMedianData({
    mlpPoint,
    placedSpeakers: placedSpeakers || [],
    roomDims: roomDims || {},
    wallInset: 0.05
  });

  // Can reset if median calculation succeeded
  const canReset = hasWides && medianData.status === 'ok';

  const handleReset = () => {
    if (!canReset) return;

    // Use canonical target positions from median data
    const newLwPos = medianData.left.targetPosition;
    const newRwPos = medianData.right.targetPosition;

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