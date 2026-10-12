/** The single measured A4 proposal compositor. Printing and Library consume its completed DOM. */
import { naturalFrame, pageMeasurement, newPage, appendUnit, materialize, freezePage } from '@/components/proposal/export/composition/proposalPageGeometry';
import { proposalContentSignature, proposalPageInventory, assertSelectedImages } from '@/components/proposal/export/composition/proposalCompositionInventory';
import { proposalContentUnits, markCompositionOrigins } from '@/components/proposal/export/composition/proposalContentUnits';
import { fragmentTextUnit } from '@/components/proposal/export/composition/proposalTextFragments';
import { measuredPartition } from '@/components/proposal/export/composition/proposalMeasuredPartition';
import { fitMediaUnit, isMediaUnit } from '@/components/proposal/export/composition/proposalMediaFitting';
import { normalizeGalleryPage } from '@/components/proposal/print/galleryPageComposition';

/** Make the existing print typography/layout measurable before opening Print. */
export function proposalMeasurementCss(doc) {
  return [...doc.querySelectorAll('style')]
    .filter((style) => !style.hasAttribute('data-browser-composition-style'))
    .map((style) => style.textContent || '')
    .filter((css) => /@media\s+print/i.test(css))
    .map((css) => css.replace(/@media\s+print/gi, '@media all').replace(/@media\s+screen/gi, '@media not all'))
    .join('\n');
}

/** Compatibility entry for old callers: all allocation still happens here. */
export function composeProposalFrames(pages) {
  const completed = [];
  pages.forEach((original, frameIndex) => {
    original.dataset.paginationFrame ||= String(frameIndex);
    naturalFrame(original);
    original.querySelectorAll('.pp-body p,.pp-endnote__body p,figcaption,.pp-comparison-option__row dd').forEach((node) => {
      node.style.setProperty('overflow-wrap', 'anywhere', 'important');
    });
    if (pageMeasurement(original).fits) { completed.push(original); return; }
    markCompositionOrigins(original);
    const probe = newPage(original, original, true);
    const measureUnits = (units) => materialize(probe, units);
    let units = proposalContentUnits(original, measureUnits);
    // Resolve oversized paragraphs, including opening copy with heading/image overhead.
    const expanded = [];
    let chain = [];
    for (const unit of units) {
      const candidate = [...chain, unit];
      let measured = measureUnits(candidate);
      // A photograph and its caption are indivisible: the photograph is reduced
      // proportionally, and only as far as its own sheet requires.
      if (!measured.fits && isMediaUnit(unit)) {
        fitMediaUnit(unit, chain, measureUnits);
        measured = measureUnits(candidate);
      }
      if (!measured.fits && unit.tableId) throw new Error('A complete table row and its required introduction exceed printable A4 height. Export stopped without splitting the row.');
      if (!measured.fits && unit.atomic) throw new Error('A photograph block exceeds one printable A4 page even at its smallest height. Export stopped without cropping or omitting it.');
      const fragments = measured.fits ? [unit] : fragmentTextUnit(unit, chain, measureUnits);
      expanded.push(...fragments);
      chain = unit.keepNext ? (fragments.length === 1 ? [...chain, unit] : [fragments[fragments.length - 1]]) : [];
    }
    units = expanded;
    const ranges = measuredPartition(units, probe, { append: appendUnit, measure: pageMeasurement });
    probe.remove();
    let page = original;
    ranges.forEach(([start, end], index) => {
      if (index) page = newPage(original, page);
      materialize(page, units, start, end);
      normalizeGalleryPage(page);
      if (!pageMeasurement(page).fits) throw new Error('A measured proposal page overflowed during final composition.');
      completed.push(page);
    });
  });
  return completed;
}

export function composeBrowserProposal(doc) {
  const root = doc.querySelector('.proposal-print-portal');
  if (!root) throw new Error('The proposal print composition is unavailable.');
  if (root.dataset.browserComposed === 'true') return root;
  assertSelectedImages(root);
  const signature = proposalContentSignature(root);
  const originals = [...root.children].filter((page) => page.matches('.pp-page'));
  const pages = composeProposalFrames(originals);
  if (proposalContentSignature(root) !== signature) throw new Error('Proposal composition changed the content inventory. Printing stopped.');
  assertSelectedImages(root);
  pages.forEach((page, index) => freezePage(page, index));
  root.dataset.browserComposed = 'true';
  root.dataset.compositionVersion = 'universal-measured-1';
  const inventory = proposalPageInventory(root, pageMeasurement);
  root.dataset.compositionInventory = JSON.stringify(inventory);
  doc.defaultView.__PROPOSAL_PAGE_INVENTORY__ = inventory;
  return root;
}