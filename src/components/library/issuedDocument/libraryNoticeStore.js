/**
 * libraryNoticeStore.js
 * ---------------------
 * ONE Project Library notice at a time, and its lifetime.
 *
 * A notice is shown through the app's notification renderer, which owns the
 * lifetime it is given: a finite `duration` in milliseconds dismisses itself
 * after that long, and a duration that is not a finite number stays until the
 * designer dismisses it.
 *
 * Two rules this module exists to hold:
 *   - A new outcome REPLACES the notice on screen. The previous notice's timer is
 *     cancelled and the previous notice is dismissed, so the newest outcome is the
 *     one being read, and no orphaned timer can dismiss it later.
 *   - Dismissing a notice only takes it off screen. It never stores, reads or
 *     alters a document, and never navigates.
 */
import { toast } from '@/components/ui/use-toast';

let notice = null;
let timer = null;

/** Take the current notice off screen and cancel its timer. */
export function clearLibraryNotice() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const handle = notice;
  notice = null;
  handle?.dismiss?.();
}

/**
 * Show ONE notice, replacing whatever was on screen.
 *
 * @returns {{id: string, dismiss: () => void}} the handle for the notice shown
 */
export function showLibraryNotice({
  title,
  description,
  variant = null,
  className = null,
  duration,
  onDismiss = null,
}) {
  clearLibraryNotice();
  const handle = toast({
    title,
    description,
    ...(variant ? { variant } : {}),
    ...(className ? { className } : {}),
    ...(duration === undefined ? {} : { duration }),
  });

  const baseDismiss = handle.dismiss;
  const shown = {
    ...handle,
    dismiss: () => {
      if (onDismiss) onDismiss();
      baseDismiss();
    },
  };

  notice = shown;
  if (Number.isFinite(duration)) {
    timer = setTimeout(() => clearLibraryNotice(), duration);
  }
  return shown;
}