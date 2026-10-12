/** Legacy import compatibility only. The measured browser compositor is the sole allocator. */
import { composeProposalFrames } from '@/components/proposal/export/browserProposalComposition';
export const CONTINUATION_CLASS = 'pp-page--continuation';
export const FLOW_FIT_TOLERANCE_MM = 0;
export const FLOW_HEADING_CLASSES = Object.freeze(['pp-header__title', 'pp-header__lead', 'pp-block__title', 'pp-facts-group__title', 'pp-decision__title', 'pp-method__heading']);
export function isHeadingBlock(element) {
  return Boolean(element?.nodeType === 1 && (/^H[1-6]$/.test(element.tagName) || FLOW_HEADING_CLASSES.some((name) => element.classList.contains(name))));
}
export function contentChunks(container) {
  const chunks = [];
  for (const node of container?.childNodes || []) {
    if (node.nodeType === 1) chunks.push({ nodes: [node] });
    else if (chunks.length) chunks[chunks.length - 1].nodes.push(node);
  }
  return chunks;
}
export function layoutHeightMm(element) { return (element?.getBoundingClientRect?.().height || 0) * 25.4 / 96; }
export function paginateFlowPages({ pages = [] } = {}) {
  const completed = composeProposalFrames(pages);
  return { pages: completed, continuations: completed.length - pages.length };
}
export function splitOverflowingPage(page) {
  return page ? paginateFlowPages({ pages: [page] }) : { pages: [], continuations: 0 };
}
export default paginateFlowPages;