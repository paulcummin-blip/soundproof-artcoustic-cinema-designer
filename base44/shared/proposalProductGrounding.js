/**
 * proposalProductGrounding.js (shared)
 * ------------------------------------
 * THE product-grounding guard for proposal narrative.
 *
 * HARD RULE: a proposal may name only the products that are actually selected in
 * the specific design version the proposal is about. Anything else — another
 * version's products, a remembered product family, a previous proposal, a
 * catalogue product that was not chosen, an AI assumption, a report example or
 * old generated copy — must not appear, however plausible it reads.
 *
 * SOURCE OF TRUTH — the same frozen, version-specific system/product authority
 * the At a Glance package table is built from, on the proposal's own snapshot:
 *   - system.product_roles[].model_label | model_key  (At a Glance: buildPackageRows)
 *   - system.subwoofer_strategy.models                (At a Glance: subwooferGlanceStatement)
 *   - room.acoustic_treatment                        (Abfuser, only when enabled)
 * A comparison adds each version's own At a Glance comparison rows (lcr,
 * surrounds, overheads, subwoofers) and that version's frozen evidence, so no
 * version's products can leak into another version's copy.
 *
 * Nothing is inferred: a product is allowed only because the frozen authority for
 * that version states it. The product vocabulary itself lives in
 * proposalProductCatalogue.js.
 *
 * Provides:
 *   1. buildProductGrounding()       — the allowed vocabulary, per version
 *   2. buildProductVocabularyRule()  — the prompt constraint the writer must obey
 *   3. groundProductMentions()       — the deterministic post-generation pass:
 *      an unselected product name is replaced with safe generic wording, and a
 *      mention that cannot be removed is reported so the section is rejected
 *      instead of stored.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import {
  CATALOGUE_ALL,
  PRODUCT_FAMILY_WORDS,
  GENERIC_BY_KIND,
  catalogueProductsInText,
  findProductMatches,
  rawNamePattern,
} from './proposalProductCatalogue.js';

/** An allowed product as the report states it. */
function allowedProduct(name, product = null, roleLabel = null) {
  return {
    name: String(name),
    roleLabel: roleLabel || null,
    kind: product?.kind || 'any',
    family: product?.family || null,
    generic: product?.generic || GENERIC_BY_KIND.any,
    catalogueKey: product?.key || null,
  };
}

/**
 * The products selected in ONE version, from the strings its own frozen
 * authority publishes — the same strings the At a Glance table prints.
 */
function productsFromAuthorityStrings(strings) {
  const products = [];
  for (const entry of strings) {
    if (!entry?.name) continue;
    // A value that names a product is grounded as that product; a value that
    // names none the catalogue knows is still allowed verbatim, because the
    // report's own table states it.
    const found = catalogueProductsInText(entry.name);
    const list = found.length > 0 ? found : [null];
    for (const product of list) {
      const name = product?.label || entry.name;
      const identity = product?.key || `raw:${String(entry.name).toLowerCase()}`;
      if (products.some((existing) => (existing.catalogueKey || `raw:${existing.name.toLowerCase()}`) === identity)) continue;
      products.push(allowedProduct(name, product, entry.roleLabel));
    }
  }
  return products;
}

/** The role strings of a version's frozen snapshot: what At a Glance prints. */
function authorityStringsFromSnapshot(snapshot) {
  const system = snapshot?.system || {};
  const strings = [];
  for (const role of Array.isArray(system.product_roles) ? system.product_roles : []) {
    const name = role?.model_label || role?.model_key;
    if (name) strings.push({ name, roleLabel: role?.role_description || role?.role || null });
  }
  const strategy = system.subwoofer_strategy || {};
  for (const model of Array.isArray(strategy.models) ? strategy.models : []) {
    if (model) strings.push({ name: model, roleLabel: 'Subwoofers' });
  }
  // The specified acoustic treatment is part of this version's selected products.
  const treatment = snapshot?.room?.acoustic_treatment || {};
  if (treatment.enabled === true && Number(treatment.quantity) > 0) {
    strings.push({ name: 'Abfuser', roleLabel: 'Acoustic treatment' });
  }
  return strings;
}

/** The role strings of one version's frozen comparison evidence. */
function authorityStringsFromVersionEvidence(version) {
  const strings = [];
  for (const role of Array.isArray(version?.speaker_package) ? version.speaker_package : []) {
    if (role?.model) strings.push({ name: role.model, roleLabel: role.role_description || role.role || null });
  }
  if (version?.subwoofer_package?.strategy) {
    strings.push({ name: version.subwoofer_package.strategy, roleLabel: 'Subwoofers' });
  }
  return strings;
}

/** The At a Glance comparison rows that state a version's products. */
const GLANCE_PRODUCT_ROW_KEYS = Object.freeze(['lcr', 'surrounds', 'overheads', 'subwoofers']);

function authorityStringsFromComparisonRows(comparisonTable, index) {
  const rows = Array.isArray(comparisonTable?.rows) ? comparisonTable.rows : [];
  const strings = [];
  for (const row of rows) {
    if (!GLANCE_PRODUCT_ROW_KEYS.includes(String(row?.key || ''))) continue;
    const value = row?.values?.[index];
    if (value) strings.push({ name: value, roleLabel: row?.area || row?.label || null });
  }
  return strings;
}

/** Carry the allowed names alongside each version's products. */
function withNames(versions) {
  return versions.map((version) => ({
    ...version,
    allowedNames: version.products.map((product) => product.name),
  }));
}

/**
 * The allowed product vocabulary for a proposal.
 *
 * @param {Object} input
 * @param {Object} [input.snapshot] — the frozen Engineering Snapshot (single report)
 * @param {string} [input.resolvedType] — 'single' | 'system_summary' | 'comparison'
 * @param {Object} [input.comparisonTable] — the frozen comparison table
 * @param {Array} [input.versionEvidence] — per-version frozen evidence
 * @param {Array} [input.versions] — the version names/labels, in report order
 * @returns {{ available: boolean, isComparison: boolean, versions: Array }}
 */
export function buildProductGrounding({ snapshot = null, resolvedType = 'single', comparisonTable = null, versionEvidence = [], versions = [] } = {}) {
  const list = Array.isArray(versionEvidence) ? versionEvidence : [];

  if (resolvedType === 'comparison' && list.length > 0) {
    const built = list.map((version, index) => ({
      id: String(version?.version_id || index),
      label: String(version?.version_name || version?.label || `Option ${String.fromCharCode(65 + index)}`),
      optionLabel: version?.label || null,
      products: productsFromAuthorityStrings([
        ...authorityStringsFromVersionEvidence(version),
        ...authorityStringsFromComparisonRows(comparisonTable, index),
      ]),
    }));
    return {
      available: built.some((version) => version.products.length > 0),
      isComparison: true,
      versions: withNames(built),
      table: comparisonTable || null,
    };
  }

  const products = productsFromAuthorityStrings(authorityStringsFromSnapshot(snapshot));
  const named = Array.isArray(versions) ? versions : [];
  return {
    available: products.length > 0,
    isComparison: false,
    versions: withNames([{
      id: String(snapshot?.version?.id || 'version'),
      label: String(snapshot?.version?.name || named[0] || 'This design version'),
      products,
    }]),
    table: null,
  };
}

/** True when the grounding can police anything at all. */
export function isGroundingUsable(grounding) {
  return Boolean(grounding?.available) && Array.isArray(grounding.versions)
    && grounding.versions.some((version) => version.products.length > 0);
}

/**
 * The prompt constraint. Appended last, so it overrides any earlier prose
 * guidance that would name a product the version does not have.
 */
export function buildProductVocabularyRule(grounding) {
  if (!isGroundingUsable(grounding)) return '';
  const lines = ['=== ALLOWED PRODUCTS: VERSION-SPECIFIC, HARD RULE (overrides every other instruction) ==='];

  if (!grounding.isComparison) {
    const version = grounding.versions[0];
    lines.push(`${version.label}: the ONLY products selected in this design version are`);
    lines.push(...version.products.map((product) => `- ${product.name}${product.roleLabel ? ` (${product.roleLabel})` : ''}`));
  } else {
    lines.push('This report compares design versions. Each version has its OWN products, and a product belongs only to the version it is listed under:');
    for (const version of grounding.versions) {
      const names = version.products.length > 0
        ? version.products.map((product) => product.name).join(', ')
        : 'no product named';
      lines.push(`- ${version.label}: ${names}`);
    }
    lines.push("Name a product only in text about the version that has it, and never let one version be described as using another version's product. Where the products differ, say plainly which version uses which.");
  }

  lines.push(
    'Never name a product from another version, another project, an earlier proposal, the product catalogue, a product family you remember, or a report example.',
    'A product not listed above does not exist in this design, however well it would suit it: do not name it, add it, compare against it or explain it.',
    'For product-family context without naming a product, write "the selected Artcoustic loudspeakers", "the screen-wall loudspeakers", "the surround loudspeakers", "the overhead loudspeakers", "the subwoofers" or "the specified acoustic treatment".',
    '"Artcoustic" may be used as the brand name. No other product name may appear anywhere in this report.',
    'Every product name is checked against this list before the report is saved, and anything not on it is removed.',
  );
  return lines.join('\n');
}

/**
 * Split HTML into sentence-sized segments without cutting through a tag, so a
 * product mention is always judged in the sentence it appears in.
 */
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

/** The versions a segment is about: by name, by option label, or all of them. */
function versionsForSegment(segment, grounding) {
  const text = String(segment).toLowerCase();
  const matched = grounding.versions.filter((version) => (
    text.includes(String(version.label).toLowerCase())
    || (version.optionLabel && text.includes(String(version.optionLabel).toLowerCase()))
  ));
  return matched.length > 0 ? matched : grounding.versions;
}

/** What the versions of one segment are allowed to name. */
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

/**
 * The generic wording for a removed name: the article is not doubled, the
 * capital is kept only at the start of a sentence, and a possessive is carried
 * onto the generic phrase.
 */
function genericPhrase(product, { atStart, precededByArticle, possessive }) {
  let phrase = product.generic;
  if (precededByArticle) phrase = phrase.replace(/^the\s+/i, '');
  if (atStart) phrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return `${phrase}${possessive ? "'" : ''}`;
}

/**
 * A generic phrase can collide with the noun it replaced ("...overhead
 * loudspeakers overhead array"), so an immediately repeated role word is folded
 * away. Wording only: no value, level or meaning is touched.
 */
const PHRASE_TIDY = Object.freeze([
  [/(overhead loudspeakers)(['’]?)\s+overheads?\b/gi, '$1$2'],
  [/(surround loudspeakers)(['’]?)\s+surrounds?\b/gi, '$1$2'],
  [/(screen-wall loudspeakers)(['’]?)\s+screens?\b/gi, '$1$2'],
  [/(centre loudspeaker)(['’]?)\s+centres?\b/gi, '$1$2'],
  [/(subwoofers)(['’]?)\s+subwoofers?\b/gi, '$1$2'],
]);

const tidyGenericPhrases = (html) => PHRASE_TIDY.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), html);

/**
 * The deterministic post-generation pass.
 *
 * An unselected product name is replaced with safe generic wording, in the
 * sentence it appears in, so no ungrounded product reaches the client. A mention
 * that survives the pass is reported as unresolved, and the caller rejects the
 * section rather than storing it.
 *
 * @param {string} html
 * @param {object} grounding — buildProductGrounding() output
 * @returns {{ html: string, grounded: boolean, violations: Array, replacements: number, unresolved: Array }}
 */
export function groundProductMentions(html, grounding) {
  const source = String(html || '');
  if (!isGroundingUsable(grounding) || !source) {
    return { html: source, grounded: true, violations: [], replacements: 0, unresolved: [] };
  }

  const violations = [];
  let replacements = 0;

  const segments = sentenceSegments(source).map((segment) => {
    if (!segment.trim()) return segment;
    const versions = versionsForSegment(segment, grounding);
    const { keys, families, rawPatterns } = allowedFor(versions);
    const matches = findProductMatches(segment);
    const plan = [];

    // 1. A product name none of this segment's versions has.
    for (const match of matches) {
      const { product } = match;
      if (keys.has(product.key)) continue;
      if (rawPatterns.some((pattern) => pattern.test(match.text))) continue;
      const preceding = segment.slice(0, match.start);
      violations.push({
        kind: 'product',
        name: product.label,
        version: versions.map((version) => version.label).join(' | '),
        segment: segment.trim(),
      });
      plan.push({
        start: match.start,
        end: match.end,
        replacement: genericPhrase(product, {
          atStart: preceding.replace(/<[^>]*>/g, '').trim() === '',
          precededByArticle: /\b(?:the|a|an)\s+$/i.test(preceding),
          possessive: match.possessive,
        }),
      });
    }

    // 2. A bare family word this version has no product in at all.
    if (keys.size > 0) {
      for (const family of PRODUCT_FAMILY_WORDS) {
        if (families.has(family.family)) continue;
        family.pattern.lastIndex = 0;
        const claimed = plan.some((item) => item.start <= (segment.search(family.pattern)));
        const index = segment.search(family.pattern);
        if (index < 0 || claimed) continue;
        const matched = family.pattern.exec(segment)[0];
        violations.push({
          kind: 'family',
          name: family.label,
          version: versions.map((version) => version.label).join(' | '),
          segment: segment.trim(),
        });
        plan.push({
          start: index,
          end: index + matched.length,
          replacement: /^[A-Z]/.test(matched) ? 'The selected Artcoustic loudspeakers' : 'the selected Artcoustic loudspeakers',
        });
      }
    }

    replacements += plan.length;
    // Applied from the end, so earlier offsets stay valid.
    return [...plan]
      .sort((a, b) => b.start - a.start)
      .reduce((out, item) => `${out.slice(0, item.start)}${item.replacement}${out.slice(item.end)}`, segment);
  });

  const cleaned = tidyGenericPhrases(segments.join(''));

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

export default buildProductGrounding;