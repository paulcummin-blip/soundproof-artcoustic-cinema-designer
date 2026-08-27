// components/utils/sessionAutosave.js
//
// Browser working copy for the Room Designer.
//
// KEYED BY PROJECT ID — each project gets its own localStorage entry.
// A working copy from Project A can never initialise Project B.
//
// Key format: b44_roomdesigner_autosave_v2:{projectId}
// Free-use fallback: b44_roomdesigner_autosave_v2:free
//
// Each stored payload embeds __projectId. On restore, if the stored
// projectId does not match the current project, the payload is rejected.

const LEGACY_KEY = "b44_roomdesigner_autosave_v1";

function getProjectIdFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const pid =
      url.searchParams.get("projectId") ||
      url.searchParams.get("project") ||
      url.searchParams.get("id");
    if (pid) return pid;
    const uuidMatch = url.pathname.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    return uuidMatch ? uuidMatch[0] : null;
  } catch {
    return null;
  }
}

function getProjectKey(projectId) {
  const pid = projectId || getProjectIdFromUrl();
  return pid
    ? `b44_roomdesigner_autosave_v2:${pid}`
    : "b44_roomdesigner_autosave_v2:free";
}

export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Load the browser working copy for the current project.
 * Rejects payloads whose embedded __projectId does not match.
 * Falls back to the legacy global key for one-time migration.
 * @param {string} [projectId] - Override (defaults to URL-derived ID).
 * @returns {{savedAt: number, payload: object}|null}
 */
export function loadAutosave(projectId) {
  const pid = projectId || getProjectIdFromUrl();
  const key = getProjectKey(pid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (!parsed) return null;
      // Validate project ID match — reject cross-project working copies.
      if (
        parsed.payload &&
        parsed.payload.__projectId &&
        pid &&
        parsed.payload.__projectId !== pid
      ) {
        return null;
      }
      return parsed;
    }

    // Migration: try legacy global key (one-time).
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = safeJsonParse(legacyRaw);
    if (!legacy) return null;
    // Only use legacy payload if it has no project binding or matches.
    if (
      !legacy.payload?.__projectId ||
      !pid ||
      legacy.payload.__projectId === pid
    ) {
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the browser working copy for the current project.
 * Also removes the legacy global key for cleanliness.
 * @param {string} [projectId]
 */
export function clearAutosave(projectId) {
  const key = getProjectKey(projectId);
  try {
    localStorage.removeItem(key);
    // Also clean up legacy key if present.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Save the browser working copy for the current project.
 * Embeds __projectId so cross-project restore can be rejected.
 * @param {object} payload
 * @param {string} [projectId]
 */
export function saveAutosave(payload, projectId) {
  const pid = projectId || getProjectIdFromUrl();
  const key = getProjectKey(pid);
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        payload: { ...payload, __projectId: pid },
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Get metadata (savedAt) for the current project's working copy.
 * @param {string} [projectId]
 * @returns {{savedAt: number}|null}
 */
export function getAutosaveMeta(projectId) {
  const data = loadAutosave(projectId);
  if (!data || !data.savedAt) return null;
  return { savedAt: data.savedAt };
}

/**
 * Very light validity guard so we don't store junk.
 * Also rejects payloads whose __projectId does not match the current project.
 * @param {object} p
 * @param {string} [projectId]
 * @returns {boolean}
 */
export function isAutosavePayloadValid(p, projectId) {
  if (!p || typeof p !== "object") return false;

  // Project ID validation: reject cross-project payloads.
  const currentPid = projectId || getProjectIdFromUrl();
  if (p.__projectId && currentPid && p.__projectId !== currentPid) return false;

  const dims = p.dimensions || p.roomDims || null;
  const w = Number(dims?.width || dims?.widthM);
  const l = Number(dims?.length || dims?.lengthM);
  const h = Number(dims?.height || dims?.heightM);

  const hasDims =
    Number.isFinite(w) &&
    Number.isFinite(l) &&
    Number.isFinite(h) &&
    w > 0 &&
    l > 0 &&
    h > 0;

  const seats = Array.isArray(p.seatingPositions) ? p.seatingPositions : [];
  const speakers = Array.isArray(p.speakerSystem?.placedSpeakers)
    ? p.speakerSystem.placedSpeakers
    : [];
  const subsFront = Array.isArray(p.frontSubsCfg?.positions)
    ? p.frontSubsCfg.positions
    : [];
  const subsRear = Array.isArray(p.rearSubsCfg?.positions)
    ? p.rearSubsCfg.positions
    : [];

  const hasAnyContent =
    seats.length > 0 ||
    speakers.length > 0 ||
    subsFront.length > 0 ||
    subsRear.length > 0;

  return hasDims && hasAnyContent;
}