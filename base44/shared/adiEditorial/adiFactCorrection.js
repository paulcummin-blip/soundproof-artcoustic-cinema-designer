/**
 * adiFactCorrection.js (shared)
 * -----------------------------
 * The factual half of "Improve with ADI".
 *
 * The wording pass is deliberately forbidden to change a fact, so a section that
 * already states a WRONG fact (a speaker count or a number of seating rows the
 * design does not have) could never be repaired by it. This module repairs those
 * statements first, deterministically, from the saved authoritative snapshot, and
 * the wording pass then improves the corrected copy.
 *
 * It reads only: the P2 result's own speaker count (an integrated soundbar's three
 * LCR channels are three discrete channels), falling back to the saved channel
 * layout, and the saved seating row count. It never invents a quantity: when the
 * snapshot does not state one, that statement is left exactly as it is. No RP22
 * value is calculated or changed.
 *
 * Pure: no React, no SDK, no side effects.
 */

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty',
];
const WORD_TO_NUMBER = new Map(WORDS.map((word, index) => [word, index]));
const NUMBER_TOKEN = `\\d{1,2}|${WORDS.join('|')}`;

function toNumber(token) {
  const text = String(token).toLowerCase();
  return /^\d+$/.test(text) ? Number(text) : WORD_TO_NUMBER.get(text);
}

/** The number written the way the copy it replaces wrote it. */
function like(token, value) {
  if (/^\d+$/.test(token)) return String(value);
  const word = value >= 0 && value <= 20 ? WORDS[value] : String(value);
  return token[0] === token[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

/**
 * The facts the saved project states: { speakerCount, rowCount }. Either is null
 * when the snapshot does not state it.
 */
export function authoritativeFacts(snapshot) {
  const headlines = Array.isArray(snapshot?.rp22?.parameter_headlines)
    ? snapshot.rp22.parameter_headlines : [];
  const p2 = headlines.find((row) => Number(row?.parameter_id) === 2);
  const fromP2 = /(\d+)\s*speakers?/i.exec(String(p2?.formatted_value ?? p2?.value ?? ''));
  const stored = Number(snapshot?.system?.channel_layout?.total_discrete);
  const speakerCount = fromP2
    ? Number(fromP2[1])
    : (Number.isFinite(stored) && stored > 0 ? stored : null);
  const rows = Number(snapshot?.room?.seating?.row_count);
  return { speakerCount, rowCount: Number.isFinite(rows) && rows > 0 ? rows : null };
}

// "fifteen discrete speaker positions", "15 discrete speakers", "seven speaker channels"
const SPEAKER_PHRASE = new RegExp(
  `\\b(${NUMBER_TOKEN})(\\s+discrete\\s+(?:speaker\\s+(?:positions?|channels?)|speakers?|loudspeakers?|channels?|positions?)|\\s+speaker\\s+(?:positions?|channels?))\\b`,
  'gi',
);

// "both seating rows", "two rows", "the two seating rows", "all three rows"
const ROW_PHRASE = new RegExp(
  `\\b(?:the\\s+|all\\s+)?(both|${NUMBER_TOKEN})(\\s+seating)?\\s+rows\\b`,
  'gi',
);

/**
 * Correct the speaker count and seating-row statements in one piece of text.
 * @returns {{ text: string, changes: string[] }}
 */
export function correctFactsInText(text, facts) {
  const changes = [];
  let out = String(text ?? '');
  const { speakerCount, rowCount } = facts || {};

  if (speakerCount) {
    out = out.replace(SPEAKER_PHRASE, (match, token, rest) => {
      if (toNumber(token) === speakerCount) return match;
      changes.push(`speakers: ${match} -> ${speakerCount}`);
      return `${like(token, speakerCount)}${rest}`;
    });
  }

  if (rowCount) {
    out = out.replace(ROW_PHRASE, (match, token, seating) => {
      const stated = String(token).toLowerCase() === 'both' ? 2 : toNumber(token);
      if (stated === rowCount) return match;
      changes.push(`rows: ${match} -> ${rowCount}`);
      return rowCount === 1 ? 'the seating row' : `all ${rowCount} seating rows`;
    });
  }

  return { text: out, changes };
}

/**
 * Correct a section's body and its Key Performance Highlights rows together.
 * @returns {{ body: string, highlightRows: Array|null, changes: string[] }}
 */
export function correctSectionFacts({ body, highlightRows, snapshot }) {
  const facts = authoritativeFacts(snapshot);
  const changes = [];
  const fixedBody = correctFactsInText(body, facts);
  changes.push(...fixedBody.changes);

  let rows = null;
  if (Array.isArray(highlightRows)) {
    rows = highlightRows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const next = { ...row };
      for (const key of ['what_you_hear', 'what_the_room_gains', 'result']) {
        if (typeof next[key] !== 'string') continue;
        const fixed = correctFactsInText(next[key], facts);
        next[key] = fixed.text;
        changes.push(...fixed.changes);
      }
      return next;
    });
  }
  return { body: fixedBody.text, highlightRows: rows, changes };
}

export default correctSectionFacts;