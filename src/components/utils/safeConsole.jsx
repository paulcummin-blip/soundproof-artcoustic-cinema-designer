// components/utils/safeConsole.js
const getConsole = () => (typeof window !== "undefined" ? window.console : undefined) || {};

const bindOr = (c, key, fallback) =>
  typeof c[key] === "function" ? c[key].bind(c) : fallback;

const noop = () => {};
const fallbackLog = (...a) => { /* last-resort sink */ };

const c = getConsole();

export const safeConsole = {
  log:   bindOr(c, "log",   fallbackLog),
  warn:  bindOr(c, "warn",  fallbackLog),
  error: bindOr(c, "error", fallbackLog),
  table: bindOr(c, "table", (...a) => bindOr(c, "log", fallbackLog)(...a)),
  group: bindOr(c, "groupCollapsed", (...a) => bindOr(c, "log", fallbackLog)(...a)),
  groupEnd: bindOr(c, "groupEnd", noop),
};