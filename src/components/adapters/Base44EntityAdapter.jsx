// Base44EntityAdapter.js - handles persistence layer for room dimensions and speaker handoff
//
// VERSION-AWARENESS (Stage B1):
// All READ functions merge the raw Project with its active ProjectVersion's
// design_state before returning per-version fields (room dimensions, selected
// speakers, speaker nodes). This ensures the SPL Calculator sees the current
// version's design, not stale legacy Project fields.
//
// The WRITE functions (setRoomDimensions, setSelectedSpeakers, setSpeakerNodes)
// are LEGACY paths that predate the versioning system. They write directly to
// the raw Project entity. The canonical save path is useProjectLoader's
// autosave/manual save, which correctly splits design_state into the
// ProjectVersion record. These write functions are retained for backward
// compatibility but should not be used for version-aware saves. The only
// active consumer (SPLCalculator via useRoomDimensions) calls loadDims only —
// it never calls the setters.

import { base44 } from '@/api/base44Client';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';

const STORAGE_KEY = 'Base44:lastRoomDimensions';
const SPEAKERS_KEY = 'Base44:selectedSpeakersByRole';
const NODES_KEY = 'Base44:speakerNodes';

/**
 * Fetch a project and merge it with its active ProjectVersion's design_state.
 * Returns the merged project (raw Project fields overlaid with version
 * design_state), or the raw project if no active version exists.
 * @param {string} projectId
 * @returns {Promise<object|null>}
 */
async function fetchMergedProject(projectId) {
  const projects = await base44.entities.Project.filter({ id: projectId }, '-updated_date', 1);
  if (!projects || projects.length === 0) return null;
  const rawP = projects[0];
  if (!rawP.active_version_id) return rawP;
  try {
    const versions = await base44.entities.ProjectVersion.filter({ id: rawP.active_version_id });
    if (versions && versions.length > 0) {
      return mergeProjectAndVersion(rawP, versions[0]);
    }
  } catch (verErr) {
    console.warn('[Base44EntityAdapter] Version fetch failed, using project-only:', verErr.message);
  }
  return rawP;
}

/**
 * Get room dimensions from Base44 SDK or localStorage fallback
 * Uses Project entity (not Room entity) to match original behavior
 * Handles null projectId by falling back to localStorage only
 * @param {string} projectId - optional project ID (can be null for local-only mode)
 * @returns {Promise<{width_m: number, length_m: number, height_m: number} | null>}
 */
export async function getRoomDimensions(projectId) {
  try {
    // Try SDK first if we have project context
    if (projectId) {
      const project = await fetchMergedProject(projectId);

      if (project) {
        // Read from merged project (version design_state takes precedence)
        const width_m = Number(project.room_width) || 0;
        const length_m = Number(project.room_length) || 0;
        const height_m = Number(project.room_height) || 0;

        if (width_m > 0 && length_m > 0 && height_m > 0) {
          // Mirror to localStorage for local fallback
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ width_m, length_m, height_m }));
            }
          } catch (e) {
            // Ignore localStorage errors
          }
          return { width_m, length_m, height_m };
        }
      }
    }
  } catch (err) {
    // SDK unavailable or fetch failed, fall through to localStorage
    console.warn('[Base44EntityAdapter] SDK fetch failed, using localStorage fallback:', err.message);
  }

  // Fallback to localStorage (works even without projectId)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          width_m: Number(parsed.width_m) || 0,
          length_m: Number(parsed.length_m) || 0,
          height_m: Number(parsed.height_m) || 0
        };
      }
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage read failed:', err.message);
  }

  return null;
}

/**
 * Set room dimensions to Base44 SDK and localStorage
 * Always writes to localStorage, writes to SDK only if projectId provided
 * @param {{width_m: number, length_m: number, height_m: number}} dimensions
 * @param {string} projectId - optional project ID (can be null for local-only mode)
 * @returns {Promise<void>}
 */
export async function setRoomDimensions(dimensions, projectId) {
  const safeData = {
    width_m: Number(dimensions.width_m) || 0,
    length_m: Number(dimensions.length_m) || 0,
    height_m: Number(dimensions.height_m) || 0
  };

  // Always write to localStorage for safety (works without projectId)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage write failed:', err.message);
  }

  // Try SDK only if we have project context
  if (projectId) {
    try {
      // Update project with room dimensions
      await base44.entities.Project.update(projectId, {
        room_width: safeData.width_m,
        room_length: safeData.length_m,
        room_height: safeData.height_m
      });
    } catch (err) {
      // SDK unavailable, but localStorage already saved
      console.warn('[Base44EntityAdapter] SDK write failed (localStorage saved):', err.message);
    }
  }
}

/**
 * Get selected speakers by role from Base44 SDK or localStorage fallback
 * Handles null projectId by falling back to localStorage only
 * @param {string} projectId - optional project ID (can be null for local-only mode)
 * @returns {Promise<object | null>}
 */
export async function getSelectedSpeakers(projectId) {
  try {
    // Try SDK first if we have project context
    if (projectId) {
      const project = await fetchMergedProject(projectId);

      if (project) {
        // Try to parse from JSON string field
        if (project.selected_speakers_by_role) {
          try {
            const parsed = typeof project.selected_speakers_by_role === 'string'
              ? JSON.parse(project.selected_speakers_by_role)
              : project.selected_speakers_by_role;

            // Mirror to localStorage
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(SPEAKERS_KEY, JSON.stringify(parsed));
              }
            } catch (e) {
              // Ignore localStorage errors
            }
            return parsed;
          } catch (e) {
            console.warn('[Base44EntityAdapter] Failed to parse selected_speakers_by_role:', e);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] SDK speakers fetch failed, using localStorage fallback:', err.message);
  }

  // Fallback to localStorage (works without projectId)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(SPEAKERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage speakers read failed:', err.message);
  }

  return null;
}

/**
 * Set selected speakers by role to Base44 SDK and localStorage
 * @param {object} payload - selectedSpeakersByRole object
 * @param {string} projectId - optional project ID
 * @returns {Promise<void>}
 */
export async function setSelectedSpeakers(payload, projectId) {
  const safeData = payload || {};

  // Always write to localStorage for safety
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SPEAKERS_KEY, JSON.stringify(safeData));
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage speakers write failed:', err.message);
  }

  // Try SDK if we have project context
  if (projectId) {
    try {
      // Store as JSON string on project
      await base44.entities.Project.update(projectId, {
        selected_speakers_by_role: JSON.stringify(safeData)
      });
    } catch (err) {
      console.warn('[Base44EntityAdapter] SDK speakers write failed (localStorage saved):', err.message);
    }
  }
}

/**
 * Get speaker nodes from Base44 SDK or localStorage fallback
 * @param {string} projectId - optional project ID
 * @returns {Promise<array | null>}
 */
export async function getSpeakerNodes(projectId) {
  try {
    // Try SDK first if we have project context
    if (projectId) {
      const project = await fetchMergedProject(projectId);

      if (project) {
        // Try to parse from JSON string field
        if (project.spl_speaker_nodes) {
          try {
            const parsed = typeof project.spl_speaker_nodes === 'string'
              ? JSON.parse(project.spl_speaker_nodes)
              : project.spl_speaker_nodes;

            // Mirror to localStorage
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(NODES_KEY, JSON.stringify(parsed));
              }
            } catch (e) {
              // Ignore localStorage errors
            }
            return Array.isArray(parsed) ? parsed : null;
          } catch (e) {
            console.warn('[Base44EntityAdapter] Failed to parse spl_speaker_nodes:', e);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] SDK nodes fetch failed, using localStorage fallback:', err.message);
  }

  // Fallback to localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(NODES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : null;
      }
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage nodes read failed:', err.message);
  }

  return null;
}

/**
 * Set speaker nodes to Base44 SDK and localStorage
 * @param {array} nodes - speakerNodes array
 * @param {string} projectId - optional project ID
 * @returns {Promise<void>}
 */
export async function setSpeakerNodes(nodes, projectId) {
  const safeData = Array.isArray(nodes) ? nodes : [];

  // Always write to localStorage for safety
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(NODES_KEY, JSON.stringify(safeData));
    }
  } catch (err) {
    console.warn('[Base44EntityAdapter] localStorage nodes write failed:', err.message);
  }

  // Try SDK if we have project context
  if (projectId) {
    try {
      // Store as JSON string on project
      await base44.entities.Project.update(projectId, {
        spl_speaker_nodes: JSON.stringify(safeData)
      });
    } catch (err) {
      console.warn('[Base44EntityAdapter] SDK nodes write failed (localStorage saved):', err.message);
    }
  }
}