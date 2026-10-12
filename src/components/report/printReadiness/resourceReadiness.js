/**
 * resourceReadiness
 * -----------------
 * The resource conditions of print preparation: what each resource must look
 * like before printing, and the waits that enforce it.
 *
 *   images       loaded AND decoded, with real dimensions
 *   fonts        document.fonts.ready, with no face the document asked for missing
 *   stylesheets  every copied <link> parsed
 *   backgrounds  pre-loaded (decorative, never blocking)
 *   layout       the same real measurement twice in a row
 *
 * The assessors and the measurement are pure — they take plain objects, so the
 * fixture harness drives them without a browser. Nothing here prints, and
 * nothing here is allowed to treat a timeout as success.
 */

import {
  PRINT_READINESS_BUDGET_MS,
  PRINT_READINESS_REASON,
  PRINT_READINESS_STABLE_FRAMES,
  delay,
  frameRunner,
  readinessNow,
  waitUntil,
  withDeadline,
} from './readinessContract.js';

/* ── Images ────────────────────────────────────────────────────────────── */

/** The source an image is actually displaying, for a failure message. */
export function imageSource(img) {
  if (!img) return '';
  return img.currentSrc || img.src || img.getAttribute?.('src') || '';
}

/**
 * Every image the print scope must carry.
 *
 * Lazy images are switched to eager: a document is printed as a whole, so a
 * deferred image that never entered the viewport would otherwise print blank.
 * That is an attribute, not content — no stored value is touched.
 */
export function collectPrintImages(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const images = Array.from(root.querySelectorAll('img'));
  images.forEach((img) => {
    try {
      if (img.getAttribute?.('loading') === 'lazy') img.loading = 'eager';
    } catch {
      // A read-only attribute is left as it is.
    }
  });
  return images;
}

/**
 * 'ready'   — loaded, with real dimensions
 * 'pending' — still loading
 * 'failed'  — the browser has finished with it and there is no image
 */
export function assessImageElement(img) {
  if (!img) return 'ready';
  const src = imageSource(img);
  if (!src) return 'ready';
  if (img.complete !== true) return 'pending';
  const width = Number(img.naturalWidth) || 0;
  const height = Number(img.naturalHeight) || 0;
  return width > 0 && height > 0 ? 'ready' : 'failed';
}

/** Force an image to be decoded, so nothing is painted mid-decode. */
export function decodeImageElement(img) {
  if (img && typeof img.decode === 'function') return img.decode();
  return Promise.resolve();
}

/**
 * Wait until every image in `root` has loaded AND decoded.
 *
 * `img.complete` alone is not proof: it is true for a broken image, and true for
 * an image whose bytes have arrived but which has not been decoded. Both are
 * checked here.
 *
 * @returns {Promise<{ok: boolean, reason: string|null, failures: Array}>}
 */
export async function waitForImages(root, {
  budgetMs = PRINT_READINESS_BUDGET_MS.images,
  pollMs = PRINT_READINESS_BUDGET_MS.poll,
  decodeImage = decodeImageElement,
} = {}) {
  const images = collectPrintImages(root);
  if (images.length === 0) return { ok: true, reason: null, failures: [] };

  // Phase 1 — every image has finished loading, or has failed.
  await waitUntil(
    () => images.every((img) => assessImageElement(img) !== 'pending'),
    { budgetMs, pollMs },
  );
  if (images.some((img) => assessImageElement(img) !== 'ready')) {
    return {
      ok: false,
      reason: PRINT_READINESS_REASON.IMAGES_FAILED,
      failures: images
        .filter((img) => assessImageElement(img) !== 'ready')
        .map((img) => ({ kind: 'image', url: imageSource(img) })),
    };
  }

  // Phase 2 — every loaded image is decoded before the layout is measured.
  const decodeBudget = Math.min(budgetMs, 5000);
  const undecoded = await Promise.all(images.map(async (img) => {
    try {
      await withDeadline(decodeImage(img), decodeBudget);
      return null;
    } catch {
      return img;
    }
  }));
  const decodeFailures = undecoded.filter(Boolean);
  if (decodeFailures.length > 0) {
    return {
      ok: false,
      reason: PRINT_READINESS_REASON.IMAGES_DECODE_FAILED,
      failures: decodeFailures.map((img) => ({ kind: 'image', url: imageSource(img) })),
    };
  }

  return { ok: true, reason: null, failures: [] };
}

/* ── Fonts ─────────────────────────────────────────────────────────────── */

/**
 * 'ready'   — no face is still loading
 * 'pending' — a face is still loading
 * 'failed'  — a face the document asked for could not be loaded
 */
export function assessFontSet(fontSet) {
  if (!fontSet || typeof fontSet.forEach !== 'function') return 'ready';
  let pending = false;
  let failed = false;
  fontSet.forEach((face) => {
    if (face?.status === 'error') failed = true;
    else if (face?.status === 'loading') pending = true;
  });
  if (failed) return 'failed';
  return pending ? 'pending' : 'ready';
}

/** The faces a failed font assessment is about. */
export function fontFailures(fontSet) {
  const failures = [];
  if (fontSet && typeof fontSet.forEach === 'function') {
    fontSet.forEach((face) => {
      if (face?.status === 'error') failures.push({ kind: 'font', url: face.family || 'font' });
    });
  }
  return failures;
}

/**
 * Wait for the document's fonts, so no face can substitute after printing starts.
 *
 * `document.fonts.ready` is awaited, and the font set is then read: a face the
 * document asked for and could not load is a failure, never a silent
 * substitution on the printed page.
 */
export async function waitForFonts(doc, {
  budgetMs = PRINT_READINESS_BUDGET_MS.fonts,
  pollMs = PRINT_READINESS_BUDGET_MS.poll,
} = {}) {
  const fontSet = doc?.fonts;
  if (!fontSet || typeof fontSet.ready?.then !== 'function') {
    // A browser without the Font Loading API has nothing to wait for.
    return { ok: true, reason: null, failures: [] };
  }
  try {
    await withDeadline(fontSet.ready, budgetMs);
  } catch {
    return {
      ok: false,
      reason: PRINT_READINESS_REASON.FONTS_TIMEOUT,
      failures: [{ kind: 'font', url: 'document fonts' }],
    };
  }
  await waitUntil(() => assessFontSet(fontSet) !== 'pending', { budgetMs: pollMs * 20, pollMs });
  if (assessFontSet(fontSet) !== 'ready') {
    return { ok: false, reason: PRINT_READINESS_REASON.FONTS_FAILED, failures: fontFailures(fontSet) };
  }
  return { ok: true, reason: null, failures: [] };
}

/* ── Stylesheets ───────────────────────────────────────────────────────── */

/** Every linked stylesheet the print document needs. */
export function collectStylesheetLinks(doc, root = null) {
  const scope = root || doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  return Array.from(scope.querySelectorAll('link[rel="stylesheet"]'));
}

/**
 * 'ready'   — the browser has the parsed sheet
 * 'pending' — still loading
 * 'failed'  — the link reported an error
 */
export function assessStylesheetElement(link, failedLinks = null) {
  if (!link) return 'ready';
  const href = link.getAttribute?.('href') || '';
  if (!href) return 'ready';
  if (failedLinks && typeof failedLinks.has === 'function' && failedLinks.has(link)) return 'failed';
  return link.sheet ? 'ready' : 'pending';
}

/**
 * Wait until every stylesheet in the print document has loaded and parsed.
 *
 * A copied `<link>` starts life unresolved, so a document printed the moment it
 * is written prints unstyled. A link that reports an error, or that never
 * resolves within the budget, is a failure — never a styled-looking guess.
 *
 * @returns {Promise<{ok: boolean, reason: string|null, failures: Array}>}
 */
export async function waitForStylesheets(doc, {
  budgetMs = PRINT_READINESS_BUDGET_MS.stylesheets,
  pollMs = PRINT_READINESS_BUDGET_MS.poll,
} = {}) {
  const links = collectStylesheetLinks(doc)
    .filter((link) => (link.getAttribute?.('href') || ''));
  if (links.length === 0) return { ok: true, reason: null, failures: [] };

  const failedLinks = new Set();
  links.forEach((link) => {
    if (typeof link.addEventListener === 'function') {
      link.addEventListener('error', () => failedLinks.add(link), { once: true });
    }
  });
  const unresolved = () => links.filter((link) => !failedLinks.has(link) && !link.sheet);

  const settled = await waitUntil(() => unresolved().length === 0, { budgetMs, pollMs });
  if (!settled) {
    return {
      ok: false,
      reason: PRINT_READINESS_REASON.STYLESHEETS_TIMEOUT,
      failures: unresolved().map((link) => ({ kind: 'stylesheet', url: link.getAttribute('href') })),
    };
  }
  if (failedLinks.size > 0) {
    return {
      ok: false,
      reason: PRINT_READINESS_REASON.STYLESHEETS_FAILED,
      failures: [...failedLinks].map((link) => ({ kind: 'stylesheet', url: link.getAttribute('href') })),
    };
  }
  return { ok: true, reason: null, failures: [] };
}

/* ── Background images (decorative) ────────────────────────────────────── */

/** The CSS background images the print scope paints, absolute and de-duplicated. */
export function collectBackgroundImageUrls(root, win = null) {
  const view = win || (typeof window !== 'undefined' ? window : null);
  if (!root || !view || typeof view.getComputedStyle !== 'function') return [];
  const elements = Array.from(root.querySelectorAll?.('*') || []).slice(0, 400);
  if (root.nodeType === 1) elements.unshift(root);
  const urls = new Set();
  elements.forEach((element) => {
    let value = '';
    try {
      value = view.getComputedStyle(element).backgroundImage || '';
    } catch {
      value = '';
    }
    (value.match(/url\((?:"|')?[^"')]+(?:"|')?\)/g) || []).forEach((entry) => {
      const url = entry.replace(/^url\((?:"|')?/, '').replace(/(?:"|')?\)$/, '').trim();
      if (url && url !== 'none' && !url.startsWith('data:')) urls.add(url);
    });
  });
  return [...urls];
}

/**
 * Pre-load the CSS background images the page paints.
 *
 * Deliberately best-effort: these are decoration on a designed page, so one that
 * cannot be fetched never blocks a client's document from being exported. They
 * are still awaited, so a background that is going to arrive has arrived before
 * the layout is measured.
 */
export async function waitForBackgroundImages(root, {
  win = null,
  budgetMs = PRINT_READINESS_BUDGET_MS.images,
} = {}) {
  const view = win || (typeof window !== 'undefined' ? window : null);
  const ImageCtor = view?.Image;
  if (!ImageCtor) return { ok: true, failures: [] };
  const urls = collectBackgroundImageUrls(root, view);
  if (urls.length === 0) return { ok: true, failures: [] };

  const failures = [];
  await Promise.all(urls.map((url) => new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!ok) failures.push({ kind: 'background_image', url });
      resolve();
    };
    const timer = setTimeout(() => finish(false), Math.min(budgetMs, 4000));
    const image = new ImageCtor();
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  })));
  return { ok: true, failures };
}

/* ── Layout ────────────────────────────────────────────────────────────── */

/**
 * One signature of the printed layout: its box, its scroll size, and the size of
 * every image it carries. Image sizes are included on purpose — an image that
 * finishes after the fonts apply changes this signature, so the document cannot
 * be declared settled while a resource is still arriving.
 */
export function measureLayout(target) {
  if (!target || typeof target.getBoundingClientRect !== 'function') return '';
  const rect = target.getBoundingClientRect() || {};
  const images = collectPrintImages(target)
    .map((img) => `${Number(img.naturalWidth) || 0}x${Number(img.naturalHeight) || 0}`)
    .join(',');
  return [
    Math.round(rect.width || 0),
    Math.round(rect.height || 0),
    target.scrollHeight || 0,
    target.scrollWidth || 0,
    images,
  ].join('|');
}

/**
 * Wait until the print layout measures the same `frames` times in a row.
 *
 * This is the only place frames are used, and they compare two real measurements
 * taken after every resource is known to have arrived — never a stand-in for
 * readiness.
 *
 * @returns {Promise<boolean>} true when the layout settled
 */
export async function waitForLayoutStable(target, win = null, {
  frames = PRINT_READINESS_STABLE_FRAMES,
  budgetMs = PRINT_READINESS_BUDGET_MS.layout,
} = {}) {
  const frame = frameRunner(win);
  if (!frame) return true;
  const deadline = readinessNow() + budgetMs;
  let previous = measureLayout(target);
  let stable = 0;
  while (stable < frames && readinessNow() < deadline) {
    await frame();
    const current = measureLayout(target);
    stable = current === previous ? stable + 1 : 0;
    previous = current;
  }
  return stable >= frames;
}

/** A bounded pause, exported for callers that need one. */
export { delay };