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

// ---------------------------------------------------------------------------
// Preferred regional entry points. Where a manufacturer runs a UK site (or a UK
// section of its global site), UK pages are searched FIRST; the manufacturer's
// recorded website always remains a valid authority, so a missing regional page
// can never block discovery. Officialness itself does not change: a source is
// official only when its host belongs to the manufacturer.
// ---------------------------------------------------------------------------
const REGIONAL_PREFERENCES = [
  { test: /bowers\s*(?:&|and)?\s*wilkins|\bb&?w\b/i, url: 'https://www.bowerswilkins.com/en-gb', region: 'UK' },
  { test: /\bkef\b/i, url: 'https://uk.kef.com', region: 'UK' },
  { test: /klipsch/i, url: 'https://klipsch.com/uk', region: 'UK' },
  { test: /focal/i, url: 'https://www.focal.com/uk', region: 'UK' },
  { test: /monitor audio/i, url: 'https://www.monitoraudio.com', region: 'UK / global' },
];

export function regionalPreference(manufacturerName) {
  const name = String(manufacturerName || '').trim();
  if (!name) return null;
  return REGIONAL_PREFERENCES.find((entry) => entry.test.test(name)) || null;
}

/**
 * The discovery authority for one manufacturer: the preferred regional entry
 * point when one exists, the recorded website, and every host that still counts
 * as official (a subdomain stays official, so a manufacturer CDN is included).
 */
export function resolveManufacturerAuthority({ manufacturerName, website }) {
  const storedDomain = normaliseDomain(website);
  const regional = regionalPreference(manufacturerName);
  const regionalHost = regional ? hostOf(regional.url) : '';
  const hosts = [];
  for (const host of [regionalHost, storedDomain]) {
    if (!host) continue;
    if (!hosts.includes(host)) hosts.push(host);
    const bare = host.replace(/^www\./i, '');
    if (bare && !hosts.includes(bare)) hosts.push(bare);
  }
  return {
    primaryUrl: regional?.url || (storedDomain ? `https://${storedDomain}` : ''),
    regionalUrl: regional?.url || '',
    regionalLabel: regional?.region || '',
    storedDomain,
    hosts,
    preferRegional: Boolean(regionalHost && regionalHost !== storedDomain),
  };
}

/** True when the URL belongs to the manufacturer (host, or a subdomain of it). */
export function isOfficialUrl(url, hosts) {
  const host = hostOf(url);
  if (!host) return false;
  const list = Array.isArray(hosts) ? hosts : [hosts].filter(Boolean);
  return list.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}