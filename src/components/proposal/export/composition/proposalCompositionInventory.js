/** Read-only content and page-boundary evidence shared by print and capture. */
export function proposalContentSignature(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('style,thead,colgroup').forEach((node) => node.remove());
  return JSON.stringify({
    text: clone.textContent.replace(/\s+/g, ' ').trim(),
    images: [...clone.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    rows: [...clone.querySelectorAll('tbody tr')].map((row) => row.textContent),
  });
}
export function proposalPageInventory(root, measure) {
  return [...root.children].filter((page) => page.matches('.proposal-print-cover,.pp-page')).map((page, index) => ({
    page: index + 1,
    kind: page.className,
    first: page.firstElementChild?.textContent?.trim().slice(0, 160) || '',
    last: page.lastElementChild?.textContent?.trim().slice(-160) || '',
    text: page.textContent.replace(/\s+/g, ' ').trim(),
    images: [...page.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    rows: [...page.querySelectorAll('tbody tr')].map((row) => row.textContent),
    ...(page.matches('.pp-page') && measure ? measure(page) : {}),
    size: '210 × 297 mm',
  }));
}
export function sameProposalBoundaries(expected, actual) {
  const identity = (pages) => pages.map(({ text, images, rows }) => ({ text, images, rows }));
  return JSON.stringify(identity(expected)) === JSON.stringify(identity(actual));
}
export function assertSelectedImages(root) {
  const selected = JSON.parse(root.dataset.selectedImages || '[]');
  const printed = new Set([...root.querySelectorAll('img')].map((image) => image.getAttribute('src')));
  const missing = selected.filter((url) => !printed.has(url));
  if (missing.length) throw new Error(`${missing.length} selected photograph(s) are missing from the proposal. Export stopped rather than omitting them.`);
}