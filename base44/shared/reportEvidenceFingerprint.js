const canonicalise = value => {
  if (value == null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export function evidenceFingerprint(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const { identity = {}, room, screen, seating, system, parameters, seat_scopes, bass } = evidence;
  const text = canonicalise({identity: {project_id: identity.project_id, version_id: identity.version_id,
    report_type: identity.report_type, source_fingerprint: identity.source_fingerprint,
    bass_fingerprint: identity.bass_fingerprint, seating_fingerprint: identity.seating_fingerprint},
    room, screen, seating, system, parameters, seat_scopes, bass});
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `re1-${hash.toString(16).padStart(8, '0')}-${text.length.toString(16)}`;
}