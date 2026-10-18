/**
 * libraryStoredNoticeAuthority.js
 * -------------------------------
 * What the Project Library says once an exported PDF has been stored — decided
 * from the stored record alone, in one place.
 *
 * Two outcomes, and they are NOT the same outcome:
 *
 *   STORED               the document landed and its page preview landed with
 *                        it. A quiet confirmation that asks nothing of anyone,
 *                        so it takes itself away after five seconds.
 *
 *   PREVIEW_INCOMPLETE   the document landed and its page preview did not (or
 *                        some of its pages have no preview). This is a DEGRADED
 *                        SUCCESS, never a failure: the PDF is safely stored and
 *                        openable, so it is stated that way, toned as
 *                        informative, and it stays until the designer dismisses
 *                        it.
 *
 * Presentation only. Nothing here stores, reads, retries or alters a document —
 * a missing page preview never affects storage, and never did.
 */
import { PREVIEW_STATUS } from '@/components/library/pdfArtifactAuthority';

/** How long a plain confirmation stays before it dismisses itself. */
export const STORED_NOTICE_MS = 5000;

/**
 * A notice that asks the designer to know something stays until they dismiss
 * it. Written as a duration that is not a finite number, which is how the
 * notification renderer is told "no auto-dismiss".
 */
export const STORED_NOTICE_STAYS_MS = Infinity;

export const STORED_NOTICE_STATE = Object.freeze({
  /** The document and its preview are both stored. */
  STORED: 'stored',
  /** The document is stored; its page preview is not complete. */
  PREVIEW_INCOMPLETE: 'stored_preview_incomplete',
});

/**
 * Visual tone per state. A stored document is never red: the failure tone
 * (STORAGE_NOTICE_CLASS) is for a document that could NOT be stored, and is
 * deliberately not reused here.
 */
export const STORED_NOTICE_TONE = Object.freeze({
  [STORED_NOTICE_STATE.STORED]:
    'items-start gap-1 p-3 pr-8 text-sm border-emerald-200 bg-emerald-50 text-emerald-950',
  [STORED_NOTICE_STATE.PREVIEW_INCOMPLETE]:
    'items-start gap-1 p-3 pr-8 text-sm border-amber-300 bg-amber-50 text-amber-950',
});

/** What the preview state means, in the designer's own words. */
const PREVIEW_SENTENCE = Object.freeze({
  [PREVIEW_STATUS.UNAVAILABLE]: 'The PDF was saved successfully, but its page preview could not be created.',
  [PREVIEW_STATUS.PARTIAL]: 'The PDF was saved successfully, but some pages have no preview.',
});

/**
 * The notice for one stored document.
 *
 * @param {object|null} record the stored Project Library record
 * @returns {{state: string, title: string, previewStatus: string|null,
 *   previewSentence: string|null, tone: string, duration: number, support: boolean}}
 */
export function resolveStoredNotice(record) {
  const previewStatus = record?.preview_status || null;
  const previewSentence = PREVIEW_SENTENCE[previewStatus] || null;
  const state = previewSentence
    ? STORED_NOTICE_STATE.PREVIEW_INCOMPLETE
    : STORED_NOTICE_STATE.STORED;

  return {
    state,
    title: 'Stored in Project Library',
    previewStatus,
    previewSentence,
    tone: STORED_NOTICE_TONE[state],
    // Only true success dismisses itself; a degraded success waits to be dismissed.
    duration: state === STORED_NOTICE_STATE.STORED ? STORED_NOTICE_MS : STORED_NOTICE_STAYS_MS,
    support: state === STORED_NOTICE_STATE.PREVIEW_INCOMPLETE,
  };
}

export default resolveStoredNotice;