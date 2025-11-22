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
    
    // Guard: no setter
    if (!setPlacedSpeakers) return;

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

    // Map overhead roles to band and side
    const roleToBand = {
      'TFL': 'front', 'TFR': 'front', 'TFC': 'front',
      'TML': 'mid', 'TMR': 'mid', 'TL': 'mid', 'TR': 'mid',
      'TBL': 'rear', 'TBR': 'rear', 'TBC': 'rear'
    };
    
    const roleToSide = {
      'TFL': 'L', 'TML': 'L', 'TL': 'L', 'TBL': 'L',
      'TFR': 'R', 'TMR': 'R', 'TR': 'R', 'TBR': 'R'
    };

    // Position all overhead speakers at their band centers
    // Only update speakers without valid positions OR those at (0,0) placeholder
    let needsUpdate = false;
    const nextSpeakers = placedSpeakers.map(spk => {
      const canonicalRole = getCanonicalRole(spk.role);
      const band = roleToBand[canonicalRole];
      const side = roleToSide[canonicalRole];
      
      // Not an overhead speaker or band not available
      if (!band || !zoneInfo[band]) return spk;
      
      const zone = zoneInfo[band];
      const targetY = zone.centerY;
      const targetX = side === 'R' ? zone.rightX : zone.leftX;
      
      const currentX = spk.position?.x;
      const currentY = spk.position?.y;

      // Check if position is invalid or is at the placeholder (0,0) from template
      const hasValidPos =
        Number.isFinite(currentX) &&
        Number.isFinite(currentY) &&
        !(currentX === 0 && currentY === 0);

      // Only auto-position if no valid position OR at (0,0) template position
      if (hasValidPos) {
        return spk;
      }

      // Move to zone center Y and edge X
      needsUpdate = true;
      return {
        ...spk,
        position: {
          ...spk.position,
          x: targetX,
          y: targetY
        }
      };
    });

    // Only update if meaningful changes occurred
    if (needsUpdate && setPlacedSpeakers) {
      setPlacedSpeakers(nextSpeakers);
    }
  }, [placedSpeakers, setPlacedSpeakers, overheadZones, getCanonicalRole, overheadCount]);
}