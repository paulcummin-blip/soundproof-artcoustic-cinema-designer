// components/hooks/useOverheadAutoPlacement.js
// Auto-placement hook for overhead speakers within RP22 zones
// Positions overhead speakers at the vertical center of their designated zone bands

import { useEffect } from 'react';

/**
 * Automatically positions overhead speakers to the center of their RP22 zones.
 * Only updates positions when speakers are outside their zones or unpositioned.
 * 
 * @param {Object} options
 * @param {Array} options.placedSpeakers - Current array of placed speakers
 * @param {Function} options.setPlacedSpeakers - Setter to update speaker positions
 * @param {Object} options.overheadZones - Zones from computeOverheadZones {frontZone, midZone, backZone, status}
 * @param {Function} options.getCanonicalRole - Role normalization function
 * @param {number} options.ohCount - Overhead count from Dolby layout (0, 2, 4, 6)
 */
export function useOverheadAutoPlacement({
  placedSpeakers,
  setPlacedSpeakers,
  overheadZones,
  getCanonicalRole,
  overheadCount
}) {
  useEffect(() => {
    // Guard: zones not ready
    if (!overheadZones || overheadZones.status !== 'ok') return;
    
    // Guard: no speakers
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;
    
    // Guard: no overhead channels
    if (!overheadCount || overheadCount <= 0) return;

    // Extract zone centers and edge positions for L/R pairs
    const zoneInfo = {};
    
    if (overheadZones.frontZone?.active) {
      const { x1, x2, y1, y2 } = overheadZones.frontZone;
      zoneInfo.front = {
        centerY: (y1 + y2) / 2,
        leftX: x1,
        rightX: x2,
        zone: overheadZones.frontZone
      };
    }
    
    if (overheadZones.midZone?.active) {
      const { x1, x2, y1, y2 } = overheadZones.midZone;
      zoneInfo.mid = {
        centerY: (y1 + y2) / 2,
        leftX: x1,
        rightX: x2,
        zone: overheadZones.midZone
      };
    }
    
    if (overheadZones.backZone?.active) {
      const { x1, x2, y1, y2 } = overheadZones.backZone;
      zoneInfo.rear = {
        centerY: (y1 + y2) / 2,
        leftX: x1,
        rightX: x2,
        zone: overheadZones.backZone
      };
    }

    // Map overhead roles to their zones with L/R positions
    const roleToZone = {
      'TFL': { ...zoneInfo.front, isLeft: true },
      'TFR': { ...zoneInfo.front, isLeft: false },
      'TML': { ...zoneInfo.mid, isLeft: true },
      'TMR': { ...zoneInfo.mid, isLeft: false },
      'TL': { ...zoneInfo.mid, isLeft: true },
      'TR': { ...zoneInfo.mid, isLeft: false },
      'TBL': { ...zoneInfo.rear, isLeft: true },
      'TBR': { ...zoneInfo.rear, isLeft: false },
    };

    // Check which speakers need updating
    let needsUpdate = false;
    const nextSpeakers = placedSpeakers.map(spk => {
      const canonicalRole = getCanonicalRole(spk.role);
      const zoneInfo = roleToZone[canonicalRole];
      
      // Not an overhead speaker or zone not available
      if (!zoneInfo || !zoneInfo.centerY || !zoneInfo.zone) return spk;
      
      const targetY = zoneInfo.centerY;
      const targetX = zoneInfo.isLeft ? zoneInfo.leftX : zoneInfo.rightX;
      const zone = zoneInfo.zone;
      
      const currentX = spk.position?.x;
      const currentY = spk.position?.y;

      // Determine if we should snap this speaker
      const shouldSnapY = 
        !Number.isFinite(currentY) || // No Y position set
        currentY < (zone.y1 - 0.01) || // Outside zone (below)
        currentY > (zone.y2 + 0.01);   // Outside zone (above)

      const shouldSnapX =
        !Number.isFinite(currentX) || // No X position set
        Math.abs(currentX - (zone.x1 + zone.x2) / 2) < 0.05; // At neutral center

      if (!shouldSnapY && !shouldSnapX) {
        // Already positioned correctly, don't move it
        return spk;
      }

      // Snap to zone center Y and edge X
      const newX = shouldSnapX ? targetX : currentX;
      const newY = shouldSnapY ? targetY : currentY;

      if (Math.abs(newX - currentX) > 0.001 || Math.abs(newY - currentY) > 0.001) {
        needsUpdate = true;
        return {
          ...spk,
          position: {
            ...spk.position,
            x: newX,
            y: newY
          }
        };
      }

      return spk;
    });

    // Only update if meaningful changes occurred
    if (needsUpdate && setPlacedSpeakers) {
      setPlacedSpeakers(nextSpeakers);
    }
  }, [placedSpeakers, setPlacedSpeakers, overheadZones, getCanonicalRole, overheadCount]);
}