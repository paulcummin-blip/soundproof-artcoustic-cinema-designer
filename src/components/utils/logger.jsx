
// components/utils/logger.js
// Minimal, side-effect-free logger that always works.

const g =
  (typeof globalThis !== "undefined" && globalThis) ||
  (typeof window !== "undefined" && window) ||
  {};
const c = g.console || (g.console = {});
if (typeof c.debug !== "function") c.debug = (...a)=>c.log?.("[debug]", ...a);

const log = {
  debug: (...a)=>{try{console.debug?.(...a)??console.log?.("[debug]",...a);}catch{}},
  info:  (...a)=>{try{console.info?.(...a) ??console.log?.(...a);}catch{}},
  warn:  (...a)=>{try{console.warn?.(...a) ??console.log?.("[warn]",...a);}catch{}},
  error: (...a)=>{try{console.error?.(...a)??console.log?.("[error]",...a);}catch{}},
};

export default log;
