/**
 * narrativeSteer.js
 * -----------------
 * THE THREE-STATE NARRATIVE STEER — what the designer wants ADI to weigh, not
 * what the proposal is required to say.
 *
 * A suggested topic is a SUBJECT, never a command. The old chips were written as
 * instructions ("Explain the 5.1 system layout", "Show the L1 Screen Dynamic
 * Range result") and, because a selected chip was appended to the Client Brief,
 * every one of them became a writing requirement: topic one was discussed, then
 * topic two, then topic three. The states replace that. The designer marks each
 * topic:
 *
 *   neutral          ADI decides whether the topic is useful for this project.
 *   prefer           give the topic more weight IF it fits the story naturally.
 *   do_not_discuss   keep the topic out of the client-facing narrative.
 *
 * WHAT PREFER IS NOT: a paragraph, a quoted parameter, a metric, a heading, or a
 * topic forced into every section it could touch. It is a preference between
 * pieces of evidence, and a preferred topic may appear in passing, combined with
 * another point, or not at all where forcing it would damage the writing.
 *
 * WHAT DO NOT DISCUSS IS NOT: a deletion. Technical evidence, the Project Report,
 * RP22/RP23 results, technical tables and factual data are untouched. Only the
 * client-facing narrative is steered.
 *
 * The designer's own written brief stays STRONGER authority than these
 * preferences: where the brief itself asks about a topic, the brief wins.
 *
 * Pure: no React, no SDK, no storage.
 */

/**
 * The topic's OWN narrative class — importance first, then the result, then this
 * brief's relevance — read from the ONE narrative priority authority. It decides
 * which topics ADI suggests, so a lightly weighted result is never suggested merely
 * because it reached a high level.
 */
import {
  NARRATIVE_PRIORITY,
  PRIORITY_RANK,
  isNarrativeCandidate,
  topicNarrativePriority,
  TOPIC_NARRATIVE_SUBJECT,
} from '../../../../shared/narrativePriorityAuthority.js';
import { BRIEF_RELEVANCE } from '../../../../shared/briefRelevance.js';

/** The three states a topic can be in. The value is what the writer is sent. */
export const STEER_STATE = Object.freeze({
  NEUTRAL: 'neutral',
  PREFER: 'prefer',
  EXCLUDE: 'do_not_discuss',
});

/** Click order for one chip: neutral → prefer → do not discuss → neutral. */
export const STEER_STATE_ORDER = Object.freeze([
  STEER_STATE.NEUTRAL,
  STEER_STATE.PREFER,
  STEER_STATE.EXCLUDE,
]);

/** What each state is called, in the order the legend reads them. */
export const STEER_STATE_LABEL = Object.freeze({
  [STEER_STATE.NEUTRAL]: 'Neutral',
  [STEER_STATE.PREFER]: 'Prefer',
  [STEER_STATE.EXCLUDE]: 'Do not discuss',
});

/** The one-line meaning of each state, shown under the chips. */
export const STEER_STATE_MEANING = Object.freeze({
  [STEER_STATE.NEUTRAL]: 'ADI decides whether it is useful.',
  [STEER_STATE.PREFER]: 'Give it more weight if it fits naturally.',
  [STEER_STATE.EXCLUDE]: 'Keep it out of the client-facing narrative.',
});

/** The helper line that replaced the brief-instruction framing. */
export const STEER_HELPER =
  'Help ADI understand what matters most in this proposal. These are preferences, not required sections.';

/** The heading of the steer area. */
export const STEER_TITLE = 'Narrative Steer';

/**
 * The topic library: the stable key each topic is stored under, and the neutral
 * name it is offered as. A label may be refined with a frozen fact ("5.1 system
 * approach", '83" TV'), but the key never changes, so a saved steer survives a
 * relabelled chip.
 */
export const TOPIC_LIBRARY = Object.freeze({
  display: { label: 'Display and screen scale', area: 'display_viewing' },
  system_approach: { label: 'System approach', area: 'loudspeaker_configuration' },
  // Every label names the SUBJECT, never the verdict. It is the topic that is
  // steered ("Bass performance", "Tonal consistency"), and the assessed result
  // decides later how strongly that subject may be described — so no label ever
  // carries a judgement of its own ("Useful bass extension").
  screen_tonal: { label: 'Tonal consistency', area: 'timbre_matching' },
  surround_tonal: { label: 'Surround tonal consistency', area: 'timbre_matching' },
  bass_extension: { label: 'Bass performance', area: 'bass_capability' },
  bass_response: { label: 'Bass response', area: 'bass_capability' },
  bass_consistency: { label: 'Bass consistency across the seats', area: 'bass_capability' },
  rear_subwoofer: { label: 'Rear subwoofer arrangement', area: 'bass_capability' },
  speaker_positioning: { label: 'Speaker positioning', area: 'spatial_resolution' },
  overhead_arrangement: { label: 'Overhead speaker arrangement', area: 'spatial_resolution' },
  viewing_experience: { label: 'Viewing experience', area: 'client_experience' },
  seating_arrangement: { label: 'Seating arrangement', area: 'client_experience' },
  seating_geometry: { label: 'Exact seating geometry', area: 'client_experience' },
  screen_dynamic: { label: 'Screen dynamic capability', area: 'dynamic_capability' },
  channel_count: { label: 'Discrete channel count', area: 'loudspeaker_configuration' },
  documented_constraint: { label: 'Documented constraint', area: 'documented_constraint' },
  // Comparison-only subjects. They name an editorial job rather than a single
  // parameter, so they carry no exclusion of their own.
  comparison_cost: { label: 'Cost and performance difference', area: 'comparison' },
  comparison_shared: { label: 'Shared design decisions', area: 'comparison' },
  comparison_changes: { label: 'What changes between the options', area: 'comparison' },
});

/**
 * The command-phrased chips a designer may already have selected, and the topic
 * each one belongs to. A restored draft or a saved steer written before the
 * states existed is read through this map, so nothing the designer marked is
 * lost when the wording changes.
 */
const LEGACY_LABEL_TOPICS = Object.freeze([
  // Ordered most specific first: an evidence example that names a TV is the
  // display topic, not the viewing topic it also mentions.
  ['" tv', 'display'],
  [' tv', 'display'],
  ['television', 'display'],
  ['inch', 'display'],
  ['screen size and aspect', 'display'],
  ['screen scale', 'display'],
  ['screen timbre', 'screen_tonal'],
  ['screen tonal', 'screen_tonal'],
  ['surround timbre', 'surround_tonal'],
  ['surround tonal', 'surround_tonal'],
  ['tonal consistency', 'screen_tonal'],
  ['system layout', 'system_approach'],
  ['system approach', 'system_approach'],
  ['discrete channels', 'channel_count'],
  ['channel count', 'channel_count'],
  ['screen dynamic range', 'screen_dynamic'],
  ['non-screen dynamic range', 'screen_dynamic'],
  ['dynamic range', 'screen_dynamic'],
  ['dynamic capability', 'screen_dynamic'],
  ['bass extension', 'bass_extension'],
  ['bass performance', 'bass_extension'],
  ['bass consistency', 'bass_consistency'],
  ['bass response', 'bass_response'],
  ['subwoofer', 'rear_subwoofer'],
  ['overhead', 'overhead_arrangement'],
  ['speaker placement', 'speaker_positioning'],
  ['speaker positioning', 'speaker_positioning'],
  ['spacing between the channels', 'documented_constraint'],
  ['seating geometry', 'seating_geometry'],
  ['seating', 'seating_arrangement'],
  ['viewing', 'viewing_experience'],
]);

/** The topic a free-text label belongs to, or null when nothing matches. */
export function topicKeyForLabel(label) {
  const text = String(label || '').toLowerCase();
  if (!text) return null;
  for (const [needle, key] of LEGACY_LABEL_TOPICS) {
    if (text.includes(needle)) return key;
  }
  return null;
}

/** Whether a key is a topic this authority knows. */
export function isTopicKey(key) {
  return Object.prototype.hasOwnProperty.call(TOPIC_LIBRARY, String(key || ''));
}

/** The neutral name of a topic, or null when the key is unknown. */
export function topicLabel(key) {
  return isTopicKey(key) ? TOPIC_LIBRARY[key].label : null;
}

/** The next state in the click order. An unknown state reads as neutral. */
export function nextSteerState(state) {
  const index = STEER_STATE_ORDER.indexOf(state);
  return STEER_STATE_ORDER[(index + 1) % STEER_STATE_ORDER.length] || STEER_STATE.NEUTRAL;
}

/** The state recorded for one topic: neutral unless the designer said otherwise. */
export function steerStateOf(steer, key) {
  const entry = steer?.[key];
  const state = typeof entry === 'string' ? entry : entry?.state;
  return STEER_STATE_ORDER.includes(state) ? state : STEER_STATE.NEUTRAL;
}

/** The label a topic was marked under, where one was recorded. */
export function steerLabelOf(steer, key) {
  const entry = steer?.[key];
  const label = typeof entry === 'object' && entry ? entry.label : null;
  return String(label || '').trim() || topicLabel(key) || key;
}

/**
 * A steer as the authority reads it: one entry per known topic, each carrying its
 * state and the label it was marked under. Unknown keys and unknown states are
 * dropped rather than guessed at.
 */
export function normaliseSteer(raw) {
  const out = {};
  for (const [key, entry] of Object.entries(raw || {})) {
    if (!isTopicKey(key)) continue;
    const state = typeof entry === 'string' ? entry : entry?.state;
    if (!STEER_STATE_ORDER.includes(state)) continue;
    out[key] = { state, label: steerLabelOf(raw, key) };
  }
  return out;
}

/** The steer with one topic moved to a state. Neutral is recorded as neutral. */
export function setTopicState(steer, key, state, label = null) {
  if (!isTopicKey(key) || !STEER_STATE_ORDER.includes(state)) return steer;
  const next = { ...normaliseSteer(steer) };
  next[key] = { state, label: String(label || '').trim() || topicLabel(key) };
  return next;
}

/** Move one topic to its next state, for a single click on a chip. */
export function cycleTopicState(steer, key, label = null) {
  return setTopicState(steer, key, nextSteerState(steerStateOf(steer, key)), label);
}

/** How many topics the designer has steered at all. */
export function steeredTopicCount(steer) {
  return Object.keys(normaliseSteer(steer)).length;
}

/**
 * The steer as the writer receives it: two lists of SUBJECTS, never sentences
 * and never instructions. Keys travel with the labels so the two sides of the
 * pipeline always name the same topic, and the empty case is explicit rather
 * than absent.
 */
export function steerPayload(steer) {
  const normalised = normaliseSteer(steer);
  const preferred = [];
  const excluded = [];
  const neutral = [];
  for (const [key, entry] of Object.entries(normalised)) {
    const topic = { topic_key: key, topic: steerLabelOf(normalised, key) };
    if (entry.state === STEER_STATE.PREFER) preferred.push(topic);
    else if (entry.state === STEER_STATE.EXCLUDE) excluded.push(topic);
    else neutral.push(topic);
  }
  return {
    preferred_topics: preferred,
    excluded_topics: excluded,
    neutral_topics: neutral,
  };
}

/** The steering preferences only: the lists the writer input carries. */
export function steerPreferences(steer) {
  const payload = steerPayload(steer);
  return {
    preferred_topics: payload.preferred_topics.map((entry) => entry.topic),
    excluded_topics: payload.excluded_topics.map((entry) => entry.topic),
    excluded_topic_keys: payload.excluded_topics.map((entry) => entry.topic_key),
  };
}

/**
 * ── WHICH TOPICS ADI SUGGESTS, AND WHICH IT MERELY OFFERS ────────────────────
 *
 * A suggestion is a topic ADI believes is worth preferring for THIS design, and
 * it is derived from the strength and distinctiveness of the published evidence
 * behind it — never from the fact that a parameter exists, and never from
 * whatever happens to be in the snapshot.
 *
 * So a Level 1 result is not promoted: it stays available as a topic the
 * designer may prefer or exclude, and ADI does not suggest discussing it. A
 * channel count is never promoted either — a count is not a story. Seating, the
 * exact seating geometry and the viewing experience are offered so the designer
 * can steer them, and are never suggested as something to sell.
 */

/** The assessed level a topic's own example names, or null when it names none. */
export function levelOfTopicLabel(text) {
  const match = /\bL([1-4])\b/.exec(String(text || ''));
  return match ? Number(match[1]) : null;
}

/** The level a topic must reach before ADI suggests preferring it. */
const SUGGESTED_MIN_LEVEL = Object.freeze({
  screen_tonal: 3,
  surround_tonal: 3,
  screen_dynamic: 2,
  overhead_arrangement: 2,
  speaker_positioning: 2,
  bass_response: 2,
  bass_consistency: 2,
  // Bass extension is assessed on the same scale as the rest of the bass family:
  // a Level 1 result is offered as a topic the designer may prefer, and is not
  // suggested as something to sell. What may be SAID about it is scaled by the
  // result itself when the copy is written.
  bass_extension: 2,
});

/** Topics ADI never promotes: they are offered so the designer can steer them. */
const NEVER_SUGGESTED = Object.freeze(new Set([
  'channel_count',
  'seating_arrangement',
  'seating_geometry',
  'viewing_experience',
  'documented_constraint',
]));

/**
 * Whether ADI suggests preferring a topic, on the strength of its own evidence.
 * The text read for a level is the evidence behind the topic — the example's own
 * wording and the calculated fact it names — so a result the design has not
 * achieved is never promoted by the topic being on screen.
 */
export function topicIsSuggested(key, evidenceText = '', { relevance = BRIEF_RELEVANCE.STANDARD } = {}) {
  if (!isTopicKey(key) || NEVER_SUGGESTED.has(key)) return false;
  const minimum = SUGGESTED_MIN_LEVEL[key];
  const level = levelOfTopicLabel(evidenceText);
  if (minimum && (level === null || level < minimum)) return false;
  // A subject with no result of its own on screen (the display scale, the system
  // approach) is offered exactly as before: it is being offered as a subject, not
  // as a claim about a result.
  if (level === null) return true;
  // Where a result IS stated, the topic must earn its place: importance and brief
  // relevance decide first, and only then does the level matter — so a trivial L4
  // on a lightly weighted parameter is never suggested.
  return isNarrativeCandidate(topicNarrativePriority(key, { level, relevance }).priority);
}

/** The frozen fact a topic's own name may carry: a TV diagonal, a screen size. */
function refineTopicLabel(key, evidenceLabel, fallback) {
  const text = String(evidenceLabel || '');
  if (key === 'display') {
    const inches = /(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|["”])/i.exec(text);
    if (!inches) return fallback;
    const size = Math.round(Number(inches[1]));
    if (!Number.isFinite(size)) return fallback;
    return /\bTV\b|television/i.test(text) ? `${size}" TV` : `${size} inch screen`;
  }
  // The configuration the design actually uses becomes part of the subject's own
  // name — "5.1 system approach" — so the chip is precise about WHAT it covers
  // while still saying nothing about how good it is.
  if (key === 'system_approach') {
    const configuration = /\b([579]\.\d(?:\.\d)?)\b/.exec(text);
    return configuration ? `${configuration[1]} system approach` : fallback;
  }
  return fallback;
}

/**
 * The topics always offered, so a subject the designer cares about can be
 * steered or excluded even where no example happens to name it. They are offered
 * as neutral topics and none of them is suggested.
 */
export const ALWAYS_OFFERED_TOPICS = Object.freeze([
  'display',
  'system_approach',
  'screen_tonal',
  'surround_tonal',
  'bass_extension',
  'rear_subwoofer',
  'speaker_positioning',
  'viewing_experience',
  'seating_arrangement',
  'seating_geometry',
  'screen_dynamic',
  'channel_count',
]);

/**
 * The topics offered to the designer, as neutral subjects: ADI's evidence
 * examples first — each mapped to the topic it belongs to, marked as suggested
 * only where its own result is strong — then the always-offered topics.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.chips] — the evidence examples on screen
 * @param {number} [input.limit]
 * @returns {Array<Object>} one entry per topic
 */
export function presentSteerTopics({ chips = [], limit = 12, brief = null } = {}) {
  const out = [];
  const seen = new Set();
  const relevanceOf = (key) => {
    const area = TOPIC_NARRATIVE_SUBJECT[key]?.area || TOPIC_LIBRARY[key]?.area || null;
    return (area && brief?.byArea?.[area]) || BRIEF_RELEVANCE.STANDARD;
  };
  const push = (entry) => {
    if (out.length >= limit || seen.has(entry.topic_key)) return;
    seen.add(entry.topic_key);
    out.push(entry);
  };

  for (const chip of Array.isArray(chips) ? chips : []) {
    const evidenceLabel = String(chip?.label || '').trim();
    const key = topicKeyForLabel(evidenceLabel);
    if (!key || !isTopicKey(key)) continue;
    const evidenceText = [evidenceLabel, chip?.reason].filter(Boolean).join(' ');
    const relevance = relevanceOf(key);
    push({
      topic_key: key,
      label: refineTopicLabel(key, evidenceLabel, TOPIC_LIBRARY[key].label),
      area: chip?.area || TOPIC_LIBRARY[key].area,
      suggested: topicIsSuggested(key, evidenceText, { relevance }),
      narrative_priority: topicNarrativePriority(key, { level: levelOfTopicLabel(evidenceText), relevance }).priority,
      evidence_label: evidenceLabel,
      reason: [evidenceLabel, String(chip?.reason || '').trim()].filter(Boolean).join(' — '),
    });
  }

  for (const key of ALWAYS_OFFERED_TOPICS) {
    if (!isTopicKey(key)) continue;
    push({
      topic_key: key,
      label: TOPIC_LIBRARY[key].label,
      area: TOPIC_LIBRARY[key].area,
      suggested: false,
      evidence_label: null,
      reason: '',
    });
  }

  return out;
}

/** A one-line summary for the review step, or null when nothing is steered. */
export function steerSummaryLine(steer) {
  const payload = steerPayload(steer);
  const parts = [];
  if (payload.preferred_topics.length > 0) {
    parts.push(`Prefer: ${payload.preferred_topics.map((entry) => entry.topic).join(', ')}`);
  }
  if (payload.excluded_topics.length > 0) {
    parts.push(`Do not discuss: ${payload.excluded_topics.map((entry) => entry.topic).join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * A steer restored from a saved proposal or a resumed draft: the writer payload
 * names each topic by its key, or by its name where only the name was stored, and
 * the state comes from the list the topic is in.
 */
export function steerFromPayload(record) {
  const out = {};
  const add = (list, state) => {
    for (const entry of Array.isArray(list) ? list : []) {
      const label = String((typeof entry === 'string' ? entry : entry?.topic) || '').trim();
      const key = (typeof entry === 'object' && entry?.topic_key) || topicKeyForLabel(label);
      if (!isTopicKey(key)) continue;
      out[key] = { state, label: label || topicLabel(key) };
    }
  };
  add(record?.neutral_topics, STEER_STATE.NEUTRAL);
  add(record?.preferred_topics, STEER_STATE.PREFER);
  add(record?.excluded_topics, STEER_STATE.EXCLUDE);
  return out;
}

export default steerPayload;