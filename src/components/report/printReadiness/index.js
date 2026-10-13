/**
 * printReadiness — THE one print-preparation authority for Sound Proof exports.
 * ---------------------------------------------------------------------------
 * The single set of conditions that must be true before the browser's print
 * dialogue is allowed to open, used UNCHANGED by both export paths:
 *
 *   - the app-owned print window → preparePrintDocument({ win })
 *   - the in-page fallback       → preparePrintDocument({ doc, root })
 *
 * It exists because a first export could print before its document was ready —
 * an image loaded but not yet decoded, a web font not yet applied, a copied
 * stylesheet not yet parsed, or an editor value still arriving — and a second
 * attempt then looked correct because everything had settled by then.
 *
 * Nothing here prints "anyway" once a budget elapses: a budget that runs out is
 * a FAILURE the caller must report, never an incomplete PDF. Retrying re-runs
 * this same preparation from the start.
 *
 * The pieces:
 *   readinessContract.js    budgets, reasons, the designer-facing message,
 *                           timing primitives and the document-inputs wait
 *   resourceReadiness.js    the images / fonts / stylesheets / background /
 *                           layout conditions and the waits that enforce them
 *   index.js (here)         the one entry point both paths call
 */

import {
  PRINT_READINESS_BUDGET_MS,
  PRINT_READINESS_REASON,
  readinessNow,
} from './readinessContract.js';
import {
  waitForBackgroundImages,
  waitForFonts,
  waitForImages,
  waitForLayoutStable,
  waitForStylesheets,
} from './resourceReadiness.js';

export {
  PRINT_READINESS_BUDGET_MS,
  PRINT_READINESS_REASON,
  PRINT_READINESS_STABLE_FRAMES,
  PRINT_NOT_READY_MESSAGE,
  describePrintReadinessFailure,
  // The bounded primitives a caller's own identity wait is built from, so no
  // stage of preparation introduces a second, unbounded timing mechanism.
  readinessNow,
  settleOneFrame,
  waitForDocumentInputs,
  withDeadline,
} from './readinessContract.js';

export {
  assessFontSet,
  assessImageElement,
  assessStylesheetElement,
  collectBackgroundImageUrls,
  collectPrintImages,
  collectStylesheetLinks,
  decodeImageElement,
  imageSource,
  measureLayout,
  waitForBackgroundImages,
  waitForFonts,
  waitForImages,
  waitForLayoutStable,
  waitForStylesheets,
} from './resourceReadiness.js';

/**
 * Prepare a print document.
 *
 * The conditions are waited for in the order that makes each one meaningful:
 * a stylesheet must have parsed before type can be measured, the fonts must have
 * applied before the layout can settle, and every image must have loaded and
 * decoded before the layout is measured at all.
 *
 * @param {Object} options
 * @param {Window} [options.win]   the print window, for its document and frames
 * @param {Document} [options.doc] the document to prepare (defaults to win's)
 * @param {Element} [options.root] the printed subtree (defaults to the body)
 * @param {Object} [options.budgets]
 * @returns {Promise<{ready: boolean, reason: string|null, failures: Array}>}
 */
export async function preparePrintDocument({
  win = null,
  doc = null,
  root = null,
  budgets = PRINT_READINESS_BUDGET_MS,
  trace = null,
} = {}) {
  const target = doc || win?.document || (typeof document !== 'undefined' ? document : null);
  if (!target) {
    return { ready: false, reason: PRINT_READINESS_REASON.STYLESHEETS_FAILED, failures: [] };
  }

  const started = readinessNow();
  const detail = { kind: 'print_readiness', lastCompletedStage: null, fontReadiness: 'not_checked', imageReadiness: 'not_checked' };
  const run = async (stage, task) => {
    detail.blockingStage = stage;
    trace?.start(stage);
    const result = await task();
    if (result.ok) { detail.lastCompletedStage = stage; trace?.done(stage); }
    else trace?.fail(stage, { reason: result.reason });
    return result;
  };
  const failure = (result) => ({ ready: false, reason: result.reason, failures: result.failures || [],
    diagnostics: { ...detail, preparationMs: Math.round(readinessNow() - started),
      conditionNotMet: detail.conditionNotMet || result.reason } });
  const stylesheets = await run('stylesheets', () => waitForStylesheets(target, {
    budgetMs: budgets.stylesheets, pollMs: budgets.poll,
  }));
  if (!stylesheets.ok) return failure(stylesheets);
  const fonts = await run('fonts', () => waitForFonts(target, { budgetMs: budgets.fonts, pollMs: budgets.poll }));
  detail.fontReadiness = fonts.ok ? 'ready' : fonts.reason;
  if (!fonts.ok) return failure(fonts);
  const scope = root || target.body || target.documentElement || null;
  const images = await run('images', () => waitForImages(scope, { budgetMs: budgets.images, pollMs: budgets.poll }));
  detail.imageReadiness = images.ok ? 'loaded_and_decoded' : images.reason;
  if (!images.ok) return failure(images);
  await run('background_images', () => waitForBackgroundImages(scope, {
    win: win || target.defaultView || null, budgetMs: budgets.images,
  }));
  detail.blockingStage = 'layout_stability';
  trace?.start('layout_stability');
  const settled = await waitForLayoutStable(scope, win || target.defaultView || null, {
    budgetMs: budgets.layout, diagnostics: detail,
  });
  if (!settled) {
    trace?.fail('layout_stability', { condition: detail.conditionNotMet });
    return failure({ reason: PRINT_READINESS_REASON.LAYOUT_UNSTABLE });
  }
  trace?.done('layout_stability');
  return { ready: true, reason: null, failures: [] };
}

export default preparePrintDocument;