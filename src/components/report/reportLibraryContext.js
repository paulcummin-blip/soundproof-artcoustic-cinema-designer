/**
 * reportLibraryContext.js
 * -----------------------
 * THE context that keeps a report opened from the Project Library bound to the
 * project and design version it was opened for.
 *
 * A report can be opened from two places:
 *
 *   1. the project flow (Room Designer, Design Review) — the report shows its
 *      normal "Back to Project" route;
 *   2. the Project Library's Generated Reports tab — the designer left the
 *      Library to inspect or export one version's report and must be able to
 *      return there, and to move between the two report types, without the
 *      version changing underneath them.
 *
 * The context travels in the report URL, written by the Library's report rows:
 *
 *   ?projectId=<id>            the project (always present)
 *   &versionId=<id>            the row's OWN version — the version authority
 *   &source=library            the report was opened from the Project Library
 *   &returnTo=project-library  the token the return route is built from
 *
 * Every hop inside such a report — Visual → Technical, Technical → Visual,
 * Technical → Design Review → Technical PDF — carries the same four values, so
 * the version can never fall back to the version loaded in the Room Designer.
 *
 * The return route is ALWAYS rebuilt from the report's own projectId/versionId
 * and the fixed Project Library route and tab. No path is ever taken from the
 * URL, so there is no open-redirect surface, and the designer always lands back
 * on the same version's section of the Generated Reports tab.
 *
 * Pure: no React, no window access, no side effects.
 */

import { buildReportActionUrl } from '@/components/proposal/sourceAuthority/proposalSourceAuthority';
import { withProposalContext } from '@/components/report/proposalReportContext';
import { REPORT_VERSION_PARAM } from '@/components/report/reportVersionRequest';

export const LIBRARY_SOURCE_PARAM = 'source';
export const LIBRARY_SOURCE_VALUE = 'library';
export const LIBRARY_RETURN_PARAM = 'returnTo';
export const LIBRARY_RETURN_VALUE = 'project-library';

/** The Project Library route and the tab a report returns to. */
export const PROJECT_LIBRARY_ROUTE = '/ProjectProposalAssets';
export const PROJECT_LIBRARY_TAB_PARAM = 'tab';
export const PROJECT_LIBRARY_REPORTS_TAB = 'reports';

/** The link label shown in a report header opened from the Library. */
export const BACK_TO_PROJECT_LIBRARY_LABEL = 'Back to Project Library';

/** The report routes the pairing moves between. */
export const REPORT_ROUTE = Object.freeze({
  VISUAL: '/RP22ClientReport',
  TECHNICAL: '/RP22Report',
  DESIGN_REVIEW: '/DesignReview',
});

/** Parse a search string, a URLSearchParams, or nothing, into URLSearchParams. */
function toParams(search) {
  if (!search) return new URLSearchParams();
  if (typeof search === 'string') {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  }
  if (typeof search.get === 'function') return search;
  return new URLSearchParams(search);
}

/**
 * Read the Project Library context carried by a report URL.
 *
 * Both markers must be present: a report opened from the project flow carries
 * neither, and one opened from the Library always carries both.
 *
 * @param {string|URLSearchParams} search — the report URL's search string
 * @returns {{active: boolean}}
 */
export function readLibraryContext(search) {
  const params = toParams(search);
  const active = params.get(LIBRARY_SOURCE_PARAM) === LIBRARY_SOURCE_VALUE
    && params.get(LIBRARY_RETURN_PARAM) === LIBRARY_RETURN_VALUE;
  return { active };
}

/**
 * Where "Back to Project Library" goes: the Generated Reports tab, scrolled to
 * the version section the report belongs to. Rebuilt from the report's own
 * identity — never from a path supplied in the URL.
 *
 * @param {Object} params
 * @param {string|null} [params.projectId]
 * @param {string|null} [params.versionId]
 * @returns {string} an in-app path
 */
export function resolveLibraryReturnUrl({ projectId = null, versionId = null } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  params.set(PROJECT_LIBRARY_TAB_PARAM, PROJECT_LIBRARY_REPORTS_TAB);
  if (versionId) params.set(REPORT_VERSION_PARAM, versionId);
  return `${PROJECT_LIBRARY_ROUTE}?${params.toString()}`;
}

/** Append a parameter set to an app path, keeping any query it already has. */
function appendParams(href, params) {
  const [withoutHash, hash = ''] = String(href).split('#');
  const [path, existingQuery = ''] = withoutHash.split('?');
  const merged = new URLSearchParams(existingQuery);
  params.forEach((value, key) => merged.set(key, value));
  const query = merged.toString();
  return `${path}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

/**
 * Add the Project Library context to a report link, so the report it opens
 * offers the way back to the Library. A context that is not active carries
 * nothing: a report opened from the project flow must not hand the Library
 * return to the report it leads to.
 *
 * @param {string} href
 * @param {{active?: boolean}} [context]
 * @returns {string}
 */
export function withLibraryContext(href, context) {
  if (!href) return href;
  if (!context || context.active !== true) return href;

  const params = new URLSearchParams();
  params.set(LIBRARY_SOURCE_PARAM, LIBRARY_SOURCE_VALUE);
  params.set(LIBRARY_RETURN_PARAM, LIBRARY_RETURN_VALUE);
  return appendParams(href, params);
}

/**
 * A cross-report link that carries the full context of the report it is clicked
 * in: the same project, the same version, and both return routes. This is the
 * ONE builder every Visual ↔ Technical hop uses — no hop may compose its own
 * URL, because a hop that forgets the version is exactly how the wrong
 * version's report gets opened.
 *
 * @param {Object} params
 * @param {string} params.route       the report route being opened
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId — the version being viewed (the authority)
 * @param {{active?: boolean}|null} [params.libraryContext] — this report's own library context
 * @param {{active?: boolean, proposalId?: string|null, returnTo?: string|null}|null} [params.proposalContext]
 * @param {Object|null} [params.extraParams] — any further parameters the destination needs
 *   (e.g. { autoPrint: '1' } for the Technical Report's print pipeline)
 * @returns {string}
 */
export function buildReportPairingUrl({
  route,
  projectId,
  versionId,
  libraryContext = null,
  proposalContext = null,
  extraParams = null,
}) {
  let href = buildReportActionUrl({ route, projectId, versionId });
  if (extraParams && typeof extraParams === 'object') {
    href = appendParams(href, new URLSearchParams(extraParams));
  }
  href = withLibraryContext(href, libraryContext);
  // An absent proposal context carries nothing: only the proposal workflow
  // turns that route on, and a report opened from the project flow or the
  // Library must not invent it.
  return proposalContext ? withProposalContext(href, proposalContext) : href;
}

/**
 * The URL a Project Library report row opens: the row's own version, plus the
 * Library context that brings the designer back to the same version section.
 *
 * @param {Object} params
 * @param {string} params.route
 * @param {string|null} params.projectId
 * @param {string} params.versionId — the row's version (never the active version)
 * @returns {string}
 */
export function buildLibraryReportActionUrl({ route, projectId, versionId, extraParams = null }) {
  return buildReportPairingUrl({
    route,
    projectId,
    versionId,
    // The row's action travels with the link: the report page runs it through its
    // own export or update handler once it is ready (see reportActionIntent).
    extraParams,
    libraryContext: { active: true },
  });
}