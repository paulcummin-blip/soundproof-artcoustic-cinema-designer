import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

/**
 * Applies the selected LCR model, snaps FC to the center plane, and locks FL/FR to that plane.
 * @param {Array} currentSpeakers - The current list of speaker objects.
 * @param {string} modelName - The full model name for the LCR speakers.
 * @param {object} dimensions - The room dimensions { width, length, height }.
 * @param {object} screen - The screen configuration object.
 * @returns {Array} The updated list of speaker objects.
 */
export function applyLCRModel(currentSpeakers, modelName, dimensions, screen) {
  const roomWidth = Number(dimensions?.width) || 4.5;
  const screenPlaneY = Math.max(0, Number(screen?.floatDepthM) || 0.20);
  const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);

  return currentSpeakers.map(speaker => {
    const role = String(speaker.role).toUpperCase();
    if (!lcrRoles.has(role)) {
      return speaker;
    }

    const updatedSpeaker = { ...speaker, model: modelName };

    // Enforce position constraints
    if (role === 'FC' || role === 'C') {
      updatedSpeaker.position = { ...speaker.position, x: roomWidth / 2, y: screenPlaneY };
    } else if (role === 'FL' || role === 'L' || role === 'FR' || role === 'R') {
      updatedSpeaker.position = { ...speaker.position, y: screenPlaneY };
    }

    return updatedSpeaker;
  });
}

/**
 * Applies the selected surrounds model, handling per-role overrides.
 * @param {Array} currentSpeakers - The current list of speaker objects.
 * @param {string} modelName - The base model name for surround speakers.
 * @param {object} overrides - A map of { ROLE: modelName } for specific overrides.
 * @returns {Array} The updated list of speaker objects.
 */
export function applySurroundsModel(currentSpeakers, modelName, overrides = {}) {
  const surroundRoles = new Set(['SL', 'SR', 'LS', 'RS', 'SBL', 'SBR', 'LW', 'RW', 'LRS', 'RRS', 'FWL', 'FWR']);
  return currentSpeakers.map(speaker => {
    const role = String(speaker.role).toUpperCase();
    if (surroundRoles.has(role)) {
      const newModel = overrides[role] || modelName;
      return { ...speaker, model: newModel };
    }
    return speaker;
  });
}

/**
 * Applies the selected model to all overhead speakers.
 * @param {Array} currentSpeakers - The current list of speaker objects.
 * @param {string} modelName - The model name for overhead speakers.
 * @returns {Array} The updated list of speaker objects.
 */
export function applyOverheadsModel(currentSpeakers, modelName) {
  const overheadRoles = new Set(['TFL', 'TFR', 'TBL', 'TBR', 'TL', 'TR', 'TFC', 'TBC']);
  return currentSpeakers.map(speaker => {
    if (overheadRoles.has(String(speaker.role).toUpperCase())) {
      return { ...speaker, model: modelName };
    }
    return speaker;
  });
}

/**
 * Applies the selected model to all subwoofer channels.
 * @param {Array} currentSpeakers - The current list of speaker objects.
 * @param {string} modelName - The model name for subwoofers.
 * @returns {Array} The updated list of speaker objects.
 */
export function applySubsModel(currentSpeakers, modelName) {
  return currentSpeakers.map(speaker => {
    const role = String(speaker.role).toUpperCase();
    if (role.startsWith('SW') || ['SUB', 'LFE'].includes(role)) {
      return { ...speaker, model: modelName };
    }
    return speaker;
  });
}