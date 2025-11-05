// components/utils/consolePolyfill.js
// Ensures console methods exist and are bound; avoids crashes where console.debug is undefined.

export function installConsolePolyfill() {
  if (typeof window === 'undefined') return;
  
  const c = (window.console = window.console || {});
  const fallback = c.log ? c.log.bind(c) : () => {};
  
  ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    if (typeof c[method] !== 'function') {
      c[method] = fallback;
    } else {
      c[method] = c[method].bind(c); // bind to preserve `this`
    }
  });
}

// Safe debug logger that works even if polyfill fails
export const debug = (...args) => {
  try {
    (console.debug || console.log || (() => {}))(...args);
  } catch (e) {
    // Silently fail if even console.log is unavailable
  }
};