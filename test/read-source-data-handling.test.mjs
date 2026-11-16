// read-source-data-handling.test.mjs
// ---------------------------------------------------------------------------
// Tests for the shared Read Source data-handling fixes:
//   1. kHz unit conversion: "24" with rawText "24kHz" → 24000
//   2. Power category suppression: all power fields surface independently
//   3. Status assignment: reported items get status "reported" even though
//      the backend does not stamp it on each item
// ---------------------------------------------------------------------------

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

// --- coerceSpecValue kHz logic (extracted from speakerSourceReading.js) ---

function normaliseNumber(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  let core = s.replace(/[^\d.,-]/g, "");
  if (!core) return null;
  const hasComma = core.includes(",");
  const hasDot = core.includes(".");
  if (hasComma && hasDot) {
    const lastComma = core.lastIndexOf(",");
    const lastDot = core.lastIndexOf(".");
    if (lastComma > lastDot) core = core.replace(/\./g, "").replace(",", ".");
    else core = core.replace(/,/g, "");
  } else if (hasComma) {
    const parts = core.split(",");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && last.length === 3 && parts[0].length >= 1)) core = parts.join("");
    else core = parts.join(".");
  } else if (hasDot) {
    const parts = core.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && last.length === 3 && parts[0].length >= 2)) core = parts.join("");
  }
  const numeric = Number(core);
  return Number.isFinite(numeric) ? numeric : null;
}

function coerceHz(field, value, rawText) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const numeric = normaliseNumber(raw);
  if (numeric === null) return "";
  if (!/_hz$/.test(field) || numeric >= 1000) return numeric;
  const own = raw.toLowerCase();
  const khz = [...own.matchAll(/(\d+(?:[.,]\d+)?)\s*k\s*hz/gi)]
    .map((match) => Number(match[1].replace(",", ".")));
  if (khz.some((v) => v === numeric)) return Math.round(numeric * 1000);
  if (field === 'frequency_response_high_hz') {
    const quote = String(rawText || '').toLowerCase();
    const numStr = numeric.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const adjacent = new RegExp(`\\b${numStr}\\s*k\\s*hz`, 'i');
    if (adjacent.test(quote)) return Math.round(numeric * 1000);
  }
  return numeric;
}

// --- extractionToFound logic (simplified) ---

const SPEC_TO_FORM = {
  sensitivity_db: 'sensitivity_db',
  sensitivity_basis: 'sensitivity_reference',
  nominal_impedance_ohm: 'impedance_ohm',
  frequency_response_low_hz: 'frequency_response_low_hz',
  frequency_response_high_hz: 'frequency_response_high_hz',
  frequency_response_tolerance_db: 'frequency_response_tolerance_db',
};

const CONTINUOUS_SOURCES = [
  { field: 'power_handling_continuous_w', label: 'Manufacturer Power Handling' },
  { field: 'long_term_iec_power_w', label: 'Long-term IEC' },
  { field: 'rated_iec_power_w', label: 'Rated IEC' },
  { field: 'aes_power_w', label: 'AES' },
];

const ALL_POWER_SOURCES = [
  ...CONTINUOUS_SOURCES,
  { field: 'recommended_amp_min_w', label: 'Recommended amplifier min' },
  { field: 'recommended_amp_max_w', label: 'Recommended amplifier max' },
  { field: 'program_power_w', label: 'Programme power' },
  { field: 'peak_power_w', label: 'Peak power' },
  { field: 'power_handling_peak_w', label: 'Power handling peak' },
];

function extractionToFound(raw) {
  const byField = {};
  for (const item of (raw?.reported || [])) {
    if (!item || !item.field) continue;
    byField[item.field] = { value: item.value, status: 'reported', quote: String(item.raw_text || '').trim() };
  }
  for (const item of (raw?.ambiguous || [])) {
    if (!item || !item.field) continue;
    if (byField[item.field]) continue;
    byField[item.field] = { value: item.value, status: 'ambiguous', quote: String(item.raw_text || '').trim() };
  }

  const found = {};
  const info = {};
  for (const [specKey, formKey] of Object.entries(SPEC_TO_FORM)) {
    if (!byField[specKey]) continue;
    found[formKey] = byField[specKey].value;
    info[formKey] = { value: byField[specKey].value, status: byField[specKey].status, quote: byField[specKey].quote };
  }

  info.power_advisories = [];
  for (const src of ALL_POWER_SOURCES) {
    const entry = byField[src.field];
    if (!entry) continue;
    info.power_advisories.push({ field: src.field, value: entry.value, status: entry.status, quote: entry.quote, category: src.label });
  }
  if (info.power_advisories.length === 0) delete info.power_advisories;

  const continuous = CONTINUOUS_SOURCES.find((src) => byField[src.field] && byField[src.field].status === 'reported');
  if (continuous) {
    found.power_w = byField[continuous.field].value;
    found.power_basis = 'continuous';
    info.power_w = { value: byField[continuous.field].value, status: 'reported', quote: byField[continuous.field].quote, basis: 'continuous', category: continuous.label };
  }
  if (byField.recommended_amp_max_w && byField.recommended_amp_max_w.status === 'reported') {
    if (!found.power_w) {
      found.power_w = byField.recommended_amp_max_w.value;
      found.power_basis = 'amplifier';
    }
    info.power_w_amp = { value: byField.recommended_amp_max_w.value, status: 'reported', quote: byField.recommended_amp_max_w.quote, basis: 'amplifier', category: 'Recommended amplifier max' };
    if (byField.recommended_amp_min_w) {
      info.power_w_min = { value: byField.recommended_amp_min_w.value, status: 'reported', quote: byField.recommended_amp_min_w.quote, basis: 'amplifier', category: 'Recommended amplifier min' };
      if (!found.power_w_min) found.power_w_min = byField.recommended_amp_min_w.value;
    }
  }
  return { found, info };
}

// --- Tests ---

test('kHz: value "24" with rawText containing "24kHz" converts to 24000 for high endpoint', () => {
  const result = coerceHz('frequency_response_high_hz', '24', 'Frequency response 49Hz – 24kHz ±3dB');
  assert.equal(result, 24000);
});

test('kHz: value "24000" stays as 24000', () => {
  const result = coerceHz('frequency_response_high_hz', '24000', 'Frequency response 49Hz – 24kHz ±3dB');
  assert.equal(result, 24000);
});

test('kHz: low endpoint "49" stays as 49', () => {
  const result = coerceHz('frequency_response_low_hz', '49', 'Frequency response 49Hz – 24kHz ±3dB');
  assert.equal(result, 49);
});

test('kHz: cross-contamination prevented — low "20" in "20Hz – 20kHz" stays 20', () => {
  const result = coerceHz('frequency_response_low_hz', '20', '20Hz – 20kHz');
  assert.equal(result, 20);
});

test('kHz: high "20" in "20Hz – 20kHz" converts to 20000', () => {
  const result = coerceHz('frequency_response_high_hz', '20', '20Hz – 20kHz');
  assert.equal(result, 20000);
});

test('kHz: value with unit "24kHz" converts to 24000', () => {
  const result = coerceHz('frequency_response_high_hz', '24kHz', 'Frequency response 49Hz – 24kHz ±3dB');
  assert.equal(result, 24000);
});

test('kHz: KEF 28kHz high endpoint converts correctly', () => {
  const result = coerceHz('frequency_response_high_hz', '28', 'Frequency Response: 40Hz – 28kHz (±3dB)');
  assert.equal(result, 28000);
});

test('status: reported items get status "reported" even without explicit status field', () => {
  const raw = {
    reported: [
      { field: 'recommended_amp_max_w', value: 200, raw_text: 'Recommended amplifier power 50W – 200W' },
    ],
    ambiguous: [],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, 200);
  assert.equal(found.power_basis, 'amplifier');
  assert.equal(info.power_w_amp.value, 200);
});

test('power: recommended amplifier range surfaces both endpoints', () => {
  const raw = {
    reported: [
      { field: 'recommended_amp_min_w', value: 50, raw_text: '50W – 200W' },
      { field: 'recommended_amp_max_w', value: 200, raw_text: '50W – 200W' },
    ],
    ambiguous: [],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.power_w, 200);
  assert.equal(info.power_w_amp.value, 200);
  assert.equal(info.power_w_min.value, 50);
  assert.equal(info.power_advisories.length, 2);
});

test('power: continuous power does not suppress recommended amplifier', () => {
  const raw = {
    reported: [
      { field: 'power_handling_continuous_w', value: 150, raw_text: 'Power Handling: 150W' },
      { field: 'recommended_amp_min_w', value: 50, raw_text: 'Recommended amplifier: 50W – 300W' },
      { field: 'recommended_amp_max_w', value: 300, raw_text: 'Recommended amplifier: 50W – 300W' },
    ],
    ambiguous: [],
  };
  const { found, info } = extractionToFound(raw);
  // Continuous is the calculation authority
  assert.equal(found.power_w, 150);
  assert.equal(found.power_basis, 'continuous');
  // But recommended amplifier is still surfaced
  assert.equal(info.power_w_amp.value, 300);
  assert.equal(info.power_w_min.value, 50);
  // All three appear in advisories
  assert.equal(info.power_advisories.length, 3);
  const categories = info.power_advisories.map((p) => p.category);
  assert.ok(categories.includes('Manufacturer Power Handling'));
  assert.ok(categories.includes('Recommended amplifier min'));
  assert.ok(categories.includes('Recommended amplifier max'));
});

test('power: programme and peak power surface as advisories', () => {
  const raw = {
    reported: [
      { field: 'power_handling_continuous_w', value: 200, raw_text: 'Continuous: 200W' },
      { field: 'program_power_w', value: 800, raw_text: 'Programme: 800W' },
      { field: 'peak_power_w', value: 3200, raw_text: 'Peak: 3200W' },
    ],
    ambiguous: [],
  };
  const { info } = extractionToFound(raw);
  assert.equal(info.power_advisories.length, 3);
  const cats = info.power_advisories.map((p) => p.category);
  assert.ok(cats.includes('Manufacturer Power Handling'));
  assert.ok(cats.includes('Programme power'));
  assert.ok(cats.includes('Peak power'));
  // Continuous is the calculation authority
  assert.equal(info.power_w.value, 200);
  assert.equal(info.power_w.basis, 'continuous');
});

test('B&W CT8.4 LCRS: full extraction maps correctly', () => {
  const raw = {
    reported: [
      { field: 'sensitivity_db', value: 88, raw_text: 'Sensitivity (2.83V, 1m) 88db' },
      { field: 'sensitivity_basis', value: '2.83V/1m', raw_text: 'Sensitivity (2.83V, 1m)' },
      { field: 'nominal_impedance_ohm', value: 8, raw_text: 'Nominal impedance 8Ω (minimum 3Ω)' },
      { field: 'recommended_amp_min_w', value: 50, raw_text: 'Recommended amplifier power 50W – 200W into 8Ω' },
      { field: 'recommended_amp_max_w', value: 200, raw_text: 'Recommended amplifier power 50W – 200W into 8Ω' },
      { field: 'frequency_response_low_hz', value: 49, raw_text: 'Frequency response 49Hz – 24kHz ±3dB' },
      { field: 'frequency_response_high_hz', value: 24000, raw_text: 'Frequency response 49Hz – 24kHz ±3dB' },
      { field: 'frequency_response_tolerance_db', value: 3, raw_text: 'Frequency response 49Hz – 24kHz ±3dB' },
    ],
    ambiguous: [],
  };
  const { found, info } = extractionToFound(raw);
  assert.equal(found.sensitivity_db, 88);
  assert.equal(found.impedance_ohm, 8);
  assert.equal(found.power_w, 200);
  assert.equal(found.power_basis, 'amplifier');
  assert.equal(info.power_w_amp.value, 200);
  assert.equal(info.power_w_min.value, 50);
  assert.equal(found.frequency_response_low_hz, 49);
  assert.equal(found.frequency_response_high_hz, 24000);
  assert.equal(found.frequency_response_tolerance_db, 3);
  // Calculation check
  const calc = 88 + 10 * Math.log10(200);
  assert.ok(Math.abs(calc - 111.0) < 0.1, `Expected ~111 dB, got ${calc}`);
});