import {
  FRAGMENT_REFUSAL,
  paginationFailureError,
} from '@/components/proposal/export/composition/paginationFailureDiagnostics';

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
export function fragmentTextUnit(unit, prefix, measureUnits, allocation = null) {
  const target = unit.node.matches('p,li,figcaption') ? unit.node : unit.node.querySelector('p,li,figcaption');
  // The stop itself is unchanged — the same safe failure, refusing to remove
  // content. What is added is the record of WHICH block it was: the section, the
  // editorial composition, the element, its measured height and the printable
  // height it exceeded. No copy is carried in it.
  const failure = (refusal, reached) => paginationFailureError({
    unit, prefix, measureUnits, allocation, refusal, target: reached,
  });
  if (!target || target.querySelector('img,video,svg,table')) {
    throw failure(
      target ? FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT : FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH,
      target,
    );
  }
  const source = textBoundaries(target);
  if (!source.length) throw failure(FRAGMENT_REFUSAL.EMPTY_OVERSIZED_BLOCK, target);
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
      let offset = start;
      choices = Array.from(source.text.slice(start, choices[0])).map((character) => { offset += character.length; return offset; });
      low = 0; high = choices.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (measureUnits([...opening, fragment(start, choices[mid])]).fits) { accepted = mid; low = mid + 1; }
        else high = mid - 1;
      }
    }
    if (accepted < 0) throw failure(FRAGMENT_REFUSAL.NO_FITTING_FRAGMENT, target);
    let end = choices[accepted];
    // Do not leave a tiny final text fragment if one earlier word boundary can balance it.
    if (end < source.length && source.length - end < 120 && accepted > 0) end = choices[accepted - 1];
    result.push(fragment(start, end));
    start = end;
  }
  // Rebalance the unavoidable paragraph continuations by their measured height.
  // A failed balancing attempt retains the already-fitting, complete greedy fragments.
  let balanced = null;
  if (result.length > 1) {
    const targetHeight = result.reduce((sum, part, index) => sum + measureUnits(index ? [part] : [...prefix, part]).used, 0) / result.length;
    const candidate = [];
    let cursor = 0;
    for (let index = 0; index < result.length; index += 1) {
      const opening = index ? [] : prefix;
      if (index === result.length - 1) {
        const tail = fragment(cursor, source.length);
        if (!measureUnits([...opening, tail]).fits) break;
        candidate.push(tail); cursor = source.length; break;
      }
      const choices = boundaries.filter((end) => end > cursor && end < source.length);
      let low = 0; let high = choices.length - 1; let accepted = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const measured = measureUnits([...opening, fragment(cursor, choices[mid])]);
        if (measured.fits && measured.used <= targetHeight) { accepted = mid; low = mid + 1; }
        else high = mid - 1;
      }
      if (accepted < 0) break;
      candidate.push(fragment(cursor, choices[accepted])); cursor = choices[accepted];
    }
    if (cursor === source.length && candidate.length === result.length) balanced = candidate;
  }
  const completed = balanced || result;
  completed[completed.length - 1].keepNext = unit.keepNext;
  return completed;
}