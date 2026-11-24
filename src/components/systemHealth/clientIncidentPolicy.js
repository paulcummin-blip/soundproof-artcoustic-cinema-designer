// Only bounded diagnostic metadata crosses the browser/server boundary.
export const CLIENT_FAILURES = Object.freeze({
 REPORT_NARRATIVE_FAILED: 'The report writer could not finish the project summary.',
 RENDER_FAILED: 'A part of the application failed to render.',
 RENDER_VALUE_REJECTED: 'A screen rejected a value that React could not render.',
 UNHANDLED_ERROR: 'An unexpected browser error interrupted the application.',
 UNHANDLED_REJECTION: 'An asynchronous operation failed without a handled recovery.',
 DATA_REQUEST_FAILED: 'An application data request failed.',
 DATA_REQUEST_STALLED: 'An application data request did not finish within two minutes.',
 UI_UNRESPONSIVE: 'The foreground application was unresponsive for at least ten seconds.',
 PROJECT_LOAD_FAILED: 'The selected project could not be loaded.',
 PROJECT_LOAD_STALLED: 'The project opening process stopped making progress.',
 BASS_CALCULATION_FAILED: 'The bass calculation failed or timed out.',
 ADI_OPTIMISATION_FAILED: 'The ADI optimisation failed or timed out.',
 REPORT_SAVED_EVIDENCE_REJECTED: 'A report rejected previously saved engineering evidence.',
 REPORT_EVIDENCE_READ_FAILED: 'Saved report evidence could not be read.',
});
export function safeDiagnostic(value, max = 700) {
 return String(value ?? '').slice(0,4000)
  .replace(/https?:\/\/[^\s)]+/gi, s => {try {const u=new URL(s);return u.origin+u.pathname;}catch{return '[url]';}})
  .replace(/(?:Bearer\s+|(?:token|password|secret|authorization|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '[credential removed]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]')
  .replace(/(["'`])[^\n]*?\1/g,'[quoted value removed]')
  .replace(/[<>]/g,'').slice(0,max);
}
export function safeRoute(value) {
 const path=String(value||'/').split(/[?#]/)[0];
 return /^\/[a-zA-Z0-9/_-]*$/.test(path) ? path.slice(0,160) : '/';
}
export function requestFailureWarrantsAlert(error) {
 if (error?.name==='AbortError' || error?.code==='ERR_CANCELED') return false;
 const status=Number(error?.response?.status || error?.status || 0);
 return status===0 || status===408 || status===429 || status>=500;
}
