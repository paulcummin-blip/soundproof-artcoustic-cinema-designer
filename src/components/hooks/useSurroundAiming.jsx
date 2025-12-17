import { useEffect, useCallback } from 'react';
import { computeWallHingeYaw, yawChangedSignificantly } from '@/components/utils/wallHingeAiming';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

/**
 * Hook to manage automatic aiming of surround speakers to MLP
 * Updates speaker rotations when toggles are ON and positions/MLP changes
 */
export function useSurroundAiming({
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  roomDimensions,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
}) {
  const updateAiming = useCallback(() => {
    // No MLP or dimensions = no aiming
    if (!mlpPoint || !roomDimensions) return;
    if (!Number.isFinite(mlpPoint.x) || !Number.isFinite(mlpPoint.y)) return;
    if (!Number.isFinite(roomDimensions.width) || !Number.isFinite(roomDimensions.length)) return;
    
    // No toggles enabled = no work to do
    if (!aimFrontWidesAtMLP && !aimSideSurroundsAtMLP && !aimRearSurroundsAtMLP) return;
    
    setSpeakers(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      
      let changed = false;
      
      const updated = prev.map(speaker => {
        if (!speaker) return speaker;
        
        const canon = getCanonicalRole(speaker.role);
        
        // Determine if this speaker should be aimed
        let shouldAim = false;
        if (aimFrontWidesAtMLP && (canon === 'LW' || canon === 'RW')) {
          shouldAim = true;
        } else if (aimSideSurroundsAtMLP && (canon === 'SL' || canon === 'SR')) {
          shouldAim = true;
        } else if (aimRearSurroundsAtMLP && (canon === 'SBL' || canon === 'SBR')) {
          shouldAim = true;
        }
        
        if (!shouldAim) return speaker;
        
        // Need valid position to aim
        if (!speaker.position) return speaker;
        if (!Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
          return speaker;
        }
        
        // Compute aimed yaw
        const newYaw = computeWallHingeYaw({
          speakerRole: canon,
          speakerPos: { x: speaker.position.x, y: speaker.position.y },
          mlpPos: { x: mlpPoint.x, y: mlpPoint.y },
          roomDims: { width: roomDimensions.width, length: roomDimensions.length },
        });
        
        if (newYaw === null) return speaker;
        
        // Get current yaw from multiple possible sources
        const currentYaw = speaker.yaw ?? speaker.rotationDeg ?? speaker.rotation_deg ?? speaker.rotation?.y ?? 0;
        
        // Only update if changed significantly (avoid infinite loops)
        if (!yawChangedSignificantly(currentYaw, newYaw, 0.1)) {
          return speaker;
        }
        
        changed = true;
        
        // Update both yaw and rotation.y for compatibility
        return {
          ...speaker,
          yaw: newYaw,
          rotation: {
            ...(speaker.rotation || {}),
            y: newYaw,
          },
        };
      });
      
      return changed ? updated : prev;
    });
  }, [
    mlpPoint,
    roomDimensions,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    setSpeakers,
  ]);
  
  // Update aiming when any dependency changes
  useEffect(() => {
    updateAiming();
  }, [updateAiming]);
  
  // Also update when speaker positions change (for drag updates)
  useEffect(() => {
    if (!Array.isArray(placedSpeakers)) return;
    
    // Extract position values to trigger on position changes
    const positions = placedSpeakers.map(s => {
      const canon = getCanonicalRole(s?.role);
      const isRelevant = 
        (aimFrontWidesAtMLP && (canon === 'LW' || canon === 'RW')) ||
        (aimSideSurroundsAtMLP && (canon === 'SL' || canon === 'SR')) ||
        (aimRearSurroundsAtMLP && (canon === 'SBL' || canon === 'SBR'));
      
      if (!isRelevant) return null;
      return { x: s?.position?.x, y: s?.position?.y };
    }).filter(p => p !== null);
    
    // Trigger update when positions change
    if (positions.length > 0) {
      updateAiming();
    }
  }, [
    placedSpeakers,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    updateAiming,
  ]);
}