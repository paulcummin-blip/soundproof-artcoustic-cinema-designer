// Test-only migration of a synthetic evidence copy. Never imported by app flows.
// Historical captured records remain unchanged; these fixtures isolate seat logic
// from the newer parameter-provenance contract.
export default function completeEvidenceFixture(evidence) {
  const copy = structuredClone(evidence);
  const engineering = copy.identity.source_fingerprint;
  const bass = copy.identity.bass_fingerprint || 'test:seating:bass-authority';
  copy.identity.bass_fingerprint = bass;
  copy.parameters = Object.entries(copy.parameter_index).map(([key, row]) => ({
    ...row, key, scope: key === 'P10' ? 'project' : row.scope || 'room',
    authority_fingerprint: ['P14', 'P18', 'P19', 'P20'].includes(key) ? bass : engineering,
    authority_timestamp: '2026-10-05T19:10:44.000Z',
    source_type: ['P14', 'P18', 'P19', 'P20'].includes(key)
      ? 'durable-current-bass-authority' : 'durable-engineering-publication',
    authority_value: row.value, authority_level: row.level,
  }));
  copy.parameter_index = Object.fromEntries(copy.parameters.map(row => [row.key, row]));
  copy.bass = { ...copy.bass, p14: { ...copy.bass?.p14,
    raw_value: copy.parameter_index.P14.raw_value,
    achieved_level: copy.parameter_index.P14.level,
  } };
  return copy;
}