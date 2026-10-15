/** The single measured A4 proposal compositor. Printing and Library consume its completed DOM. */
import { naturalFrame, pageMeasurement, newPage, appendUnit, materialize, freezePage } from '@/components/proposal/export/composition/proposalPageGeometry';
import { proposalContentSignature, proposalPageInventory, assertSelectedImages } from '@/components/proposal/export/composition/proposalCompositionInventory';
import { proposalContentUnits, markCompositionOrigins } from '@/components/proposal/export/composition/proposalContentUnits';
import { fragmentTextUnit } from '@/components/proposal/export/composition/proposalTextFragments';
import { measuredPartition } from '@/components/proposal/export/composition/proposalMeasuredPartition';
import { reserveMediaUnit, isMediaUnit } from '@/components/proposal/export/composition/proposalMediaFitting';
import { classifyPillarComposition } from '@/components/proposal/export/composition/pillarCompositionAuthority';
import { normalizeGalleryPage } from '@/components/proposal/print/galleryPageComposition';
import { fitHighlightsSection } from '@/components/proposal/export/composition/highlightsFitting';

/** The one sentence a summary that cannot fit one sheet is stopped with. */
const HIGHLIGHTS_OVERFLOW = 'The complete Key Performance Highlights section cannot fit one A4 sheet. Export stopped rather than splitting the table or setting it in a smaller type.';

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
    // The evidence summary is ONE sheet. It is curated by measurement here — the
    // compositor's own frame first, then the table's own spacing, then the least
    // valuable rows, with the closing note inside every measurement — and then
    // KEPT WHOLE: it never enters the content-unit path below, so its table
    // cannot be divided across two sheets and its closing note is never handed to
    // the paragraph-fragmentation fallback. A summary that cannot be fitted
    // legibly is reported by name instead of being printed as an accident. The
    // full result set stays in the Project Report.
    if (original.matches?.('.pp-page--highlights')) {
      if (!fitHighlightsSection(original, pageMeasurement)) throw new Error(HIGHLIGHTS_OVERFLOW);
      completed.push(original);
      return;
    }
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
    // The allocation position of the block being measured, carried into the
    // failure diagnostics: which block on which frame stopped the export.
    let allocationIndex = 0;
    for (const unit of units) {
      allocationIndex += 1;
      const candidate = [...chain, unit];
      let measured = measureUnits(candidate);
      // A photograph and its caption are indivisible: the photograph is reduced
      // proportionally, and only as far as the area its own Library role reserves.
      if (!measured.fits && isMediaUnit(unit)) {
        reserveMediaUnit(unit, chain, measureUnits);
        measured = measureUnits(candidate);
      }
      if (!measured.fits && unit.tableId) throw new Error('A complete table row and its required introduction exceed printable A4 height. Export stopped without splitting the row.');
      // A photograph that cannot sit beside the copy it was measured with MOVES to
      // the next sheet at its reserved size; it is never fragmented, which would
      // print the same photograph twice, and never reduced below its reserved area.
      const mediaMovesWhole = !measured.fits && isMediaUnit(unit) && measureUnits([unit]).fits;
      if (!measured.fits && unit.atomic && !mediaMovesWhole) throw new Error('A photograph block exceeds one printable A4 page even at its reserved size. Export stopped without cropping or omitting it.');
      const fragments = measured.fits || mediaMovesWhole ? [unit] : fragmentTextUnit(unit, chain, measureUnits, {
        index: allocationIndex,
        total: units.length,
        frame: original.dataset.paginationFrame,
      });
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
  // The curated one-sheet summary is settled BEFORE the content inventory is
  // taken, so the check below still proves that composition itself changed
  // nothing: what the document prints is what it printed, minus the rows this
  // summary withdraws by measurement, which no other part of the pack carries.
  // The fit measures the section in the compositor's own page frame, so the row
  // selection accepted here is the selection the allocation below will see.
  [...root.children]
    .filter((page) => page.matches('.pp-page--highlights'))
    .forEach((page) => {
      if (!fitHighlightsSection(page, pageMeasurement)) throw new Error(HIGHLIGHTS_OVERFLOW);
    });
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
  // The export's own image trace: which Library role every photograph was
  // composed under, the geometry the composition gave it, and which approved
  // three-pillar composition the measured allocation produced. Read-only evidence
  // — it decides nothing and changes no value.
  const pillar = classifyPillarComposition(inventory);
  root.dataset.pillarComposition = pillar.composition || 'none';
  root.dataset.pillarCompositionNote = pillar.note || '';
  root.dataset.imageLayoutTrace = JSON.stringify(inventory.flatMap((entry) => entry.imageRoles || []));
  doc.defaultView.__PROPOSAL_PAGE_INVENTORY__ = inventory;
  doc.defaultView.__PROPOSAL_IMAGE_TRACE__ = JSON.parse(root.dataset.imageLayoutTrace);
  return root;
}