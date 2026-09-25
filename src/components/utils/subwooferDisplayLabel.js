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

// User-facing system label for the configured subwoofer system.
// Handles front-only, rear-only, both-same-model, and mixed-model cases
// without showing empty sides (e.g. never "×0 + SUB2-12 ×2").
export function formatSubwooferSystemLabel(frontModel, frontCount, rearModel, rearCount) {
  const hasFront = Number(frontCount) > 0 && frontModel;
  const hasRear = Number(rearCount) > 0 && rearModel;

  if (!hasFront && !hasRear) return "";

  const frontLabel = hasFront ? subwooferDisplayLabel(frontModel) : "";
  const rearLabel = hasRear ? subwooferDisplayLabel(rearModel) : "";

  // Both sides, same model — show total count
  if (hasFront && hasRear && frontModel === rearModel) {
    return `${frontLabel} ×${frontCount + rearCount}`;
  }

  // Both sides, different models
  if (hasFront && hasRear) {
    return `${frontLabel} ×${frontCount} + ${rearLabel} ×${rearCount}`;
  }

  // Front only
  if (hasFront) {
    return `${frontLabel} ×${frontCount}`;
  }

  // Rear only — prefix with "Rear" so the designer knows which side
  return `Rear ${rearLabel} ×${rearCount}`;
}