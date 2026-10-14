/**
 * narrativePillars.js (base44/shared — CANONICAL)
 * ----------------------------------------------
 * THE THREE PILLARS ORGANISE THE CLIENT STORY. RP22 PARAMETERS ARE THE EVIDENCE
 * BENEATH IT.
 *
 * Sound Proof says three things make a system good: DYNAMIC RANGE, SPATIAL
 * RESOLUTION and TIMBRE MATCHING. The client is choosing those three experiences;
 * P12, P14, P18 and P20 are how well this design delivers them. Every important
 * result is therefore asked two questions — WHICH PILLAR DOES THIS STRENGTHEN, and
 * WHAT WILL THE CLIENT ACTUALLY NOTICE BECAUSE OF IT? — and is then told inside
 * that pillar, never as a paragraph of its own.
 *
 * The bass is the clearest case. Output, depth, control and consistency are ONE
 * Dynamic Range story: a strong bass system does not mean "26 Hz" or "P14 L3", it
 * means a greater contrast between quiet material and the largest effects, with the
 * deepest moments having scale and physical weight. P19 supports the control of
 * that experience at the reference position and P20 how well it carries across the
 * seating, so they strengthen the same story rather than creating two more.
 *
 * WHAT THE PILLARS NEVER DO. No figure, level, scope or claim is changed, averaged
 * or widened: each part of a story reads its own member's published result, a
 * consistency claim is stated only for the seats its own result holds for, and
 * infrasonic language is refused wherever the extension does not reach it. The
 * parameter numbers and the measured results stay in the evidence, and success is
 * read against the brief, never from a Performance Level alone.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { PERFORMANCE_AREAS, performancePhrase } from './performanceLanguageAuthority.js';
import { levelRank } from './strengthImportance.js';
import { SEAT_SCOPE, p20ConsistencyPhrase } from './seatScopeNarrativeAuthority.js';

/** The pillar generation, so a draft can be traced to the story structure it was written under. */
export const NARRATIVE_PILLAR_VERSION = 2;

export const PILLAR = Object.freeze({
  DYNAMIC_RANGE: 'dynamic_range',
  SPATIAL_RESOLUTION: 'spatial_resolution',
  TIMBRE_MATCHING: 'timbre_matching',
});

/** The three pillars, in the order the story reads them. */
export const PILLAR_ORDER = Object.freeze([
  PILLAR.DYNAMIC_RANGE,
  PILLAR.SPATIAL_RESOLUTION,
  PILLAR.TIMBRE_MATCHING,
]);

/**
 * The evidence that strengthens each pillar. `primary` carries the pillar; each
 * `supporting` result explains part of the same story and never becomes one of its
 * own.
 */
export const PILLAR_EVIDENCE = Object.freeze({
  [PILLAR.DYNAMIC_RANGE]: Object.freeze({
    primary: Object.freeze(['p12', 'p13', 'p14', 'p18']),
    supporting: Object.freeze(['p19', 'p20']),
  }),
  [PILLAR.SPATIAL_RESOLUTION]: Object.freeze({
    primary: Object.freeze(['p3', 'p4', 'p5', 'p11']),
    supporting: Object.freeze([]),
  }),
  [PILLAR.TIMBRE_MATCHING]: Object.freeze({
    primary: Object.freeze(['p16', 'p17']),
    supporting: Object.freeze([]),
  }),
});

/**
 * The pillars, with the experience each one stands for, the answers the client
 * needs and the translation the evidence is written in.
 */
export const PILLARS = Object.freeze({
  [PILLAR.DYNAMIC_RANGE]: Object.freeze({
    key: PILLAR.DYNAMIC_RANGE,
    label: 'Dynamic Range',
    question: 'Can the system go from quiet dialogue and detail to large-scale impact without sounding strained?',
    why_care: 'Dynamic Range creates excitement. A system with good dynamic range stays clear and relaxed through quiet material and then produces genuine scale and impact when the soundtrack demands it: the contrast between quiet detail and explosive moments is where the excitement, the realism and the musical energy come from.',
    translation: Object.freeze([
      'quiet dialogue and detail preserved',
      'normal listening levels',
      'powerful musical passages',
      'major film effects',
      'deep low-frequency impact',
    ]),
    vocabulary: Object.freeze(['contrast', 'scale', 'impact', 'headroom', 'excitement', 'weight', 'effortlessness']),
    register_examples: Object.freeze([
      'Bass is one of the strengths of this design. The system has the output and depth to give films and music real scale and impact, so the largest moments feel substantially different from the quiet ones.',
      'This system has exceptional low-frequency capability, combining very high output with infrasonic depth. The biggest effects have genuine physical scale and authority, creating the contrast between quiet detail and explosive moments that makes a cinema soundtrack exciting.',
    ]),
    success_note: 'A dynamic result is a success when it is right for the intended use: the same figures that are ample in a television lounge may be a limitation in a reference cinema, and the brief decides which this is.',
    rule: 'Dynamic Range is not simply maximum SPL. It is the system\'s ability to preserve the contrast between quiet dialogue and detail, normal listening levels, powerful musical passages, major film effects and deep low-frequency impact, and it is told as ONE story across the screen channels, the surrounds and the bass.',
  }),
  [PILLAR.SPATIAL_RESOLUTION]: Object.freeze({
    key: PILLAR.SPATIAL_RESOLUTION,
    label: 'Spatial Resolution',
    question: 'Can sounds appear in convincing places and move naturally around the room?',
    why_care: 'Because dialogue stays connected to the picture and effects create a believable space instead of sounding like individual speakers. The loudspeakers disappear more easily as sources, and the soundtrack forms a space around the audience that the client can follow.',
    translation: Object.freeze([
      'the connection between sound and picture',
      'convincing placement',
      'natural movement',
      'envelopment',
      'the ability to follow an effect around the room',
    ]),
    vocabulary: Object.freeze(['precision', 'placement', 'movement', 'envelopment', 'a believable space', 'immersion']),
    register_examples: Object.freeze([
      'Sounds appear where the picture puts them and move naturally around the room, so the soundtrack forms a believable space around the seating rather than a set of separate loudspeakers.',
    ]),
    success_note: 'Placement is a success when the layout suits the seating and the intended use: a small room does not need theatre distances to place a sound convincingly.',
    rule: 'Spatial Resolution is told as ONE story of placement and movement. The placement results are evidence for that one story and are never separate client talking points, and each result named holds on its own: a mixed spatial picture is never written as a uniformly strong one.',
  }),
  [PILLAR.TIMBRE_MATCHING]: Object.freeze({
    key: PILLAR.TIMBRE_MATCHING,
    label: 'Timbre Matching',
    question: 'Does a voice, an instrument or an effect retain its character as it moves between speakers and seats?',
    why_care: 'Because the system sounds like one coherent environment rather than a collection of different loudspeakers. Attention stays on the film or the music instead of on differences between the loudspeakers or between the seats.',
    translation: Object.freeze([
      'voices retaining their natural character',
      'instruments sounding consistent',
      'effects not changing tone as they move',
      'a broadly similar tonal balance across the important seating positions',
    ]),
    vocabulary: Object.freeze(['one voice', 'natural character', 'consistent tone', 'coherent']),
    register_examples: Object.freeze([
      'A voice keeps its natural character as it moves across the front and around the room, so the system sounds like one coherent environment rather than a collection of loudspeakers.',
    ]),
    success_note: 'A tonal result is a success when the character of the sound is preserved for the listener, whatever the level achieved.',
    rule: 'Timbre Matching is told as ONE coherent tonal-consistency story. The two tonal results are separate seat-to-seat frequency-response results, one loudspeaker group each: they are never a comparison measured between the groups, and no tonal result is written as though the tonal balance were the same in every seat unless its own result says so.',
  }),
});

/** Every parameter's pillar, built once from the pillar evidence itself. */
export const PARAMETER_PILLAR = Object.freeze(
  PILLAR_ORDER.reduce((map, pillarKey) => {
    const evidence = PILLAR_EVIDENCE[pillarKey];
    for (const key of [...evidence.primary, ...evidence.supporting]) map[key] = pillarKey;
    return map;
  }, {}),
);

/** The pillar one parameter strengthens, or null for evidence that is not a pillar result. */
export function pillarOf(parameterKey) {
  return PARAMETER_PILLAR[String(parameterKey)] || null;
}

/** Every parameter that strengthens one pillar, primary first. */
export function pillarMemberKeys(pillarKey) {
  const evidence = PILLAR_EVIDENCE[pillarKey];
  return evidence ? [...evidence.primary, ...evidence.supporting] : [];
}

/* ── The bass as parts of the one Dynamic Range story ─────────────────────── */

/**
 * The four readings of the bass story. Each part answers its own question at its
 * own published result, and together they are what the client notices: greater
 * contrast, with scale and weight that the important seats share.
 */
export const BASS_PARTS = Object.freeze([
  Object.freeze({
    part: 'output',
    keys: Object.freeze(['p14']),
    question: 'How much output is available for the largest moments?',
    area: PERFORMANCE_AREAS.BASS_OUTPUT,
    vocabulary: Object.freeze(['power', 'impact', 'physicality']),
    notices: 'the largest effects have something substantial to draw on',
  }),
  Object.freeze({
    part: 'depth',
    keys: Object.freeze(['p18']),
    question: 'How low does the system reach, and how much scale does that give the deepest moments?',
    area: PERFORMANCE_AREAS.BASS_EXTENSION,
    vocabulary: Object.freeze(['depth', 'scale', 'physical impact']),
    notices: 'the deepest moments have scale and physical weight rather than simply getting louder',
    allows_infrasonic: true,
  }),
  Object.freeze({
    part: 'control',
    keys: Object.freeze(['p19']),
    question: 'How closely does the response follow the target at the reference seating position?',
    // The performance register holds no area for this result, so no clause is
    // invented here: the part is stated from its own evidence.
    area: null,
    vocabulary: Object.freeze(['control', 'composure']),
    notices: 'the weight arrives cleanly instead of smearing the detail above it',
    supporting: true,
  }),
  Object.freeze({
    part: 'consistency',
    keys: Object.freeze(['p20']),
    question: 'How well does that bass performance carry across the primary seats?',
    area: null,
    vocabulary: Object.freeze(['consistency', 'shared weight']),
    notices: 'the weight and excitement are shared rather than concentrated in one seat',
    supporting: true,
  }),
]);

export const BASS_PART_ORDER = Object.freeze(BASS_PARTS.map((part) => part.part));

/* ── The seat scope a consistency claim may be made for ───────────────────── */

/** The wording each seat scope allows. */
export const SEAT_SCOPE_WORDING = Object.freeze({
  [SEAT_SCOPE.ALL]: 'across the seating',
  [SEAT_SCOPE.PRIMARY]: 'across the primary seating area',
});

/** The wording a narrower result must never be widened into. */
export const WIDENED_SCOPE_WORDING = Object.freeze(['across the room', 'across every seat', 'throughout the room', 'at every seat']);

export const PRIMARY_SEAT_SCOPE_RULE = `PRESERVE THE EXACT SEAT SCOPE. Where the bass consistency result holds for the primary seats only, say "across the primary seating area" and stop there: never claim all-seat consistency, never write "across the room", "across every seat" or "throughout the room", and never let the shared-experience sentence imply a seat it does not hold for. Where the result holds across the assessed seating, the wider wording is allowed. The seats a claim is made for are read from the result itself, never chosen for emphasis.`;

/* ── Infrasonic language, only where the extension supports it ─────────────── */

/**
 * The RP22 boundary the depth result is graded against: a minimum-L3 in-room
 * extension reaches 20 Hz. Deepest-octave, infrasonic language therefore begins at
 * an L3 depth result, and where a published extension value exists it has to agree
 * with it.
 */
export const INFRASONIC_EXTENSION_HZ = 20;
export const INFRASONIC_MIN_DEPTH_LEVEL = 'L3';

/** The phrases a genuinely deep result has earned. */
export const INFRASONIC_PHRASES = Object.freeze([
  'infrasonic depth',
  'physical scale',
  'felt as much as heard',
  'genuine low-frequency authority',
]);

export const INFRASONIC_EXAMPLE = 'The system reaches into the infrasonic part of the soundtrack, adding a physical sense of scale to the biggest effects as well as audible bass.';

export const INFRASONIC_RULE = `INFRASONIC LANGUAGE MUST BE EARNED. Use "infrasonic", or phrases such as infrasonic depth, physical scale, felt as much as heard or genuine low-frequency authority, ONLY where the bass extension result genuinely supports it: a moderate or mid-band extension is written as the depth it gives the soundtrack, with no infrasonic claim and no promise below the published limit. Do not hedge a deep result either.`;

/** The Hz a published extension value states, or null. */
export function extensionHz(value) {
  if (value == null) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*hz/i);
  if (!match) return null;
  const hz = Number(match[1]);
  return Number.isFinite(hz) ? hz : null;
}

/**
 * Whether the depth result supports infrasonic language, and why.
 *
 * @param {Object} input
 * @param {string|null} [input.depthLevel] — the published extension result
 * @param {string|number|null} [input.depthValue] — the published extension, e.g. '18 Hz'
 * @returns {{allowed: boolean, reason: string, phrases: Array<string>, extension_hz: number|null}}
 */
export function infrasonicAllowance({ depthLevel = null, depthValue = null } = {}) {
  const level = String(depthLevel || '').toUpperCase() || null;
  const hz = extensionHz(depthValue);
  const refused = (reason) => ({ allowed: false, reason, phrases: [], extension_hz: hz });
  if (level == null) {
    return refused('no extension result is published, so no deepest-octave claim can be made');
  }
  if (!levelRank(level) || levelRank(level) < levelRank(INFRASONIC_MIN_DEPTH_LEVEL)) {
    return refused(`the extension result is ${level}, and infrasonic language begins at ${INFRASONIC_MIN_DEPTH_LEVEL} (${INFRASONIC_EXTENSION_HZ} Hz)`);
  }
  if (hz != null && hz > INFRASONIC_EXTENSION_HZ) {
    return refused(`the published extension states ${hz} Hz, which does not reach the ${INFRASONIC_EXTENSION_HZ} Hz infrasonic boundary`);
  }
  return {
    allowed: true,
    reason: hz == null
      ? `the extension result is ${level}, which reaches the ${INFRASONIC_EXTENSION_HZ} Hz boundary or below`
      : `the extension result is ${level} at ${hz} Hz`,
    phrases: [...INFRASONIC_PHRASES],
    extension_hz: hz,
  };
}

/* ── The rules the writer is held to ──────────────────────────────────────── */

export const CORE_STORY_RULE = `ASDR tells us what matters. RP22 tells us how well it performs. The brief tells us whether that performance is right for this project. The three pillars tell us how to explain why the client should care.`;

export const STORY_HIERARCHY_RULE = `THE STORY RUNS: brief, then ASDR importance, then the evidence, then the three pillars, then the client's experience. It never runs parameter, paragraph, next parameter.`;

export const NARRATIVE_METHOD_RULE = `FOR EVERY IMPORTANT RESULT OR GROUP OF RELATED RESULTS, ANSWER THREE QUESTIONS BEFORE WRITING: (1) which of the three pillars does this strengthen? (2) what does that change in the listening experience? (3) why should the client care? Write from answers 2 and 3. The parameter numbers remain evidence.`;

export const PILLAR_STRUCTURE_RULE = `THE THREE PILLARS ORGANISE THE CLIENT STORY: Dynamic Range, Spatial Resolution and Timbre Matching. They are the performance characteristics Sound Proof says make a system good, and they are the structure the client story is written through. RP22 parameters are the evidence underneath them, never the structure: do not make individual parameters the shape of the client story, do not give a parameter its own section, heading or paragraph, and never produce "Bass Output / Bass Extension / Bass Response / Bass Consistency" as four stories. Produce Dynamic Range as one fluent story about power, depth, scale and impact, with the control and consistency of that experience supporting it where the evidence holds.`;

export const EVIDENCE_NOT_HEADLINE_RULE = `NEVER MERELY REPORT THE EVIDENCE. Do not write "99 dBC", "26 Hz" or "Level 3" as the point of a sentence. Explain what those results collectively allow the system to do: the contrast it preserves, the scale it gives the biggest moments, the space it places effects in, the character it keeps as sound moves. A figure earns its place only where it states a key result the client asked about.`;

export const BASS_STORY_RULE = `THE BASS NORMALLY STRENGTHENS DYNAMIC RANGE, NOT A SUBJECT OF ITS OWN. Bass output, bass depth, the response at the reference position and the consistency across the seating are four readings of one thing the client experiences as a single subject, so they are combined into the Dynamic Range story rather than discussed independently. A strong bass system is not "26 Hz" or "P14 L3": it is a greater contrast between quiet material and the largest effects, with the deepest moments having scale and physical weight. P19 supports the control and quality of that experience at the reference position and P20 how well it carries across the seating: name neither as a parameter, and tell both inside the same bass account.`;

export const BRIEF_CONTEXT_RULE = `THE BRIEF DECIDES WHETHER A RESULT IS A SUCCESS. Never judge success from an RP22 Performance Level alone: a single-row 5.1 television lounge may achieve L1 or L2 in high-weight parameters and still be a highly successful design, because that performance is right for the intended use. The same results in a reference-quality twelve-seat dedicated cinema may be a limitation. Read the brief and the intended use first, describe a result that suits the project positively as the achievement it is, and never present a result as strong, weak, generous or limited without that context.`;

export const SEATING_RATIONALE_NOTE = `THE SEATING IS A DESIGN DECISION, NOT A FOURTH PILLAR. Where the seating arrangement is explained, explain in plain terms what the placement does for the listener: the room working with the seating, the viewing position, and the balance the layout strikes. It is never presented as a performance result, never given a Performance Level, and never turned into a pillar of its own.`;

/* ── How much of a pillar's evidence is discussed ─────────────────────────── */

/**
 * HOW MUCH of a pillar's evidence is told. It is decided for each result, never for
 * the pillar: ASDR importance and the brief decide which results lead, which
 * support and which stay in the engineering evidence.
 */
export const EVIDENCE_EMPHASIS = Object.freeze({
  LEAD: 'lead',
  SUPPORTING: 'supporting',
  CONTRIBUTING: 'contributing',
  CONTEXT: 'context',
  EXCLUDED: 'excluded',
});

export const PILLAR_ALWAYS_AVAILABLE_RULE = `A PILLAR IS NEVER SILENCED BY ITS OWN EVIDENCE. Dynamic Range, Spatial Resolution and Timbre Matching are the three ways Sound Proof explains performance, and every proposal tells all three. ASDR importance decides how much of the EVIDENCE beneath a pillar is discussed — which results lead, which support and which stay in the engineering evidence — and never whether the pillar itself is there. Where little beneath a pillar is worth telling, that pillar is simply shorter: write it briefly and honestly from the evidence it does hold, without leaving it out, apologising for it or padding it.`;

export const EVIDENCE_EMPHASIS_RULE = `THE EMPHASIS INSIDE A PILLAR IS ALREADY DECIDED. Each result beneath a pillar carries an emphasis: a lead result is written out; a supporting or contributing result is woven into the same story; a context result strengthens the pillar but belongs in the engineering evidence, so it is mentioned only in passing where the story genuinely needs it. A lightly weighted result that happens to score highly is never a headline, and a heavily weighted result is discussed even where its level is modest. Never re-rank the evidence and never invent an emphasis.`;

export const SEATING_RATIONALE_RULE = `THE SEATING DECISION IS EXPLAINED AS A DESIGN REASON, NEVER AS A RESULT. Where the evidence carries a seating rationale, explain WHY the seating sits where it does: the space behind the seating is deliberate, the seats are kept clear of the rear wall because a seat close to it is one of the most difficult places in a room for bass and it affects how evenly the system behaves at the listening positions, and the clearance also leaves a better relationship between the audience and the surrounding loudspeakers. It is a deliberate design decision rather than wasted floor space. State no parameter, no Performance Level and no equation, never quote the distance as if it were the benefit, and never promise a particular measured bass outcome. Where the room takes a compromise, explain the balance constructively. Where the seating subject is steered do-not-discuss, the rationale is not written at all.`;

/* ── Reading client-facing text ───────────────────────────────────────────── */

const PARAMETER_NAME_PATTERN = /\bP(?:[1-9]|1\d|2[0-3])\b/g;
const LEVEL_NAME_PATTERN = /\b(?:Level\s*[1-4]|L[1-4])\b/g;
const RAW_MEASUREMENT_PATTERN = /\b\d+(?:\.\d+)?\s*(?:dB[AC]?|Hz|kHz|dBC)\b/g;

/** The parameter names a piece of client-facing text states, in the order read. */
export function parameterNamesIn(text) {
  if (text == null) return [];
  return [...String(text).matchAll(PARAMETER_NAME_PATTERN)].map((match) => match[0]);
}

/** The raw Performance Levels a piece of client-facing text states, in the order read. */
export function levelNamesIn(text) {
  if (text == null) return [];
  return [...String(text).matchAll(LEVEL_NAME_PATTERN)].map((match) => match[0]);
}

/** The bare measurements a piece of client-facing text states, in the order read. */
export function rawMeasurementsIn(text) {
  if (text == null) return [];
  return [...String(text).matchAll(RAW_MEASUREMENT_PATTERN)].map((match) => match[0]);
}

/**
 * Whether a piece of client-facing story text is safe: it names no parameter,
 * states no raw Performance Level and reports no bare measurement. Audit only — it
 * reports what it reads and changes nothing.
 */
export function clientStoryTextIsSafe(text) {
  const parameters = parameterNamesIn(text);
  const levels = levelNamesIn(text);
  const measurements = rawMeasurementsIn(text);
  return {
    safe: parameters.length === 0 && levels.length === 0 && measurements.length === 0,
    parameters,
    levels,
    measurements,
    violations: [...parameters, ...levels, ...measurements],
  };
}

/** The pillar vocabulary and questions, as the writer's own reference lines. */
export function pillarReferenceLines() {
  return PILLAR_ORDER.flatMap((pillarKey) => {
    const pillar = PILLARS[pillarKey];
    return [
      `${pillar.label.toUpperCase()} — ${pillar.question}`,
      `WHY THE CLIENT CARES: ${pillar.why_care}`,
      `TRANSLATE THE EVIDENCE INTO: ${pillar.translation.join('; ')}.`,
      `WRITE IT AS: ${pillar.rule}`,
    ];
  });
}