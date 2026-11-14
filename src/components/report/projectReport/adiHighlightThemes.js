/**
 * adiHighlightThemes.js
 * ---------------------
 * THE Project Report's Key Performance Highlights: EXACTLY FOUR themes, in this
 * order and no other:
 *
 *   1 · Spatial Resolution   the architecture, and where the speakers sit in it
 *   2 · Timbre Matching      tonal consistency within each speaker layer
 *   3 · Dynamic Range        ONE whole-system capability story
 *   4 · Bass Performance     extension, reference-seat response, seat consistency
 *
 * There is no placement card and no seating-clearance card: the placement results
 * belong to Spatial Resolution, and the seating decision is the design's own
 * decision rather than a performance theme.
 *
 * WHAT A THEME MAY STATE
 *   A theme states a parameter result ONLY where that parameter's own published
 *   result is eligible — terminal, authoritative, non-assumed and not provisional
 *   (see the canonical evidence reader in adiHighlightImportance). A clause whose
 *   parameter carries no eligible result is simply not written, and no theme
 *   claims a level, a figure or a layer the publication does not state.
 *
 *   A LEVEL IS NEVER WRITTEN INTO THE COPY. Each result travels on its own
 *   evidence line as the canonical level pill, so one result is stated once.
 *
 *   P20 IS STATED WITH THE RESULT IT HAS. Seat-to-seat consistency is the one
 *   place this page tells the client where the design is limited, and it is never
 *   hidden: a Bass Performance theme that stated extension and the reference-seat
 *   response while leaving the seat-to-seat result out would be the whole point of
 *   the page failing.
 *
 * WHERE EACH FACT COMES FROM
 *   · the eligible evidence map — every parameter result and its published value;
 *   · the room result for P18/P19 — the canonical rows every bass surface reads;
 *   · the design's own specification (productsSelected + its stated layout) for
 *     the architecture: the system format and the speaker layers it is built from,
 *     read from the ONE client-facing system-format authority.
 *
 * Nothing is calculated, graded, re-scaled or inferred here. Pure: no React, no
 * fetching, no side effects.
 */

import { collectEligibleEvidence, levelRank, levelLabel, isStrength } from './adiHighlightImportance';
import { productEntries, PLACEMENT_PHRASES } from './adiHighlightStories';
import { statedSummaryValue } from './projectReportPublishedValues';
import { systemFormat } from '@/shared/systemFormat';

/** The four themes the page states, in reading order. Nothing else is a theme. */
export const ADI_HIGHLIGHT_THEMES = Object.freeze([
  { id: 'spatial-resolution', title: 'Spatial Resolution' },
  { id: 'timbre-matching', title: 'Timbre Matching' },
  { id: 'dynamic-range', title: 'Dynamic Range' },
  { id: 'bass-performance', title: 'Bass Performance' },
]);

/** The card emphasis every theme carries: the four are stated as equals. */
const THEME_WEIGHT = 3;

/** One evidence line: the parameter, its published level and its stated value. */
const pill = (key, level, value) => ({ key, level: level ?? null, value: value || null });

/** A parameter's own eligible result, or null when it has none to state. */
function eligible(byKey, key) {
  const entry = byKey?.[key];
  return entry && entry.eligible === true && entry.level != null ? entry : null;
}

/** A published room result row (P18/P19 live here — they are room/RSP results). */
function roomRow(summary, id) {
  return summary?.roomResultsByParameter?.[id]
    ?? summary?.roomResultsByParameter?.[String(id)]
    ?? null;
}

/**
 * Clauses as one readable list: two read "a and b", three or more read
 * "a, b and c". Never four "and"s in one sentence.
 */
function listClauses(clauses, joiner = ', ') {
  const list = clauses.filter(Boolean);
  if (list.length <= 1) return list.join('');
  if (list.length === 2 && joiner === ', and ') {
    return `${list[0]}, and ${list[1]}`;
  }
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Capitalise the first letter of a sentence fragment. */
const capify = (text) => String(text || '').replace(/^([a-z])/, (m) => m.toUpperCase());

/**
 * P20 seat-level breakdown: how many assessed seats sit at each published level.
 * Read from the published authority's own per-seat results, so a seat-to-seat
 * claim can distinguish the limiting seats from the better-performing ones
 * without ever implying every seat shares one result. Returns null when no
 * per-seat result was published.
 */
function p20SeatBreakdown(summary) {
  const seats = summary?.parameterAuthority?.p20?.seats;
  if (!seats || typeof seats !== 'object') return null;
  const levels = {};
  let assessed = 0;
  for (const seatId of Object.keys(seats)) {
    const seat = seats[seatId];
    if (seat?.state !== 'scored') continue;
    const label = levelLabel(seat.level);
    if (label == null) continue;
    assessed += 1;
    levels[label] = (levels[label] || 0) + 1;
  }
  return assessed > 0 ? { assessed, levels } : null;
}

/**
 * The P20 distribution as a wording authority: the floor (weakest) level, how
 * many seats sit at it, and how many sit above it. `uniform` is true when every
 * assessed seat shares one level, so no variation claim is made.
 */
function p20Distribution(summary) {
  const breakdown = p20SeatBreakdown(summary);
  if (!breakdown) return null;
  const { assessed, levels } = breakdown;
  const sorted = Object.keys(levels).sort((a, b) => levelRank(a) - levelRank(b));
  const floor = sorted[0];
  const floorCount = levels[floor] || 0;
  const betterCount = assessed - floorCount;
  return { assessed, floor, floorCount, betterCount, uniform: sorted.length === 1 };
}

/**
 * A room parameter's published result, stated only when its own row is
 * authoritative: a result the publication marked as not authoritative is never
 * stated to a client as a finished one.
 */
function roomResult(byKey, summary, id) {
  const row = roomRow(summary, id);
  if (!row) return null;
  const level = byKey?.[`p${id}`]?.level ?? row.level ?? null;
  if (level == null || row.isAuthoritative === false) return null;
  return { level, value: statedSummaryValue(summary, id) };
}

/** The numeric segments of a stated layout, e.g. "9.1.6" → [9, 1, 6]. */
function layoutDigits(layout) {
  const token = String(layout ?? '').trim().split(/[\s_]+/)[0] || '';
  return token
    ? token.split('.').map((part) => (Number.isFinite(Number(part)) ? Number(part) : null))
    : [];
}

/**
 * The listener-level speaker structure the layout is built from. A 9-channel bed
 * is the canonical nine around the room; a 7-channel bed is read from the
 * design's own stated choice of rears or wides.
 */
function bedStructure(bed, sevenBedLayoutType) {
  if (bed >= 9) return 'screen left, centre and right, front wides, side surrounds and rear surrounds';
  if (bed === 7) {
    return String(sevenBedLayoutType || 'rears') === 'wides'
      ? 'screen left, centre and right, front wides and side surrounds'
      : 'screen left, centre and right, side surrounds and rear surrounds';
  }
  return 'screen left, centre and right and side surrounds';
}

/**
 * 1 · SPATIAL RESOLUTION — the architecture, and where the speakers sit in it.
 *
 * Grounded in the actual system: the format the client reads (bed · active
 * subwoofers · overheads), the layer structure that format is built from, and the
 * placement results this design's own publication states — including its
 * seat-scoped results, which are only ever stated for the seats they were
 * assessed across.
 */
function buildSpatialTheme({ byKey, summary, counts, dolbyConfig, sevenBedLayoutType }) {
  const bed = layoutDigits(dolbyConfig)[0];
  const format = systemFormat({ layout: dolbyConfig, subwooferCount: counts.subwoofers });
  const overheads = counts.overheads || 0;
  const p2 = eligible(byKey, 'p2');
  const p7 = eligible(byKey, 'p7');
  const p11 = eligible(byKey, 'p11');
  const p9 = eligible(byKey, 'p9');
  const p4 = eligible(byKey, 'p4');
  const p5 = eligible(byKey, 'p5');

  const evidence = [
    p2 ? pill('P2', p2.level, p2.value || `${bed || counts.lcr || 0} listener-level channels`) : null,
    p7 ? pill('P7', p7.level, PLACEMENT_PHRASES.p7) : null,
    p11 ? pill('P11', p11.level, PLACEMENT_PHRASES.p11) : null,
    p9 ? pill('P9', p9.level, PLACEMENT_PHRASES.p9) : null,
  ].filter(Boolean);

  const overheadPhrase = overheads > 0
    ? `, with ${overheads} overhead speaker${overheads === 1 ? '' : 's'} extending effects above the audience`
    : '';
  const opening = format && Number.isFinite(bed)
    ? `The room is built as a ${format} layout: ${bedStructure(bed, sevenBedLayoutType)} at listener level${overheadPhrase}.`
    : `The room is built with ${counts.lcr || 0} screen channels and ${counts.surrounds || 0} surround position${(counts.surrounds || 0) === 1 ? '' : 's'}${overheadPhrase}.`;

  const sentences = [opening];

  const placementStrengths = [];
  if (p11 && isStrength(p11.level)) placementStrengths.push('every surround, wide and overhead speaker sits within its recommended RP22 position zone');
  if (p7 && isStrength(p7.level)) placementStrengths.push('front wides keep the front soundstage continuous');
  if (placementStrengths.length) sentences.push(`${capify(listClauses(placementStrengths))}, so sound is placed precisely around the room.`);

  const seatStrengths = [];
  if (p4 && isStrength(p4.level)) seatStrengths.push('the screen channels stay level-matched');
  if (p5 && isStrength(p5.level)) seatStrengths.push('the surround spacing holds within its limit');
  if (p9 && isStrength(p9.level)) seatStrengths.push('the overhead speakers are spaced within the vertical limit');
  if (seatStrengths.length) sentences.push(`Across the assessed seats, ${listClauses(seatStrengths)}.`);

  const limits = [];
  if (p5 && !isStrength(p5.level)) limits.push('surround spacing is the main limitation in how precisely sound can be positioned around the listeners');
  if (p9 && !isStrength(p9.level) && overheads > 0) limits.push('overhead spacing is wider than the recommended limit');
  if (p7 && !isStrength(p7.level)) limits.push('front-wide placement sits outside its recommended deviation');
  if (limits.length) sentences.push(`${capify(listClauses(limits, ', and '))}.`);

  return {
    ...ADI_HIGHLIGHT_THEMES[0],
    order: 1,
    category: null,
    weight: THEME_WEIGHT,
    level: evidence.reduce((weakest, item) => (levelRank(item.level) < levelRank(weakest) ? item.level : weakest), evidence[0]?.level ?? null),
    evidence,
    explanation: sentences.join(' '),
    sources: ['P2', 'P7', 'P11', 'P9', 'P4', 'P5'].filter((key) => eligible(byKey, key.toLowerCase())),
  };
}

/**
 * 2 · TIMBRE MATCHING — tonal consistency within each speaker layer.
 *
 * P16 is the screen channels' own consistency and P17 the non-screen channels':
 * neither compares one group with another, so each is stated for its OWN group
 * and for its own level. No claim is made for a layer whose result is absent.
 */
function buildTimbreTheme({ byKey, counts }) {
  const hasOverheads = (counts.overheads || 0) > 0;
  const layer = hasOverheads ? 'surround and overhead' : 'surround';
  const p16 = eligible(byKey, 'p16');
  const p17 = eligible(byKey, 'p17');
  const seats = Math.max(p16?.assessed || 0, p17?.assessed || 0);
  const seatPhrase = seats > 0 ? `across the ${seats} assessed seat${seats === 1 ? '' : 's'}` : 'across the assessed seats';

  const evidence = [
    p16 ? pill('P16', p16.level, p16.value ? `Screen channels · ${p16.value}` : 'Screen channels') : null,
    p17 ? pill('P17', p17.level, p17.value ? `${layer} channels · ${p17.value}` : `${layer} channels`) : null,
  ].filter(Boolean);

  if (!p16 && !p17) {
    return {
      ...ADI_HIGHLIGHT_THEMES[1],
      order: 2,
      category: null,
      weight: THEME_WEIGHT,
      level: null,
      evidence: [],
      explanation: `Tonal consistency is assessed for the screen channels and the ${layer} channels. This design carries no published result for those groups, so no tonal claim is made here.`,
      sources: [],
    };
  }

  const both = p16 && p17;
  const screenStrength = p16 && isStrength(p16.level);
  const nonScreenStrength = p17 && isStrength(p17.level);
  const bothStrong = both && screenStrength && nonScreenStrength;

  const sentences = [];
  if (bothStrong) {
    sentences.push('Tonal consistency is a particular strength of this design.');
  } else if (screenStrength || nonScreenStrength) {
    sentences.push('Tonal consistency is a genuine strength within the speaker groups that reach it.');
  } else {
    sentences.push('Tonal consistency is assessed within each speaker group.');
  }

  const parts = [];
  if (p16) {
    parts.push(screenStrength
      ? `voices and instruments keep a similar character ${seatPhrase} within the screen group`
      : `the screen channels hold their tonal balance ${seatPhrase}`);
  }
  if (p17) {
    parts.push(`the ${layer} channels hold theirs within their own group`);
  }
  if (parts.length) sentences.push(`${capify(listClauses(parts))}.`);
  if (bothStrong) sentences.push('This helps listeners hear a balanced soundtrack across the seating area.');

  return {
    ...ADI_HIGHLIGHT_THEMES[1],
    order: 2,
    category: null,
    weight: THEME_WEIGHT,
    level: both
      ? (levelRank(p16.level) <= levelRank(p17.level) ? (p16.level ?? p17.level) : p17.level)
      : (p16?.level ?? p17?.level ?? null),
    evidence,
    explanation: sentences.join(' '),
    sources: ['P16', 'P17'].filter((key) => eligible(byKey, key.toLowerCase())),
  };
}

/**
 * 3 · DYNAMIC RANGE — ONE whole-system story.
 *
 * The screen stage, the surround and overhead layers and the subwoofers are the
 * same system, so they are told together: what each layer reaches, and the depth
 * the low end reaches with it. The theme's own level is the weakest of the three
 * capability results, so the theme never reads stronger than its weakest layer.
 */
function buildDynamicTheme({ byKey, summary, counts }) {
  const layer = (counts.overheads || 0) > 0 ? 'surround and overhead' : 'surround';
  const p12 = eligible(byKey, 'p12');
  const p13 = eligible(byKey, 'p13');
  const p14 = eligible(byKey, 'p14');
  const p18 = roomResult(byKey, summary, 18);

  const evidence = [
    p12 ? pill('P12', p12.level, p12.value ? `Screen stage · ${p12.value}` : 'Screen stage') : null,
    p13 ? pill('P13', p13.level, p13.value ? `${layer} layers · ${p13.value}` : `${layer} layers`) : null,
    p14 ? pill('P14', p14.level, p14.value ? `Bass target · ${p14.value}` : 'Bass output target') : null,
    p18 ? pill('P18', p18.level, p18.value ? `Extension to ${p18.value}` : 'Extension') : null,
  ].filter(Boolean);

  if (evidence.length === 0) {
    return {
      ...ADI_HIGHLIGHT_THEMES[2],
      order: 3,
      category: null,
      weight: THEME_WEIGHT,
      level: null,
      evidence: [],
      explanation: 'Dynamic range is assessed from the output each speaker layer can reach at the reference seating position. This design carries no published result for those layers, so no dynamic-range claim is made here.',
      sources: [],
    };
  }

  const layerLevels = [p12, p13, p14].filter(Boolean).map((entry) => entry.level);
  const weakestLayer = layerLevels.reduce(
    (min, lvl) => (levelRank(lvl) < levelRank(min) ? lvl : min),
    layerLevels[0],
  );
  const weakestRank = levelRank(weakestLayer);
  const overallTone = weakestRank >= 4 ? 'strong'
    : weakestRank >= 2 ? 'useful'
    : 'limited';
  const sentences = [`The system offers ${overallTone} dynamic capability for this room.`];

  if (p12 && p13) {
    if (levelRank(p12.level) < levelRank(p13.level)) {
      sentences.push(`The screen stage is the limiting layer at the reference position, while the ${layer} channels provide greater capability.`);
    } else if (levelRank(p12.level) > levelRank(p13.level)) {
      sentences.push(`The ${layer} channels are the limiting layer at the reference position, while the screen stage provides greater capability.`);
    } else {
      sentences.push(`The screen stage and the ${layer} channels offer comparable capability at the reference position.`);
    }
  } else if (p12) {
    sentences.push(`The screen stage provides the system's principal capability at the reference position.`);
  } else if (p13) {
    sentences.push(`The ${layer} channels provide capability around and above the seats.`);
  }

  if (p14 && p18) {
    sentences.push(`The bass system is assessed against a ${p14.value || 'published'} output target, with predicted in-room extension to ${p18.value}.`);
  } else if (p14) {
    sentences.push(`The bass system is assessed against a ${p14.value || 'published'} output target.`);
  } else if (p18) {
    sentences.push(`Predicted in-room extension reaches ${p18.value}.`);
  }

  return {
    ...ADI_HIGHLIGHT_THEMES[2],
    order: 3,
    category: null,
    weight: THEME_WEIGHT,
    level: [p12, p13, p14].filter(Boolean)
      .reduce((weakest, item) => (levelRank(item.level) < levelRank(weakest) ? item.level : weakest), 'L4'),
    evidence,
    explanation: sentences.join(' '),
    sources: ['P12', 'P13', 'P14', 'P18'].filter((key) => (key === 'P18' ? Boolean(p18) : Boolean(eligible(byKey, key.toLowerCase())))),
  };
}

/**
 * 4 · BASS PERFORMANCE — extension, the reference-seat response, and seat-to-seat
 * consistency stated with the result it actually has.
 *
 * P19 is RSP-only: its published room result IS the whole assessment, and it is
 * read from the same canonical row every other P19 surface reads. P20 is the
 * weakest assessed seat's result, so a consistency claim is only ever made at the
 * level the seats support.
 */
function buildBassTheme({ byKey, summary, counts }) {
  const p18 = roomResult(byKey, summary, 18);
  const p19 = roomResult(byKey, summary, 19);
  const p20 = eligible(byKey, 'p20');
  const subCount = counts?.subwoofers || 0;

  const evidence = [
    p18 ? pill('P18', p18.level, p18.value ? `Extension to ${p18.value}` : 'In-room extension') : null,
    p19 ? pill('P19', p19.level, p19.value ? `At the reference seat · ${p19.value}` : 'At the reference seat') : null,
    p20 ? pill('P20', p20.level, p20.assessed ? `Across the ${p20.assessed} assessed seats` : 'Across the assessed seats') : null,
  ].filter(Boolean);

  if (evidence.length === 0) {
    return {
      ...ADI_HIGHLIGHT_THEMES[3],
      order: 4,
      category: null,
      weight: THEME_WEIGHT,
      level: null,
      evidence: [],
      explanation: 'Bass performance is assessed from the in-room extension, the response at the reference seating position and the difference between seats. This design carries no published result for those measures, so no bass claim is made here.',
      sources: [],
    };
  }

  const seatWord = (n) => `seat${n === 1 ? '' : 's'}`;
  const verb = (n) => (n === 1 ? 's' : '');

  const sentences = [];
  if (p18) {
    const subPhrase = subCount > 0
      ? `${subCount} subwoofer${subCount === 1 ? '' : 's'} provide${subCount === 1 ? 's' : ''} `
      : 'The design provides ';
    sentences.push(`${subPhrase}predicted bass extension to ${p18.value}, adding depth to music and film soundtracks.`);
  }
  if (p19) {
    sentences.push('At the reference seating position, the corrected response is assessed against the target across the assessed band.');
  }

  if (p20) {
    const dist = p20Distribution(summary);
    if (dist) {
      const floorStrength = isStrength(dist.floor);
      const uniform = dist.uniform || dist.betterCount === 0;
      if (uniform) {
        sentences.push(floorStrength
          ? `The response is consistent across the ${dist.assessed} assessed ${seatWord(dist.assessed)}.`
          : `Seat-to-seat consistency is the principal limitation of the bass response, with similar deviation across the ${dist.assessed} assessed ${seatWord(dist.assessed)}.`);
      } else if (floorStrength) {
        sentences.push(
          `Most seats achieve a consistent result across the ${dist.assessed} assessed ${seatWord(dist.assessed)}, `
          + `with ${dist.floorCount} ${seatWord(dist.floorCount)} show${verb(dist.floorCount)} slightly greater deviation from the target response.`,
        );
      } else {
        sentences.push(
          `Performance varies across the ${dist.assessed} assessed ${seatWord(dist.assessed)}: `
          + `${dist.floorCount} ${seatWord(dist.floorCount)} show${verb(dist.floorCount)} the greatest deviation from the target response, `
          + `while the remaining ${dist.betterCount} achieve${verb(dist.betterCount)} a more consistent result.`,
        );
      }
    } else {
      sentences.push('Seat-to-seat consistency is the principal limitation of the bass response.');
    }
  }

  return {
    ...ADI_HIGHLIGHT_THEMES[3],
    order: 4,
    category: null,
    weight: THEME_WEIGHT,
    level: [p18, p19, p20].filter(Boolean)
      .reduce((weakest, item) => (levelRank(item.level) < levelRank(weakest) ? item.level : weakest), 'L4'),
    evidence,
    explanation: sentences.join(' '),
    sources: ['P18', 'P19', 'P20'].filter((key) => (key === 'P18' ? Boolean(p18) : key === 'P19' ? Boolean(p19) : Boolean(p20))),
  };
}

/**
 * The four themes this design's own published evidence supports, in order.
 * Exactly four are returned for every design: a theme whose evidence is absent
 * states plainly that no result was published, and claims nothing.
 *
 * @param {Object} sources — engineeringSummary, productsSelected, dolbyConfig and
 *   the project's own seven-bed choice
 * @returns {Array} the four theme highlights
 */
export function buildAdiHighlightThemes(sources = {}) {
  const { engineeringSummary, productsSelected, dolbyConfig = null, sevenBedLayoutType = null } = sources;
  const byKey = collectEligibleEvidence(engineeringSummary).byKey;
  const connections = {
    lcr: productEntries(productsSelected, 'lcr').reduce((sum, entry) => sum + entry.count, 0),
    surrounds: productEntries(productsSelected, 'surrounds').reduce((sum, entry) => sum + entry.count, 0),
    overheads: productEntries(productsSelected, 'overheads').reduce((sum, entry) => sum + entry.count, 0),
    subwoofers: productEntries(productsSelected, 'subwoofers').reduce((sum, entry) => sum + entry.count, 0),
  };
  const summary = engineeringSummary;

  return [
    buildSpatialTheme({ byKey, summary, counts: connections, dolbyConfig, sevenBedLayoutType }),
    buildTimbreTheme({ byKey, counts: connections }),
    buildDynamicTheme({ byKey, summary, counts: connections }),
    buildBassTheme({ byKey, summary, counts: connections }),
  ];
}

export default buildAdiHighlightThemes;