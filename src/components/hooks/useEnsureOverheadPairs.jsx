// components/hooks/useEnsureOverheadPairs.js
// Ensures all required overhead speaker pairs exist in placedSpeakers
// based on the current Dolby configuration.

import * as React from 'react';
import { getSpeakerVisibilityFor } from '../AppStateProvider';

/**
 * Ensures that all overhead speaker roles required by the Dolby configuration
 * are present in placedSpeakers. Creates missing speakers using an existing
 * template, allowing downstream hooks (auto-placement, drag logic) to work correctly.
 * 
 * @param {Object} options
 * @param {string} options.dolbyConfiguration - Dolby layout like "5.1.4", "7.1.6", etc.
 * @param {Array} options.placedSpeakers - Current array of placed speakers
 * @param {Function} options.setPlacedSpeakers - Setter to update placed speakers
 * @param {boolean} options.useWidesInsteadOfRears - Layout preference for 7.x configurations
 */
export function useEnsureOverheadPairs({
  dolbyConfiguration,
  placedSpeakers,
  setPlacedSpeakers,
  useWidesInsteadOfRears = false,
  isDragging = false
}) {
  React.useEffect(() => {
    // [B44 PROMPT 3] Guard: don't create/modify overheads while dragging
    // CRITICAL: RP22 zones constrain placement, not interaction. Never block dragging.
    if (isDragging) return;
    
    // Guard: no configuration
    if (!dolbyConfiguration) return;
    
    // Guard: invalid speakers array
    if (!Array.isArray(placedSpeakers)) return;

    // 1. Determine required overhead roles from visibility logic
    const visibleRolesSet = getSpeakerVisibilityFor(dolbyConfiguration, useWidesInsteadOfRears);
    
    const requiredOverheadRoles = Array.from(visibleRolesSet).filter(
      role => role.startsWith('T')
    );

    // No overhead roles required for this layout
    if (requiredOverheadRoles.length === 0) return;

    // 2. Index existing speakers by role
    const existingByRole = {};
    placedSpeakers.forEach(spk => {
      if (spk.role) {
        existingByRole[spk.role] = spk;
      }
    });

    // 3. Identify missing roles
    const missingRoles = requiredOverheadRoles.filter(
      role => !existingByRole[role]
    );

    // All required overhead roles already exist
    if (missingRoles.length === 0) return;

    // 4. Find a template speaker
    const templateOverhead = placedSpeakers.find(s =>
      s.role && String(s.role).startsWith('T')
    );
    const templateAny = placedSpeakers[0];
    const template = templateOverhead || templateAny;

    // Can't create speakers without a template
    if (!template) return;

    // 5. Create missing speakers
    const nextSpeakers = [...placedSpeakers];
    
    missingRoles.forEach(role => {
      const newSpeaker = {
        ...template,
        id: template.id ? `${template.id}_${role}` : role,
        role,
        position: {
          x: template.position?.x ?? 0,
          y: template.position?.y ?? 0,
          z: template.position?.z ?? 2.4
        }
      };
      
      nextSpeakers.push(newSpeaker);
    });

    // 6. Commit changes
    if (nextSpeakers.length > placedSpeakers.length) {
      setPlacedSpeakers(nextSpeakers);
    }
  }, [dolbyConfiguration, placedSpeakers, setPlacedSpeakers, useWidesInsteadOfRears, isDragging]);
}