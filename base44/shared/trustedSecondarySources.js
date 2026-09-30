// trustedSecondarySources.js  (backend)
// ---------------------------------------------------------------------------
// TRUSTED SECONDARY evidence: a small, named set of UK custom-install
// distributors whose hosted copies of manufacturer product sheets, datasheets,
// manuals and specification sheets may be used for a P12/P13 comparison when the
// manufacturer's own site has no sheet, its product page is too thin, or the
// model is legacy and its own page no longer states the values.
//
// These are NOT primary sources and they are NOT official. They are trusted
// enough to use, clearly labelled, and capped at confidence C — unless the
// document turns out to sit on the manufacturer's own CDN or archive, in which
// case the host rule (officialDomain.js) already treats it as official.
//
// A frontend mirror lives at src/components/utils/spl/trustedSecondarySources.js
// so the review screens label a host exactly as this module classifies it.
// ---------------------------------------------------------------------------

import { hostOf } from './officialDomain.js';

export const TRUSTED_SECONDARY_SOURCES = [
  { name: 'Habitech', host: 'habitech.co.uk', url: 'https://www.habitech.co.uk' },
  { name: 'CAVD', host: 'cavd.co.uk', url: 'https://www.cavd.co.uk' },
  { name: 'Pulse Cinemas', host: 'pulsecinemas.com', url: 'https://pulsecinemas.com' },
  { name: 'AWE Europe', host: 'awe-europe.com', url: 'https://www.awe-europe.com' },
];

export const TRUSTED_SECONDARY_HOSTS = TRUSTED_SECONDARY_SOURCES.map((source) => source.host);

/** The trusted distributor behind a URL or a bare host, or null. Subdomains count. */
export function trustedSecondarySource(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return null;
  const host = /^https?:\/\//i.test(raw) ? hostOf(raw) : hostOf(`https://${raw}`);
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

/** A short line naming the distributor, e.g. "Trusted secondary distributor · Habitech". */
export function trustedSourceLine(urlOrHost) {
  const source = trustedSecondarySource(urlOrHost);
  return source ? `Trusted secondary distributor · ${source.name}` : '';
}

// --- Evidence ranking -------------------------------------------------------
// A  Official manufacturer page, datasheet, manual, product sheet, CDN or
//    official support download.
// B  Strong calculated: official manufacturer data carries sensitivity,
//    impedance and a power authority or max SPL.
// C  Trusted secondary: Habitech, CAVD, Pulse Cinemas, AWE Europe — an
//    admin-approved distributor source. Usable for P12/P13 estimates, always
//    labelled, never A.
// D  Insufficient: no sensitivity, no impedance, no max SPL, no power authority.
export const EVIDENCE_RANKS = {
  A: { rank: 'A', label: 'Official manufacturer', meaning: 'Official manufacturer page, datasheet, manual, product sheet, CDN or official support download.' },
  B: { rank: 'B', label: 'Strong calculated', meaning: 'Official manufacturer data carries sensitivity, impedance and a power authority or max SPL.' },
  C: { rank: 'C', label: TRUSTED_EVIDENCE_LABEL, meaning: 'Trusted secondary distributor source — usable for P12/P13 estimates, capped at C.' },
  D: { rank: 'D', label: 'Insufficient', meaning: 'No sensitivity, no impedance, no max SPL and no usable power authority.' },
};

/** The label a source type carries in the review screens. */
export const SOURCE_TYPE_LABELS = {
  OFFICIAL_PAGE: 'Official manufacturer',
  OFFICIAL_DOCUMENT: 'Official document',
  TRUSTED_SECONDARY: 'Trusted secondary distributor',
  ADMIN_APPROVED: 'Admin-approved secondary',
  INSUFFICIENT: 'Insufficient',
};

// --- Discovery focus --------------------------------------------------------
// The manufacturers this capability database exists for: high-end custom-install
// and architectural cinema, not generic hi-fi.
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
  const canonical = canonicalManufacturerName(name).toLowerCase();
  if (!canonical) return false;
  return FOCUS_MANUFACTURERS.some((entry) => entry.toLowerCase() === canonical)
    || FOCUS_MANUFACTURERS.some((entry) => canonical.startsWith(entry.toLowerCase().split(' ')[0]) && entry.toLowerCase().split(' ').length > 1 && canonical.includes(entry.toLowerCase()));
}

// --- Search patterns --------------------------------------------------------
// Official sources are searched first, then the trusted distributors. The
// site: patterns are only used once the official search has left a model
// incomplete.
export const TRUSTED_SECONDARY_SEARCH_PATTERNS = [
  'site:habitech.co.uk <manufacturer> <model>',
  'site:cavd.co.uk <manufacturer> <model>',
  'site:pulsecinemas.com <manufacturer> <model>',
  'site:awe-europe.com <manufacturer> <model>',
  '"<manufacturer> <model> product sheet"',
  '"<manufacturer> <model> spec sheet"',
  '"<manufacturer> <model> datasheet"',
  '"<manufacturer> <model> manual"',
  '"<manufacturer> <model> installation guide"',
  '"<manufacturer> <model> PDF"',
  '"<manufacturer> <model> in wall"',
  '"<manufacturer> <model> cinema"',
  '"<manufacturer> <model> custom install"',
  '"<manufacturer> <model> LCR"',
  '"<manufacturer> <model> architectural"',
];

/** Which P12/P13 fields a trusted-secondary pass is allowed to look for. */
export const TRUSTED_SECONDARY_FIELDS = [
  'sensitivity_db', 'sensitivity_basis',
  'nominal_impedance_ohm', 'minimum_impedance_ohm',
  'recommended_amp_min_w', 'recommended_amp_max_w',
  'power_handling_continuous_w', 'long_term_iec_power_w', 'rated_iec_power_w', 'aes_power_w',
  'max_continuous_spl_db', 'max_peak_spl_db', 'max_spl_basis',
  'frequency_response_low_hz', 'frequency_response_hz', 'frequency_response_high_hz',
  'frequency_response_tolerance', 'measurement_space',
  'horizontal_dispersion_deg', 'vertical_dispersion_deg',
];

// The assumptions a C-graded row is allowed to make, and the ones that are never
// allowed. Stated wherever trusted secondary evidence is shown.
export const ALLOWED_C_ASSUMPTIONS = [
  'Missing measurement space — the Sound Proof half-space policy is applied, and stated.',
  'Missing max SPL — calculated from sensitivity plus the stated power authority.',
  'Missing sensitivity basis — treated as 2.83 V / 1 m only when the source wording strongly supports it, and stated.',
  'Recommended amplifier maximum used as the power authority when no AES/continuous rating exists, clearly labelled.',
];

export const DISALLOWED_ASSUMPTIONS = [
  'Never invent sensitivity.',
  'Never invent impedance (an ADI assumption must be labelled and the row stays C or D).',
  'Never invent power handling.',
  'Never use a random dealer page automatically.',
];