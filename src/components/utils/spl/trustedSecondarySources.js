// trustedSecondarySources.js  (frontend mirror)
// ---------------------------------------------------------------------------
// TRUSTED SECONDARY evidence: the named UK custom-install distributors whose
// hosted copies of manufacturer product sheets, datasheets, manuals and
// specification sheets may be used for a P12/P13 comparison when the
// manufacturer's own site has no sheet, its product page is too thin, or the
// model is legacy. They are not primary sources, they are always labelled, and
// they are capped at confidence C unless the document actually sits on the
// manufacturer's own host.
//
// This mirrors base44/shared/trustedSecondarySources.js (the backend functions
// cannot share a module with the bundle), so a host is classified identically on
// both sides.
// ---------------------------------------------------------------------------

export const TRUSTED_SECONDARY_SOURCES = [
  { name: 'Habitech', host: 'habitech.co.uk', url: 'https://www.habitech.co.uk' },
  { name: 'CAVD', host: 'cavd.co.uk', url: 'https://www.cavd.co.uk' },
  { name: 'Pulse Cinemas', host: 'pulsecinemas.com', url: 'https://pulsecinemas.com' },
  { name: 'AWE Europe', host: 'awe-europe.com', url: 'https://www.awe-europe.com' },
];

export const TRUSTED_SECONDARY_HOSTS = TRUSTED_SECONDARY_SOURCES.map((source) => source.host);

/** The host of a URL or bare host, without "www." and lower-cased. */
export function hostOfUrl(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/** The trusted distributor behind a URL or bare host, or null. Subdomains count. */
export function trustedSecondarySource(urlOrHost) {
  const host = hostOfUrl(urlOrHost);
  if (!host) return null;
  return TRUSTED_SECONDARY_SOURCES.find(
    (source) => host === source.host || host.endsWith(`.${source.host}`),
  ) || null;
}

export function isTrustedSecondaryUrl(url) {
  return trustedSecondarySource(url) !== null;
}

// --- Evidence wording -------------------------------------------------------
export const TRUSTED_EVIDENCE_LABEL = 'Trusted secondary evidence';

export const TRUSTED_SECONDARY_BASIS = {
  ESTIMATE: 'ADI estimate from trusted secondary data',
  CALCULATED: 'Calculated from trusted secondary published data',
};

export const TRUSTED_SECONDARY_STATEMENT =
  'Specification data is taken from a trusted secondary distributor source. '
  + 'Useful for comparison, but not equivalent to live official manufacturer data.';

export const TRUSTED_SECONDARY_ROW_NOTE = 'Trusted secondary evidence used';

export const TRUSTED_HOST_WARNING =
  'This is not the manufacturer\u2019s own website — a trusted secondary distributor source.';

export const TRUSTED_BADGE_LABEL = 'Trusted secondary';

/** A short line naming the distributor, e.g. "Trusted secondary distributor · Habitech". */
export function trustedSourceLine(urlOrHost) {
  const source = trustedSecondarySource(urlOrHost);
  return source ? `Trusted secondary distributor · ${source.name}` : '';
}

// --- Evidence ranking -------------------------------------------------------
export const EVIDENCE_RANKS = {
  A: { rank: 'A', label: 'Official manufacturer', meaning: 'Official manufacturer page, datasheet, manual, product sheet, CDN or official support download.' },
  B: { rank: 'B', label: 'Strong calculated', meaning: 'Official manufacturer data carries sensitivity, impedance and a power authority or max SPL.' },
  C: { rank: 'C', label: TRUSTED_EVIDENCE_LABEL, meaning: 'Trusted secondary distributor source — usable for P12/P13 estimates, capped at C.' },
  D: { rank: 'D', label: 'Insufficient', meaning: 'No sensitivity, no impedance, no max SPL and no usable power authority.' },
};

/** Source-type wording for the candidate review list. */
export const SOURCE_TYPE_LABELS = {
  OFFICIAL_PAGE: 'Official manufacturer',
  OFFICIAL_DOCUMENT: 'Official document',
  TRUSTED_SECONDARY: 'Trusted secondary distributor',
  ADMIN_APPROVED: 'Admin-approved secondary',
  INSUFFICIENT: 'Insufficient',
};

/** Confidence wording for the candidate review list (A/B/C/D). */
export const CONFIDENCE_LABELS = {
  A: 'A Comparable',
  B: 'B Calculated from published official data',
  C: 'C Trusted secondary / ADI estimate',
  D: 'D Insufficient data',
};

// --- Discovery focus --------------------------------------------------------
export const FOCUS_MANUFACTURERS = [
  'KEF',
  'Bowers & Wilkins',
  'Origin Acoustics',
  'Sonance',
  'Triad',
  'Paradigm',
  'Lyngdorf Audio',
  'M&K Sound',
  'Monitor Audio',
  'JBL Synthesis',
  'Perlisten',
  'Procella',
  'Wisdom Audio',
  'Ascendo',
  'James Loudspeaker',
  'Focal',
  'DALI',
  'MartinLogan',
  'Klipsch',
];

const FOCUS_ALIASES = {
  kef: 'KEF',
  'bowers & wilkins': 'Bowers & Wilkins',
  'bowers and wilkins': 'Bowers & Wilkins',
  'b&w': 'Bowers & Wilkins',
  bw: 'Bowers & Wilkins',
  'origin acoustics': 'Origin Acoustics',
  sonance: 'Sonance',
  triad: 'Triad',
  'triad speakers': 'Triad',
  paradigm: 'Paradigm',
  'lyngdorf audio': 'Lyngdorf Audio',
  lyngdorf: 'Lyngdorf Audio',
  // The correct spelling is Lyngdorf Audio: the misspelling is corrected, never searched.
  'lyndorf audio': 'Lyngdorf Audio',
  lyndorf: 'Lyngdorf Audio',
  'm&k sound': 'M&K Sound',
  'mk sound': 'M&K Sound',
  'm&k': 'M&K Sound',
  'monitor audio': 'Monitor Audio',
  'jbl synthesis': 'JBL Synthesis',
  'jbl': 'JBL Synthesis',
  perlisten: 'Perlisten',
  procella: 'Procella',
  'procella audio': 'Procella',
  'wisdom audio': 'Wisdom Audio',
  wisdom: 'Wisdom Audio',
  ascendo: 'Ascendo',
  'ascendo immersive': 'Ascendo',
  'james loudspeaker': 'James Loudspeaker',
  'james loudspeakers': 'James Loudspeaker',
  focal: 'Focal',
  dali: 'DALI',
  'martin logan': 'MartinLogan',
  martinlogan: 'MartinLogan',
  klipsch: 'Klipsch',
};

/** The canonical spelling of a manufacturer name ("Lyndorf Audio" → "Lyngdorf Audio"). */
export function canonicalManufacturerName(name) {
  const key = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return '';
  return FOCUS_ALIASES[key] || String(name).trim();
}

/** Is this manufacturer one of the names this capability database focuses on? */
export function isFocusManufacturer(name) {
  const canonical = canonicalManufacturerName(name);
  if (!canonical) return false;
  return FOCUS_MANUFACTURERS.some((entry) => entry.toLowerCase() === canonical.toLowerCase());
}