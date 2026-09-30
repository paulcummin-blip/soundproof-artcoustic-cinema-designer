import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_MANUFACTURERS,
  canonicalManufacturerName,
  isFocusManufacturer,
  isTrustedSecondaryUrl,
  trustedSecondarySource,
  TRUSTED_SECONDARY_STATEMENT,
  TRUSTED_HOST_WARNING,
} from '../src/components/utils/spl/trustedSecondarySources.js';
import { normalizeCompetitor } from '../src/components/utils/spl/competitorNormalization.js';
import {
  evidenceBadgeLabel,
  evidenceLabel,
  evidenceRowNote,
  evidenceStatement,
  confidenceCapReason,
  isTrustedEvidence,
} from '../src/components/admin/speaker-db/secondaryEvidence/secondaryEvidencePolicy.js';

// --- Trusted secondary domains ----------------------------------------------
// Habitech, CAVD, Pulse Cinemas and AWE Europe may be used for a P12/P13
// estimate. They are not primary sources, they are always labelled, and they are
// capped at C — unless the document actually sits on the manufacturer's host.

test('1. the four trusted distributors are recognised, subdomains included', () => {
  for (const url of [
    'https://www.habitech.co.uk/product/x.pdf',
    'https://habitech.co.uk/product-sheet.pdf',
    'https://www.cavd.co.uk/spec.pdf',
    'https://pulsecinemas.com/manuals/model.pdf',
    'https://www.awe-europe.com/products/model/datasheet.pdf',
  ]) {
    assert.equal(isTrustedSecondaryUrl(url), true, url);
  }
  assert.equal(trustedSecondarySource('https://www.habitech.co.uk/a.pdf').name, 'Habitech');
  assert.equal(trustedSecondarySource('https://www.awe-europe.com/a.pdf').name, 'AWE Europe');
});

test('2. a random dealer page is never trusted automatically', () => {
  assert.equal(isTrustedSecondaryUrl('https://dealer.example/model.pdf'), false);
  assert.equal(isTrustedSecondaryUrl('https://www.richersounds.com/model.pdf'), false);
  assert.equal(isTrustedSecondaryUrl(''), false);
  assert.equal(trustedSecondarySource('https://dealer.example/model.pdf'), null);
});

// --- Evidence ranking -------------------------------------------------------

const values = {
  manufacturer: 'Bowers & Wilkins',
  model: 'CT8 LR',
  sensitivity_value_db: 93,
  sensitivity_reference: '2.83V/1m',
  rated_impedance_ohm: 8,
  minimum_impedance_ohm: 4,
  recommended_amp_min_w: 500,
  recommended_amp_max_w: 1000,
  frequency_range: '29–24000 Hz',
  measurement_space_basis: 'Half Space',
};

const accepted = (host, isOfficial = false) => ({
  source_type: 'Secondary Evidence',
  url: `https://${host}/ct8-lr-product-sheet.pdf`,
  host,
  document_type: 'manufacturer_product_sheet',
  is_official: isOfficial,
  accepted_by: 'Paul',
  basis: '',
});

test('3. trusted secondary values grade the model and hold it at C, labelled', () => {
  const n = normalizeCompetitor({ ...values, secondary_evidence: accepted('habitech.co.uk') });
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.data_confidence, 'C');
  assert.equal(n.secondary_trusted, true);
  assert.equal(n.secondary_source_name, 'Habitech');
  assert.equal(n.evidence_quality, 'Trusted secondary evidence');
  assert.equal(n.capability_basis, 'ADI estimate from trusted secondary data');
  assert.match(n.confidence_cap_reason, /capped at C/);
});

test('4. the same values from an official manufacturer CDN are not capped', () => {
  const n = normalizeCompetitor({
    ...values,
    secondary_evidence: accepted('bowerswilkins.com', true),
  });
  assert.equal(n.data_confidence, 'B');
  assert.equal(n.secondary_trusted, false);
});

test('5. a trusted host can never reach A, even with a published continuous SPL', () => {
  const published = {
    ...values,
    continuous_power_w: 500,
    power_rating_type: 'Continuous',
    published_max_continuous_spl_db_1m: 116,
  };
  assert.equal(normalizeCompetitor(published).data_confidence, 'A');
  const capped = normalizeCompetitor({ ...published, secondary_evidence: accepted('cavd.co.uk') });
  assert.equal(capped.data_confidence, 'C');
  assert.equal(capped.secondary_trusted, true);
});

// --- Wording the review screens show ---------------------------------------

test('6. the wording names the tier exactly', () => {
  const trusted = accepted('pulsecinemas.com');
  assert.equal(isTrustedEvidence(trusted), true);
  assert.equal(evidenceLabel(trusted), 'Trusted secondary evidence');
  assert.equal(evidenceBadgeLabel(trusted), 'Trusted secondary');
  assert.equal(evidenceRowNote(trusted), 'Trusted secondary evidence used');
  assert.equal(evidenceStatement(trusted), TRUSTED_SECONDARY_STATEMENT);
  assert.match(confidenceCapReason(trusted), /Trusted secondary distributor source \(Pulse Cinemas, pulsecinemas\.com\)/);
  assert.equal(TRUSTED_HOST_WARNING.includes('trusted secondary distributor'), true);
});

test('7. an admin-approved copy outside the trusted set keeps the plain wording', () => {
  const other = accepted('dealer.example');
  assert.equal(isTrustedEvidence(other), false);
  assert.equal(evidenceLabel(other), 'Secondary evidence');
  assert.equal(evidenceRowNote(other), 'Secondary evidence used');
  assert.notEqual(evidenceStatement(other), TRUSTED_SECONDARY_STATEMENT);
});

// --- Discovery focus --------------------------------------------------------

test('8. the focus brands are the custom-install cinema names, spelled correctly', () => {
  for (const name of [
    'KEF', 'Bowers & Wilkins', 'Origin Acoustics', 'Sonance', 'Triad', 'Paradigm',
    'Lyngdorf Audio', 'M&K Sound', 'Monitor Audio', 'JBL Synthesis', 'Perlisten',
    'Procella', 'Wisdom Audio', 'Ascendo', 'James Loudspeaker', 'Focal', 'DALI',
    'MartinLogan', 'Klipsch',
  ]) {
    assert.equal(FOCUS_MANUFACTURERS.includes(name), true, name);
  }
  assert.equal(FOCUS_MANUFACTURERS.includes('Lyndorf Audio'), false);
});

test('9. a misspelled manufacturer name is corrected, never searched', () => {
  assert.equal(canonicalManufacturerName('Lyndorf Audio'), 'Lyngdorf Audio');
  assert.equal(canonicalManufacturerName('lyngdorf'), 'Lyngdorf Audio');
  assert.equal(canonicalManufacturerName('B&W'), 'Bowers & Wilkins');
  assert.equal(canonicalManufacturerName('M&K'), 'M&K Sound');
  assert.equal(canonicalManufacturerName('Martin Logan'), 'MartinLogan');
  assert.equal(canonicalManufacturerName('KEF'), 'KEF');
  assert.equal(isFocusManufacturer('Lyndorf Audio'), true);
  assert.equal(isFocusManufacturer('Some Hi-Fi Brand'), false);
});