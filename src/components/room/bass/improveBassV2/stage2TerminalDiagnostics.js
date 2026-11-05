// Bounded diagnostic receipts only; never restored as engineering authority.
const KEY = "sp.stage2-terminal.v1";
let memory = [];
export function readStage2TerminalDiagnostics() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "[]");
    return [...new Map([...stored, ...memory].map(record => [record.runId, record])).values()].slice(-20);
  } catch { return memory; }
}
export function saveStage2TerminalDiagnostics(record) {
  memory = [...readStage2TerminalDiagnostics().filter(r => r.runId !== record.runId), record].slice(-20);
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* history also retains receipt */ }
  return record;
}
if (typeof window !== "undefined") window.__SP_STAGE2_TERMINALS__ = readStage2TerminalDiagnostics;
