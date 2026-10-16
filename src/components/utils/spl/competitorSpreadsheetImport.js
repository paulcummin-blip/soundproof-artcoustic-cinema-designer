import { competitorIdentityKey } from './manufacturerIdentity.js';

// Excel is a repeatable update, not a replacement of the whole library.
export function planCompetitorImport(preview, existing) {
  const seen = new Set();
  return preview.map(({ record, rowNumber }) => {
    if (!record.manufacturer || !record.model) throw new Error(`Row ${rowNumber}: manufacturer and model are required.`);
    if (String(record.manufacturer).trim().toLowerCase() === 'artcoustic') throw new Error('Artcoustic uses the shared Sound Proof registry and cannot be replaced by this import.');
    const key = competitorIdentityKey(record);
    if (seen.has(key)) throw new Error(`Duplicate model in Excel: ${record.manufacturer} ${record.model}`);
    seen.add(key);
    const matches = existing.filter(r => competitorIdentityKey(r) === key);
    if (matches.length > 1) throw new Error(`Multiple stored records match ${record.manufacturer} ${record.model}; resolve them before importing.`);
    return { record, rowNumber, existingId: matches[0]?.id || null, action: matches.length ? 'Update' : 'Add' };
  });
}

export async function applyCompetitorImport(plan, entity, batch) {
  const result = { added: 0, updated: 0 };
  for (const item of plan) {
    const values = {
      ...item.record, import_batch: batch, publish_source: 'spreadsheet',
      published: true, published_at: batch, active: true,
      source_product_id: null, source_specification_id: null, approval_status: null,
      source_confidence: null, source_evidence_quality: null, spec_version_label: null,
      secondary_evidence: null, evidence_source: 'official',
    };
    if (item.existingId) { await entity.update(item.existingId, values); result.updated++; }
    else { await entity.create(values); result.added++; }
  }
  return result;
}

// Explicitly imported sheets are visible; untouched legacy rows remain excluded.
export function selectComparisonLibraryRows(rows) {
  const byKey = new Map();
  const priority = r => r.publish_source === 'spreadsheet' ? 1 : 0;
  for (const row of rows) {
    if (row.active === false || row.published !== true ||
        !['spreadsheet', 'speaker_database'].includes(row.publish_source)) continue;
    const key = competitorIdentityKey(row);
    const old = byKey.get(key);
    if (!old || priority(row) > priority(old) ||
      (priority(row) === priority(old) && String(row.published_at || '') > String(old.published_at || ''))) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export function comparisonDataQuality(record, assumptions = []) {
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
  const source = Boolean(record.source_url || record.datasheet_url);
  const knownBasis = /^(1W|2\.83V)\/1m$/i.test(String(record.sensitivity_reference || ''));
  const hasSensitivity = positive(record.sensitivity_value_db) && knownBasis &&
    (String(record.sensitivity_reference).toLowerCase() === '1w/1m' || positive(record.sensitivity_impedance_used_ohm ?? record.rated_impedance_ohm));
  const ratedPower = positive(record.continuous_power_w) && !/peak|program|recommended/i.test(record.power_rating_type || '');
  const measuredCap = positive(record.published_max_continuous_spl_db_1m);
  const good = record.p12_p13_eligible === true && source && hasSensitivity &&
    (ratedPower || measuredCap) && assumptions.length === 0 &&
    record.data_confidence !== 'C' && !record.secondary_evidence;
  return good ? 'Good Data' : 'Limited Data';
}
