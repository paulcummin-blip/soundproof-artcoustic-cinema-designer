import { isProductToken, modelTokens } from './writerVocabulary.js';

/** Physical counts and logical-channel wording, without product-specific phrases. */
const POSITION = /\b(?:centre|center)\b/i;
/** The position words a count is judged against: another layer named in its own right. */
const OTHER_POSITION = /\b(?:surround|overhead|left|right)\b/i;
/** A neighbouring sentence that is about another layer rather than this arrangement. */
const OTHER_LAYER = /\b(?:surround|overhead|subwoofer|lfe|left|right|height|front wide)\b/i;
const PHYSICAL = '(?:cabinets?|enclosures?|loudspeakers?|speakers?|monitors?|boxes?)';
const NUMBER = '(?:a pair|\\d+|one|two|three|four|five|six|seven|eight|nine|ten|single|pair|both|dual|a)';
const VALUES = { one: 1, single: 1, a: 1, two: 2, pair: 2, both: 2, dual: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const count = word => word.toLowerCase() === 'a pair' ? 2 : VALUES[word.toLowerCase()] ?? Number(word);
const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const denied = (text, at) => /\b(?:not|never|rather than|instead of)\b[^,;:.]{0,30}$/i.test(text.slice(0, at));

/** The tokens a quantity may be attached to a model with ("2 x C4-1", "C4-1 × 2"). */
const QUANTITY_BEFORE_MODEL = `(${NUMBER})\\s*(?:×|x|\\*)\\s*`;
const QUANTITY_AFTER_MODEL = `\\s*(?:×|x|\\*)\\s*(${NUMBER})\\b`;

/** One occurrence of a complete identifier, as its own whole token. */
function identifierOccurrences(text, name) {
  const pattern = new RegExp(`(^|[^\\w-])(${escaped(name)})(?![\\w-])`, 'gi');
  const spans = [];
  let match = pattern.exec(text);
  while (match) {
    const start = match.index + match[1].length;
    spans.push({ start, end: start + match[2].length });
    match = pattern.exec(text);
  }
  return spans;
}

/**
 * The spans of the text occupied by complete product/model identifiers.
 *
 * A model name is a NAME, not a quantity: the numeral inside "C4-1" is part of
 * the identifier and never states how many cabinets the design places. The
 * vocabulary's own model-shaped tokens are read, so no model is hard-coded, and
 * the arrangement's own frozen model names are read whatever shape they have — a
 * name such as "SPITFIRE CLOUD" is no less a name than "C4-1".
 */
function identifierSpans(text, requirement) {
  const value = String(text || '');
  const names = [...modelTokens(value).filter(isProductToken), ...((requirement?.models) || [])];
  return names.filter(Boolean).flatMap((name) => identifierOccurrences(value, name));
}
export function namesCabinetPosition(text, requirement) {
  return POSITION.test(text) || requirement.models.some(model => new RegExp(`\\b${escaped(model)}\\b`, 'i').test(text));
}
/**
 * The clause a match sits in: its own words plus the text either side of it, up to
 * the nearest clause boundary. A count is judged by the clause that states it, so
 * a sentence that describes this arrangement and another layer in the same breath
 * cannot blank this arrangement's count.
 */
export function clauseAt(text, index, length) {
  const value = String(text || '');
  const before = value.slice(0, index).split(/[.;:,]/).pop();
  const after = value.slice(index + length).split(/[.;:,]/)[0];
  return `${before} ${value.slice(index, index + length)} ${after}`;
}

/**
 * Whether the text names a cabinet position of its own OTHER than this
 * arrangement's. A sentence that also names this arrangement's position or model
 * is describing this arrangement, whatever else it mentions.
 */
export function namesOtherCabinetPosition(text, requirement) {
  const value = String(text || '');
  if (!OTHER_LAYER.test(value)) return false;
  if (POSITION.test(value)) return false;
  return !(requirement?.models || []).some(model => new RegExp(`\\b${escaped(model)}\\b`, 'i').test(value));
}

export function cabinetCounts(text, requirement) {
  const pattern = new RegExp(`\\b(${NUMBER})\\b[\\s,×x*]*(?:of\\s+)?(?:(?!channels?\\b)[\\w-]+[\\s-]+){0,5}${PHYSICAL}\\b`, 'gi');
  const found = [];
  // Every numeral inside a complete model identifier is set aside: "C4-1 cabinets"
  // names a model and states no quantity at all, so it asserts no cabinet count.
  const identifiers = identifierSpans(text, requirement);
  const insideIdentifier = (index) => identifiers.some((span) => index >= span.start && index < span.end);
  for (const match of text.matchAll(pattern)) {
    // Never consume a logical-channel count as if it counted cabinets.
    if (/\bchannels?\b/i.test(match[0])) continue;
    // Nor a numeral that is part of a model identifier rather than a quantity.
    if (insideIdentifier(match.index)) continue;
    const before = text.slice(0, match.index).split(/[,;:]/).pop();
    const after = text.slice(match.index + match[0].length).split(/[,;:]/)[0];
    const phrase = `${before} ${match[0]} ${after}`;
    if (!namesCabinetPosition(phrase, requirement) || denied(text, match.index)) continue;
    // A separately named layer's count is not the centre cabinet count.
    if (!namesCabinetPosition(match[0], requirement) && /\b(?:surround|overhead|subwoofer|left|right)\b/i.test(match[0])) continue;
    found.push(count(match[1]));
  }
  // A specification may put the quantity after the physical noun.
  const suffix = new RegExp(`\\b${PHYSICAL}\\b\\s*(?:×|x|:)\\s*(${NUMBER})\\b`, 'gi');
  for (const match of text.matchAll(suffix)) {
    if (namesCabinetPosition(text, requirement)) found.push(count(match[1]));
  }
  // A quantity stated against this arrangement's OWN model identifier IS a cabinet
  // quantity: "2 x C4-1" places two cabinets of that model, and "C4-1 × 2" states
  // the same thing. Only this arrangement's own models can do this, so another
  // layer's model never becomes this arrangement's cabinet count.
  for (const model of requirement?.models || []) {
    if (!model) continue;
    const token = escaped(model);
    const patterns = [
      new RegExp(`${QUANTITY_BEFORE_MODEL}${token}(?![\\w-])`, 'gi'),
      new RegExp(`(?:^|[^\\w-])${token}${QUANTITY_AFTER_MODEL}`, 'gi'),
    ];
    for (const quantityPattern of patterns) {
      for (const match of text.matchAll(quantityPattern)) {
        const clause = clauseAt(text, match.index, match[0].length);
        if (!namesCabinetPosition(clause, requirement)) continue;
        found.push(count(match[1]));
      }
    }
  }
  return found;
}
export function logicalChannelCounts(text, requirement) {
  if (!namesCabinetPosition(text, requirement)) return [];
  const found = [];
  const pattern = new RegExp(`\\b(${NUMBER})\\b(?:[\\s-]+(?:logical|audio|centre|center|discrete|independent|separate|distinct|dedicated|individual)){0,4}[\\s-]+channels?\\b`, 'gi');
  for (const match of text.matchAll(pattern)) {
    if (denied(text, match.index)) continue;
    // Another layer's reference must never invalidate this arrangement's count: the
    // test is the CLAUSE the count is stated in, not the whole sentence. "the left
    // and right channels use Q6-3; the centre channel uses two C4-1 cabinets
    // working together as one audio channel" states ONE centre channel, whatever
    // else the sentence goes on to mention.
    if (!POSITION.test(match[0]) && OTHER_POSITION.test(clauseAt(text, match.index, match[0].length))) continue;
    found.push(count(match[1]));
  }
  if (/\b(?:each|both|two|pair)\b[^.;]{0,55}\b(?:separate|independent|distinct|different)\b[^.;]{0,20}\bchannels?\b/i.test(text)) found.push(2);
  // Natural equivalent: both cabinets carry the same centre signal/channel.
  if (/\b(?:same|shared)\s+(?:(?:logical|audio|centre|center)\s+){0,3}(?:channel|signal)\b/i.test(text)) found.push(1);
  // Natural equivalents: the arrangement reproduces ONE channel or signal, or is
  // stated as ONE logical source for the same signal ("2 x C4-1 (mono)"). Each
  // states one channel — and none of them excuses a cabinet count the frozen
  // evidence does not place.
  if (/\b(?:one|single|a)\s+(?:(?:logical|audio|centre|center)\s+)*(?:channel|signal)\b/i.test(text)) found.push(1);
  if (/\b(?:one|single)\s+(?:logical|single|only)\s+(?:source|channel|signal)\b/i.test(text)) found.push(1);
  if (/\bmono\b/i.test(text)) found.push(1);
  return found;
}
export default cabinetCounts;