/**
 * proposalProductCatalogue.js (shared)
 * ------------------------------------
 * The Artcoustic product vocabulary used to RECOGNISE a product name in prose,
 * and the generic wording that replaces it when it is not selected.
 *
 * Data only: it decides nothing about what is allowed. The version-specific
 * allowed list is built by proposalProductGrounding.js from the frozen system
 * authority, and this catalogue is what that list is compared against.
 *
 * Matchers are derived from the app's speaker-registry keys, so a written name
 * is recognised however it is punctuated:
 *
 *   spitfire-cloud -> "Spitfire Cloud", "Spitfire-Cloud", "Cloud"
 *   q6-3           -> "Q6-3", "Q6 3"
 *   sub4-12        -> "SUB4-12", "SUB4 12"
 *
 * The longest, most specific name wins where two overlap, so "Evolve 1-1" is
 * never read as "Evolve 1".
 *
 * Pure: no React, no SDK, no writes.
 */

/** Generic wording used when an unselected product name has to be removed. */
export const GENERIC_BY_KIND = Object.freeze({
  lcr: 'the selected Artcoustic screen-wall loudspeakers',
  soundbar: 'the selected Artcoustic centre loudspeaker',
  surround: 'the selected Artcoustic surround loudspeakers',
  overhead: 'the selected Artcoustic overhead loudspeakers',
  subwoofer: 'the selected subwoofers',
  treatment: 'the specified acoustic treatment',
  any: 'the selected Artcoustic loudspeakers',
});

/** The Artcoustic products the app can specify, keyed as the registry keys them. */
export const PRODUCT_CATALOGUE = Object.freeze([
  { key: 'q4-3', label: 'Q4-3', family: 'spitfire', kind: 'lcr' },
  { key: 'q6-3', label: 'Q6-3', family: 'spitfire', kind: 'lcr' },
  { key: 'q4-5', label: 'Q4-5', family: 'spitfire', kind: 'lcr' },
  { key: 'q8-5', label: 'Q8-5', family: 'spitfire', kind: 'lcr' },
  { key: 'mikro', label: 'Mikro', family: 'mikro', kind: 'overhead' },
  { key: 'architect-mikro', label: 'Architect Mikro', family: 'architect', kind: 'overhead' },
  { key: 'evolve-1', label: 'Evolve 1', family: 'evolve', kind: 'surround' },
  { key: 'evolve-1-1', label: 'Evolve 1-1', family: 'evolve', kind: 'surround' },
  { key: 'sl-evolve-1-1', label: 'SL Evolve 1-1', family: 'evolve', kind: 'surround' },
  { key: 'evolve-2-1', label: 'Evolve 2-1', family: 'evolve', kind: 'surround' },
  { key: 'evolve-3-1', label: 'Evolve 3-1', family: 'evolve', kind: 'surround' },
  { key: 'evolve-4-2', label: 'Evolve 4-2', family: 'evolve', kind: 'surround' },
  { key: 'evolve-6-3', label: 'Evolve 6-3', family: 'evolve', kind: 'surround' },
  { key: 'evolve-8-4', label: 'Evolve 8-4', family: 'evolve', kind: 'surround' },
  { key: 'architect-2-1', label: 'Architect 2-1', family: 'architect', kind: 'overhead' },
  { key: 'architect-4-2-mk2', label: 'Architect 4-2 MkII', family: 'architect', kind: 'overhead', aliases: ['architect 4-2 mk2', 'architect 4.2 mkii'] },
  { key: 'spitfire-cloud', label: 'Spitfire Cloud', family: 'spitfire', kind: 'overhead', aliases: ['cloud'] },
  { key: 'architect-4-2', label: 'Architect 4-2', family: 'architect', kind: 'overhead' },
  { key: 'architect-pas2-2', label: 'Architect PAS2-2', family: 'architect', kind: 'overhead' },
  { key: 'c-1', label: 'C-1', family: 'soundbar', kind: 'soundbar' },
  { key: 'c4-1', label: 'C4-1', family: 'soundbar', kind: 'soundbar' },
  { key: 'multi-lcr', label: 'Multi LCR', family: 'soundbar', kind: 'soundbar' },
  { key: 'multi-mono', label: 'Multi Mono', family: 'soundbar', kind: 'soundbar' },
  { key: 'hspl-lcr', label: 'HSPL LCR', family: 'soundbar', kind: 'soundbar' },
  { key: 'hspl-mono', label: 'HSPL Mono', family: 'soundbar', kind: 'soundbar' },
  { key: 'sub2-12', label: 'SUB2-12', family: 'subwoofer', kind: 'subwoofer' },
  { key: 'sub3-12', label: 'SUB3-12', family: 'subwoofer', kind: 'subwoofer' },
  { key: 'sub4-12', label: 'SUB4-12', family: 'subwoofer', kind: 'subwoofer' },
  { key: 'abfuser', label: 'Abfuser', family: 'abfuser', kind: 'treatment' },
]);

/**
 * Earlier Artcoustic product names a writer may reach for from memory. They are
 * never selected in a current version, so naming one is always ungrounded.
 */
export const LEGACY_PRODUCT_NAMES = Object.freeze([
  { key: 'spitfire-a6', label: 'Spitfire A6', family: 'spitfire', kind: 'lcr' },
  { key: 'spitfire-a4', label: 'Spitfire A4', family: 'spitfire', kind: 'lcr' },
  { key: 'diablo', label: 'Diablo', family: 'spitfire', kind: 'lcr' },
]);

/**
 * A bare family word. It is judged against the version's own products: "Spitfire"
 * is grounded when the version has a Spitfire product, and ungrounded when it
 * does not. Only distinctive product-line words appear here.
 */
export const PRODUCT_FAMILY_WORDS = Object.freeze([
  { family: 'spitfire', label: 'Spitfire', pattern: /\bspitfire\b/i },
  { family: 'evolve', label: 'Evolve', pattern: /\bevolve\b/i },
  { family: 'architect', label: 'Architect', pattern: /\barchitect\b/i },
  { family: 'mikro', label: 'Mikro', pattern: /\bmikro\b/i },
  { family: 'abfuser', label: 'Abfuser', pattern: /\babfuser\b/i },
]);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A matcher built from the key: word boundaries at both ends, any separator
 * between the parts, plus the declared aliases.
 */
function namePattern(product) {
  const parts = String(product.key).split('-').map(escapeRegExp);
  const forms = [
    parts.join('[\\s\\-_]*'),
    ...(product.aliases || []).map((alias) => escapeRegExp(alias).replace(/\\?\s+/g, '[\\s\\-_]+')),
  ];
  return new RegExp(`\\b(?:${forms.join('|')})\\b`, 'i');
}

/** Every recognised product name, with its matcher and its generic wording. */
export const CATALOGUE_ALL = Object.freeze([...PRODUCT_CATALOGUE, ...LEGACY_PRODUCT_NAMES].map((product) => ({
  ...product,
  pattern: namePattern(product),
  generic: GENERIC_BY_KIND[product.kind] || GENERIC_BY_KIND.any,
})));

/** A loose matcher for an authority string that is not a catalogue product. */
export function rawNamePattern(name) {
  const parts = String(name).trim().split(/[\s\-_/×]+/).filter(Boolean).map(escapeRegExp);
  return parts.length > 1 ? new RegExp(`\\b${parts.join('[\\s\\-_]*')}\\b`, 'i') : null;
}

/**
 * Every recognised product name in a text, with its position. Where two names
 * overlap, the longest and most specific one is kept, so "Evolve 1-1" is read as
 * one product rather than as "Evolve 1".
 *
 * A trailing possessive is included in the match, so a removed name takes its
 * "'s" with it.
 *
 * @returns {Array<{ product: object, start: number, end: number, text: string, possessive: boolean }>}
 */
export function findProductMatches(text) {
  const source = String(text || '');
  if (!source) return [];
  const found = [];

  for (const product of CATALOGUE_ALL) {
    const pattern = new RegExp(`${product.pattern.source}(?:['’]s)?`, 'gi');
    let match = pattern.exec(source);
    while (match) {
      found.push({
        product,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        possessive: /['’]s$/.test(match[0]),
      });
      if (pattern.lastIndex <= match.index) pattern.lastIndex = match.index + 1;
      match = pattern.exec(source);
    }
  }

  // Longest name first, then earliest: an overlapping shorter name is dropped.
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const accepted = [];
  for (const candidate of found) {
    if (accepted.some((kept) => candidate.start < kept.end && kept.start < candidate.end)) continue;
    accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/** The catalogue products named in a text, most specific first. */
export function catalogueProductsInText(text) {
  return findProductMatches(text).map((match) => match.product);
}

export default PRODUCT_CATALOGUE;