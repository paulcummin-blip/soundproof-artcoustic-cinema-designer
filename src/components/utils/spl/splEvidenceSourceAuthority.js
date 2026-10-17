// splEvidenceSourceAuthority.js
// ---------------------------------------------------------------------------
// ONE home for the question the RP22 comparison must answer honestly: where did
// this loudspeaker's continuous SPL capability actually come from?
//
//   Manufacturer Measured          the manufacturer states the figure as a
//                                 measured / rated figure under a stated basis
//   Manufacturer Calculated        the manufacturer publishes the figure as
//                                 calculated rather than measured
//   Manufacturer Published (unstated)
//                                 a manufacturer figure whose basis is not
//                                 stated — never treated as measured capability
//   Sound Proof Estimate           no manufacturer SPL authority is published,
//                                 so Sound Proof derives the capability from the
//                                 manufacturer's published sensitivity + power
//
// Provenance decides the evidence label and a confidence CAP only. Nothing here
// changes an SPL value, a space correction, an RP22 threshold, the propagation
// rules, the amplifier ceiling, the EQ headroom or the eligibility rules: the
// number that is graded is exactly the number that was graded before, and a
// stated Half Space / 2π figure still receives no additional 6 dB.
//
// The declarations this module reads are the ones the manufacturer or the
// specification actually states:
//   • max_spl_test_conditions — the basis carried from the specification's
//     max_spl_basis ('calculated', 'AES', 'IEC', 'continuous', …) or, on a legacy
//     row, the manufacturer's own free-text test conditions.
//   • source_evidence_quality — the specification's declared evidence quality
//     ('Manufacturer Published' / 'Manufacturer Calculated' / …).
// A populated continuous SPL field is NEVER on its own taken as measured
// evidence, and an explicit statement that the figure is calculated always wins:
// provenance may lower a classification, never raise one.
// ---------------------------------------------------------------------------

export const SPL_EVIDENCE_SOURCES = {
  MANUFACTURER_MEASURED: {
    key: 'manufacturer_measured',
    label: 'Manufacturer Measured',
    confidenceCap: null,
    authority: 'Published measured continuous SPL',
    statement:
      'The manufacturer states this continuous SPL figure as a measured / rated figure under a stated basis. '
      + 'It is not an independent Sound Proof measurement.',
  },
  MANUFACTURER_CALCULATED: {
    key: 'manufacturer_calculated',
    label: 'Manufacturer Calculated',
    confidenceCap: 'B',
    authority: 'Manufacturer-calculated continuous SPL',
    statement:
      'The manufacturer publishes this continuous SPL figure as a calculated figure rather than a measured one. '
      + 'It remains usable as manufacturer-stated capability, but it is never presented as measured capability.',
  },
  MANUFACTURER_UNVERIFIED: {
    key: 'manufacturer_unverified',
    label: 'Manufacturer Published (unstated)',
    confidenceCap: 'B',
    authority: 'Published continuous SPL (basis unstated)',
    statement:
      'The manufacturer publishes a continuous SPL figure but does not state whether it is measured or calculated, '
      + 'so Sound Proof does not treat it as measured capability.',
  },
  SOUND_PROOF_ESTIMATE: {
    key: 'sound_proof_estimate',
    label: 'Sound Proof Estimate',
    confidenceCap: null,
    authority: 'Calculated from sensitivity + power',
    statement:
      'No manufacturer continuous SPL authority is published for this model, so the capability is calculated by '
      + 'Sound Proof from the manufacturer\u2019s published sensitivity and power data. It is not manufacturer-measured performance.',
  },
};

const MEASURED_BASIS_VALUES = new Set(['aes', 'iec', 'continuous', 'peak', 'measured', 'measured continuous']);

// A legacy free-text conditions field that names a measurement standard or method.
const MEASURED_BASIS_PATTERN = /\b(aes|iec|cta|ansi|60268|2034|anechoic|measured|measurement|tested|test|standard|rated)\b/;

const CONFIDENCE_RANK = { A: 1, B: 2, C: 3, D: 4, INSUFFICIENT: 4 };

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const textOf = (value) => String(value ?? '').trim().toLowerCase();

/** Does this basis state a measured / rated figure? */
export function isMeasuredSplBasis(basis) {
  const text = textOf(basis);
  if (!text) return false;
  if (MEASURED_BASIS_VALUES.has(text)) return true;
  return MEASURED_BASIS_PATTERN.test(text);
}

/** Does this basis state that the figure is calculated? */
export function isCalculatedSplBasis(basis) {
  return /\bcalculated\b|\bderived\b/.test(textOf(basis));
}

/**
 * Where the graded SPL figure came from.
 * @param {object} params { publishedSpl, splBasis, declaredEvidenceQuality }
 * @returns {object} one of SPL_EVIDENCE_SOURCES
 */
export function resolveSplEvidenceSource({ publishedSpl, splBasis, declaredEvidenceQuality } = {}) {
  const numericSpl = Number(publishedSpl);
  const hasManufacturerSpl = hasValue(publishedSpl) && Number.isFinite(numericSpl) && numericSpl !== 0;
  if (!hasManufacturerSpl) return SPL_EVIDENCE_SOURCES.SOUND_PROOF_ESTIMATE;

  const basis = textOf(splBasis);
  const declaredQuality = textOf(declaredEvidenceQuality);

  // A statement that the figure is calculated always wins over any other reading.
  if (isCalculatedSplBasis(basis) || declaredQuality === 'manufacturer calculated') {
    return SPL_EVIDENCE_SOURCES.MANUFACTURER_CALCULATED;
  }
  if (isMeasuredSplBasis(basis) || declaredQuality === 'manufacturer published') {
    return SPL_EVIDENCE_SOURCES.MANUFACTURER_MEASURED;
  }
  // A manufacturer figure whose basis is missing or ambiguous is held as
  // published-but-unverified: measurement is never assumed.
  return SPL_EVIDENCE_SOURCES.MANUFACTURER_UNVERIFIED;
}

/**
 * Apply a confidence cap. Ranks run A (1) → INSUFFICIENT (4); a cap can only hold
 * a classification back, never lift it, and an unknown value is left alone.
 */
export function capEvidenceConfidence(confidence, cap) {
  const current = CONFIDENCE_RANK[String(confidence || '').toUpperCase()];
  const limit = CONFIDENCE_RANK[String(cap || '').toUpperCase()];
  if (!current || !limit || limit <= current) return confidence;
  return String(cap).toUpperCase();
}