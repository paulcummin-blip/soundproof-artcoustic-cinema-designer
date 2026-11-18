// Keep lifecycle transitions observable when browser storage is full or blocked.
// Memory takes precedence only for keys written by this page session.
export function createIntentStorage(getStorage) {
  const memory = new Map();
  return {
    get(key) {
      if (memory.has(key)) return memory.get(key);
      try { return getStorage().getItem(key); } catch { return null; }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        if (value === null) getStorage().removeItem(key);
        else getStorage().setItem(key, value);
      } catch { /* The session still has the status and recovery reason. */ }
    },
  };
}
