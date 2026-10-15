/**
 * useProposalReviewGate
 * ---------------------
 * The Proposal Editor's answer to one click: Export Proposal PDF.
 *
 * The product rule is that a document may be previewed at any time, but may only
 * be ISSUED — exported as the client's PDF — once its generated copy has been
 * approved. So when copy is still awaiting approval, the click has to say so. It
 * names the sections that need it and takes the designer to the first one; it
 * never returns silently, and it never re-states a banner that was already on
 * screen.
 *
 * It decides nothing about whether the copy is approved. That is the issue gate,
 * resolved by the server with the copy layer; this only routes the click, so a
 * block is stated once and an evidence failure is never disguised as a review.
 *
 * Extracted from the editor page so the page keeps its size, and so the routing
 * of the click is readable on its own.
 *
 * @param {Object} input
 * @param {Object|null} input.review — the resolved review state (layer.review)
 * @param {Array<Object>} input.sections — the document's sections
 * @param {Function} input.onExport — the real export, run when nothing is awaiting
 * @param {Function} [input.setActiveSectionKey] — activates a section in the editor
 * @returns {{awaiting: number, showDialog: boolean, requestExport: Function,
 *   reviewFirstSection: Function, dismiss: Function}}
 */

import { useCallback, useState } from 'react';

export default function useProposalReviewGate({ review = null, sections = [], onExport, setActiveSectionKey }) {
  const [showDialog, setShowDialog] = useState(false);
  const awaiting = review?.copy?.awaiting || 0;

  const requestExport = useCallback(() => {
    if (awaiting > 0) {
      setShowDialog(true);
      return;
    }
    onExport?.();
  }, [awaiting, onExport]);

  const dismiss = useCallback(() => setShowDialog(false), []);

  /**
   * Take the designer to the first section that still needs approval: the one
   * they would meet first reading the document, because the review items are
   * resolved in document order. Where a block names no single section, the dialog
   * has nothing to open and simply closes.
   */
  const reviewFirstSection = useCallback(() => {
    setShowDialog(false);
    const target = (review?.copy?.items || []).find((item) => item.target_section_type);
    const section = target && (sections || []).find((row) => row.section_type === target.target_section_type);
    if (!section) return;
    setActiveSectionKey?.(section.section_key);
    const scroll = () => document
      .querySelector(`[data-proposal-section="${target.target_section_type}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // One settled frame, so the section the click activated is the one brought
    // into view rather than the one that was active before it.
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(scroll);
    } else {
      scroll();
    }
  }, [review, sections, setActiveSectionKey]);

  return { awaiting, showDialog, requestExport, reviewFirstSection, dismiss };
}