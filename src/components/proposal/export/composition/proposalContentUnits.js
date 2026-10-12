/** Semantic units within the measured browser compositor; original DOM order is authoritative. */
const PROSE = '.pp-body,.pp-endnote__body,.proposal-print-section__body';
const HEADING = '.pp-header,.pp-block__title,.pp-facts-group__title,.pp-decision__title,.pp-endnote__title,h1,h2,h3,h4';
function shell(node) {
  const copy = node.cloneNode(false);
  if (copy.nodeType === 1) copy.removeAttribute('id');
  return copy;
}
function wrapped(node, ancestors) {
  let copy = node.cloneNode(true);
  for (const parent of [...ancestors].reverse()) {
    const container = shell(parent);
    container.append(copy);
    copy = container;
  }
  copy.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
  return copy;
}
export function markCompositionOrigins(page) {
  [...page.querySelectorAll('*')].forEach((node, index) => { node.dataset.paginationOrigin = `${page.dataset.paginationFrame}:${index}`; });
  // Keep column geometry identical for all row fragments, including five-option comparisons.
  page.querySelectorAll('table').forEach((table) => {
    const cells = [...(table.tHead?.rows[0]?.cells || [])];
    const widths = cells.map((cell) => cell.getBoundingClientRect().width);
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (!total || table.querySelector('colgroup')) return;
    const columns = table.ownerDocument.createElement('colgroup');
    columns.dataset.paginationOrigin = `${table.dataset.paginationOrigin}:columns`;
    widths.forEach((width) => {
      const col = table.ownerDocument.createElement('col');
      col.style.width = `${width / total * 100}%`;
      columns.append(col);
    });
    table.prepend(columns);
    table.style.setProperty('table-layout', 'fixed', 'important');
  });
}
export function proposalContentUnits(page, measureUnits) {
  const units = [];
  const atom = (source, ancestors, extra = {}) => ({ node: wrapped(source, ancestors), source, keepNext: source.matches?.(HEADING) || false, ...extra });
  const tableUnits = (table, ancestors) => {
    const entries = [...table.tBodies].flatMap((body) => [...body.rows].map((row) => ({ body, row })));
    if (!entries.length) return [atom(table, ancestors)];
    return entries.map(({ body, row }, index) => {
      const grid = shell(table);
      for (const child of table.children) {
        if (child.matches('colgroup,thead') || (index === 0 && child.matches('caption'))
            || (index === entries.length - 1 && child.matches('tfoot'))) grid.append(child.cloneNode(true));
      }
      const rows = shell(body);
      rows.append(row.cloneNode(true));
      const footer = grid.querySelector('tfoot');
      if (footer) grid.insertBefore(rows, footer); else grid.append(rows);
      return { node: wrapped(grid, ancestors), source: row, keepNext: false,
        tableId: table.dataset.paginationOrigin, rowTotal: entries.length, rowIndex: index };
    });
  };
  const collect = (node, ancestors = [], force = false) => {
    if (node.nodeType !== 1) return [atom(node, ancestors, { keepNext: !node.textContent.trim() })];
    if (node.matches('table')) return tableUnits(node, ancestors);
    const unit = atom(node, ancestors);
    const prose = node.matches(PROSE);
    if (!force && !prose && measureUnits([unit]).fits) return [unit];
    // Paragraphs are indivisible until the text-fragment step proves one cannot fit.
    if (node.matches('p,li,figcaption') || !node.childNodes.length) return [unit];
    return [...node.childNodes].flatMap((child) => collect(child, [...ancestors, node], child.matches?.(PROSE)));
  };
  for (const group of page.childNodes) {
    const whole = atom(group, []);
    const standalone = measureUnits([whole]);
    const paragraphs = group.querySelectorAll?.('.pp-body p') || [];
    // A long prose section may use spare space; a short section stays a complete unit.
    const longProse = group.hasAttribute?.('data-editorial-section') && paragraphs.length >= 3
      && standalone.used > standalone.budget * 0.55;
    units.push(...(standalone.fits && !longProse ? [whole] : collect(group, [], true)));
  }
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (unit.source.matches?.('.kph-table__note,.pp-endnote') && index > 0) units[index - 1].keepNext = true;
    if (unit.source.matches?.('figure,.pp-media') && index > 0 && units[index - 1].keepNext && index + 1 < units.length) unit.keepNext = true;
    // A tiny opening paragraph keeps a second paragraph instead of opening a section on a single sentence.
    if (unit.source.matches?.('p') && index > 0 && units[index - 1].keepNext
        && unit.source.textContent.trim().length < 160 && units[index + 1]?.source.matches?.('p')) unit.keepNext = true;
  }
  if (page.matches('.pp-page--highlights')) {
    const firstRow = units.findIndex((unit) => unit.tableId);
    if (firstRow >= 0) units.slice(0, firstRow).forEach((unit) => { unit.keepNext = true; });
  }
  return units;
}