// secondaryEvidencePolicy.js
// ---------------------------------------------------------------------------
// The single policy for admin-approved SECONDARY evidence: an original
// manufacturer document that is no longer hosted on the manufacturer's own
// domain, and that the admin has explicitly accepted.
//
// The official-domain rule is untouched — this is an exception an admin makes on
// purpose, it is recorded against the specification, and it can never present
// itself as published measured manufacturer evidence:
//
//   secondary, third-party host  → capped at C, basis "Secondary evidence"
//   official CDN or official archive → no cap (the host does belong to the
//                                      manufacturer), recorded as official
// ---------------------------------------------------------------------------

export const SECONDARY_SOURCE_TYPE = 'Secondary Evidence';

export const SECONDARY_HOST_WARNING = 'This is not hosted on the official manufacturer domain.';

export const SECONDARY_CONFIDENCE_CAP = 'C';

export const SECONDARY_BASIS = {
  ESTIMATE: 'ADI estimate from secondary manufacturer document',
  CALCULATED: 'Calculated from secondary published data',
};

export const SECONDARY_STATEMENT =
  'Specification data is taken from an admin-approved secondary copy of a manufacturer product sheet. '
  + 'This is useful for comparison, but is not equivalent to a live official manufacturer source.';

export const SECONDARY_BADGE_LABEL = 'Secondary evidence';

/** The document type wording returned by the reader, for display. */
export function documentTypeLabel(documentType) {
  return {
    manufacturer_product_sheet: 'Manufacturer product sheet',
    manufacturer_manual: 'Manufacturer manual',
    manufacturer_brochure: 'Manufacturer brochure',
    dealer_page: 'Dealer page',
    distributor_page: 'Distributor page',
    unknown: 'Unknown document',
  }[documentType] || 'Unknown document';
}

/** A recorded secondary source is capped unless it sits on the manufacturer's own host. */
export function isSecondaryCapped(evidence) {
  if (!evidence) return false;
  return evidence.is_official !== true;
}

/**
 * The basis phrase stored with the accepted evidence: a capability calculated
 * from values the secondary document publishes, or an ADI estimate where the
 * document states values but no capability figure.
 */
export function secondaryBasisLabel({ hasPublishedMaxSpl, evidence }) {
  if (evidence?.basis) return evidence.basis;
  return hasPublishedMaxSpl ? SECONDARY_BASIS.CALCULATED : SECONDARY_BASIS.ESTIMATE;
}

/** Why the confidence is held where it is — shown in the hover panel and stored. */
export function confidenceCapReason(evidence) {
  if (!evidence) return '';
  if (evidence.is_official === true) {
    return `Hosted on ${evidence.host || 'the manufacturer domain'} — an official host, so no confidence cap applies.`;
  }
  return `Admin-approved secondary copy hosted on ${evidence.host || 'a third-party host'}, not the manufacturer's own domain — capped at ${SECONDARY_CONFIDENCE_CAP}.`;
}

/** Confidence after the cap: A and B become C; C stays C; insufficient stays insufficient. */
export function capSecondaryConfidence(confidence, evidence) {
  if (!isSecondaryCapped(evidence)) return confidence;
  if (confidence === 'A' || confidence === 'B') return SECONDARY_CONFIDENCE_CAP;
  return confidence;
}