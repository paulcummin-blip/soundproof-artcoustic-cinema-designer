/**
 * Version-scoped Design Review handoff.
 *
 * Room Designer publishes its already-settled ASDR / RP22 result snapshot here.
 * Design Review reads the live same-window value first, then a version-scoped
 * localStorage snapshot for direct/new-tab loads. This is transport only:
 * no grading, seat matching, RSP selection, or analysis is performed here.
 *
 * Identity is projectId :: versionId. Every publish, read, subscribe, and
 * storage key requires BOTH. There is no project-only fallback: if the
 * selected version has no matching publication, readers return null (fail
 * closed). The active version's ID must be supplied explicitly by consumers
 * that intend to read the active version (sidebar, Design Review, reports).
 */

import { assertNotAuthoritativeReadOnly } from "@/components/state/authoritativeReadOnlyMode";

const STORAGE_PREFIX = "soundproof:design-review-handoff:v2:";
const HANDOFF_EVENT = "soundproof:design-review-handoff";
const VERSION_MAP_KEY = "__ROOM_DESIGNER_ASDR_BY_VERSION__";
const ACTIVE_MIRROR_KEY = "__ROOM_DESIGNER_ASDR__";

const normaliseProjectId = (value) => String(value || "").trim();
const normaliseVersionId = (value) => String(value || "").trim();

export const storageKey = (projectId, versionId) =>
  `${STORAGE_PREFIX}${normaliseProjectId(projectId)}::${normaliseVersionId(versionId)}`;

const versionKey = (projectId, versionId) =>
  `${normaliseProjectId(projectId)}::${normaliseVersionId(versionId)}`;

const belongsToVersion = (snapshot, projectId, versionId) =>
  normaliseProjectId(snapshot?.projectId) === normaliseProjectId(projectId) &&
  normaliseVersionId(snapshot?.versionId) === normaliseVersionId(versionId);

// ── Version-scoped in-memory Map accessor ────────────────────────────────
const getVersionMap = () => {
  if (typeof window === "undefined") return null;
  if (!window[VERSION_MAP_KEY] || typeof window[VERSION_MAP_KEY] !== "object") {
    window[VERSION_MAP_KEY] = {};
  }
  return window[VERSION_MAP_KEY];
};

const setVersionEntry = (projectId, versionId, snapshot) => {
  const map = getVersionMap();
  if (!map) return;
  const key = versionKey(projectId, versionId);
  if (snapshot === null) {
    delete map[key];
  } else {
    map[key] = snapshot;
  }
};

const getVersionEntry = (projectId, versionId) => {
  const map = getVersionMap();
  if (!map) return null;
  return map[versionKey(projectId, versionId)] || null;
};

// ── Lightweight project-scoped indicators (NOT engineering publications) ─
// These remain project-scoped: they are transient UI state (pending, flag),
// not version-locked engineering truth. The sidebar reads them for the
// active project regardless of which version is open.

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

const SEAT_PRIORITY_FP_KEY = "__ROOM_DESIGNER_SEAT_PRIORITY_FP__";

/**
 * Publish the current live seat-priority fingerprint so the sidebar can
 * detect when a published scoped rating was calculated from a different
 * priority set than the current one. This is a lightweight indicator (NOT a
 * rating) published to a separate window property.
 */
export function publishSeatPriorityFingerprint(projectId, fingerprint) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  window[SEAT_PRIORITY_FP_KEY] = { projectId: pid, fingerprint: fingerprint || '', ts: Date.now() };
}

export function readSeatPriorityFingerprint(projectId) {
  if (typeof window === "undefined") return null;
  const pid = normaliseProjectId(projectId);
  const indicator = window[SEAT_PRIORITY_FP_KEY];
  if (!indicator || normaliseProjectId(indicator.projectId) !== pid) return null;
  return indicator.fingerprint || '';
}

export function clearSeatPriorityFingerprint(projectId) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  if (!pid) return;
  const indicator = window[SEAT_PRIORITY_FP_KEY];
  if (indicator && normaliseProjectId(indicator.projectId) === pid) {
    window[SEAT_PRIORITY_FP_KEY] = { projectId: pid, fingerprint: '', ts: Date.now() };
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

// ── Version-scoped engineering publication ───────────────────────────────

/**
 * Clear a published Design Review ASDR snapshot for a specific project +
 * version. Used when the minimum 5.1 system is not present so a partial
 * ASDR cannot leak into Design Review via the live window property or the
 * persistent localStorage cache.
 *
 * Requires both projectId and versionId. If versionId is omitted, no
 * project-only fallback is used — the clear is a no-op (fail closed).
 */
export function clearDesignReviewHandoff(projectId, versionId) {
  if (typeof window === "undefined") return;
  const pid = normaliseProjectId(projectId);
  const vid = normaliseVersionId(versionId);
  if (!pid || !vid) return;

  setVersionEntry(pid, vid, null);

  // Clear the active mirror only if it belongs to this version.
  if (belongsToVersion(window[ACTIVE_MIRROR_KEY], pid, vid)) {
    window[ACTIVE_MIRROR_KEY] = null;
  }

  try {
    window.localStorage.removeItem(storageKey(pid, vid));
  } catch {
    // Storage may be unavailable or blocked — live same-window handoff is
    // already cleared above.
  }

  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, {
    detail: { projectId: pid, versionId: vid, snapshot: null },
  }));
}

export function publishDesignReviewHandoff(snapshot) {
  if (typeof window === "undefined") return null;

  const projectId = normaliseProjectId(snapshot?.projectId);
  const versionId = normaliseVersionId(snapshot?.versionId);
  // Authoritative Read-Only Mode guard — warn if the Technical Report
  // (or any read-only consumer) attempts to publish authoritative state.
  assertNotAuthoritativeReadOnly('publishDesignReviewHandoff', 'publish-design-review-handoff');
  if (!projectId || !versionId) return null;

  // Previously, a pending-bass rating was blocked from publication entirely.
  // That left a STALE scoped rating visible when seat priorities changed while
  // bass was pending. Now we always publish the current rating so the non-bass
  // seat-scoped categories (Spatial Resolution, Screen/Viewing) reflect the
  // current priority scope. The separate bass-pending indicator
  // (publishBassPendingIndicator) lets the sidebar show "Calculating bass
  // analysis…" independently. The isPendingBass flag remains on the rating for
  // consumers that need it, but it no longer gates publication.
  const published = {
    ...snapshot,
    projectId,
    versionId,
    publishedAt: Date.now(),
  };

  // Version-scoped in-memory Map is the authoritative live store.
  setVersionEntry(projectId, versionId, published);

  // Backward-compat active mirror: the last published snapshot in this
  // window. Direct readers (RP22ClientReport, Layout stale-scope check) read
  // this. It represents the version that was last active in this window.
  window[ACTIVE_MIRROR_KEY] = published;

  // Keep the persistent handoff intentionally compact. Recommendations can
  // contain full scenario reruns and remain a live same-window authority; the
  // direct-load cache carries only the settled report/result fields.
  const storedRating = published.rating
    ? Object.fromEntries(Object.entries(published.rating).filter(([key]) => key !== "engineeringSummary"))
    : null;
  const stored = {
    projectId,
    versionId,
    calculationRevision: published.calculationRevision ?? null,
    calculationFingerprint: published.calculationFingerprint ?? null,
    publishedAt: published.publishedAt,
    showAsdr: published.showAsdr,
    rating: storedRating,
    engineeringSummary: published.engineeringSummary ?? published.rating?.engineeringSummary ?? null,
    p19SeatAuthority: published.p19SeatAuthority ?? published.engineeringSummary?.p19SeatAuthority ?? published.rating?.p19SeatAuthority ?? null,
    seatPriorityFingerprint: published.rating?.seatPriorityFingerprint ?? null,
    seatDesignRatings: published.seatDesignRatings ?? null,
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

  const key = storageKey(projectId, versionId);
  try {
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // analysisResult and seatDesignRatings are convenience fields for direct
    // report loads, not Proposal engineering authority. If the full transport
    // exceeds browser quota, persist the version-scoped canonical authority
    // without those heavy fields so a previous stale snapshot cannot survive.
    const compactStored = {
      ...stored,
      analysisResult: null,
      seatDesignRatings: null,
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(compactStored));
    } catch {
      // Fail closed. Keeping an older value would make stale engineering data
      // appear authoritative after navigation or a new-tab load.
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Storage is wholly unavailable; the live same-window Map remains.
      }
    }
  }

  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, {
    detail: { projectId, versionId, snapshot: published },
  }));

  return published;
}

export function subscribeDesignReviewHandoff(projectId, versionId, callback) {
  if (typeof window === "undefined" || typeof callback !== "function") return () => {};
  const pid = normaliseProjectId(projectId);
  const vid = normaliseVersionId(versionId);
  if (!pid || !vid) return () => {};

  const expectedKey = storageKey(pid, vid);
  const onPublish = (event) => {
    if (
      normaliseProjectId(event?.detail?.projectId) === pid &&
      normaliseVersionId(event?.detail?.versionId) === vid
    ) {
      callback(event.detail.snapshot, false);
    }
  };
  const onStorage = (event) => {
    if (event.key === expectedKey) callback(null, true);
  };
  window.addEventListener(HANDOFF_EVENT, onPublish);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(HANDOFF_EVENT, onPublish);
    window.removeEventListener("storage", onStorage);
  };
}

export function readDesignReviewHandoff(
  projectId,
  versionId,
  { allowStored = true, preferStored = false } = {}
) {
  if (typeof window === "undefined") return null;

  const requestedProjectId = normaliseProjectId(projectId);
  const requestedVersionId = normaliseVersionId(versionId);
  if (!requestedProjectId || !requestedVersionId) return null;

  if (!preferStored) {
    const live = getVersionEntry(requestedProjectId, requestedVersionId);
    if (live) return live;
  }

  if (!allowStored) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(requestedProjectId, requestedVersionId));
    if (!raw) return null;

    const stored = JSON.parse(raw);
    if (!belongsToVersion(stored, requestedProjectId, requestedVersionId)) return null;

    // The publication carries its own version/fingerprint authority. Project
    // autosave timestamps are not an engineering invalidation signal and must
    // never cause reports to silently discard the last settled result.
    return stored;
  } catch {
    return null;
  }
}