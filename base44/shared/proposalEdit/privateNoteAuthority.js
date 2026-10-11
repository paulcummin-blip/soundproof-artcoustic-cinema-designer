// Publication-only guard: private instructions remain instructions, not prose.
export function publicationText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))))
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, name) => ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[name.toLowerCase()]))
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export function containsPrivateNote(text, notes = []) {
  const content = publicationText(text);
  if (!content) return false;
  return notes.filter(Boolean).some(note => {
    const full = publicationText(note);
    if (full && content === full) return true;
    const fragments = [full, ...String(note).split(/[.!?;\n]+/).map(publicationText)];
    return fragments.some(fragment => fragment.length >= 12 && content.includes(fragment));
  });
}