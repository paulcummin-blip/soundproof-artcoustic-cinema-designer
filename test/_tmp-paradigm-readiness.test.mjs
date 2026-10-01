// Temporary verification: run the REAL readiness authority over the seven
// imported Paradigm specifications (values exactly as stored) and confirm the
// class the Speaker Database list and the RP22 candidate list will show.

import { test, expect } from 'vitest';
import { comparisonReadiness, evidenceText, powerBasisText } from '../src/components/admin/speaker-db/comparisonReadiness.js';

const MODELS = [
  { model: 'CI Elite E3 LCR v2', sens: 89, frLow: 93, ampMax: 200 },
  { model: 'CI Elite E5 LCR v2', sens: 91, frLow: 82, ampMax: 220 },
  { model: 'CI Elite E7 LCR v2', sens: 92, frLow: 80, ampMax: 220 },
  { model: 'CI Elite E80-IW v2', sens: 88, frLow: 57, ampMax: 180 },
  { model: 'CI Pro P65-IW v2', sens: 87.5, frLow: 70, ampMax: 120 },
  { model: 'CI Pro P80-IW v2', sens: 87.5, frLow: 55, ampMax: 150 },
  { model: 'CI Pro P5 LCR v2', sens: 91, frLow: 84, ampMax: 200 },
];

function readinessFor(m) {
  const product = {
    id: 'p', manufacturer_name: 'Paradigm', model: m.model,
    official_product_url: 'https://www.paradigm.com/en/in-wall-speakers/model',
  };
  const specification = {
    product_id: 'p',
    sensitivity_db: m.sens,
    sensitivity_basis: 'unknown',
    nominal_impedance_ohm: 8,
    recommended_amp_min_w: 15,
    recommended_amp_max_w: m.ampMax,
    frequency_response_low_hz: m.frLow,
    frequency_response_high_hz: 22000,
    frequency_response_tolerance: '±3 dB',
    max_spl_basis: 'unknown',
    measurement_space: 'unspecified',
    source_date: '2026-10-01',
    confidence: 'C',
    evidence_quality: 'Manufacturer Calculated',
  };
  return comparisonReadiness({ product, specification });
}

test('Paradigm import: every model is gradeable as an ADI estimate (C)', () => {
  const lines = [];
  for (const m of MODELS) {
    const r = readinessFor(m);
    lines.push([
      m.model.padEnd(20),
      `${r.confidence} ${r.label}`.padEnd(28),
      evidenceText(r).padEnd(22),
      powerBasisText({ recommended_amp_max_w: m.ampMax }).padEnd(38),
      `eligible=${r.eligible}`,
      `assumedBasis=${r.sensitivityBasisAssumed}`,
      `powerAuthority=${r.powerAuthority}`,
      `capability=${r.capabilityBasis}`,
      `evidence=${r.evidenceQuality}`,
      `missingCritical=[${r.missingCriticalLabels.join(', ')}]`,
    ].join(' | '));

    expect(r.confidence, m.model).toBe('C');
    expect(r.label, m.model).toBe('ADI Estimate');
    expect(r.eligible, m.model).toBe(true);
    expect(r.capabilityBasis, m.model).toBe('Calculated');
    expect(r.powerAuthorityW, m.model).toBe(m.ampMax);
    // The genuinely unstated fields are named, never silently filled.
    expect(r.missingCriticalLabels, m.model).toEqual(
      expect.arrayContaining(['Sensitivity basis', 'Measurement space', 'Evidence quality']),
    );
  }
  console.log('\n' + lines.join('\n'));
});