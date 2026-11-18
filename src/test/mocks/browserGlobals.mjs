// Minimal browser globals polyfill for mounting React hooks in Node.
// useProjectLoader reads window.location.search, window.localStorage,
// window.__B44_LOGS and expects setTimeout/clearTimeout.
import { useEffect } from 'react';

export function installBrowserGlobals() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  const window = {
    location: {
      search: '?projectId=proj-mount-test',
      href: 'http://localhost/?projectId=proj-mount-test',
      pathname: '/RoomDesigner',
    },
    localStorage,
    __B44_LOGS: false,
    __ROOM_DESIGNER_PRICE__: null,
    __ROOM_DESIGNER_ASDR__: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = window;
  globalThis.localStorage = localStorage;
  globalThis.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    head: { appendChild: () => {}, removeChild: () => {} },
  };
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  }
}