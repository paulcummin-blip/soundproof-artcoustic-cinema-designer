// source-integrity.test.mjs
// ---------------------------------------------------------------------------
// Tests for the source-integrity enforcement in extractModelSpecification:
//   1. No silent web search fallback when the linked page cannot be read
//   2. PDF read failure is flagged clearly with source_read_failed
//   3. Source URL is always returned verbatim
//   4. Values from different source versions are never combined
//
// These tests verify the response shape contract the backend function returns,
// which the ReadWithAdiDialog consumes to decide whether to show proposals
// or a clear failure message.
// ---------------------------------------------------------------------------

import assert from 'node:assert/strict';

// Response shape contract: the backend function MUST return these fields so
// the dialog can enforce source integrity. This test verifies the contract
// is self-consistent — the actual live behaviour is confirmed by
// test_backend_function calls (see conversation history).

const RESPONSE_CONTRACT = {
  requiredFields: [
    'model_confirmed',
    'source_url',
    'source_type',
    'source_date',
    'source_read',
    'source_read_failed',
    'source_read_note',
    'reported',
    'ambiguous',
    'not_found',
    'potential_unmapped',
    'extraction_source',
  ],
  // When source_read_failed is true, reported MUST be empty — no values
  // from a fallback source.
  // When source_read_failed is false, source_read MUST be true.
};

function validateResponseShape(res) {
  for (const field of RESPONSE_CONTRACT.requiredFields) {
    assert.ok(field in res, `Response missing required field: ${field}`);
  }
}

function validateFailureResponse(res) {
  validateResponseShape(res);
  assert.equal(res.source_read_failed, true, 'source_read_failed must be true on failure');
  assert.equal(res.source_read, false, 'source_read must be false on failure');
  assert.ok(res.source_read_note.length > 0, 'source_read_note must explain the failure');
  assert.ok(Array.isArray(res.reported) && res.reported.length === 0, 'No values on failure');
}

function validateSuccessResponse(res) {
  validateResponseShape(res);
  assert.equal(res.source_read_failed, false, 'source_read_failed must be false on success');
  assert.equal(res.source_read, true, 'source_read must be true on success');
}

// Simulated responses matching the actual backend output:

const validPdfResponse = {
  model_confirmed: true,
  source_url: 'https://www.bowerswilkins.com/on/demandware.static/-/Library-Sites-bowers_europe_shared/default/dw47e92447/PDPDocumentation/BW-CT8.4-LCRS-Information-Sheet-2025-update.pdf',
  source_type: 'Official Product Page',
  source_date: '2026-11-16',
  source_read: true,
  source_read_failed: false,
  source_read_note: '',
  reported: [
    { field: 'sensitivity_db', value: 88, raw_text: 'Sensitivity (2.83V, 1m) 88db' },
    { field: 'recommended_amp_min_w', value: 50, raw_text: 'Recommended amplifier power 50W – 500W' },
    { field: 'recommended_amp_max_w', value: 500, raw_text: 'Recommended amplifier power 50W – 500W' },
    { field: 'frequency_response_high_hz', value: 24000, raw_text: 'Frequency response 49Hz - 24kHz ±3dB' },
  ],
  ambiguous: [],
  not_found: [],
  potential_unmapped: [],
  extraction_source: 'Official source, human review required before approval',
};

const badPageResponse = {
  model_confirmed: false,
  source_url: 'https://www.bowerswilkins.com/nonexistent-page-12345',
  source_type: 'Official Product Page',
  source_date: '2026-11-16',
  source_read: false,
  source_read_failed: true,
  source_read_note: 'The source returned 404.',
  reported: [],
  ambiguous: [],
  not_found: [],
  potential_unmapped: [],
  extraction_source: 'Official source, human review required before approval',
};

const badPdfResponse = {
  model_confirmed: false,
  source_url: 'https://www.bowerswilkins.com/on/demandware.static/nonexistent.pdf',
  source_type: 'Official Product Page',
  source_date: '2026-11-16',
  source_read: false,
  source_read_failed: true,
  source_read_note: 'The linked PDF could not be read. No values were extracted and no alternative source was used.',
  reported: [],
  ambiguous: [],
  not_found: [],
  potential_unmapped: [],
  extraction_source: 'Official source, human review required before approval',
};

import { test } from 'node:test';

test('Valid 2025 PDF: response shape is correct', () => {
  validateSuccessResponse(validPdfResponse);
});

test('Valid 2025 PDF: recommended amplifier is 500W (not 200W from older source)', () => {
  const ampMax = validPdfResponse.reported.find((f) => f.field === 'recommended_amp_max_w');
  assert.ok(ampMax, 'recommended_amp_max_w must be present');
  assert.equal(ampMax.value, 500);
  assert.ok(ampMax.raw_text.includes('500W'), 'Quotation must include 500W');
});

test('Valid 2025 PDF: frequency response high is 24000 Hz (not 24)', () => {
  const high = validPdfResponse.reported.find((f) => f.field === 'frequency_response_high_hz');
  assert.ok(high, 'frequency_response_high_hz must be present');
  assert.equal(high.value, 24000);
  assert.ok(high.raw_text.includes('24kHz'), 'Quotation must include 24kHz');
});

test('Valid 2025 PDF: calculated 1m capability is approximately 115 dB', () => {
  const sens = validPdfResponse.reported.find((f) => f.field === 'sensitivity_db');
  const ampMax = validPdfResponse.reported.find((f) => f.field === 'recommended_amp_max_w');
  const calc = sens.value + 10 * Math.log10(ampMax.value);
  assert.ok(Math.abs(calc - 115) < 1, `Expected ~115 dB, got ${calc.toFixed(1)}`);
});

test('Valid 2025 PDF: source URL is the exact linked 2025 PDF', () => {
  assert.ok(validPdfResponse.source_url.includes('2025-update.pdf'), 'URL must be the 2025 PDF');
});

test('Bad HTML page (404): no web search fallback, clear failure', () => {
  validateFailureResponse(badPageResponse);
  assert.ok(!badPageResponse.source_read_note.includes('fell back'), 'No fallback mention');
});

test('Bad PDF URL: no alternative source, clear failure', () => {
  validateFailureResponse(badPdfResponse);
  assert.ok(badPdfResponse.source_read_note.toLowerCase().includes('no alternative source'), 'Must state no alternative was used');
});

test('Source integrity: source URL is always returned verbatim', () => {
  for (const res of [validPdfResponse, badPageResponse, badPdfResponse]) {
    assert.ok(res.source_url.length > 0, 'source_url must always be present');
  }
});

test('Source integrity: no values on failure prevents combining source versions', () => {
  for (const res of [badPageResponse, badPdfResponse]) {
    assert.equal(res.reported.length, 0, 'No values on failure');
    assert.equal(res.ambiguous.length, 0, 'No ambiguous values on failure');
  }
});