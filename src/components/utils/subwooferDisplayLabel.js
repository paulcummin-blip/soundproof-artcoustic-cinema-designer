// Display-name boundary for subwoofer models.
// Internal state keeps the canonical lowercase model key (e.g. "sub2-12").
// All user-facing copy renders the canonical uppercase label (e.g. "SUB2-12").
//
// These helpers are the single source of truth for key<->label conversion at
// the presentation boundary. They tolerate either case on input so legacy
// persisted values (uppercase or lowercase) render correctly without migration.

import { normaliseModelKey, getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Canonical lowercase internal key. Returns "" for empty/unknown input.
export function subwooferModelKey(model) {
  if (!model) return "";
  return normaliseModelKey(model);
}

// Canonical uppercase display label for user-facing copy.
// Falls back to the raw value uppercased when the model is not in the registry.
export function subwooferDisplayLabel(model) {
  if (!model) return "";
  const meta = getSpeakerModelMeta(model);
  if (meta && !meta.notFound && meta.label) return meta.label;
  return String(model).trim().toUpperCase();
}