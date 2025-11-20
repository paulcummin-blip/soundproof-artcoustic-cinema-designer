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

    // Extract zone centers
    const zoneCenters = {};
    
    if (overheadZones.frontZone?.active) {
      const { y1, y2 } = overheadZones.frontZone;
      zoneCenters.front = (y1 + y2) / 2;
    }
    
    if (overheadZones.midZone?.active) {
      const { y1, y2 } = overheadZones.midZone;
      zoneCenters.mid = (y1 + y2) / 2;
    }
    
    if (overheadZones.backZone?.active) {
      const { y1, y2 } = overheadZones.backZone;
      zoneCenters.rear = (y1 + y2) / 2;
    }

    // Map overhead roles to their zone centers
    const roleToZone = {
      'TFL': { centerY: zoneCenters.front, zone: overheadZones.frontZone },
      'TFR': { centerY: zoneCenters.front, zone: overheadZones.frontZone },
      'TML': { centerY: zoneCenters.mid, zone: overheadZones.midZone },
      'TMR': { centerY: zoneCenters.mid, zone: overheadZones.midZone },
      'TL': { centerY: zoneCenters.mid, zone: overheadZones.midZone },
      'TR': { centerY: zoneCenters.mid, zone: overheadZones.midZone },
      'TBL': { centerY: zoneCenters.rear, zone: overheadZones.backZone },
      'TBR': { centerY: zoneCenters.rear, zone: overheadZones.backZone },
    };

    // Check which speakers need updating
    let needsUpdate = false;
    const nextSpeakers = placedSpeakers.map(spk => {
      const canonicalRole = getCanonicalRole(spk.role);
      const zoneInfo = roleToZone[canonicalRole];
      
      // Not an overhead speaker or zone not available
      if (!zoneInfo || !zoneInfo.centerY || !zoneInfo.zone) return spk;
      
      const targetY = zoneInfo.centerY;
      const zone = zoneInfo.zone;
      const currentY = spk.position?.y;

      // Determine if we should snap this speaker
      const shouldSnap = 
        !Number.isFinite(currentY) || // No Y position set
        currentY < (zone.y1 - 0.01) || // Outside zone (below)
        currentY > (zone.y2 + 0.01);   // Outside zone (above)

      if (!shouldSnap) {
        // Already within zone, don't move it
        return spk;
      }

      // Snap to zone center
      if (Math.abs(targetY - currentY) > 0.001) {
        needsUpdate = true;
        return {
          ...spk,
          position: {
            ...spk.position,
            y: targetY
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