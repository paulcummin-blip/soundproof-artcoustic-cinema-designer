/**
 * proposalProductSentenceRewriter.js (shared)
 * -------------------------------------------
 * The deterministic sentence rewriter behind proposal product grounding.
 *
 * When a generated sentence names a product the design version does not have,
 * the sentence is not patched: patching leaves copy like "combines an Architect
 * and the selected Artcoustic overhead loudspeakers array", which is safe but
 * reads like a repair. The whole sentence is rewritten instead, in the report's
 * own voice, using the layers the design has and — only where that is
 * unambiguous — the one product selected for a layer.
 *
 *   "The overhead layer combines an Architect and Spitfire Cloud overhead array,
 *    so effects travel convincingly above the seats."
 *      -> "The overhead layer uses Architect 2-1 loudspeakers to provide coverage
 *          above the seating area."
 *
 * The vocabulary (product names, role wording, keywords) lives in
 * proposalProductCatalogue.js. This module owns the grammar.
 *
 * Pure: no React, no SDK, no writes.
 */

import {
  CATALOGUE_ALL,
  GENERIC_BY_KIND,
  LOUDSPEAKER_ROLES,
  NAMED_PHRASES,
  PRODUCT_FAMILY_WORDS,
  ROLE_KEYWORDS,
  ROLE_NOUNS,
  ROLE_ORDER,
  findProductMatches,
  genericPhrase,
  rawNamePattern,
} from './proposalProductCatalogue.js';

/** A sentence's intent, from its own words. */
const TIMBRE_PATTERN = /(timbre|tonal|tonally|consistency|consistent)/i;

/** A version-scoped sentence subject: "The Level 4 version", "Option B", "Version 2". */
const VERSION_SUBJECT_PATTERN = /^\s*((?:The\s+)?(?:Level\s+\d+|Version\s+\d+|Option\s+[A-Z])(?:\s+version)?)/;

const stripTags = (text) => String(text || '').replace(/<[^>]*>/g, ' ');

/** True when this grounding has a version with products to police. */
const hasProductAuthority = (grounding) => Boolean(grounding?.available)
  && Array.isArray(grounding.versions)
  && grounding.versions.some((version) => version.products.length > 0);

/** Split HTML into sentence-sized segments without cutting through a tag. */
function sentenceSegments(html) {
  const source = String(html || '');
  const segments = [];
  let start = 0;
  let inTag = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '<') inTag = true;
    else if (char === '>') inTag = false;
    else if (!inTag && (char === '.' || char === '!' || char === '?') && /\s/.test(source[index + 1] || ' ')) {
      segments.push(source.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < source.length) segments.push(source.slice(start));
  return segments;
}

/**
 * The versions a sentence is about: by name, by option label, by the short
 * reference it opens with ("Level 4 relies on ..."), or all of them. A short
 * reference is only read at the start of a sentence, so an RP22 performance
 * level mentioned in passing ("reaches Level 1") never scopes the sentence.
 */
function versionsForSegment(segment, grounding) {
  const text = stripTags(segment).toLowerCase();
  const leading = text.match(/^\s*(?:the\s+)?((?:level|version)\s+\d+|option\s+[a-z])\b/);
  const matched = grounding.versions.filter((version) => {
    const label = String(version.label).toLowerCase();
    const option = version.optionLabel ? String(version.optionLabel).toLowerCase() : null;
    if (text.includes(label) || (option && text.includes(option))) return true;
    if (!leading) return false;
    const short = label.match(/^(?:(?:level|version)\s+\d+|option\s+[a-z])/);
    return Boolean(short && short[0] === leading[1]);
  });
  return matched.length > 0 ? matched : grounding.versions;
}

/** What the versions of one sentence are allowed to name. */
function allowedFor(versions) {
  const keys = new Set();
  const families = new Set();
  const rawPatterns = [];
  for (const version of versions) {
    for (const product of version.products) {
      if (product.catalogueKey) keys.add(product.catalogueKey);
      if (product.family) families.add(product.family);
      if (!product.catalogueKey) {
        const pattern = rawNamePattern(product.name);
        if (pattern) rawPatterns.push(pattern);
      }
    }
  }
  return { keys, families, rawPatterns };
}

/** The unselected products a sentence names. */
function invalidMentions(segment, { keys, families, rawPatterns }) {
  const invalid = [];
  for (const match of findProductMatches(segment)) {
    const { product } = match;
    if (keys.has(product.key)) continue;
    if (rawPatterns.some((pattern) => pattern.test(match.text))) continue;
    invalid.push({ name: product.label, kind: product.kind });
  }
  if (keys.size === 0) return invalid;

  for (const family of PRODUCT_FAMILY_WORDS) {
    if (families.has(family.family)) continue;
    if (!family.pattern.test(stripTags(segment))) continue;
    // A family word already carried by a named product is reported once.
    if (invalid.some((item) => new RegExp(family.label, 'i').test(item.name))) continue;
    invalid.push({ name: family.label, kind: 'any' });
  }
  return invalid;
}

/** Which layers a sentence is talking about: its own words, and its products. */
function rolesFor(segment, invalid) {
  const text = stripTags(segment);
  const found = new Set();
  for (const item of invalid) {
    if (item.kind !== 'any' && ROLE_NOUNS[item.kind]) found.add(item.kind);
  }
  for (const entry of ROLE_KEYWORDS) {
    if (entry.pattern.test(text)) found.add(entry.role);
  }
  for (const match of findProductMatches(text)) {
    if (ROLE_NOUNS[match.product.kind]) found.add(match.product.kind);
  }
  return ROLE_ORDER.filter((role) => found.has(role));
}

/** A version subject the sentence opens with, kept in the rewrite. */
function versionSubject(segment) {
  const match = stripTags(segment).match(VERSION_SUBJECT_PATTERN);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/** The one product selected for a layer, when it is unambiguous. */
function namedProductFor(role, versions) {
  const names = new Set();
  for (const version of versions) {
    for (const product of version.products) {
      if (product.kind === role) names.add(product.name);
    }
  }
  return names.size === 1 ? [...names][0] : null;
}

/**
 * A layer's wording: its one selected model where that is unambiguous and the
 * sentence did not claim a different model for that layer, otherwise clean role
 * language.
 */
function phraseFor(role, { versions, misnamed, onlyRole, forceGeneric }) {
  const named = forceGeneric ? null : namedProductFor(role, versions);
  if (named && (!misnamed.has(role) || onlyRole)) {
    return { text: (NAMED_PHRASES[role] || NAMED_PHRASES.any)(named), named: true };
  }
  return { text: genericPhrase(role), named: false };
}

/** "a", "a and b", "a, b and c" — British report style. */
function joinList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The clean sentence for a rewritten segment: role-based, grammatical, and
 * naming only products the version actually has.
 */
function composeGroundedSentence({ roles, phrases, subject }) {
  if (roles.length === 0) {
    const one = phrases[0];
    return `${subject || 'This design'} uses ${one ? one.text : genericPhrase('any')} to support the required performance.`;
  }

  const list = roles.map((role) => phrases[role]);
  const single = roles.length === 1 ? roles[0] : null;

  /**
   * A sentence scoped to one version, or covering several layers at once, states
   * the layers the design uses rather than stitching product names together.
   */
  const layerStatement = () => {
    const namedPhrases = list.filter((phrase) => phrase.named);
    const loudspeakerNouns = roles.filter((role) => LOUDSPEAKER_ROLES.includes(role)).map((role) => ROLE_NOUNS[role]);
    const hasSub = roles.includes('subwoofer');
    const hasTreatment = roles.includes('treatment');
    const tail = roles.every((role) => LOUDSPEAKER_ROLES.includes(role) || role === 'treatment') ? 'coverage' : 'performance';

    // Nothing here may be named: the layers are described, not the models.
    if (namedPhrases.length === 0) {
      const parts = [];
      if (loudspeakerNouns.length > 0) parts.push(`its selected ${joinList(loudspeakerNouns)} loudspeakers`);
      if (hasSub) parts.push(GENERIC_BY_KIND.subwoofer);
      if (hasTreatment) parts.push(GENERIC_BY_KIND.treatment);
      return `${subject || 'This design'} uses ${joinList(parts) || genericPhrase('any')} to support the required ${tail}.`;
    }

    return `${subject || 'This design'} uses ${joinList(list.map((phrase) => phrase.text))} to support the required ${tail}.`;
  };

  if (subject) return layerStatement();
  if (single === 'overhead') {
    return `The overhead layer uses ${list[0].text} to provide coverage above the seating area.`;
  }
  if (single === 'surround') {
    return `The surround layer uses ${list[0].text} to provide coverage around and behind the seating area.`;
  }
  if (single === 'lcr' || single === 'soundbar') {
    return `The front stage uses ${list[0].text} to anchor the performance at the screen.`;
  }
  if (single === 'subwoofer') {
    return `Low-frequency support comes from ${list[0].text}.`;
  }
  if (single === 'treatment') {
    return `Acoustic treatment is provided by ${list[0].text}.`;
  }
  return layerStatement();
}

/** Rewrite one sentence that named an unselected product, keeping its markup. */
function rewriteSegment(segment, invalid, context) {
  const leading = (String(segment).match(/^(?:\s|<[^>]*>)+/) || [''])[0];
  const rest = String(segment).slice(leading.length);
  const trailingMatch = rest.match(/(?:\s|<[^>]*>)+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const text = rest.slice(0, rest.length - trailing.length);
  if (!text.trim()) return segment;

  const roles = rolesFor(text, invalid);
  const misnamed = new Set(invalid.map((item) => item.kind).filter((kind) => kind !== 'any'));
  // A sentence scoped to one version states its layers, never a model.
  const subject = versionSubject(text);
  const phrases = {};
  for (const role of roles) {
    phrases[role] = phraseFor(role, {
      versions: context.versions,
      misnamed,
      onlyRole: roles.length === 1,
      forceGeneric: Boolean(subject),
    });
  }

  const isTimbre = TIMBRE_PATTERN.test(stripTags(text)) && !subject;

  const sentence = isTimbre && roles.length > 0
    ? `Timbre consistency comes from ${joinList(roles.map((role) => phrases[role].text))}.`
    : composeGroundedSentence({ roles, phrases, subject });

  return `${leading}${sentence}${trailing}`;
}

/**
 * The deterministic post-generation pass.
 *
 * A sentence naming an unselected product is replaced in full with a clean
 * role-based sentence, so no ungrounded product reaches the client and no
 * patched phrase reaches the client either. A mention that survives the pass is
 * reported as unresolved, and the caller rejects the section rather than
 * storing it.
 *
 * @param {string} html
 * @param {object} grounding — buildProductGrounding() output
 * @returns {{ html: string, grounded: boolean, violations: Array, replacements: number, unresolved: Array }}
 */
export function groundProductMentions(html, grounding) {
  const source = String(html || '');
  if (!hasProductAuthority(grounding) || !source) {
    return { html: source, grounded: true, violations: [], replacements: 0, unresolved: [] };
  }

  const violations = [];
  let replacements = 0;

  const segments = sentenceSegments(source).map((segment) => {
    if (!segment.trim()) return segment;
    const versions = versionsForSegment(segment, grounding);
    const invalid = invalidMentions(segment, allowedFor(versions));
    if (invalid.length === 0) return segment;

    replacements += 1;
    for (const item of invalid) {
      violations.push({
        kind: item.kind === 'any' ? 'family' : 'product',
        name: item.name,
        version: versions.map((version) => version.label).join(' | '),
        segment: stripTags(segment).trim(),
      });
    }
    return rewriteSegment(segment, invalid, { versions });
  });

  const cleaned = segments.join('');

  // Anything the pass could not remove is reported, so it can be rejected.
  const unresolved = violations.filter((violation) => {
    const product = CATALOGUE_ALL.find((entry) => entry.label === violation.name);
    const family = PRODUCT_FAMILY_WORDS.find((entry) => entry.label === violation.name);
    const pattern = violation.kind === 'family' ? family?.pattern : product?.pattern;
    return pattern ? pattern.test(cleaned) : false;
  });

  return {
    html: cleaned,
    grounded: unresolved.length === 0,
    violations,
    replacements,
    unresolved,
  };
}

export default groundProductMentions;