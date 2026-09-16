// components/utils/sessionAutosave.js
//
// Browser working copy for the Room Designer.
//
// KEYED BY VERSION ID — each design version gets its own localStorage entry.
// A working copy from Version A can never initialise Version B, even within
// the same project. This prevents cross-version data corruption.
//
// Key format: b44_roomdesigner_autosave_v3:{versionId}
// Legacy v2 keys (project-id-keyed) are migrated once on first load.
// Free-use fallback: b44_roomdesigner_autosave_v3:free
//
// Each stored payload embeds __versionId and __projectId. On restore, if the
// stored versionId does not match the current version, the payload is rejected.

const LEGACY_KEY = "b44_roomdesigner_autosave_v1";
const V2_PREFIX = "b44_roomdesigner_autosave_v2:";

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

function getVersionKey(versionId) {
  if (versionId) return `b44_roomdesigner_autosave_v3:${versionId}`;
  return "b44_roomdesigner_autosave_v3:free";
}

// Legacy v2 key (project-id-keyed) — used for one-time migration to v3.
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
 * Load the browser working copy for the current version.
 * v3 keys are version-id-keyed; v2 keys (project-id-keyed) are tried as
 * a one-time migration fallback when no v3 key exists yet.
 * @param {string} [versionId] - Active ProjectVersion ID (v3 key).
 * @param {string} [projectId] - Project ID (v2 legacy fallback).
 * @returns {{savedAt: number, payload: object}|null}
 */
export function loadAutosave(versionId, projectId) {
  const vid = versionId;
  const pid = projectId || getProjectIdFromUrl();
  const v3Key = getVersionKey(vid);

  try {
    // v3: version-id-keyed
    if (vid) {
      const raw = localStorage.getItem(v3Key);
      if (raw) {
        const parsed = safeJsonParse(raw);
        if (!parsed) return null;
        if (
          parsed.payload &&
          parsed.payload.__versionId &&
          parsed.payload.__versionId !== vid
        ) {
          return null;
        }
        return parsed;
      }
    }

    // v2 fallback: project-id-keyed (one-time migration to v3)
    if (pid) {
      const v2Key = getProjectKey(pid);
      const v2Raw = localStorage.getItem(v2Key);
      if (v2Raw) {
        const parsed = safeJsonParse(v2Raw);
        if (!parsed) return null;
        if (
          parsed.payload &&
          parsed.payload.__projectId &&
          parsed.payload.__projectId !== pid
        ) {
          return null;
        }
        return parsed;
      }
    }

    // v1 legacy global key
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = safeJsonParse(legacyRaw);
    if (!legacy) return null;
    if (
      pid &&
      legacy.payload?.__projectId &&
      legacy.payload.__projectId === pid
    ) {
      return legacy;
    }
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the browser working copy for the current version (v3) or project (v2).
 * Also removes legacy keys for cleanliness.
 * @param {string} [versionId] - Active ProjectVersion ID (v3 key).
 * @param {string} [projectId] - Project ID (v2 legacy cleanup).
 */
export function clearAutosave(versionId, projectId) {
  try {
    if (versionId) localStorage.removeItem(getVersionKey(versionId));
    // Backward compatibility: old callers pass projectId as the first
    // argument. Clean up the v2 key using it as a potential project ID.
    if (versionId) localStorage.removeItem(getProjectKey(versionId));
    if (projectId) localStorage.removeItem(getProjectKey(projectId));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Save the browser working copy for the current version.
 * Embeds __versionId and __projectId so cross-version restore can be rejected.
 * @param {object} payload
 * @param {string} [versionId] - Active ProjectVersion ID (v3 key).
 * @param {string} [projectId] - Project ID (embedded for traceability).
 */
export function saveAutosave(payload, versionId, projectId) {
  const vid = versionId;
  const pid = projectId || getProjectIdFromUrl();
  const key = getVersionKey(vid);
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        payload: { ...payload, __versionId: vid, __projectId: pid },
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Get metadata (savedAt) for the current version's working copy.
 * @param {string} [versionId] - Active ProjectVersion ID.
 * @param {string} [projectId] - Project ID (v2 fallback).
 * @returns {{savedAt: number}|null}
 */
export function getAutosaveMeta(versionId, projectId) {
  const data = loadAutosave(versionId, projectId);
  if (!data || !data.savedAt) return null;
  return { savedAt: data.savedAt };
}

/**
 * Very light validity guard so we don't store junk.
 * Rejects payloads whose __versionId (v3) or __projectId (v2) do not match.
 * @param {object} p
 * @param {string} [versionId] - Active ProjectVersion ID.
 * @param {string} [projectId] - Project ID (v2 fallback).
 * @returns {boolean}
 */
export function isAutosavePayloadValid(p, versionId, projectId) {
  if (!p || typeof p !== "object") return false;

  // Version ID validation (v3): reject cross-version payloads.
  if (versionId && p.__versionId && p.__versionId !== versionId) return false;

  // Project ID validation (v2 fallback): reject cross-project payloads.
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