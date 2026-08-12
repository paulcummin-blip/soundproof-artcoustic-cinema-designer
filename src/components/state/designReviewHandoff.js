/**
 * Project-scoped Design Review handoff.
 *
 * Room Designer publishes its already-settled ASDR / RP22 result snapshot here.
 * Design Review reads the live same-window value first, then a project-scoped
 * localStorage snapshot for direct/new-tab loads. This is transport only:
 * no grading, seat matching, RSP selection, or analysis is performed here.
 */

const STORAGE_PREFIX = "soundproof:design-review-handoff:v1:";
const PROJECT_UPDATE_GRACE_MS = 30_000;

const normaliseProjectId = (value) => String(value || "").trim();

const storageKey = (projectId) =>
  `${STORAGE_PREFIX}${normaliseProjectId(projectId)}`;

const belongsToProject = (snapshot, projectId) =>
  normaliseProjectId(snapshot?.projectId) === normaliseProjectId(projectId);

const isFreshForProject = (snapshot, projectUpdatedAt) => {
  const updatedAtMs = Date.parse(projectUpdatedAt || "");
  const publishedAtMs = Number(snapshot?.publishedAt);

  if (!Number.isFinite(updatedAtMs)) return true;
  if (!Number.isFinite(publishedAtMs)) return false;

  // Project autosave may land just after the analysis effect publishes.
  return publishedAtMs + PROJECT_UPDATE_GRACE_MS >= updatedAtMs;
};

export function publishDesignReviewHandoff(snapshot) {
  if (typeof window === "undefined") return null;

  const projectId = normaliseProjectId(snapshot?.projectId);
  if (!projectId) return null;

  const published = {
    ...snapshot,
    projectId,
    publishedAt: Date.now(),
  };

  window.__ROOM_DESIGNER_ASDR__ = published;

  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(published));
  } catch {
    // Live same-window handoff remains authoritative if storage is unavailable
    // or the browser quota cannot hold the snapshot.
  }

  return published;
}

export function readDesignReviewHandoff(
  projectId,
  { projectUpdatedAt = null, allowStored = true } = {}
) {
  if (typeof window === "undefined") return null;

  const requestedProjectId = normaliseProjectId(projectId);
  if (!requestedProjectId) return null;

  const live = window.__ROOM_DESIGNER_ASDR__;
  if (belongsToProject(live, requestedProjectId)) return live;

  if (!allowStored) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(requestedProjectId));
    if (!raw) return null;

    const stored = JSON.parse(raw);
    if (!belongsToProject(stored, requestedProjectId)) return null;
    if (!isFreshForProject(stored, projectUpdatedAt)) return null;

    return stored;
  } catch {
    return null;
  }
}
