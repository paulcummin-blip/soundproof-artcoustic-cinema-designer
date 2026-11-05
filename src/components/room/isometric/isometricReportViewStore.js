// isometricReportViewStore.js
// ---------------------------------------------------------------------------
// Presentation-only persistence for the Isometric View's saved report framing.
//
// Stores ONLY:
//   - camera target (x, y, z)
//   - camera orientation (orbit angles)
//   - zoom / framing (orthographic zoom factor)
//   - presentation visibility settings (clean view, heads, rsp marker)
//   - schema/version marker
//
// Scoped to (projectId, versionId). It NEVER stores physical geometry, speakers,
// subwoofers, seats, screen or room dimensions. Saving a report view does NOT
// trigger the project design save, bass recalculation or RP22 recalculation.
//
// In-memory store + localStorage mirror, so a saved framing survives a page
// reload / project reopen. Pure: no React import — the React binding hook lives
// in useSavedReportView.js.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "b44_isometric_report_view_v1";
const SCHEMA_VERSION = 1;

const listeners = new Set();
const cache = new Map();

function storageKey(projectId, versionId) {
  return `${STORAGE_PREFIX}::${projectId || "_"}::${versionId || "_"}`;
}

function readFromStorage(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number(parsed?.schemaVersion) !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be unavailable (private mode) — in-memory cache still works
  }
}

function emit() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener error is non-fatal */ }
  });
}

export function getSavedReportView(projectId, versionId) {
  const key = storageKey(projectId, versionId);
  if (cache.has(key)) return cache.get(key) || null;
  const fromStorage = readFromStorage(key);
  cache.set(key, fromStorage);
  return fromStorage;
}

export function saveReportView(projectId, versionId, framing) {
  const key = storageKey(projectId, versionId);
  const record = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    camera: {
      targetX: Number(framing?.camera?.targetX) || 0,
      targetY: Number(framing?.camera?.targetY) || 0,
      targetZ: Number(framing?.camera?.targetZ) || 0,
      azimuthDeg: Number(framing?.camera?.azimuthDeg) || 0,
      polarDeg: Number(framing?.camera?.polarDeg) || 0,
      zoom: Number(framing?.camera?.zoom) || 1,
    },
    visibility: {
      cleanView: !!framing?.visibility?.cleanView,
      showHeads: framing?.visibility?.showHeads !== false,
      showRspMarker: framing?.visibility?.showRspMarker !== false,
    },
  };
  cache.set(key, record);
  writeToStorage(key, record);
  emit();
  return record;
}

export function clearSavedReportView(projectId, versionId) {
  const key = storageKey(projectId, versionId);
  cache.set(key, null);
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(key); } catch { /* non-fatal */ }
  }
  emit();
}

export function subscribeReportView(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// getReportFraming — the single deterministic report-framing authority.
//
// Returns the saved report view record for (projectId, versionId) if one
// exists, otherwise null. Null means "use the Reset View default framing"
// (the IsometricView resolves it from the current room dimensions via the
// same applyFraming path the drawing uses on mount).
//
// The live exploratory camera position is NEVER the report framing: the
// store only ever receives a record from an explicit Save to Report, so a
// dealer who explores without saving gets the Reset View default, not their
// temporary angle. This is the one deterministic rule every report consumer
// reads through.
export function getReportFraming(projectId, versionId) {
  return getSavedReportView(projectId, versionId);
}