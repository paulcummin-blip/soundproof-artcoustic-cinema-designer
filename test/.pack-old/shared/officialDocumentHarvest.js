// officialDocumentHarvest.js
// ---------------------------------------------------------------------------
// Supporting documentation for one product page.
//
// The specification a competitor comparison needs is usually not on the product
// page: it lives in the official product sheet, datasheet, manual, installation
// guide or brochure. This module follows the links a product page actually
// publishes (downloads / manuals / specifications / support sections) and keeps
// only those on the manufacturer's own hosts — a dealer or distributor copy is
// never harvested, so it can never become the evidence behind a grade.
// ---------------------------------------------------------------------------

const USER_AGENT = 'Mozilla/5.0 (compatible; SoundProofSpeakerResearch/1.0)';

// The document kinds this pipeline looks for, in the wording used across the UI.
export const DOCUMENT_TYPES = [
  'Product page',
  'Product sheet',
  'Datasheet',
  'Manual',
  'Installation guide',
  'Brochure',
  'Other document',
];

const TYPE_RULES = [
  { type: 'Installation guide', test: /install|fitting|mounting|placement guide|ci spec|architectural/i },
  { type: 'Manual', test: /manual|owner'?s? guide|user guide|handbook/i },
  { type: 'Datasheet', test: /data ?sheet|cut ?sheet|tech(nical)? ?sheet/i },
  { type: 'Product sheet', test: /product sheet|spec(ification)? ?sheet|info(rmation)? ?sheet|technical|specification|\bspecs?\b/i },
  { type: 'Brochure', test: /brochure|catalogue|catalog|leaflet|flyer/i },
];

// A link is worth following when it points at a document or a downloads area.
const DOCUMENT_HINT = /\.pdf($|[?#])|download|manual|datasheet|data-sheet|spec(ification)?|document|support|brochure|install|cut-sheet|info-sheet/i;

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The document kind a link label / URL describes. */
export function classifyDocumentType(label, url) {
  const haystack = `${stripTags(label)} ${url || ''}`.toLowerCase();
  for (const rule of TYPE_RULES) {
    if (rule.test.test(haystack)) return rule.type;
  }
  return 'Other document';
}

/** Does the preferred regional entry point actually respond? */
export async function urlResponds(url, timeoutMs = 4000) {
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does this address actually exist? Distinguishes a source that is merely
 * refusing our request (401/403/405/429 — still present) from one that does not
 * exist at all (404/410 — an address the search invented, or one the
 * manufacturer has since removed).
 * @returns {Promise<{ok: boolean, notFound: boolean, status: number}>}
 */
export async function probeUrl(url, timeoutMs = 4000) {
  if (!url) return { ok: false, notFound: true, status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf,*/*' },
    });
    const status = response.status;
    return {
      ok: response.ok || [401, 403, 405, 429].includes(status),
      notFound: status === 404 || status === 410,
      status,
    };
  } catch {
    // A network failure proves nothing about the address, so it is not treated
    // as a missing source.
    return { ok: false, notFound: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Official documents linked from one product page.
 * @param {string} pageUrl the official product page
 * @param {object} options { isAllowed: (url) => boolean, limit, timeoutMs }
 * @returns {Promise<Array<{url: string, label: string, document_type: string}>>}
 *   an empty array whenever the page cannot be read — never a fabricated link.
 */
export async function harvestOfficialDocuments(pageUrl, { isAllowed, limit = 6, timeoutMs = 3500 } = {}) {
  if (!pageUrl || typeof isAllowed !== 'function') return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(pageUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
    });
    if (!response.ok) return [];
    const html = (await response.text()).slice(0, 500000);

    const anchors = html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]{0,200}?<\/a>/gi) || [];
    const found = [];
    const seen = new Set();

    for (const anchor of anchors) {
      const href = (anchor.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
      if (!DOCUMENT_HINT.test(href) && !DOCUMENT_HINT.test(stripTags(anchor))) continue;

      let absolute;
      try {
        absolute = new URL(href, pageUrl).toString().split('#')[0];
      } catch {
        continue;
      }
      // Official hosts only: a dealer's copy of the same sheet is never evidence.
      if (!isAllowed(absolute)) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);

      const label = stripTags(anchor).slice(0, 120);
      found.push({ url: absolute, label, document_type: classifyDocumentType(label, absolute) });
      if (found.length >= limit) break;
    }

    return found;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}