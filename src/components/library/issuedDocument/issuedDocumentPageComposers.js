/**
 * issuedDocumentPageComposers.js
 * ------------------------------
 * The content-driven page composers an issued document may declare, by the
 * serialisable token its composition carries.
 *
 * Most issued documents are composed in the browser before they are printed: the
 * report page frames are fixed-height, and the proposal pack allocates its own
 * pages. The Current Speaker Design schedule is content-driven instead — its
 * whole length is one block sequence — so it declares a composer token and both
 * the printed PDF and the stored Project Library copy run that one composer over
 * the same markup. The stored copy is therefore page-for-page the document that
 * was printed.
 *
 * The token travels through the stored snapshot, so no function is ever written
 * to an entity record.
 *
 * Pure: no DOM access at module level, no React.
 */

import { ISSUED_DOCUMENT_PAGE_COMPOSER } from '@/components/library/issuedDocument/issuedDocumentTypes';
import { composeSpeakerDesignPages } from '@/components/report/speakerDesign/speakerDesignPaging';

const COMPOSERS = Object.freeze({
  [ISSUED_DOCUMENT_PAGE_COMPOSER.SPEAKER_DESIGN]: composeSpeakerDesignPages,
});

/**
 * The composer a composition token names.
 *
 * @param {string|null|undefined} token
 * @returns {null | ((doc: Document, options?: Object) => number)}
 */
export function resolvePageComposer(token) {
  if (!token) return null;
  return COMPOSERS[token] || null;
}

export default resolvePageComposer;