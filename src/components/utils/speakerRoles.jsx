// Small, pure helpers – no imports from app state
export function parseBedChannels(dolbyLayout) {
  // Accept strings like "5.1", "7.1", "9.1.2 Dolby Atmos" etc.
  if (!dolbyLayout || typeof dolbyLayout !== 'string') return 5;
  const m = dolbyLayout.trim().match(/^(\d+)\s*(?:\.|$)/);
  const n = m ? parseInt(m[1], 10) : 5;
  return Number.isFinite(n) ? n : 5;
}

// Return the set of roles that are *allowed* by the layout + switch
export function computeAllowedBedRoles({ dolbyLayout, useWidesInsteadOfRears }) {
  const bed = parseBedChannels(dolbyLayout);
  const roles = new Set(['FL','FC','FR','SL','SR']); // minimum for all

  if (bed >= 7) {
    if (bed >= 9) {
      // 9-bed: both rears and wides are valid
      roles.add('SBL'); roles.add('SBR');
      roles.add('LW');  roles.add('RW');
    } else {
      // 7-bed: rears XOR wides
      if (useWidesInsteadOfRears) { roles.add('LW'); roles.add('RW'); }
      else { roles.add('SBL'); roles.add('SBR'); }
    }
  }
  return roles;
}