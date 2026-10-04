/**
 * reportVersionRequest.js
 * -----------------------
 * THE version-request authority for the report pages.
 *
 * A report action carries the version it was clicked in — the Project Library
 * row's own version_id — and the report must open, generate and export for that
 * version. This module is the one place that decides which version a report page
 * was asked for:
 *
 *   1. the explicit request in the URL (?versionId=, ?version_id=)
 *   2. the project's active version, when no version was requested
 *
 * The request is NEVER inferred from the currently loaded Room Designer state,
 * the last opened version, or a global selection. A row's version_id is the
 * authority, and a page that was asked for a version must not silently render
 * another one.
 *
 * The version NAME is read from the ProjectVersion record itself (see
 * readVersionIdentity in activeVersionIdentity) rather than carried in the URL,
 * so a report and its exported filename state the exact name the designer saved
 * — there is no second copy of the name to disagree with it.
 *
 * Pure: no reads, no writes, no runtime APIs.
 */

/** The version parameter the Library's report actions pass. */
export const REPORT_VERSION_PARAM = 'versionId';

/** Accepted alias, so a stable link written as ?version_id= also resolves. */
export const REPORT_VERSION_PARAM_ALIAS = 'version_id';

/**
 * The version requested in the URL, or null when the page was not asked for one.
 *
 * @param {URLSearchParams|{get: Function}|null} searchParams
 * @returns {string|null}
 */
export function readRequestedVersionId(searchParams) {
  if (!searchParams || typeof searchParams.get !== 'function') return null;
  const raw = searchParams.get(REPORT_VERSION_PARAM)
    || searchParams.get(REPORT_VERSION_PARAM_ALIAS)
    || '';
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/**
 * The version a report page must render: the explicit request first, the
 * project's active version only as the fallback for a page opened without one.
 *
 * @param {Object} params
 * @param {string|null} [params.requestedVersionId]
 * @param {string|null} [params.activeVersionId]
 * @returns {string|null}
 */
export function resolveReportVersionId({ requestedVersionId = null, activeVersionId = null } = {}) {
  return requestedVersionId || activeVersionId || null;
}

/**
 * May a page reuse the already-hydrated shared design state?
 *
 * Only when it is holding the version the page was asked for. A page that was
 * asked for another version hydrates that version explicitly — the in-session
 * shortcut must never answer a request for a different version with the loaded
 * one's design.
 *
 * @param {Object} params
 * @param {string|null} [params.requestedVersionId]
 * @param {string|null} [params.hydratedVersionId]
 * @returns {boolean}
 */
export function sharedHydrationMatchesRequest({ requestedVersionId = null, hydratedVersionId = null } = {}) {
  // No explicit request: the loaded version is the version to render.
  if (!requestedVersionId) return true;
  // Nothing is hydrated yet, so there is nothing to reuse.
  if (!hydratedVersionId) return false;
  return String(requestedVersionId) === String(hydratedVersionId);
}