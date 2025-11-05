// components/utils/splMathSafe.js
//
// Tiny guard so the UI never crashes if the SPL math bundle
// hasn't loaded or was renamed. Always returns a well-formed object.

function noopComputeLcrSpl(/* args */) {
  return {
    // Keep keys your UI expects:
    FL: null,
    FC: null,
    FR: null,
    left: null,
    center: null,
    right: null,
    // Optional aggregate value:
    maxSpl: null,
    averageAngleToMLP: 0,
    // Optional diagnostics:
    ok: false,
    reason: 'splMath not available',
  };
}

export function safeComputeLcrSpl(...args) {
  try {
    const host = (typeof window !== 'undefined' ? window._splMath : null);
    const fn = host && typeof host.computeLcrSpl === 'function'
      ? host.computeLcrSpl
      : null;

    if (!fn) return noopComputeLcrSpl();

    // Some codebases used .call(this, ...args). Support both.
    const out = fn.apply(host, args);
    // Ensure shape is predictable
    if (!out || typeof out !== 'object') return noopComputeLcrSpl();
    return {
      FL: out.FL ?? null,
      FC: out.FC ?? null, 
      FR: out.FR ?? null,
      left: out.left ?? out.FL ?? null,
      center: out.center ?? out.FC ?? null,
      right: out.right ?? out.FR ?? null,
      maxSpl: out.maxSpl ?? null,
      averageAngleToMLP: out.averageAngleToMLP ?? 0,
      ok: true,
      reason: null,
    };
  } catch (e) {
    return { ...noopComputeLcrSpl(), reason: String(e && e.message || e) };
  }
}