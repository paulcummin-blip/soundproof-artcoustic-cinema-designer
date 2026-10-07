/**
 * writerProductScope.js (shared)
 * ------------------------------
 * THE product-attribution rule, scoped the way the evidence scopes it: by
 * OPTION, by ROLE and by QUANTITY — never by product name alone.
 *
 * A product name is not owned by one option. The same loudspeaker can be the LCR
 * in one version and the surround in the other, and the same subwoofer can be
 * fitted twice in one option and four times in the other. A name-only rule reads
 * a correct sentence as an import from the other option, which is what this
 * module exists to stop without opening the door to a real import.
 *
 * This module reads each mention with the option the sentence attributes it to —
 * and the role and quantity the sentence states for it — against the frozen
 * pack's own per-option product authority:
 *
 *   - system.products_by_layer[<layer>][].{model, quantity} → the model, its role
 *     family and the quantity that option is specified with in that layer;
 *   - system.products[].{key, area, value}                  → the role area the
 *     reports print, and the quantities the row states;
 *   - system.subwoofer_strategy.{count, models}             → the option's total
 *     subwoofer count, so a stated total is as valid as a per-position quantity.
 *
 * A mention is reported only when the pack does not support it: a product the
 * option does not have, a role the option does not use it in, or a quantity the
 * option is not specified with. A product shared by both options passes in
 * either option, and an unattributed mention is judged against the cited claims'
 * own option, exactly as before.
 *
 * A mention the sentence itself frames as the rejected alternative — the product
 * named after "rather than" or "instead of" — is read as the design being
 * replaced, never as a product the option the sentence names is specified with.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { WRITER_REJECTION } from './writerContractSchema.js';
import { CONTRAST } from './writerOutputTextRules.js';
import { modelTokens, sentenceParts } from './writerVocabulary.js';

/** A model-shaped token, as the reports write it ("SUB4-12", "Q8-5"). */
const MODEL_PATTERN = /\b[A-Z]{1,4}\d{1,3}(?:[-\u2013]\d{1,3})?[A-Z]?\b/g;

/** Tokens that look like a model but are never a product. */
const NOT_A_PRODUCT = /^(?:P\d{1,2}|L[1-4]|RP2[23])$/;

/** The role families a product row, or a sentence, can name. */
const ROLE_FAMILIES = Object.freeze([
  { family: 'screen', pattern: /\b(?:lcr|left[\s/]*(?:centre|center)[\s/]*right|screen|front[\s-]*(?:stage|wall))\b/i },
  { family: 'surround', pattern: /\bsurrounds?\b/i },
  { family: 'wide', pattern: /\bwides?\b/i },
  { family: 'overhead', pattern: /\b(?:overheads?|height|ceiling)\b/i },
  { family: 'subwoofer', pattern: /\b(?:subwoofers?|low[\s-]frequency)\b/i },
]);

/** A quantity written as a word rather than a figure. */
const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The key a product name is held under, so case and spacing never split one product in two. */
function keyOf(name) {
  return String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Every role family a label, area or sentence names. */
function roleFamiliesIn(text) {
  const families = new Set();
  const value = String(text || '');
  if (value.length === 0) return families;
  for (const { family, pattern } of ROLE_FAMILIES) {
    if (pattern.test(value)) families.add(family);
  }
  return families;
}

/** The figures a row states once its own product names are taken out. */
function quantitiesIn(value, names) {
  let text = String(value || '');
  for (const name of Array.isArray(names) ? names : []) {
    text = text.split(new RegExp(escapeRegExp(name), 'gi')).join(' ');
  }
  text = text.replace(new RegExp(MODEL_PATTERN.source, 'g'), ' ');
  const found = [];
  const pattern = /\d{1,3}/g;
  let match = pattern.exec(text);
  while (match) {
    found.push(Number(match[0]));
    match = pattern.exec(text);
  }
  return found;
}

/** The names a version names an option by: its saved report name, and its short form. */
function optionAliases(option) {
  const name = typeof option?.version_name === 'string' ? option.version_name.trim() : '';
  if (name.length === 0) return [];
  const short = name.replace(/\s+versions?$/i, '').trim();
  return short && short !== name ? [name, short] : [name];
}

/**
 * The product authority of one frozen pack.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @returns {Map<string, { display: string, owners: Set<string>,
 *   byOption: Map<string, { families: Set<string>, quantities: Set<number> }> }>}
 */
export function packProductAuthority(pack) {
  const authority = new Map();

  const entryFor = (name, optionId) => {
    const key = keyOf(name);
    if (key.length === 0) return null;
    const entry = authority.get(key) || { display: String(name).trim(), owners: new Set(), byOption: new Map() };
    if (optionId) {
      entry.owners.add(optionId);
      if (!entry.byOption.has(optionId)) entry.byOption.set(optionId, { families: new Set(), quantities: new Set() });
    }
    authority.set(key, entry);
    return entry;
  };

  const apply = (name, optionId, families, quantities) => {
    const entry = entryFor(name, optionId);
    if (!entry || !optionId) return;
    const scope = entry.byOption.get(optionId);
    for (const family of families) scope.families.add(family);
    for (const quantity of quantities) if (Number.isFinite(quantity)) scope.quantities.add(Number(quantity));
  };

  for (const option of Array.isArray(pack?.options) ? pack.options : []) {
    const optionId = option?.version_id ?? null;
    const system = option?.facts?.system || {};

    // The layer authority: the model each role family is delivered with, and its
    // quantity. This is where a model whose name carries no figure ("SPITFIRE
    // CLOUD") is stated, so it is grounded exactly like a numbered one.
    const byLayer = system.products_by_layer && typeof system.products_by_layer === 'object' ? system.products_by_layer : {};
    for (const [layer, rows] of Object.entries(byLayer)) {
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row?.model) continue;
        const families = roleFamiliesIn(`${layer} ${row?.role || ''}`);
        const quantity = Number(row?.quantity);
        apply(row.model, optionId, families, Number.isFinite(quantity) ? [quantity] : []);
      }
    }

    // The printed rows: the area the reports label the product with, and the
    // quantities the row itself states.
    const rowNames = [];
    for (const row of Array.isArray(system.products) ? system.products : []) {
      const value = String(row?.value || '');
      const families = roleFamiliesIn(`${row?.key || ''} ${row?.area || ''}`);
      const names = modelTokens(value);
      const quantities = quantitiesIn(value, names);
      for (const name of names) {
        rowNames.push(name);
        apply(name, optionId, families, quantities);
      }
      if (names.length === 0 && value.trim().length > 0) {
        const label = value.split(/[×x*]/)[0].trim();
        if (label.length > 1) apply(label, optionId, families, quantities);
      }
    }

    // The subwoofer strategy: the option's total count, so a total reads as valid
    // as the per-position figure.
    const strategy = system.subwoofer_strategy || {};
    const total = Number(strategy.count);
    const models = Array.isArray(strategy.models) ? strategy.models : [];
    for (const model of models) {
      const families = roleFamiliesIn('subwoofers');
      const known = [...authority.keys()].find((key) => key === keyOf(model));
      apply(known || model, optionId, families, Number.isFinite(total) ? [total] : []);
    }
    for (const name of rowNames) {
      if (!models.some((model) => keyOf(model) === keyOf(name))) continue;
      if (Number.isFinite(total)) apply(name, optionId, new Set(), [total]);
    }
  }

  return authority;
}

/** The sentence a position falls inside, with its own offset. */
function sentenceSpans(text) {
  const spans = [];
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const boundary = char === '\n' || (/[.!?;]/.test(char) && (index + 1 >= text.length || /\s/.test(text[index + 1])));
    if (!boundary) continue;
    const slice = text.slice(cursor, index + 1);
    const lead = slice.length - slice.trimStart().length;
    if (slice.trim().length > 0) spans.push({ text: slice.trim(), start: cursor + lead });
    cursor = index + 1;
  }
  const tail = text.slice(cursor);
  if (tail.trim().length > 0) spans.push({ text: tail.trim(), start: cursor + tail.length - tail.trimStart().length });
  return spans;
}

/** The clause a mention's own role and quantity are stated in. */
function mentionWindow(text, end) {
  const rest = text.slice(end);
  const stop = rest.search(/[,;.:!?]|\band\b(?=\s*both\b)/);
  return stop === -1 ? rest : rest.slice(0, stop);
}

/**
 * Whether a mention is the rejected alternative of its own sentence — the product
 * a sentence names after "rather than" or "instead of". "Level 4 is specified with
 * SUB4-12 x 4 rather than SUB3-12 x 2" names SUB3-12 as the design being replaced,
 * not as one the option it names is specified with, so it is not an import into
 * that option. The alternative is read within the mention's own clause: a mark
 * that ends the alternative before the mention leaves the mention outside it.
 */
function isRejectedAlternative({ span, start }) {
  const local = start - span.start;
  if (local <= 0) return false;
  const before = span.text.slice(0, local);
  const pattern = new RegExp(CONTRAST.source, 'gi');
  let opened = -1;
  let match = pattern.exec(before);
  while (match) {
    opened = match.index + match[0].length;
    match = pattern.exec(before);
  }
  if (opened === -1) return false;
  return !/[.!?;]|\b(?:but|however|although|whereas|yet)\b/i.test(before.slice(opened));
}

/** The quantity a mention states: attached to it, or written as the word before it. */
function statedQuantity(text, start, end) {
  const after = text.slice(end, end + 12);
  let match = /^\s*[×x*]\s*(\d{1,3})\b/.exec(after);
  if (match) return Number(match[1]);

  const before = text.slice(Math.max(0, start - 24), start);
  match = /(\d{1,3})\s*[×x*]\s*$/.exec(before);
  if (match) return Number(match[1]);
  match = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+$/i.exec(before);
  if (match) return WORD_NUMBERS[match[1].toLowerCase()];
  return null;
}

/**
 * Every product mention a text carries: the names the pack lists for any option,
 * plus any model-shaped token the pack does not list at all.
 */
function mentionsIn(text, authority) {
  const found = [];
  const claimed = [];
  const overlaps = (at, end) => claimed.some((range) => at < range.end && end > range.start);

  const entries = [...authority.entries()].sort((a, b) => b[1].display.length - a[1].display.length);
  for (const [key, entry] of entries) {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.display).replace(/\\?\s+/g, '\\s+')}\\b`, 'gi');
    let match = pattern.exec(text);
    while (match) {
      if (!overlaps(match.index, match.index + match[0].length)) {
        claimed.push({ start: match.index, end: match.index + match[0].length });
        found.push({ token: match[0], key, start: match.index, end: match.index + match[0].length });
      }
      match = pattern.exec(text);
    }
  }

  const pattern = new RegExp(MODEL_PATTERN.source, 'g');
  let match = pattern.exec(text);
  while (match) {
    const token = match[0];
    const end = match.index + token.length;
    if (!NOT_A_PRODUCT.test(token) && !authority.has(keyOf(token)) && !overlaps(match.index, end)) {
      claimed.push({ start: match.index, end });
      found.push({ token, key: keyOf(token), start: match.index, end, unlisted: true });
    }
    match = pattern.exec(text);
  }

  return found.sort((a, b) => a.start - b.start);
}

/** The option a mention is attributed to: the one named nearest it in its sentence. */
function attributedOptions({ span, position, options, everyOption }) {
  const hits = [];
  for (const option of options) {
    for (const alias of option.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
      let match = pattern.exec(span.text);
      while (match) {
        hits.push({ id: option.id, at: match.index });
        match = pattern.exec(span.text);
      }
    }
  }
  if (hits.length === 0) return /\bboth\b/i.test(span.text) ? everyOption : null;
  const local = position - span.start;
  const preceding = hits.filter((hit) => hit.at <= local).sort((a, b) => b.at - a.at)[0];
  const chosen = preceding || hits.sort((a, b) => a.at - b.at)[0];
  return new Set([chosen.id]);
}

/**
 * Every product-scope violation a section's text carries.
 *
 * @param {Object} input
 * @param {string} input.text — the section's prose
 * @param {Object} input.input — the writer input the draft was written against
 * @param {Object} input.vocabulary — packVocabulary(input.evidence_pack)
 * @param {Set<string>} [input.citedOptionIds] — the options the cited claims are scoped to
 * @param {boolean} [input.oneOptionOnly] — whether every cited claim belongs to one option
 * @returns {Array<{ token: string, code: string, detail: string, sentence: string }>}
 */
export function productScopeViolations({ input = null, vocabulary = null, text = '', citedOptionIds = [], oneOptionOnly = false } = {}) {
  const found = [];
  if (typeof text !== 'string' || text.length === 0) return found;

  const pack = input?.evidence_pack || null;
  const authority = packProductAuthority(pack);
  const options = (Array.isArray(pack?.options) ? pack.options : [])
    .map((option) => ({ id: option?.version_id || null, aliases: optionAliases(option) }))
    .filter((option) => option.id);
  const everyOption = new Set(options.map((option) => option.id));
  const cited = new Set(citedOptionIds instanceof Set ? [...citedOptionIds] : (citedOptionIds || []));
  const spans = sentenceSpans(text);
  const reported = new Set();

  const push = (mention, sentence, code, detail) => {
    const key = `${code}|${detail}`;
    if (reported.has(key)) return;
    reported.add(key);
    found.push({ token: mention.token, code, detail, sentence });
  };

  for (const mention of mentionsIn(text, authority)) {
    const span = spans.find((entry) => mention.start >= entry.start && mention.start < entry.start + entry.text.length)
      || { text: sentenceParts(text).find((sentence) => sentence.includes(mention.token)) || text, start: 0 };
    const sentence = span.text;

    // A model the pack lists nowhere is unselected, whatever the sentence says.
    if (mention.unlisted && !vocabulary?.products?.has(mention.token)) {
      push(mention, sentence, WRITER_REJECTION.UNSELECTED_PRODUCT, mention.token);
      continue;
    }

    const attribution = attributedOptions({ span, position: mention.start, options, everyOption });
    const scoped = attribution || (oneOptionOnly && cited.size === 1 ? new Set([...cited]) : null);
    if (!scoped || scoped.size === 0) continue;

    const entry = authority.get(mention.key) || null;
    const owners = entry ? new Set([...entry.owners]) : new Set(vocabulary?.owners?.get(mention.token) || []);

    // The sentence's own rejected alternative is the design being replaced, not a
    // product the option the sentence names is specified with. The contrast rule
    // already exempts a mention in a contrast sentence; reading the mention's own
    // position means a sentence that names an option can no longer turn its own
    // alternative into an import. A product the pack lists nowhere is unselected
    // and was refused above, before this point.
    if (owners.size > 0 && CONTRAST.test(sentence) && isRejectedAlternative({ span, start: mention.start })) continue;

    const owned = [...scoped].filter((id) => owners.has(id));
    if (owned.length === 0) {
      if (attribution || !CONTRAST.test(sentence)) {
        push(mention, sentence, WRITER_REJECTION.EXTRA_PRODUCT, `product_belongs_to_another_option:${mention.token}`);
      }
      continue;
    }

    // Role and quantity belong to one option's own specification, so they are only
    // judged when the sentence attributes the mention to exactly one option.
    if (scoped.size !== 1 || !entry) continue;
    const scope = entry.byOption.get([...scoped][0]) || null;
    if (!scope) continue;

    const quantity = statedQuantity(text, mention.start, mention.end);
    if (quantity !== null && scope.quantities.size > 0 && !scope.quantities.has(quantity)) {
      push(mention, sentence, WRITER_REJECTION.CHANGED_PARAMETER_VALUE, `product_quantity_not_stated_by_the_reports:${mention.token}`);
      continue;
    }

    const families = roleFamiliesIn(mentionWindow(text, mention.end));
    if (families.size > 0 && scope.families.size > 0 && ![...families].some((family) => scope.families.has(family))) {
      push(mention, sentence, WRITER_REJECTION.EXTRA_PRODUCT, `product_role_not_the_one_the_option_uses:${mention.token}`);
    }
  }

  return found;
}

export default productScopeViolations;