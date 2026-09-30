// Field-level source authority — the `field_authority` map on SpeakerSpecification.
//
// Entries are written in two shapes and every reader MUST normalise through here:
//   "Official PDF"                        — legacy / plain source string
//   { source: "Official PDF", note: "…" } — Add Speaker review step (source + note)
//
// Rendering the raw entry as a React child throws
// "Objects are not valid as a React child (found: object with keys {source, note})",
// so the map is never read directly at a render site.

export function resolveFieldAuthority(fieldAuthority, fieldKey) {
  const entry = fieldAuthority?.[fieldKey];
  if (entry == null) return { source: "", note: "" };
  if (typeof entry === "string") return { source: entry, note: "" };
  return { source: entry.source || "", note: entry.note || "" };
}

// Change a field's source authority while preserving any note already recorded
// for that field (so editing the source cannot silently discard a reviewer note).
export function setFieldAuthoritySource(fieldAuthority, fieldKey, source) {
  const next = { ...(fieldAuthority || {}) };
  const existing = resolveFieldAuthority(fieldAuthority, fieldKey);
  if (!source && !existing.note) {
    delete next[fieldKey];
    return next;
  }
  next[fieldKey] = existing.note ? { source: source || "", note: existing.note } : source;
  return next;
}