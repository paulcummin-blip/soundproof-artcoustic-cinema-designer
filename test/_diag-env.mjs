// Temporary diagnostic environment stub: several app modules read `window` at
// import time. Imported first so it runs before any of them.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { href: 'http://localhost/', search: '', pathname: '/', origin: 'http://localhost', hash: '' },
    history: { replaceState: () => {}, pushState: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    print: () => {},
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    body: { classList: { add: () => {}, remove: () => {} } },
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    fonts: { ready: Promise.resolve() },
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = globalThis.window.localStorage;
}
export default true;