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
  for (const match of text.matchAll(pattern)) {
    // Never consume a logical-channel count as if it counted cabinets.
    if (/\bchannels?\b/i.test(match[0])) continue;
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
  return found;
}
export default cabinetCounts;