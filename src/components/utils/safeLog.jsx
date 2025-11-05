
// components/utils/safeLog.js
export function safeGroup(label, fn) {
  const g = typeof console.groupCollapsed === "function" ? "groupCollapsed"
          : (typeof console.group === "function" ? "group" : null);
  try {
    if (g) console[g](label);
    fn?.();
  } finally {
    if (g && typeof console.groupEnd === "function") console.groupEnd();
  }
}

export function safeTable(rows) {
  if (typeof console.table === "function") {
    console.table(rows);
  } else {
    console.log(rows);
  }
}

export function safeGroupEnd() {
  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}
