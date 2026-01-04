// components/utils/sessionAutosave.js
const KEY = "b44_roomdesigner_autosave_v1";

export function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return safeJsonParse(raw);
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function saveAutosave(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  } catch {}
}

export function getAutosaveMeta() {
  const data = loadAutosave();
  if (!data || !data.savedAt) return null;
  return { savedAt: data.savedAt };
}

// very light validity guard so we don't store junk
export function isAutosavePayloadValid(p) {
  if (!p || typeof p !== "object") return false;

  const dims = p.dimensions || p.roomDims || null;
  const w = Number(dims?.width || dims?.widthM);
  const l = Number(dims?.length || dims?.lengthM);
  const h = Number(dims?.height || dims?.heightM);

  const hasDims = Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h) && w > 0 && l > 0 && h > 0;

  const seats = Array.isArray(p.seatingPositions) ? p.seatingPositions : [];
  const speakers = Array.isArray(p.speakerSystem?.placedSpeakers) ? p.speakerSystem.placedSpeakers : [];
  const subsFront = Array.isArray(p.frontSubsCfg?.positions) ? p.frontSubsCfg.positions : [];
  const subsRear = Array.isArray(p.rearSubsCfg?.positions) ? p.rearSubsCfg.positions : [];

  const hasAnyContent = seats.length > 0 || speakers.length > 0 || subsFront.length > 0 || subsRear.length > 0;

  return hasDims && hasAnyContent;
}