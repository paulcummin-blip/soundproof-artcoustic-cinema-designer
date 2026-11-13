/** Hidden capture frames may never receive animation callbacks. */
export function waitForCapturePaint(win, maxWaitMs = 250) {
  return new Promise((resolve) => {
    let first = null;
    let second = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (first !== null) win?.cancelAnimationFrame?.(first);
      if (second !== null) win?.cancelAnimationFrame?.(second);
      resolve();
    };
    const timer = setTimeout(finish, maxWaitMs);
    if (!win?.requestAnimationFrame) return;
    first = win.requestAnimationFrame(() => {
      if (settled) return;
      second = win.requestAnimationFrame(finish);
    });
  });
}

/**
 * Bound capture, before any upload starts. An expired capture can never return
 * bytes to the storage caller, even if its renderer completes later.
 */
export async function withCaptureDeadline(operation, timeoutMs = 120000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('PDF capture timed out before upload. Retry the document generation.');
          error.captureDiagnostics = { operation: 'capture_timeout' };
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
