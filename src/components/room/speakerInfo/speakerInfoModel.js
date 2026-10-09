/**
 * Speaker information shown on hover or tap in the Room Designer drawings
 * (Front Elevation, Side Elevations, Plan View).
 *
 * Pure presentation. The drawings hand in the values they already hold — the
 * speaker's stored acoustic centre height and its catalogue cabinet size — and
 * this module only formats them. It never measures the drawn icon, so what the
 * tooltip reports is always the stored value, never a scaled drawing estimate.
 */
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const toCm = (metres) => {
  const v = Number(metres);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
};

const isUnset = (model) => !model || model === "off" || model === "none";

/** Friendly product name for a model key (falls back to the key itself). */
export function speakerModelLabel(model) {
  if (isUnset(model)) return null;
  const meta = getSpeakerModelMeta(model);
  if (meta?.label) return String(meta.label);
  return String(model);
}

/**
 * Catalogue cabinet size for a model, resolved for the given orientation or TV
 * preset by the existing registry — the same authority the drawings position by.
 */
export function speakerCabinetDimsM(model, orientationOrPreset = null) {
  if (isUnset(model)) return { widthM: null, heightM: null };
  const meta = getSpeakerModelMeta(model, orientationOrPreset) || {};
  if (meta.notFound) return { widthM: null, heightM: null };
  const widthM = Number(meta.widthM) > 0 ? Number(meta.widthM) : null;
  const heightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : null;
  return { widthM, heightM };
}

/** Stored orientation as a readable word. Unknown stays absent — never guessed. */
export function orientationLabel(orientation) {
  const v = String(orientation || "").toLowerCase();
  if (v === "vertical") return "Vertical";
  if (v === "horizontal") return "Horizontal";
  return null;
}

/** "FCL — C-1" */
export function speakerInfoTitle(role, model) {
  const r = String(role || "").trim().toUpperCase();
  const label = speakerModelLabel(model);
  if (r && label && r !== label) return `${r} — ${label}`;
  return r || label || "Speaker";
}

/**
 * The tooltip body.
 *
 * Height is the stored acoustic centre height (position.z — metres above
 * finished floor) and is labelled for exactly what it is.
 */
export function buildSpeakerInfoLines({
  acousticCentreZ_m,
  cabinetWidth_m,
  cabinetHeight_m,
  orientation,
  extras = [],
}) {
  const lines = [];
  const centreCm = toCm(acousticCentreZ_m);
  if (centreCm !== null) lines.push(`Acoustic centre height: ${centreCm} cm`);
  const wCm = toCm(cabinetWidth_m);
  const hCm = toCm(cabinetHeight_m);
  if (wCm !== null && hCm !== null) lines.push(`Cabinet: ${wCm} × ${hCm} cm`);
  const o = orientationLabel(orientation);
  if (o) lines.push(`Orientation: ${o}`);
  return [...lines, ...extras.filter(Boolean)];
}

/**
 * Full info model for one speaker.
 * Drawn dimensions (already orientation-aware in the elevations) win when
 * supplied; otherwise the catalogue is read for the model.
 */
export function buildSpeakerInfo({
  role,
  model,
  acousticCentreZ_m,
  cabinetWidth_m,
  cabinetHeight_m,
  orientation = null,
  orientationOrPreset = null,
  extras = [],
}) {
  const drawn = Number(cabinetWidth_m) > 0 && Number(cabinetHeight_m) > 0;
  const dims = drawn
    ? { widthM: Number(cabinetWidth_m), heightM: Number(cabinetHeight_m) }
    : speakerCabinetDimsM(model, orientationOrPreset);
  return {
    title: speakerInfoTitle(role, model),
    lines: buildSpeakerInfoLines({
      acousticCentreZ_m,
      cabinetWidth_m: dims.widthM,
      cabinetHeight_m: dims.heightM,
      orientation,
      extras,
    }),
  };
}