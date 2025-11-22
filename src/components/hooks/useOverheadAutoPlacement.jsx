// components/hooks/useOverheadAutoPlacement.js
// Auto-placement hook for overhead speakers within RP22 zones
// Positions overhead speakers at the vertical center of their designated zone bands

import { useEffect, useRef } from 'react';

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
  overheadCount,
  hasManualOverheadEdit = false,
  mlpPoint = null,
  heightM = 2.4
}) {
  const lastLayoutKeyRef = useRef(null);

  useEffect(() => {
    // Guard: user has manually edited overheads - don't auto-place anymore
    if (hasManualOverheadEdit) return;
    
    // Guard: zones not ready
    if (!overheadZones || overheadZones.status !== 'ok') return;
    
    // Guard: no speakers
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;
    
    // Guard: no overhead channels
    if (!overheadCount || overheadCount <= 0) return;

    // Build layout signature to detect zone changes
    const layoutKey = JSON.stringify({
      clampByRole: overheadZones?.clampByRole || null,
      mlp: mlpPoint || null,
    });

    // Only reposition if layout has changed
    if (layoutKey === lastLayoutKeyRef.current) return;
    lastLayoutKeyRef.current = layoutKey;

    // Use per-role clamp rectangles to center each overhead
    const clampByRole = overheadZones?.clampByRole;
    if (!clampByRole) return;

    // Build list of expected overhead roles for current layout
    const expectedRoles = [];
    if (overheadCount === 2) {
      expectedRoles.push('TL', 'TR');
    } else if (overheadCount === 4) {
      expectedRoles.push('TFL', 'TFR', 'TBL', 'TBR');
    } else if (overheadCount === 6) {
      expectedRoles.push('TFL', 'TFR', 'TL', 'TR', 'TBL', 'TBR');
    }

    if (expectedRoles.length === 0) return;

    let needsUpdate = false;
    const nextSpeakers = [...placedSpeakers];

    // For each expected overhead role, ensure it exists and is positioned
    expectedRoles.forEach(role => {
      const rect = clampByRole[role];
      if (!rect || !Number.isFinite(rect.xMin) || !Number.isFinite(rect.xMax) || 
          !Number.isFinite(rect.yMin) || !Number.isFinite(rect.yMax)) {
        return;
      }

      // Calculate center of this role's clamp rectangle
      const centerX = (rect.xMin + rect.xMax) / 2;
      const centerY = (rect.yMin + rect.yMax) / 2;

      // Find existing speaker with this role
      const existingIndex = nextSpeakers.findIndex(s => getCanonicalRole(s.role) === role);

      if (existingIndex >= 0) {
        // Speaker exists - check if it needs repositioning
        const spk = nextSpeakers[existingIndex];
        const currentX = spk.position?.x;
        const currentY = spk.position?.y;

        const isOutsideX = !Number.isFinite(currentX) || currentX < rect.xMin || currentX > rect.xMax;
        const isOutsideY = !Number.isFinite(currentY) || currentY < rect.yMin || currentY > rect.yMax;

        if (isOutsideX || isOutsideY) {
          nextSpeakers[existingIndex] = {
            ...spk,
            position: {
              ...(spk.position || {}),
              x: centerX,
              y: centerY,
              z: spk.position?.z || heightM - 0.1, // Near ceiling
            },
          };
          needsUpdate = true;
        }
      } else {
        // Speaker doesn't exist - create it
        nextSpeakers.push({
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: role,
          model: null, // Will be resolved from global overhead model
          position: {
            x: centerX,
            y: centerY,
            z: heightM - 0.1,
          },
        });
        needsUpdate = true;
      }
    });

    // Only update if meaningful changes occurred
    if (needsUpdate && setPlacedSpeakers) {
      setPlacedSpeakers(nextSpeakers);
    }
  }, [placedSpeakers, setPlacedSpeakers, overheadZones, getCanonicalRole, overheadCount, mlpPoint, heightM]);
}