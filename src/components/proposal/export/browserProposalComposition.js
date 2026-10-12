/** Measured browser A4 composition. Works only on an export clone, never saved copy. */
const PX_PER_MM = 96 / 25.4;
const SHEET_HEIGHT = 297 * PX_PER_MM;
const EPSILON = 0.25;

/** Make the existing print typography/layout measurable before opening Print. */
export function proposalMeasurementCss(doc) {
  return [...doc.querySelectorAll('style')]
    .filter((style) => !style.hasAttribute('data-browser-composition-style'))
    .map((style) => style.textContent || '')
    .filter((css) => /@media\s+print/i.test(css))
    .map((css) => css.replace(/@media\s+print/gi, '@media all').replace(/@media\s+screen/gi, '@media not all'))
    .join('\n');
}

function set(element, property, value) {
  element.style.setProperty(property, value, 'important');
}

function naturalFrame(page) {
  set(page, 'width', '210mm');
  set(page, 'box-sizing', 'border-box');
  set(page, 'height', 'auto');
  set(page, 'min-height', '0');
  set(page, 'max-height', 'none');
  set(page, 'margin', '0');
  set(page, 'display', 'flow-root');
}

function fits(page) {
  return page.getBoundingClientRect().height <= SHEET_HEIGHT - EPSILON;
}

function newPage(original, after) {
  const page = original.cloneNode(false);
  page.removeAttribute('id');
  page.classList.add('pp-page--continuation');
  naturalFrame(page);
  after.after(page);
  return page;
}

function place(page, block) {
  page.append(block);
  // A continued heading's inter-section gap isn't a page-top margin.
  const header = block.querySelector?.('.pp-header--continued');
  if (header) {
    if (page.firstElementChild === block) set(header, 'margin-top', '0');
    else header.style.removeProperty('margin-top');
  }
}

/** Only open a section that exceeds a complete sheet, preserving paragraph shells. */
function longSectionBlocks(section) {
  const units = [];
  for (const child of [...section.children]) {
    if (child.matches('.pp-body') && child.children.length) {
      let shell = null;
      const prefix = [];
      for (const paragraph of [...child.childNodes]) {
        if (paragraph.nodeType === 3 && !paragraph.textContent.trim()) {
          if (shell) shell.append(paragraph);
          else prefix.push(paragraph);
          continue;
        }
        shell = child.cloneNode(false);
        shell.append(...prefix.splice(0), paragraph);
        units.push(shell);
      }
      if (prefix.length) {
        shell = child.cloneNode(false);
        shell.append(...prefix);
        units.push(shell);
      }
    } else units.push(child);
  }
  // The complete header (number, DESIGN, title, rule) always travels with opening copy.
  const blocks = [];
  for (let i = 0; i < units.length; i += 1) {
    const block = section.cloneNode(false);
    block.append(units[i]);
    if (units[i].matches('.pp-header')) {
      if (units[i + 1]) block.append(units[++i]);
      if (block.lastElementChild.matches('.pp-media') && units[i + 1]) block.append(units[++i]);
    } else if (units[i].querySelector('h1,h2,h3,h4') && units[i + 1]) {
      block.append(units[++i]);
    }
    blocks.push(block);
  }
  return blocks;
}

function composeNarrative(original) {
  const groups = [...original.children];
  let page = original;
  original.replaceChildren();
  for (const group of groups) {
    const hadContent = Boolean(page.firstElementChild);
    place(page, group);
    if (fits(page)) continue;
    if (hadContent) {
      group.remove();
      page = newPage(original, page);
      place(page, group);
      if (fits(page)) continue;
    }
    group.remove();
    const blocks = group.hasAttribute('data-editorial-section') ? longSectionBlocks(group) : [group];
    for (const block of blocks) {
      const occupied = Boolean(page.firstElementChild);
      place(page, block);
      if (fits(page)) continue;
      if (occupied) {
        block.remove();
        page = newPage(original, page);
        place(page, block);
      }
      if (!fits(page)) throw new Error('A proposal block exceeds one printable A4 page. Printing stopped without clipping or shrinking it.');
    }
  }
}

/** Measured row partitions: every sheet carries at least two rows, final note included. */
function composePerformance(original) {
  if (fits(original)) return;
  const table = original.querySelector('.kph-table');
  if (!table) throw new Error('The performance page exceeds A4 without a measurable table.');
  const host = table.parentElement;
  const rows = [...table.tBodies].flatMap((body) => [...body.rows]);
  const leading = [...original.children].filter((child) => child !== host);
  const trailing = [...host.childNodes].filter((node) => node !== table);
  // Measure the COMPLETE table including its closing note on a fresh sheet.
  // A real introduction may stay on the first sheet; never strand a bare title.
  const wholeTablePage = newPage(original, original);
  wholeTablePage.append(host);
  if (fits(wholeTablePage) && fits(original)
      && leading.some((node) => node.matches('.pp-highlights__intro') && node.textContent.trim())) {
    return;
  }
  original.append(host);
  wholeTablePage.remove();
  // Freeze the existing column geometry, not the font sizes, before measuring subsets.
  const widths = [...table.tHead.rows[0].cells].map((cell) => cell.getBoundingClientRect().width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const colgroup = table.ownerDocument.createElement('colgroup');
  widths.forEach((width) => {
    const col = table.ownerDocument.createElement('col');
    col.style.width = `${width / total * 100}%`;
    colgroup.append(col);
  });
  table.prepend(colgroup);
  set(table, 'table-layout', 'fixed');
  const shell = table.cloneNode(true);
  [...shell.tBodies].forEach((body) => body.remove());
  const makeHost = (subset, last) => {
    const wrapper = host.cloneNode(false);
    const grid = shell.cloneNode(true);
    const body = table.ownerDocument.createElement('tbody');
    subset.forEach((row) => body.append(row));
    grid.append(body);
    wrapper.append(grid);
    if (last) trailing.forEach((node) => wrapper.append(node));
    return wrapper;
  };
  // Search fewest pages first, then the most balanced valid distribution.
  // For eight rows this prefers 4/4 over 6/2; it can never produce 7/1.
  const probe = newPage(original, original);
  const feasible = (start, count, first, last) => {
    probe.replaceChildren();
    if (first) leading.forEach((node) => probe.append(node.cloneNode(true)));
    const clones = rows.slice(start, start + count).map((row) => row.cloneNode(true));
    const wrapper = makeHost(clones, false);
    if (last) trailing.forEach((node) => wrapper.append(node.cloneNode(true)));
    probe.append(wrapper);
    return fits(probe);
  };
  let partition = null;
  for (let sheets = 2; sheets <= Math.floor(rows.length / 2) && !partition; sheets += 1) {
    const search = (start, remaining, counts) => {
      if (remaining === 0) return start === rows.length ? counts : null;
      const maximum = rows.length - start - 2 * (remaining - 1);
      const ideal = (rows.length - start) / remaining;
      const candidates = Array.from({ length: Math.max(0, maximum - 1) }, (_, i) => i + 2)
        .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
      for (const count of candidates) {
        if (!feasible(start, count, start === 0, remaining === 1)) continue;
        const found = search(start + count, remaining - 1, [...counts, count]);
        if (found) return found;
      }
      return null;
    };
    partition = search(0, sheets, []);
  }
  probe.remove();
  if (!partition) throw new Error('The performance table cannot fit A4 with at least two complete rows per sheet. Printing stopped without removing content.');
  original.replaceChildren(...leading);
  let page = original;
  let cursor = 0;
  partition.forEach((count, index) => {
    if (index) page = newPage(original, page);
    page.append(makeHost(rows.slice(cursor, cursor + count), index === partition.length - 1));
    cursor += count;
  });
}

function contentSignature(root) {
  // Column headings alone may repeat; every other text node and image must match in order.
  const clone = root.cloneNode(true);
  clone.querySelectorAll('style,thead').forEach((node) => node.remove());
  return JSON.stringify({
    text: clone.textContent.replace(/\s+/g, ' ').trim(),
    images: [...clone.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    rows: [...clone.querySelectorAll('tbody tr')].map((row) => row.textContent),
  });
}

export function composeBrowserProposal(doc) {
  const root = doc.querySelector('.proposal-print-portal');
  if (!root) throw new Error('The proposal print composition is unavailable.');
  if (root.dataset.browserComposed === 'true') return;
  const signature = contentSignature(root);
  const pages = [...root.querySelectorAll('.pp-page')].filter((page) => page.parentElement === root);
  pages.forEach(naturalFrame);
  pages.forEach((page) => {
    if (page.classList.contains('pp-page--flow')) composeNarrative(page);
    else if (page.classList.contains('pp-page--highlights')) composePerformance(page);
    // Good designed pages are not recomposed, rescaled or restyled internally.
  });
  if (contentSignature(root) !== signature) throw new Error('Proposal composition changed the content inventory. Printing stopped.');
  const composed = [...root.querySelectorAll('.pp-page')].filter((page) => page.parentElement === root);
  composed.forEach((page, index) => {
    if (!fits(page)) throw new Error(`Proposal sheet ${index + 2} exceeds A4. Printing stopped without clipping.`);
    set(page, 'height', '297mm');
    set(page, 'break-inside', 'avoid');
    set(page, 'page-break-inside', 'avoid');
    set(page, 'break-before', index === 0 ? 'auto' : 'page');
    set(page, 'page-break-before', index === 0 ? 'auto' : 'always');
  });
  root.dataset.browserComposed = 'true';
  // A read-only inventory for inspecting first/last blocks in the actual print window.
  doc.defaultView.__PROPOSAL_PAGE_INVENTORY__ = composed.map((page, index) => ({
    page: index + 2,
    first: page.firstElementChild?.textContent?.trim().slice(0, 160),
    last: page.lastElementChild?.textContent?.trim().slice(-160),
    rows: page.querySelectorAll('.kph-table tbody tr').length,
    size: '210 × 297 mm',
  }));
}