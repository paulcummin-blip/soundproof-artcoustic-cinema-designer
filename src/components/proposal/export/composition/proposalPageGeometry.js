/** Measurement primitives for the existing browser compositor, not a second allocator. */
export const PX_PER_MM = 96 / 25.4;
export const PAGE_HEIGHT = 297 * PX_PER_MM;
const TOLERANCE = 0.5;
export function setPrintStyle(node, property, value) {
  node.style.setProperty(property, value, 'important');
}
export function naturalFrame(page) {
  const values = { width: '210mm', 'box-sizing': 'border-box', height: 'auto', 'min-height': '0', 'max-height': 'none', margin: '0', display: 'flow-root' };
  Object.entries(values).forEach(([key, value]) => setPrintStyle(page, key, value));
}
export function pageMeasurement(page) {
  const view = page.ownerDocument.defaultView;
  const css = view.getComputedStyle(page);
  const number = (name) => parseFloat(css[name]) || 0;
  const rect = page.getBoundingClientRect();
  const top = rect.top + number('paddingTop') + number('borderTopWidth');
  const bottomPadding = number('paddingBottom') + number('borderBottomWidth');
  const budget = PAGE_HEIGHT - (top - rect.top) - bottomPadding;
  let bottom = top;
  for (const child of page.children) {
    if (child.tagName === 'STYLE') continue;
    const childRect = child.getBoundingClientRect();
    const margin = parseFloat(view.getComputedStyle(child).marginBottom) || 0;
    bottom = Math.max(bottom, childRect.bottom + margin);
    // A fixed-height or flex wrapper must not hide overflowing descendants.
    for (const node of child.querySelectorAll('*')) {
      if (node.tagName === 'STYLE') continue;
      bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
    }
  }
  const used = Math.max(0, bottom - top);
  return { used, budget, fits: used <= budget - TOLERANCE, usedMm: used / PX_PER_MM, availableMm: budget / PX_PER_MM };
}
export function newPage(original, after, probe = false) {
  const page = original.cloneNode(false);
  page.removeAttribute('id');
  if (!probe) page.classList.add('pp-page--continuation');
  naturalFrame(page);
  after.after(page);
  return page;
}
function sameShell(a, b) {
  return a?.nodeType === 1 && b?.nodeType === 1 && a.tagName === b.tagName
    && a.dataset.paginationOrigin && a.dataset.paginationOrigin === b.dataset.paginationOrigin;
}
function mergeShell(target, incoming) {
  for (const child of [...incoming.childNodes]) {
    if (child.nodeType === 1 && /^(THEAD|COLGROUP)$/.test(child.tagName)
        && [...target.children].some((existing) => sameShell(existing, child))) continue;
    if (sameShell(target.lastChild, child)) mergeShell(target.lastChild, child);
    else target.append(child);
  }
}
/** Adjacent fragments reconstruct their original wrappers and table, once per sheet. */
export function appendUnit(page, unit) {
  const node = unit.node.cloneNode(true);
  if (sameShell(page.lastElementChild, node)) mergeShell(page.lastElementChild, node);
  else page.append(node);
  const first = page.firstElementChild;
  const header = first?.matches('.pp-header--continued') ? first : first?.querySelector('.pp-header--continued');
  if (header) setPrintStyle(header, 'margin-top', '0');
}
export function materialize(page, units, start = 0, end = units.length) {
  page.replaceChildren();
  for (let index = start; index < end; index += 1) appendUnit(page, units[index]);
  return pageMeasurement(page);
}
export function freezePage(page, index) {
  setPrintStyle(page, 'height', '297mm');
  setPrintStyle(page, 'break-inside', 'avoid');
  setPrintStyle(page, 'page-break-inside', 'avoid');
  setPrintStyle(page, 'break-before', index === 0 ? 'auto' : 'page');
  setPrintStyle(page, 'page-break-before', index === 0 ? 'auto' : 'always');
}