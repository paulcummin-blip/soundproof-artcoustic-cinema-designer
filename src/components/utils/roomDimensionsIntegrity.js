/**
 * roomDimensionsIntegrity.js
 * ---------------------------
 * Authority for detecting whether an established project has valid room
 * dimensions loaded from its saved Project record.
 *
 * Problem: hydrateProjectIntoAppState silently substitutes generic defaults
 * (4.5 × 6.0 × 2.4 m) when stored dimensions are missing, zero, or non-numeric.
 * An established project can then appear correctly configured while its RP22
 * calculations run on substituted defaults rather than real saved geometry.
 *
 * This module classifies the stored Project record's dimensions so the UI can
 * show a warning and RP22 publication can be blocked until the designer enters
 * and saves valid dimensions.
 *
 * A genuinely new, unconfigured project never reaches this check — it uses
 * AppStateProvider's default roomDims directly and no hydration occurs.
 */

export const ROOM_DIMS_INTEGRITY = Object.freeze({
  VALID: 'valid',
  MISSING: 'missing',
  INVALID: 'invalid',
});

const DIMENSION_FIELDS = ['width', 'length', 'height'];

function isValidDimension(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Extract the three dimension values from a stored Project record, checking
 * both the canonical roomDims JSON and the legacy flat fields.
 * Returns { width, length, height } where each is the raw stored value
 * (number, null, undefined, or unparseable).
 */
function extractStoredDimensions(storedProject) {
  if (!storedProject || typeof storedProject !== 'object') {
    return { width: null, length: null, height: null };
  }

  let w = null;
  let l = null;
  let h = null;

  const roomDims = storedProject.roomDims;
  if (roomDims != null) {
    let parsed = roomDims;
    if (typeof roomDims === 'string') {
      try { parsed = JSON.parse(roomDims); } catch { parsed = null; }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      w = parsed.widthM ?? parsed.width ?? null;
      l = parsed.lengthM ?? parsed.length ?? null;
      h = parsed.heightM ?? parsed.height ?? null;
    }
  }

  // Fall back to legacy flat fields only when the JSON did not supply a value
  if (w == null) w = storedProject.room_width ?? null;
  if (l == null) l = storedProject.room_length ?? null;
  if (h == null) h = storedProject.room_height ?? null;

  return { width: w, length: l, height: h };
}

/**
 * Resolve the integrity status for a stored Project record.
 *
 * Returns:
 *   { status: 'valid',   missingFields: [] }                      — all three dims present and positive
 *   { status: 'missing', missingFields: ['width', ...] }           — one or more dims absent/null/zero
 *   { status: 'invalid', missingFields: ['height', ...] }          — a dim is present but negative/non-numeric
 *
 * A record with no id (new/unsaved project) is treated as valid — defaults
 * are acceptable for genuinely new projects.
 */
export function resolveRoomDimsIntegrity(storedProject) {
  if (!storedProject || typeof storedProject !== 'object') {
    return { status: ROOM_DIMS_INTEGRITY.VALID, missingFields: [] };
  }

  // A record with no id has not been saved — defaults are fine for new projects.
  if (!storedProject.id) {
    return { status: ROOM_DIMS_INTEGRITY.VALID, missingFields: [] };
  }

  const { width, length, height } = extractStoredDimensions(storedProject);

  const missingFields = [];
  let hasInvalid = false;

  for (const field of DIMENSION_FIELDS) {
    const raw = field === 'width' ? width : field === 'length' ? length : height;
    if (raw == null || raw === '' || Number(raw) === 0 || !Number.isFinite(Number(raw))) {
      missingFields.push(field);
    } else if (Number(raw) < 0) {
      missingFields.push(field);
      hasInvalid = true;
    } else if (!isValidDimension(raw)) {
      missingFields.push(field);
      hasInvalid = true;
    }
  }

  if (missingFields.length === 0) {
    return { status: ROOM_DIMS_INTEGRITY.VALID, missingFields: [] };
  }

  return {
    status: hasInvalid ? ROOM_DIMS_INTEGRITY.INVALID : ROOM_DIMS_INTEGRITY.MISSING,
    missingFields,
  };
}

/**
 * Whether the integrity status blocks authoritative RP22 calculation and
 * publication. A valid or new-project status does not block.
 */
export function roomDimsIntegrityBlocksCalculation(integrity) {
  if (!integrity || typeof integrity !== 'object') return false;
  return integrity.status === ROOM_DIMS_INTEGRITY.MISSING
    || integrity.status === ROOM_DIMS_INTEGRITY.INVALID;
}

/**
 * Human-readable summary for the warning banner.
 */
export function roomDimsIntegrityMessage(integrity) {
  if (!roomDimsIntegrityBlocksCalculation(integrity)) return null;
  const fields = (integrity?.missingFields || []).map(capitaliseField);
  if (fields.length === 0) return null;
  const prefix = integrity.status === ROOM_DIMS_INTEGRITY.INVALID
    ? 'Room dimensions are invalid'
    : 'Room dimensions missing';
  return `${prefix}: ${fields.join(', ')}. Enter the correct dimensions before running RP22 calculations.`;
}

function capitaliseField(field) {
  switch (field) {
    case 'width': return 'Width';
    case 'length': return 'Length';
    case 'height': return 'Height';
    default: return field;
  }
}