/** Fragment only a paragraph that cannot fit its available sheet, retaining inline markup. */
function textBoundaries(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4);
  const nodes = [];
  let text;
  let length = 0;
  while ((text = walker.nextNode())) {
    nodes.push({ node: text, start: length, end: length + text.textContent.length });
    length += text.textContent.length;
  }
  return { nodes, length, text: nodes.map((entry) => entry.node.textContent).join('') };
}
function position(nodes, offset, end) {
  const entry = nodes.find((item) => end ? offset > item.start && offset <= item.end : offset >= item.start && offset < item.end) || nodes[nodes.length - 1];
  return { node: entry.node, offset: Math.max(0, Math.min(entry.node.length, offset - entry.start)) };
}
export function fragmentTextUnit(unit, prefix, measureUnits) {
  const target = unit.node.matches('p,li,figcaption') ? unit.node : unit.node.querySelector('p,li,figcaption');
  if (!target || target.querySelector('img,video,svg,table')) throw new Error('An indivisible proposal block exceeds printable A4 height. Export stopped without removing content.');
  const source = textBoundaries(target);
  if (!source.length) throw new Error('An empty oversized proposal block cannot be paginated.');
  const origin = target.dataset.paginationOrigin;
  const fragment = (start, end) => {
    const node = unit.node.cloneNode(true);
    const destination = node.dataset.paginationOrigin === origin ? node : node.querySelector(`[data-pagination-origin="${origin}"]`);
    const range = target.ownerDocument.createRange();
    const from = position(source.nodes, start, false);
    const to = position(source.nodes, end, true);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    destination.replaceChildren(range.cloneContents());
    return { ...unit, node, keepNext: false, textFragment: true };
  };
  // Whitespace stays on one side of each boundary; no character is lost or added.
  let boundaries = [...source.text.matchAll(/\s+/g)].map((match) => match.index + match[0].length);
  boundaries.push(source.length);
  const result = [];
  let start = 0;
  while (start < source.length) {
    let choices = boundaries.filter((end) => end > start);
    let low = 0;
    let high = choices.length - 1;
    let accepted = -1;
    const opening = result.length === 0 ? prefix : [];
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measureUnits([...opening, fragment(start, choices[mid])]).fits) { accepted = mid; low = mid + 1; }
      else high = mid - 1;
    }
    if (accepted < 0) {
      // Long unbroken words: character boundaries, with the original characters preserved.
      choices = Array.from({ length: choices[0] - start }, (_, index) => start + index + 1);
      low = 0; high = choices.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (measureUnits([...opening, fragment(start, choices[mid])]).fits) { accepted = mid; low = mid + 1; }
        else high = mid - 1;
      }
    }
    if (accepted < 0) throw new Error('The proposal heading and its opening content cannot fit the printable A4 area without changing the design.');
    let end = choices[accepted];
    // Do not leave a tiny final text fragment if one earlier word boundary can balance it.
    if (end < source.length && source.length - end < 120 && accepted > 0) end = choices[accepted - 1];
    result.push(fragment(start, end));
    start = end;
  }
  result[result.length - 1].keepNext = unit.keepNext;
  return result;
}