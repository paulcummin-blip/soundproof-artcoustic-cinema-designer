import { WRITER_REJECTION, violation } from './writerContractSchema.js';
import { attributeViolation } from './writerViolationAudit.js';

/** Complete sentences: decimals and channel counts are not sentence boundaries. */
export function proposalSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

/** Whitespace is presentation, not a way around the verbatim duplication rule. */
export function crossSectionDuplicates(sections = []) {
  const seen = new Map();
  const found = [];
  for (const entry of sections) {
    if (!entry || typeof entry.text !== 'string') continue;
    for (const sentence of proposalSentences(entry.text)) {
      if ((sentence.match(/\S+/g) || []).length < 10) continue;
      const key = sentence.replace(/\s+/g, ' ');
      const previous = seen.get(key);
      if (previous && previous !== entry.section) {
        found.push(attributeViolation(violation(WRITER_REJECTION.CROSS_SECTION_DUPLICATION, {
          section: entry.section, detail: `sentence_repeated_from:${previous}`,
        }), { text: entry.text, sentence, ruleId: 'cross_section_verbatim:ten_or_more_words' }));
      } else if (!previous) seen.set(key, entry.section);
    }
  }
  return found;
}

export function internalLevelLanguage(text) {
  return /\bL[1-4]\b|\b(?:RP22\s+)?(?:Performance\s+)?Level\s+[1-4]\b/i.test(text);
}

export function unexplainedOverhead(text) {
  return /\(\s*OH\s*\)/i.test(text);
}

export function singleOptionFraming(text) {
  return /\bthis\s+(?:proposal\s+outlines|design\s+presents|option)\b|\b(?:decision|selected\s+option)\b|\b(?:what\s+changes|what\s+stays\s+the\s+same|no\s+changes\s+to\s+report)\b/i.test(text);
}

/** Tonal evidence cannot become an unqualified, whole-experience seat claim. */
export function tonalScopeStretch(text, claims = []) {
  const tonal = claims.some(c => /tonal[-_ ]consistency|timbre/i.test(`${c?.claim_id || ''} ${c?.area || ''}`));
  if (!tonal) return false;
  const seats = /\b(?:all|every|each)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|assessed)\s+)*(?:seats?|seating\s+positions?|listening\s+positions?)\b|\b(?:front|rear|back)\s+(?:or|and)\s+(?:front|rear|back)\s+row\b|\bacross\s+(?:the\s+)?(?:room|seating\s+area)\b/i.test(text);
  const scopedText = text.replace(/\b(?:tonal|timbre)\s+performance\b/gi, 'tonal character');
  const broad = /\b(?:experience|performance|sound\s+field|soundfield|whole[- ]room|overall\s+sound|bass|placement)\s+(?:(?:is|stays?|remains?|feels?)\s+)?(?:balanced|equal|even|consistent|uniform)\b|\b(?:balanced|equal|even|consistent|uniform)\s+(?:\w+\s+){0,2}(?:experience|performance|bass|placement)\b|\b(?:seat\s+equality|whole[- ]room\s+balance)\b/i.test(scopedText);
  return seats && broad;
}

export default crossSectionDuplicates;