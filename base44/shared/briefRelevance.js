/**
 * briefRelevance.js (base44/shared — CANONICAL)
 * ---------------------------------------------
 * HOW RELEVANT EACH NARRATIVE AREA IS TO THIS PROJECT'S BRIEF.
 *
 * WHY IT EXISTS. Achieved level alone must never decide what a proposal talks
 * about. A reference-grade parameter that reached L4 in a straightforward room is
 * not automatically a story, and a heavily weighted parameter that reached L1 or
 * L2 can be exactly the right result for the brief the client set. The brief is
 * the missing half of that judgement, so it is read here, once, as one of three
 * plain states per narrative area.
 *
 * WHAT IT IS NOT:
 *   · it is not a score and not a second rating: it states high / standard / none,
 *     never a number, and it is never printed on a client-facing page;
 *   · it creates no weighting: the ASDR importance table is untouched and is never
 *     imitated here. This module answers only "does this brief care about this
 *     subject, and does the design contain it at all";
 *   · it changes no calculation, no RP22 or RP23 result, no level and no claim.
 *
 * HOW AN AREA'S RELEVANCE IS DECIDED, in this order:
 *   1. an area the design does not contain at all reads NONE — a project with no
 *      subwoofer has no bass story to tell, whatever a table says about it;
 *   2. an area the designer named in the brief, or marked Prefer in the narrative
 *      steer, reads HIGH;
 *   3. an area the brief's own intent puts at the centre of the project reads
 *      HIGH: a media lounge is built around the picture, the system approach, the
 *      viewing and the bass, while a dedicated cinema is built around dynamic
 *      range, spatial resolution, tonal consistency and the bass;
 *   4. every other area the design contains reads STANDARD.
 *
 * The intent is the design's own declared intent, and it is supplied by the
 * caller: a television design is a media lounge unless the designer explicitly
 * marked it as a dedicated cinema (see projectIntentClassification.js).
 *
 * Pure: no React, no SDK, no storage, no side effects.
 */

/** The three relevance states. There is no fourth and no numeric one. */
export const BRIEF_RELEVANCE = Object.freeze({
  HIGH: 'high',
  STANDARD: 'standard',
  NONE: 'none',
});

/** The project intents this authority reads a brief against. */
export const BRIEF_INTENT = Object.freeze({
  MEDIA_LOUNGE: 'media_lounge',
  DEDICATED_CINEMA: 'dedicated_cinema',
});

/** The narrative areas, named exactly as the narrative steer names them. */
export const BRIEF_AREAS = Object.freeze([
  'display_viewing',
  'client_experience',
  'loudspeaker_configuration',
  'bass_capability',
  'dynamic_capability',
  'spatial_resolution',
  'timbre_matching',
  'documented_constraint',
]);

/**
 * What each intent builds the project around. These are subjects, not weights and
 * not scores: they say which areas the brief itself is about, so an on-brief
 * result in one of them is worth discussing at whatever level it reached.
 */
export const INTENT_CENTRAL_AREAS = Object.freeze({
  [BRIEF_INTENT.MEDIA_LOUNGE]: Object.freeze([
    'display_viewing',
    'client_experience',
    'loudspeaker_configuration',
    'bass_capability',
  ]),
  [BRIEF_INTENT.DEDICATED_CINEMA]: Object.freeze([
    'dynamic_capability',
    'spatial_resolution',
    'timbre_matching',
    'bass_capability',
    'display_viewing',
  ]),
});

/** The subjects a brief's own words can name. Narrow, and never a judgement. */
const SUBJECT_PATTERNS = Object.freeze([
  [/subwoofer|\bbass\b|low[- ]frequenc|lfe/i, 'bass_capability'],
  [/dynamic range|dynamic|impact|headroom|concert level|reference level/i, 'dynamic_capability'],
  [/timbre|tonal|timbre match|voice|dialogue clarity/i, 'timbre_matching'],
  [/overhead|atmos|immersive|height|spatial|placement|spacing|surround/i, 'spatial_resolution'],
  [/\btv\b|television|screen|projector|projection|picture|large format|cinemascope/i, 'display_viewing'],
  [/seating|seat|viewing|comfort|lounge|recliner|sofa|rows?/i, 'client_experience'],
  [/5\.1|7\.1|9\.1|\bchannels?\b|system|format|layout/i, 'loudspeaker_configuration'],
]);

/** The area a piece of the brief's own text names, or null. */
export function areaForSubjectText(text) {
  const value = String(text || '');
  if (!value.trim()) return null;
  for (const [pattern, area] of SUBJECT_PATTERNS) {
    if (pattern.test(value)) return area;
  }
  return null;
}

/** The areas a brief's own words name — at most one per area, never guessed twice. */
export function areasForBriefText(text) {
  const value = String(text || '');
  if (!value.trim()) return [];
  const out = [];
  for (const [pattern, area] of SUBJECT_PATTERNS) {
    if (pattern.test(value) && !out.includes(area)) out.push(area);
  }
  return out;
}

/** Which areas this design actually contains evidence for. */
const CONTAINED = Object.freeze({
  display_viewing: (design) => design.display !== false,
  client_experience: (design) => design.seats !== 0 && (design.seats > 0 || design.display !== false),
  loudspeaker_configuration: (design) => design.speakers !== false,
  bass_capability: (design) => design.bass === true,
  dynamic_capability: (design) => design.screenChannels !== false,
  spatial_resolution: (design) => design.spatial === true,
  timbre_matching: (design) => design.timbre === true,
  documented_constraint: () => true,
});

/**
 * The brief relevance of every area.
 *
 * @param {Object} input
 * @param {string} [input.intent] — the design's declared intent
 * @param {Array<string>} [input.subjects] — areas the designer named: narrative
 *   steer areas marked Prefer, or areas read from the brief's own wording
 * @param {string} [input.briefText] — the designer's own brief, read for subjects
 * @param {Object} [input.design] — what the design contains: { display, speakers,
 *   seats, bass, spatial, timbre, screenChannels }
 * @returns {{intent, byArea, highAreas, noneAreas, reasons, subjectAreas, source}}
 */
export function readBriefRelevance({
  intent = null,
  subjects = [],
  briefText = '',
  design = {},
} = {}) {
  const resolvedIntent = intent === BRIEF_INTENT.MEDIA_LOUNGE || intent === BRIEF_INTENT.DEDICATED_CINEMA
    ? intent
    : null;
  const central = resolvedIntent ? INTENT_CENTRAL_AREAS[resolvedIntent] : [];
  const named = [
    ...(Array.isArray(subjects) ? subjects : []),
    ...areasForBriefText(briefText),
  ].filter((area) => BRIEF_AREAS.includes(String(area)));
  const namedAreas = [...new Set(named)];

  const byArea = {};
  const reasons = {};
  for (const area of BRIEF_AREAS) {
    const contained = (CONTAINED[area] || (() => true))(design);
    if (!contained) {
      byArea[area] = BRIEF_RELEVANCE.NONE;
      reasons[area] = 'this design contains no evidence for this subject';
      continue;
    }
    if (namedAreas.includes(area)) {
      byArea[area] = BRIEF_RELEVANCE.HIGH;
      reasons[area] = "the designer's own brief names this subject";
      continue;
    }
    if (central.includes(area)) {
      byArea[area] = BRIEF_RELEVANCE.HIGH;
      reasons[area] = 'the declared intent of this project is built around this subject';
      continue;
    }
    byArea[area] = BRIEF_RELEVANCE.STANDARD;
    reasons[area] = 'contained by the design, and not central to the brief';
  }

  return {
    intent: resolvedIntent,
    byArea,
    highAreas: BRIEF_AREAS.filter((area) => byArea[area] === BRIEF_RELEVANCE.HIGH),
    noneAreas: BRIEF_AREAS.filter((area) => byArea[area] === BRIEF_RELEVANCE.NONE),
    reasons,
    subjectAreas: namedAreas,
    source: resolvedIntent ? 'declared_intent_and_brief' : 'design_only',
  };
}

/**
 * The design facts this authority reads, taken from what a caller already holds:
 * the frozen snapshot's own system, room and display facts. Nothing is inferred
 * from a level, and a missing fact is never read as a present one.
 *
 * @param {Object} input.snapshot — a frozen Engineering Snapshot
 * @param {Object} [input.connections] — { counts: { lcr, surrounds, overheads, subwoofers, wides } }
 * @returns {Object} the design block readBriefRelevance expects
 */
export function readDesignContainment({ snapshot = null, connections = null, seats = null } = {}) {
  const counts = connections?.counts || {};
  const layout = snapshot?.system?.channel_layout || {};
  const seatList = Array.isArray(seats) ? seats : (Array.isArray(snapshot?.seats) ? snapshot.seats : []);
  const speakerCount = (counts.lcr || 0) + (counts.surrounds || 0) + (counts.overheads || 0) + (counts.wides || 0);
  const overheads = (counts.overheads || 0) + (Number(layout.overhead_channels) || 0);
  const surrounds = (counts.surrounds || 0) + (Number(layout.bed_channels) || 0);
  const subwoofers = (counts.subwoofers || 0) + (Number(layout.subwoofer_count) || 0);
  const perSeat = Array.isArray(snapshot?.viewing?.per_seat) ? snapshot.viewing.per_seat.length : 0;
  return {
    display: snapshot?.room?.screen !== undefined || snapshot?.available === true,
    speakers: speakerCount > 0 || snapshot?.system !== undefined,
    seats: seatList.length || Number(snapshot?.room?.seating?.total_seats) || perSeat || 0,
    bass: subwoofers > 0,
    spatial: overheads > 0 || surrounds >= 5 || (counts.wides || 0) > 0,
    timbre: speakerCount > 1 || snapshot?.system?.products !== undefined,
    screenChannels: speakerCount > 0 || (Number(layout.bed_channels) || 0) >= 5,
  };
}

export default readBriefRelevance;