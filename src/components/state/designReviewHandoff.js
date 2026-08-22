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

const BASS_PENDING_KEY = "__ROOM_DESIGNER_BASS_PENDING__";

/**
 * Lightweight pending indicator (NOT a rating). Published to a separate
 * window property so the sidebar can show "Calculating bass analysis…"
 * without publishing a pending rating to __ROOM_DESIGNER_ASDR__.
 */
export function publishBassPendingIndicator(projectId, pending, p14TargetUnselected = false) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  window[BASS_PENDING_KEY] = {
    projectId: pid,
    pending: pending === true,
    p14TargetUnselected: p14TargetUnselected === true,
    ts: Date.now(),
  };
}

export function readBassPendingIndicator(projectId) {
  if (typeof window === "undefined") return false;
  const pid = normaliseProjectId(projectId);
  const indicator = window[BASS_PENDING_KEY];
  if (!indicator || normaliseProjectId(indicator.projectId) !== pid) return false;
  return indicator.pending === true;
}

/**
 * Read the P14-target-unselected flag from the SAME bass-pending indicator
 * object. This is NOT a second indicator — it extends the existing one so
 * the sidebar can distinguish "P14 target not selected" (neutral, no
 * calculation running) from "bass genuinely calculating" (real foreground
 * work in progress).
 */
export function readP14TargetUnselectedIndicator(projectId) {
  if (typeof window === "undefined") return false;
  const pid = normaliseProjectId(projectId);
  const indicator = window[BASS_PENDING_KEY];
  if (!indicator || normaliseProjectId(indicator.projectId) !== pid) return false;
  return indicator.p14TargetUnselected === true;
}

export function clearBassPendingIndicator(projectId) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  const indicator = window[BASS_PENDING_KEY];
  if (indicator && normaliseProjectId(indicator.projectId) === pid) {
    window[BASS_PENDING_KEY] = { projectId: pid, pending: false, p14TargetUnselected: false, ts: Date.now() };
  }
}

const ASDR_UNAVAILABLE_KEY = "__ROOM_DESIGNER_ASDR_UNAVAILABLE__";

/**
 * Lightweight minimum-system indicator (NOT a rating). Published to a
 * separate window property so the sidebar can show the ASDR unavailable
 * message before the minimum 5.1 system exists, without publishing any
 * rating to __ROOM_DESIGNER_ASDR__.
 */
export function publishAsdrUnavailableIndicator(projectId, unavailable) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  window[ASDR_UNAVAILABLE_KEY] = { projectId: pid, unavailable: unavailable === true, ts: Date.now() };
}

export function readAsdrUnavailableIndicator(projectId) {
  if (typeof window === "undefined") return false;
  const pid = normaliseProjectId(projectId);
  const indicator = window[ASDR_UNAVAILABLE_KEY];
  if (!indicator || normaliseProjectId(indicator.projectId) !== pid) return false;
  return indicator.unavailable === true;
}

export function clearAsdrUnavailableIndicator(projectId) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  const indicator = window[ASDR_UNAVAILABLE_KEY];
  if (indicator && normaliseProjectId(indicator.projectId) === pid) {
    window[ASDR_UNAVAILABLE_KEY] = { projectId: pid, unavailable: false, ts: Date.now() };
  }
}

/**
 * Clear any published Design Review ASDR snapshot for a project. Used when
 * the minimum 5.1 system is not present so a partial ASDR cannot leak into
 * Design Review via the live window property or the persistent localStorage
 * cache.
 */
export function clearDesignReviewHandoff(projectId) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  if (window.__ROOM_DESIGNER_ASDR__ && normaliseProjectId(window.__ROOM_DESIGNER_ASDR__.projectId) === pid) {
    window.__ROOM_DESIGNER_ASDR__ = null;
  }
  try {
    window.localStorage.removeItem(storageKey(pid));
  } catch {
    // Storage may be unavailable or blocked — live same-window handoff is
    // already cleared above.
  }
}

export function publishDesignReviewHandoff(snapshot) {
  if (typeof window === "undefined") return null;

  const projectId = normaliseProjectId(snapshot?.projectId);
  if (!projectId) return null;

  // Do not publish a pending rating. isPendingBass is the authoritative gate:
  // false for both final ratings and retained same-fingerprint ratings (which
  // are valid final results from a previous calculation, held during refresh).
  if (snapshot?.rating?.isPendingBass === true) return null;

  const published = {
    ...snapshot,
    projectId,
    publishedAt: Date.now(),
  };

  window.__ROOM_DESIGNER_ASDR__ = published;

  // Keep the persistent handoff intentionally compact. Recommendations can
  // contain full scenario reruns and remain a live same-window authority; the
  // direct-load cache carries only the settled report/result fields.
  const stored = {
    projectId,
    publishedAt: published.publishedAt,
    showAsdr: published.showAsdr,
    rating: published.rating,
    analysisResult: published.analysisResult,
    seatingPositions: published.seatingPositions,
    placedSpeakers: published.placedSpeakers,
    frontSubs: published.frontSubs,
    rearSubs: published.rearSubs,
    screen: published.screen,
    dolbyLayout: published.dolbyLayout,
    mlpPoint: published.mlpPoint,
    priceData: published.priceData,
  };

  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(stored));
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