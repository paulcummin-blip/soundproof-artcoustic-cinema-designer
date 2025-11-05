/**
 * Thin adapter for Base44 Entity SDK.
 * If window.Base44?.entities exists, we use it.
 * Otherwise, we fallback to localStorage so the UI can be smoke-tested immediately.
 *
 * Entity: "rooms"
 * Shape: { id, name, width, length, height, seats, isDraft, notes }
 */

const ENTITY_KEY = "rooms";
const FALLBACK_STORAGE_KEY = "b44.rooms";

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function hasSDK() {
  try {
    return Boolean(window?.Base44?.entities?.list && window?.Base44?.entities?.get);
  } catch {
    return false;
  }
}

// ---------- Fallback (localStorage) ----------
function readFallbackAll() {
  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFallbackAll(arr) {
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(arr));
}

function uid() {
  return `room_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------- Public API ----------
export async function listRooms() {
  if (hasSDK()) {
    // SDK path — assumed API (adjust if your SDK differs)
    const out = await window.Base44.entities.list(ENTITY_KEY);
    return Array.isArray(out) ? out : [];
  }
  // Fallback
  await delay(120);
  return readFallbackAll();
}

export async function getRoom(id) {
  if (hasSDK()) {
    return window.Base44.entities.get(ENTITY_KEY, id);
  }
  await delay(80);
  return readFallbackAll().find((r) => r.id === id) || null;
}

export async function createRoom(payload) {
  if (hasSDK()) {
    const created = await window.Base44.entities.create(ENTITY_KEY, payload);
    return created?.id;
  }
  await delay(120);
  const all = readFallbackAll();
  const id = uid();
  all.push({ id, ...payload });
  writeFallbackAll(all);
  return id;
}

export async function updateRoom(id, payload) {
  if (hasSDK()) {
    await window.Base44.entities.update(ENTITY_KEY, id, payload);
    return;
  }
  await delay(120);
  const all = readFallbackAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...payload, id };
    writeFallbackAll(all);
  }
}

export async function deleteRoom(id) {
  if (hasSDK()) {
    await window.Base44.entities.delete(ENTITY_KEY, id);
    return;
  }
  await delay(120);
  const all = readFallbackAll().filter((r) => r.id !== id);
  writeFallbackAll(all);
}