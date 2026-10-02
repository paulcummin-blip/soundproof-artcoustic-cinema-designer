// projectOpeningWaitPolicy.js
// --------------------------
// WHEN the project opening panel reports on its wait — and when (and only when) a
// restore that has genuinely stopped responding may be recorded as Failed.
//
// Split out of projectOpeningAuthority.js so the timing policy can be read, tested
// and adjusted on its own, without touching the state machine that decides whether
// the project may open.
//
// The policy:
//
//   0 – 30 s   normal Restoring / Hydrating / Loading / Calculating
//   at 30 s    the panel says the restore is taking longer than usual (onSlow)
//   at 90 s    Retry is offered, so an unresponsive restore can be re-run (onRetry)
//   at 120 s   the stall check runs (onStall) — and only a row that has not moved
//              AT ALL in that whole window is recorded as Failed
//
// The stall window is re-armed by genuine progress (see rearmStall), so larger
// projects, saved bass authority, report authority, proposal source data and pricing
// all get the time they really need. Normal slow loading is never converted into a
// failure, and none of these markers can resolve a stage or open the project.
//
// Pure timing: no React, no state machine, no database access.

/** The panel never flashes: it stays for at least this long. */
export const PROJECT_OPENING_MIN_VISIBLE_MS = 900;

/** The panel reports a long restore here. Nothing has failed. */
export const PROJECT_OPENING_SLOW_MS = 30000;

/** Retry is offered here, so a restore that has stopped responding can be re-run. */
export const PROJECT_OPENING_RETRY_MS = 90000;

/** Only after this whole window PASSES WITH NO PROGRESS may a row be Failed. */
export const PROJECT_OPENING_STALL_MS = 120000;

/** The historical name for the stall window, kept for existing callers. */
export const PROJECT_OPENING_TIMEOUT_MS = PROJECT_OPENING_STALL_MS;

/** One window: the option if it is a number, else the caller's previous value. */
function waitWindow(value, fallbackValue, defaultValue) {
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  return fallbackValue == null ? defaultValue : fallbackValue;
}

/**
 * Resolve the three wait windows for one opening. `stallMs` is the preferred
 * spelling and `timeoutMs` the historical name for the same window. A zero stall
 * window disables every marker — a caller that drives them explicitly asks for it.
 */
export function resolveWaitWindows(options = {}, fallback = {}) {
  const requestedStall = options.stallMs ?? options.timeoutMs;
  return {
    slowMs: waitWindow(options.slowMs, fallback.slowMs, PROJECT_OPENING_SLOW_MS),
    retryMs: waitWindow(options.retryMs, fallback.retryMs, PROJECT_OPENING_RETRY_MS),
    stallMs: waitWindow(requestedStall, fallback.stallMs, PROJECT_OPENING_STALL_MS),
  };
}

/**
 * The three wait markers for the opening under way.
 *
 * arm() starts all three from now (a retry re-arms them), rearmStall() restarts only
 * the stall window — which is what a row genuinely moving does — and clear()
 * releases them all, so a closed opening can never fire one afterwards.
 */
export function createWaitMarkers(handlers = {}) {
  let slowTimer = null;
  let retryTimer = null;
  let stallTimer = null;

  const clearOne = (timer) => {
    if (timer != null) clearTimeout(timer);
    return null;
  };

  const fire = (delay, run) => {
    if (!(delay > 0)) return null;
    return setTimeout(run, delay);
  };

  const rearmStall = (stallMs) => {
    stallTimer = clearOne(stallTimer);
    stallTimer = fire(stallMs, () => {
      stallTimer = null;
      if (handlers.onStall) handlers.onStall();
    });
    return stallTimer;
  };

  return {
    arm(windows = {}) {
      const { slowMs, retryMs, stallMs } = windows;
      // A zero stall window means "no wait markers at all": nothing is reported and
      // nothing can be failed.
      if (!(stallMs > 0)) {
        slowTimer = clearOne(slowTimer);
        retryTimer = clearOne(retryTimer);
        stallTimer = clearOne(stallTimer);
        return;
      }
      slowTimer = clearOne(slowTimer);
      slowTimer = fire(slowMs, () => {
        slowTimer = null;
        if (handlers.onSlow) handlers.onSlow();
      });
      retryTimer = clearOne(retryTimer);
      retryTimer = fire(retryMs, () => {
        retryTimer = null;
        if (handlers.onRetry) handlers.onRetry();
      });
      rearmStall(stallMs);
    },
    rearmStall,
    clear() {
      slowTimer = clearOne(slowTimer);
      retryTimer = clearOne(retryTimer);
      stallTimer = clearOne(stallTimer);
    },
  };
}