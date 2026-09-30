// officialDomain.js
// ---------------------------------------------------------------------------
// Official-domain authority shared by every function that searches a
// manufacturer's own website. A source URL counts as official only when its
// host is the manufacturer's recorded domain, or a subdomain of it: dealer,
// retailer, distributor, marketplace and review sites are never official.
// ---------------------------------------------------------------------------

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/** The manufacturer's stored website is the authority for what counts as official. */
export function normaliseDomain(value) {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  if (!raw) return '';
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
  return hostOf(withScheme);
}

export function isOfficialHost(host, domain) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}