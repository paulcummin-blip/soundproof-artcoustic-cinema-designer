/**
 * performanceLanguageAuthority.js (base44/shared — CANONICAL)
 * ----------------------------------------------------------
 * THE PERFORMANCE LANGUAGE AUTHORITY: how strong the client-facing language may
 * be, decided by the engineering result itself.
 *
 * THE CORE RULE. The engineering result controls the strength of the language. A
 * result that achieves a higher RP22 Performance Level has earned stronger
 * language, and a passing result is never flattened into cautious words such as
 * "useful", "adequate", "acceptable" or "reasonable". Equally, the language never
 * runs ahead of the evidence: every result is written at the level the frozen pack
 * states for it, and nothing is written stronger than its own level supports.
 *
 * L1 sounds good. L2 sounds clearly better. L3 sounds seriously impressive. L4
 * sounds exceptional — and an L4 result never reads as only marginally better
 * than an L2.
 *
 * WHAT LIVES HERE
 *   - the per-area, per-level register: the sentence each result has earned, and
 *     the clause form of that sentence, which the shared strength statements fit
 *     into their own sentence;
 *   - the general intensity scale: the vocabulary each level has earned;
 *   - the rules the writer is held to, composed by performanceLanguageScaleLines()
 *     and injected into the proposal writing authority.
 *
 * WHERE IT IS CONSUMED
 *   - strengthStories.js — the ONE engineering strength authority — states each
 *     story's sentence at the level its own evidence reached, so the Project
 *     Report's ADI Design Highlights page and the proposal writer always speak
 *     about a result at the same strength;
 *   - soundProofWritingAuthority.js — the proposal writing authority carries the
 *     register and the rules, so the writer's own prose scales the same way.
 *
 * Two areas are deliberately NOT given new language here, because the authority
 * they already have governs them: viewing geometry (P23, stated per row) and
 * seating clearance (P1, the seating-boundary principle). Their own authorities
 * state them.
 *
 * This module states language only. It reads no evidence, changes no figure, and
 * is imported by no validator: it can never widen a claim, a scope or a level.
 *
 * Pure: no React, no runtime-specific APIs.
 */

/** The register generation, so a draft can be traced to the language it was written under. */
export const PERFORMANCE_LANGUAGE_VERSION = 1;

/** The four Performance Levels, in order. */
export const PERFORMANCE_LEVELS = Object.freeze(['L1', 'L2', 'L3', 'L4']);

/** The performance areas whose language scales with their own result. */
export const PERFORMANCE_AREAS = Object.freeze({
  BASS_EXTENSION: 'bass_extension',
  BASS_OUTPUT: 'bass_output',
  DYNAMIC_RANGE: 'dynamic_range',
  TIMBRE: 'timbre',
  SPATIAL_RESOLUTION: 'spatial_resolution',
});

const AREA_ORDER = Object.freeze([
  PERFORMANCE_AREAS.BASS_EXTENSION,
  PERFORMANCE_AREAS.BASS_OUTPUT,
  PERFORMANCE_AREAS.DYNAMIC_RANGE,
  PERFORMANCE_AREAS.TIMBRE,
  PERFORMANCE_AREAS.SPATIAL_RESOLUTION,
]);

/** The headings the register is stated under. */
const AREA_LABEL = Object.freeze({
  [PERFORMANCE_AREAS.BASS_EXTENSION]: 'BASS EXTENSION',
  [PERFORMANCE_AREAS.BASS_OUTPUT]: 'BASS OUTPUT / LFE',
  [PERFORMANCE_AREAS.DYNAMIC_RANGE]: 'DYNAMIC RANGE / SPL',
  [PERFORMANCE_AREAS.TIMBRE]: 'TIMBRE MATCHING',
  [PERFORMANCE_AREAS.SPATIAL_RESOLUTION]: 'SPATIAL RESOLUTION',
});

/**
 * A published level, as the pack may state it: 'L3', 'Level 3' or 3 all read as
 * 'L3'. Anything else is not a level and states no language.
 */
export function performanceLevel(level) {
  if (level == null) return null;
  if (typeof level === 'number' && Number.isFinite(level)) {
    return PERFORMANCE_LEVELS[level - 1] || null;
  }
  const text = String(level).trim().toUpperCase().replace(/^LEVEL\s*/, 'L');
  return PERFORMANCE_LEVELS.includes(text) ? text : null;
}

/** The level's own rank, 1 to 4, or null when it is not a level. */
export function performanceLevelRank(level) {
  const normalised = performanceLevel(level);
  return normalised ? PERFORMANCE_LEVELS.indexOf(normalised) + 1 : null;
}

/**
 * The register itself: for each area and level, the sentence that result has
 * earned (`sentence`) and its clause form (`clause`), which reads naturally
 * inside a sentence the story builders compose. The language is exactly the
 * approved Sound Proof scale for the area, and it never claims more than the
 * level states: the L1 and L2 entries describe the capability the result
 * provides, never the deepest available performance.
 */
export const PERFORMANCE_LANGUAGE = Object.freeze({
  [PERFORMANCE_AREAS.BASS_EXTENSION]: {
    L1: {
      sentence: 'Solid bass depth that gives films and music real weight and scale.',
      clause: 'solid bass depth that gives films and music real weight and scale',
    },
    L2: {
      sentence: 'Deep bass that adds scale, impact and excitement to films and music.',
      clause: 'deep bass that adds scale, impact and excitement to films and music',
    },
    L3: {
      sentence: 'Very deep, powerful bass with the weight and authority expected from a serious cinema system.',
      clause: 'very deep, powerful bass with the weight and authority expected from a serious cinema system',
    },
    L4: {
      sentence: 'Exceptional low-frequency performance, reaching into the deepest parts of the soundtrack with huge scale, physical impact and authority.',
      clause: 'exceptional low-frequency performance, reaching into the deepest parts of the soundtrack with huge scale, physical impact and authority',
    },
  },
  [PERFORMANCE_AREAS.BASS_OUTPUT]: {
    L1: {
      sentence: 'Real weight and scale behind the low end, with convincing impact.',
      clause: 'there is real weight and scale behind the low end, with convincing impact',
    },
    L2: {
      sentence: 'Substantial low-frequency output that gives explosions and score real impact.',
      clause: 'the low end carries substantial output, giving explosions and score real impact',
    },
    L3: {
      sentence: 'Powerful low-frequency output with the authority a serious cinema system is expected to deliver.',
      clause: 'the low end is powerful, with the authority a serious cinema system is expected to deliver',
    },
    L4: {
      sentence: 'Exceptional low-frequency authority, with huge scale and genuine physical impact.',
      clause: 'the low end has exceptional authority, with huge scale and genuine physical impact',
    },
  },
  [PERFORMANCE_AREAS.DYNAMIC_RANGE]: {
    L1: {
      sentence: 'Plenty of output for clean, engaging playback with convincing impact.',
      clause: 'there is plenty of output for clean, engaging playback with convincing impact',
    },
    L2: {
      sentence: 'Strong dynamic capability, allowing loud moments to arrive with real energy while dialogue and detail remain clear.',
      clause: 'there is strong dynamic capability, letting loud moments arrive with real energy while dialogue and detail stay clear',
    },
    L3: {
      sentence: 'Serious cinema-level headroom, giving large-scale effects and music substantial impact without sounding strained.',
      clause: 'the system has serious cinema-level headroom, giving large-scale effects and music substantial impact without sounding strained',
    },
    L4: {
      sentence: 'Exceptional dynamic headroom, delivering the scale, immediacy and physical impact of the biggest film moments with remarkable authority.',
      clause: 'the system has exceptional dynamic headroom, delivering the scale, immediacy and physical impact of the biggest film moments with remarkable authority',
    },
  },
  [PERFORMANCE_AREAS.TIMBRE]: {
    L1: {
      sentence: 'Good tonal consistency across the assessed seating.',
      clause: 'good tonal consistency',
    },
    L2: {
      sentence: 'Strong tonal consistency across the assessed seating.',
      clause: 'strong tonal consistency',
    },
    L3: {
      sentence: 'Very consistent tonal character across the seating.',
      clause: 'very consistent tonal character',
    },
    L4: {
      sentence: 'Exceptional tonal consistency, with a remarkably stable tonal character across the assessed seats.',
      clause: 'exceptional tonal consistency',
    },
  },
  [PERFORMANCE_AREAS.SPATIAL_RESOLUTION]: {
    L1: {
      sentence: 'Convincing positioning and movement.',
      clause: 'convincing positioning and movement',
    },
    L2: {
      sentence: 'A strong sense of placement and movement.',
      clause: 'a strong sense of placement and movement',
    },
    L3: {
      sentence: 'A highly precise and enveloping presentation.',
      clause: 'a highly precise and enveloping presentation',
    },
    L4: {
      sentence: 'Exceptionally precise placement and seamless movement around the room.',
      clause: 'exceptionally precise placement and seamless movement around the room',
    },
  },
});

/** The words each level has earned, used by the writer's own prose. */
export const GENERAL_INTENSITY_SCALE = Object.freeze({
  L1: Object.freeze(['solid', 'convincing', 'clear', 'capable', 'engaging', 'good scale', 'real weight', 'proper surround movement']),
  L2: Object.freeze(['strong', 'deep', 'involving', 'substantial', 'impressive', 'greater scale', 'real impact']),
  L3: Object.freeze(['very strong', 'very deep', 'powerful', 'highly accomplished', 'substantial authority', 'serious cinema performance', 'considerable headroom']),
  L4: Object.freeze(['exceptional', 'outstanding', 'reference-level', 'extremely consistent', 'huge scale', 'physical impact', 'exceptional authority', 'seamless', 'remarkably controlled']),
});

/** The cautious words a passing result is never flattened into. */
export const FLATTENED_RESULT_TERMS = Object.freeze(['useful', 'adequate', 'acceptable', 'reasonable']);

/**
 * The flattened-result words a piece of prose contains. Audit and review only:
 * it reports what it reads and removes nothing, because "useful" and "reasonable"
 * are still the right words where the context genuinely asks for restrained
 * technical wording.
 */
export function flattenedResultTerms(text) {
  const source = String(text || '').toLowerCase();
  if (source.length === 0) return [];
  return FLATTENED_RESULT_TERMS.filter((term) => new RegExp(`\\b${term}\\b`).test(source));
}

/** The sentence one area's result has earned, or null when either is unknown. */
export function performanceSentence(area, level) {
  const normalised = performanceLevel(level);
  const entry = PERFORMANCE_LANGUAGE[area]?.[normalised];
  return entry ? entry.sentence : null;
}

/**
 * The clause form of that sentence, for composing into a longer sentence.
 * Returns null when the area or the level is not known, so a caller always has
 * its own neutral fallback rather than an empty clause.
 */
export function performancePhrase(area, level) {
  const normalised = performanceLevel(level);
  const entry = PERFORMANCE_LANGUAGE[area]?.[normalised];
  return entry ? entry.clause : null;
}

/** The approved sentence and clause together, for callers that want both. */
export function performanceRegister(area, level) {
  const normalised = performanceLevel(level);
  const entry = PERFORMANCE_LANGUAGE[area]?.[normalised];
  return entry ? { area, level: normalised, sentence: entry.sentence, clause: entry.clause } : null;
}

/* ── The rules the writer is held to ───────────────────────────────────────── */

export const PERFORMANCE_LANGUAGE_CORE_RULE = 'THE ENGINEERING RESULT CONTROLS THE STRENGTH OF THE LANGUAGE. Every result is written at the Performance Level the frozen pack states for it: a higher level has earned stronger language, and a passing result is never flattened into cautious words. Do not exaggerate beyond the evidence, and equally do not under-sell exceptional engineering. L1 should sound good, L2 should sound clearly better, L3 should sound seriously impressive, and L4 should sound exceptional — never merely a little better than L2.';

const AREA_RULES = Object.freeze({
  [PERFORMANCE_AREAS.BASS_EXTENSION]: 'Avoid “useful bass extension” and any similar hedge: a moderate extension is written as the depth it gives the soundtrack, and restrained technical wording is used only where the context genuinely requires it.',
  [PERFORMANCE_AREAS.BASS_OUTPUT]: 'An L4 bass output or depth result is a flagship result and the copy may sound exciting: present it accordingly rather than holding it back.',
  [PERFORMANCE_AREAS.DYNAMIC_RANGE]: 'Dynamic range is written as capability and headroom, never as loudness alone: the loud end and the quiet end are both stated at the level the result earned.',
  [PERFORMANCE_AREAS.TIMBRE]: 'Timbre matching is written as tonal consistency. Do not use impact, weight or scale language for a tonal result, at any level.',
  [PERFORMANCE_AREAS.SPATIAL_RESOLUTION]: 'Spatial resolution is written around precision and immersion: positioning, placement and movement, at the level the result earned.',
});

/**
 * The register and the rules, as prompt lines for the proposal writing
 * authority. One source of the scale: the same table the strength statements are
 * composed from.
 */
export function performanceLanguageScaleLines() {
  const lines = [
    '=== PERFORMANCE LANGUAGE SCALES WITH THE RESULT ===',
    PERFORMANCE_LANGUAGE_CORE_RULE,
    `Do not flatten passing results into cautious phrases such as ${FLATTENED_RESULT_TERMS.map((term) => `“${term}”`).join(', ')}, and never describe a completed design as merely sufficient. The words each level has earned:`,
  ];
  for (const level of PERFORMANCE_LEVELS) {
    lines.push(`- ${level}: ${GENERAL_INTENSITY_SCALE[level].join(', ')}.`);
  }
  lines.push('The approved language for each performance area, at each level:');
  for (const area of AREA_ORDER) {
    lines.push(`${AREA_LABEL[area]}:`);
    for (const level of PERFORMANCE_LEVELS) {
      lines.push(`  ${level}: ${PERFORMANCE_LANGUAGE[area][level].sentence}`);
    }
  }
  lines.push('AREA RULES:');
  for (const area of AREA_ORDER) {
    lines.push(`- ${AREA_LABEL[area]}: ${AREA_RULES[area]}`);
  }
  lines.push('Read the Performance Level beside every result and choose the language that level has earned: the language is always about the result in front of you, and never stronger than it.');
  lines.push('');
  return lines;
}

export default performancePhrase;