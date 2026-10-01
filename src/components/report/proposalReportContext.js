/**
 * proposalReportContext.js
 * ------------------------
 * The contextual route back from a generated report to the proposal workflow.
 *
 * A report can be opened from two places:
 *
 *   1. the project flow (Room Designer, Design Review) — the report is the
 *      destination, so it shows only its normal navigation;
 *   2. the Proposal Centre — the designer left the proposal workflow to produce
 *      a source report and needs the way back to it.
 *
 * The context travels in the report URL, set by the proposal surfaces:
 *
 *   ?from=proposal            the report was opened from the proposal workflow
 *   &proposalId=<id>          a specific proposal to return to
 *   &returnTo=<internal path> an explicit in-app return path
 *
 * Only `from=proposal` turns the route on, and Back to Proposal only ever
 * points at an in-app proposal path — an external or malformed return URL falls
 * back to the Proposal Centre. Both report pages preserve the context when the
 * user moves between the Visual and Technical Report, so the way back survives
 * the whole report pairing.
 *
 * Pure: no React, no window access, no side effects.
 */

export const PROPOSAL_CONTEXT_PARAM = 'from';
export const PROPOSAL_CONTEXT_VALUE = 'proposal';
export const PROPOSAL_ID_PARAM = 'proposalId';
export const RETURN_TO_PARAM = 'returnTo';

export const PROPOSAL_CENTRE_ROUTE = '/ProposalCentre';
export const PROPOSAL_EDITOR_ROUTE = '/ProposalEditor';

/** The link label shown in the report header. */
export const BACK_TO_PROPOSAL_LABEL = 'Back to Proposal';

/** In-app paths a proposal return may point at. */
const PROPOSAL_RETURN_PREFIXES = Object.freeze([
  PROPOSAL_CENTRE_ROUTE,
  PROPOSAL_EDITOR_ROUTE,
  '/proposal/',
]);

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
 * Is this a path inside this app? Rejects absolute URLs, protocol-relative
 * paths, whitespace-padded values and anything carrying a scheme or port.
 */
export function isSafeInternalPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  if (!path || path !== value) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\') || path.includes(':')) return false;
  if (/\s/.test(path)) return false;
  return true;
}

/** Is this a safe path to a proposal surface (Centre, Editor or direct link)? */
export function isProposalReturnPath(value) {
  if (!isSafeInternalPath(value)) return false;
  return PROPOSAL_RETURN_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Read the proposal context carried by a report URL.
 *
 * @param {string|URLSearchParams} search — the report URL's search string
 * @returns {{active: boolean, proposalId: string|null, returnTo: string|null}}
 */
export function readProposalContext(search) {
  const params = toParams(search);
  const active = params.get(PROPOSAL_CONTEXT_PARAM) === PROPOSAL_CONTEXT_VALUE;
  if (!active) return { active: false, proposalId: null, returnTo: null };

  const proposalId = params.get(PROPOSAL_ID_PARAM) || null;
  const returnTo = params.get(RETURN_TO_PARAM) || null;

  return {
    active: true,
    proposalId,
    // An unsafe or non-proposal path is dropped here, so it can never be
    // navigated to later.
    returnTo: isProposalReturnPath(returnTo) ? returnTo : null,
  };
}

/**
 * Where "Back to Proposal" goes.
 *
 * An explicit proposal return path wins; otherwise a known proposal id returns
 * to that proposal; otherwise the Proposal Centre. Never an arbitrary URL.
 */
export function resolveProposalReturnUrl(context = {}) {
  const returnTo = isProposalReturnPath(context.returnTo) ? context.returnTo : null;
  if (returnTo) return returnTo;

  const proposalId = typeof context.proposalId === 'string' ? context.proposalId.trim() : '';
  if (proposalId) {
    return `${PROPOSAL_EDITOR_ROUTE}?${PROPOSAL_ID_PARAM}=${encodeURIComponent(proposalId)}`;
  }

  return PROPOSAL_CENTRE_ROUTE;
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
 * A report link that carries the proposal context, so the report it opens can
 * offer the way back. Used for every hop inside the proposal → report chain,
 * including report-to-report moves, which must not drop the context.
 *
 * @param {string} href — the report or report-pairing path, e.g. '/RP22Report?projectId=x'
 * @param {{active?: boolean, proposalId?: string|null, returnTo?: string|null}} [context]
 *   Pass the report's own context to carry it through a report-to-report move.
 *   Omit it when the link itself comes from the proposal workflow. A context
 *   that reads inactive carries nothing: a report opened from the project flow
 *   must not hand the way back to the report it leads to.
 * @returns {string}
 */
export function withProposalContext(href, context) {
  if (!href) return href;
  if (context && context.active === false) return href;

  const params = new URLSearchParams();
  params.set(PROPOSAL_CONTEXT_PARAM, PROPOSAL_CONTEXT_VALUE);

  const proposalId = typeof context?.proposalId === 'string' ? context.proposalId.trim() : '';
  if (proposalId) params.set(PROPOSAL_ID_PARAM, proposalId);

  if (isProposalReturnPath(context?.returnTo)) params.set(RETURN_TO_PARAM, context.returnTo);

  return appendParams(href, params);
}