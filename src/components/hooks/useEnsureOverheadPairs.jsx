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
  overheadGlobalModel = null,
  overheadFrontOverride = null,
  overheadMidOverride = null,
  overheadRearOverride = null,
  useFrontGlobal = true,
  useMidGlobal = true,
  useRearGlobal = true,
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

    const resolveOverheadModelForRole = (role) => {
      const r = String(role || '').toUpperCase();
      if (!r.startsWith('T')) return null;

      let zone = null;

      if (['TFL', 'TFR', 'TFC'].includes(r)) zone = 'front';
      else if (['TL', 'TR', 'TML', 'TMR'].includes(r)) zone = 'mid';
      else if (['TBL', 'TBR', 'TBC', 'TRL', 'TRR', 'TRC'].includes(r)) zone = 'rear';

      if (!zone) return overheadGlobalModel || null;

      if (zone === 'front') {
        return useFrontGlobal
          ? (overheadGlobalModel || null)
          : (overheadFrontOverride || overheadGlobalModel || null);
      }

      if (zone === 'mid') {
        return useMidGlobal
          ? (overheadGlobalModel || null)
          : (overheadMidOverride || overheadGlobalModel || null);
      }

      if (zone === 'rear') {
        return useRearGlobal
          ? (overheadGlobalModel || null)
          : (overheadRearOverride || overheadGlobalModel || null);
      }

      return overheadGlobalModel || null;
    };

    // 1. Determine required overhead roles from visibility logic
    const visibleRolesSet = getSpeakerVisibilityFor(dolbyConfiguration, useWidesInsteadOfRears);
    
    const requiredOverheadRoles = Array.from(visibleRolesSet).filter(
      role => role.startsWith('T')
    );

    // No overhead roles required for this layout
    if (requiredOverheadRoles.length === 0) return;

    // Guard: do not seed T* speakers unless an overhead model is actually selected.
    // An overhead is "effectively off" when overheadGlobalModel is absent AND no
    // zone-specific override is independently active.
    const isModelOff = (m) => !m || ['off', 'none', ''].includes(String(m).toLowerCase().trim());
    const hasGlobal = !isModelOff(overheadGlobalModel);
    const hasFrontOverride = !useFrontGlobal && !isModelOff(overheadFrontOverride);
    const hasMidOverride   = !useMidGlobal   && !isModelOff(overheadMidOverride);
    const hasRearOverride  = !useRearGlobal  && !isModelOff(overheadRearOverride);
    const overheadsEffectivelyEnabled = hasGlobal || hasFrontOverride || hasMidOverride || hasRearOverride;
    if (!overheadsEffectivelyEnabled) return;

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