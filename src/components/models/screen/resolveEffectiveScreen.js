// Single authority for resolving effective screen dimensions.
// When manualSize.enabled is ON and manual width/height are valid,
// manual dimensions become the authoritative screen dimensions everywhere downstream.

/**
 * Compute physical dimensions from a manualSize config object.
 * Supports "diagonal" mode (diagonal inches + aspect) and "wh" mode (width × height in metres).
 * Returns { widthM, heightM, widthInches, aspectRatio } or null when invalid.
 */
export function computeManualDimensions(manualSize) {
  if (!manualSize || manualSize.enabled !== true) return null;

  if (manualSize.mode === "diagonal") {
    const diagonal = Number(manualSize.diagonalInches);
    if (!Number.isFinite(diagonal) || diagonal <= 0) return null;

    let aspectW, aspectH;
    if (manualSize.aspect === "Custom") {
      aspectW = Number(manualSize.customAspectW) || 16;
      aspectH = Number(manualSize.customAspectH) || 9;
    } else if (typeof manualSize.aspect === "string" && manualSize.aspect.includes(":")) {
      const parts = manualSize.aspect.split(":");
      aspectW = Number(parts[0]) || 16;
      aspectH = Number(parts[1]) || 9;
    } else {
      aspectW = 16;
      aspectH = 9;
    }

    const ratio = aspectW / aspectH;
    const widthInches = diagonal * (aspectW / Math.sqrt(aspectW ** 2 + aspectH ** 2));
    const heightInches = widthInches / ratio;
    const widthM = widthInches * 0.0254;
    const heightM = heightInches * 0.0254;

    return { widthM, heightM, widthInches, aspectRatio: `${aspectW}:${aspectH}` };
  }

  // "wh" mode — width × height in metres are authoritative
  const widthM = Number(manualSize.widthM);
  const heightM = Number(manualSize.heightM);
  if (!Number.isFinite(widthM) || widthM <= 0) return null;
  if (!Number.isFinite(heightM) || heightM <= 0) return null;

  const widthInches = widthM / 0.0254;
  // Express the actual entered ratio as a "W:H" string so downstream
  // consumers that derive height from width / ratio get the correct value.
  const ratio = widthM / heightM;
  const aspectRatio = `${ratio.toFixed(2)}:1`;

  return { widthM, heightM, widthInches, aspectRatio };
}

/**
 * Returns true when manual override is active and produces valid dimensions.
 */
export function isManualOverrideActive(screen) {
  if (!screen?.manualSize?.enabled) return false;
  return computeManualDimensions(screen.manualSize) != null;
}

/**
 * Resolve the effective visible width in inches, accounting for manual override.
 * Checks manualSize FIRST, then TV preset, then visibleWidthInches.
 */
/** Preset key → viewable width in inches. One map, so a preset a design states
 * resolves to the same width wherever that design is read. */
export const TV_PRESET_KEY_TO_INCHES = Object.freeze({
  tv65: 55.55,
  tv77: 67.36,
  tv83: 72.52,
  tv100: 87.80,
});

/** The aspect a screen is read with when the design itself states none. */
const DEFAULT_SCREEN_ASPECT = "16:9";

export function resolveEffectiveVisibleWidthInches(screen) {
  if (!screen) return 100;

  const manual = computeManualDimensions(screen.manualSize);
  if (manual) return manual.widthInches;

  if (screen.tvPresetKey && TV_PRESET_KEY_TO_INCHES[screen.tvPresetKey]) {
    return TV_PRESET_KEY_TO_INCHES[screen.tvPresetKey];
  }
  const tvMm = Number(screen.tvWidthMm);
  if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;

  const visible = Number(screen.visibleWidthInches);
  return Number.isFinite(visible) && visible > 0 ? visible : 100;
}

/**
 * Resolve effective viewable dimensions in metres, accounting for manual override.
 * Returns { widthM, heightM }.
 */
export function resolveEffectiveViewableDimsM(screen) {
  if (!screen) return { widthM: 2.54, heightM: 1.43 };

  const manual = computeManualDimensions(screen.manualSize);
  if (manual) return { widthM: manual.widthM, heightM: manual.heightM };

  const widthInches = resolveEffectiveVisibleWidthInches({ ...screen, manualSize: undefined });
  const widthM = widthInches * 0.0254;
  const arStr = String(screen.aspectRatio || "16:9");
  let ratio = 16 / 9;
  if (arStr.includes(":")) {
    const [aw, ah] = arStr.split(":").map(Number);
    if (Number.isFinite(aw) && Number.isFinite(ah) && aw > 0 && ah > 0) ratio = aw / ah;
  }
  return { widthM, heightM: widthM / ratio };
}

/**
 * Apply manual override to a screen config object.
 * When manualSize is enabled and valid, writes effective visibleWidthInches,
 * aspectRatio, viewableWidthM, viewableHeightM into the object while
 * preserving the original preset values in backup fields.
 * When manual is disabled, restores from backup fields and clears them.
 *
 * @param {object} prev - previous screen state (for backup source)
 * @param {object} next - new screen state from the caller
 * @returns {object} - screen with effective dimensions applied
 */
export function applyManualOverrideToScreen(prev, next) {
  if (!next || typeof next !== "object") return next;

  const manual = computeManualDimensions(next.manualSize);
  const prevManualActive = isManualOverrideActive(prev);
  const nextManualActive = manual != null;

  // The persisted manual fields are DERIVED from the one authority — manualSize —
  // on every screen write, so the saved configuration can never disagree with the
  // toggle, the dropdown, the drawing or the geometry. Without this, an unrelated
  // screen write persisted "not manual" and the override was lost on reload.
  // manualMode mirrors the toggle itself; the dimensions appear only when the
  // override is valid, so an enabled-but-empty override still falls back to the
  // automatic width instead of sizing the screen from nothing.
  const manualFields = {
    manualMode: next.manualSize?.enabled === true,
    manualWidthM: manual ? manual.widthM : 0,
    manualHeightM: manual ? manual.heightM : 0,
  };

  if (nextManualActive) {
    // Backup preset values from the cleanest available source.
    // If backup already exists on next, keep it; otherwise take from prev
    // (but only if prev was NOT under manual override — otherwise prev.visibleWidthInches
    // is already the effective value, not the preset).
    const hasBackup = next.presetVisibleWidthInches != null;
    const backupFromPreset = !prevManualActive;
    const backup = hasBackup ? {
      presetVisibleWidthInches: next.presetVisibleWidthInches,
      presetAspectRatio: next.presetAspectRatio,
      presetTvPresetKey: next.presetTvPresetKey,
      presetTvWidthMm: next.presetTvWidthMm,
    } : {
      presetVisibleWidthInches: backupFromPreset ? (prev?.visibleWidthInches ?? 100) : (prev?.presetVisibleWidthInches ?? next.visibleWidthInches ?? 100),
      presetAspectRatio: backupFromPreset ? (prev?.aspectRatio ?? "16:9") : (prev?.presetAspectRatio ?? next.aspectRatio ?? "16:9"),
      presetTvPresetKey: backupFromPreset ? (prev?.tvPresetKey ?? null) : (prev?.presetTvPresetKey ?? null),
      presetTvWidthMm: backupFromPreset ? (prev?.tvWidthMm ?? null) : (prev?.presetTvWidthMm ?? null),
    };

    return {
      ...next,
      ...backup,
      ...manualFields,
      visibleWidthInches: manual.widthInches,
      aspectRatio: manual.aspectRatio,
      viewableWidthM: manual.widthM,
      viewableHeightM: manual.heightM,
    };
  }

  // Manual not active — restore preset if we were previously overriding
  if (prevManualActive || next.presetVisibleWidthInches != null) {
    const restore = {};
    if (next.presetVisibleWidthInches != null) restore.visibleWidthInches = next.presetVisibleWidthInches;
    if (next.presetAspectRatio != null) restore.aspectRatio = next.presetAspectRatio;
    if (next.presetTvPresetKey !== undefined) restore.tvPresetKey = next.presetTvPresetKey;
    if (next.presetTvWidthMm !== undefined) restore.tvWidthMm = next.presetTvWidthMm;

    return {
      ...next,
      ...restore,
      ...manualFields,
      viewableWidthM: undefined,
      viewableHeightM: undefined,
      presetVisibleWidthInches: undefined,
      presetAspectRatio: undefined,
      presetTvPresetKey: undefined,
      presetTvWidthMm: undefined,
    };
  }

  return { ...next, ...manualFields };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Inactive-branch authority
 *
 * A screen carries both display branches at once: the active one, and the
 * INACTIVE backup kept so the other mode can be restored (the preset width kept
 * while a manual override is on, the manual geometry kept while a preset is
 * active). Only the ACTIVE branch is design authority. The helpers below state
 * the inactive branch canonically, so a save/load round trip — or any later
 * write into that backup — can never change the design's engineering identity.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * The canonical UNSET preset: the geometry the screen authority resolves when a
 * design states no preset at all. It is the authority for the inactive preset
 * branch of a manual display, exactly as it is for a design with no override.
 */
export function resolveCanonicalUnsetPreset() {
  return {
    visibleWidthInches: resolveEffectiveVisibleWidthInches({
      manualSize: undefined,
      tvPresetKey: null,
      tvWidthMm: null,
      visibleWidthInches: null,
    }),
    aspectRatio: DEFAULT_SCREEN_ASPECT,
    tvPresetKey: null,
    tvWidthMm: null,
  };
}

/**
 * The preset geometry a manual-active screen must back up: the preset the design
 * actually states (its preset key or its width in millimetres), otherwise the
 * canonical unset preset.
 *
 * The effective manual width is NEVER a preset backup. Writing it there is what
 * turned an inactive UI field into an engineering input: the effective manual
 * width was saved as `screen_size`, restored into the inactive preset backup, and
 * hashed into the engineering fingerprint.
 *
 * @param {object} screen - a screen config (live state or persisted fields)
 * @returns {{visibleWidthInches:number, aspectRatio:string, tvPresetKey:string|null, tvWidthMm:number|null}}
 */
export function resolvePresetBackupGeometry(screen = {}) {
  const unset = resolveCanonicalUnsetPreset();
  const tvWidthMm = Number(screen?.tvWidthMm);
  const hasWidthMm = Number.isFinite(tvWidthMm) && tvWidthMm > 0;
  const tvPresetKey = typeof screen?.tvPresetKey === "string" && screen.tvPresetKey ? screen.tvPresetKey : null;
  const presetInches = tvPresetKey && TV_PRESET_KEY_TO_INCHES[tvPresetKey]
    ? TV_PRESET_KEY_TO_INCHES[tvPresetKey]
    : (hasWidthMm ? tvWidthMm / 25.4 : null);

  if (presetInches == null) return unset;

  return {
    visibleWidthInches: presetInches,
    aspectRatio: typeof screen?.aspectRatio === "string" && screen.aspectRatio
      ? screen.aspectRatio
      : unset.aspectRatio,
    tvPresetKey,
    tvWidthMm: hasWidthMm ? tvWidthMm : null,
  };
}

/**
 * Replace only values of keys the screen already carries, so a canonical state
 * never introduces a key the live state did not have.
 */
function withCanonicalValues(screen, canonical) {
  const facts = { ...screen };
  for (const [key, value] of Object.entries(canonical)) {
    if (key in facts) facts[key] = value;
  }
  return facts;
}

/**
 * The screen facts an engineering identity may hash: the ACTIVE display branch as
 * the design states it, with the INACTIVE branch stated canonically.
 *
 *   manual override active  → the manual geometry and its display type are the
 *                             authority; the preset backup is canonical.
 *   preset/automatic active → the preset geometry is the authority; the manual
 *                             backup keeps only its display-type authority, never
 *                             its geometry.
 *
 * Inactive UI state is therefore fingerprint-inert in both directions.
 */
export function screenEngineeringFacts(screen) {
  if (!screen || typeof screen !== "object") return screen ?? null;

  if (isManualOverrideActive(screen)) {
    const preset = resolvePresetBackupGeometry(screen);
    return withCanonicalValues(screen, {
      presetVisibleWidthInches: preset.visibleWidthInches,
      presetAspectRatio: preset.aspectRatio,
      presetTvPresetKey: preset.tvPresetKey,
      presetTvWidthMm: preset.tvWidthMm,
    });
  }

  const manualSize = screen.manualSize;
  return withCanonicalValues(screen, {
    manualMode: false,
    manualWidthM: 0,
    manualHeightM: 0,
    // The display type is authority that belongs to the screen, not to the
    // inactive geometry, so it survives; the inactive geometry does not.
    manualSize: manualSize && typeof manualSize === "object"
      ? { displayType: manualSize.displayType ?? null }
      : manualSize ?? null,
  });
}