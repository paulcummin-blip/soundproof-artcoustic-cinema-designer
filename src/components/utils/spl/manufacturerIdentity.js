// manufacturerIdentity.js
// ---------------------------------------------------------------------------
// Canonical manufacturer / model identity for competitor matching.
//
// The Speaker Database and the legacy spreadsheet import spell the same
// manufacturer differently — "M&K Sound", "MK Sound", "M and K Sound",
// "M.K. Sound" — so matching on the raw string used to create a second
// comparison row for the same product.
//
// Everything that matches or compares a competitor row against a Speaker
// Database product uses these keys instead of the raw strings. The key is
// deliberately aggressive: case, punctuation, spacing, diacritics and joining
// words are removed, so only the significant letters and digits survive.
// ---------------------------------------------------------------------------

const JOINING_WORDS = new Set(['and', 'the', 'of']);

export function normaliseManufacturerIdentity(name) {
  const spaced = String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ') // M&K → M and K
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' '); // punctuation and spacing → single space

  return spaced
    .split(' ')
    .filter(Boolean)
    .filter((token) => !JOINING_WORDS.has(token))
    .join('');
}

export function normaliseModelIdentity(model) {
  return String(model ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function competitorIdentityKey(record) {
  if (!record) return '';
  return `${normaliseManufacturerIdentity(record.manufacturer)}::${normaliseModelIdentity(record.model)}`;
}

export function sameCompetitorIdentity(record, { manufacturer, model }) {
  if (!record) return false;
  return normaliseManufacturerIdentity(record.manufacturer) === normaliseManufacturerIdentity(manufacturer)
    && normaliseModelIdentity(record.model) === normaliseModelIdentity(model);
}