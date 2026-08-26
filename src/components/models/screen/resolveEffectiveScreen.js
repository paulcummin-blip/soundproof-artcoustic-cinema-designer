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
export function resolveEffectiveVisibleWidthInches(screen) {
  if (!screen) return 100;

  const manual = computeManualDimensions(screen.manualSize);
  if (manual) return manual.widthInches;

  const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
  if (screen.tvPresetKey && TV_KEY_TO_INCHES[screen.tvPresetKey]) {
    return TV_KEY_TO_INCHES[screen.tvPresetKey];
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
      viewableWidthM: undefined,
      viewableHeightM: undefined,
      presetVisibleWidthInches: undefined,
      presetAspectRatio: undefined,
      presetTvPresetKey: undefined,
      presetTvWidthMm: undefined,
    };
  }

  return next;
}