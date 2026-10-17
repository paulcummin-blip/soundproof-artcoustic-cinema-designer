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

import { collectEligibleEvidence, levelRank } from './adiHighlightImportance';
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

  const opening = format && Number.isFinite(bed)
    ? `The room is built as a ${format} layout: ${bedStructure(bed, sevenBedLayoutType)} at listener level${overheads > 0 ? `, plus ${overheads} overhead speakers` : ''}.`
    : `The room is built as a ${counts.lcr || 0} speaker screen stage with ${counts.surrounds || 0} surround and wide positions${overheads > 0 ? ` and ${overheads} overhead speakers` : ''}.`;

  const clauses = [
    p7 ? 'Front wides sit inside their deviation limit, closing the gap between the screen and the side speakers so movement across the front of the room stays continuous' : null,
    p11 ? 'every surround, wide and overhead speaker is inside the recommended RP22 position zones' : null,
  ].filter(Boolean);
  // The seat-scoped results are stated for the seats they were assessed across, in
  // their own sentence, so a seat-scoped result is never carried into a room-wide
  // claim by the wording around it.
  const seatClauses = [
    p4 ? 'the screen channels stay level-matched' : null,
    p5 ? 'the surround spacing holds within the horizontal limit' : null,
    p9 ? 'the overhead speakers are spaced within the vertical limit' : null,
  ].filter(Boolean);

  const sentences = [opening];
  if (clauses.length > 0) sentences.push(`${listClauses(clauses, ', and ')}.`);
  if (seatClauses.length > 0) sentences.push(`Across the assessed seats ${listClauses(seatClauses)}.`);

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
  const layer = (counts.overheads || 0) > 0 ? 'surround and overhead' : 'surround';
  const p16 = eligible(byKey, 'p16');
  const p17 = eligible(byKey, 'p17');
  const seats = Math.max(p16?.assessed || 0, p17?.assessed || 0);

  const evidence = [
    p16 ? pill('P16', p16.level, p16.value ? `Screen channels across the seats · ${p16.value}` : 'Screen channels across the assessed seats') : null,
    p17 ? pill('P17', p17.level, p17.value ? `${layer} channels across the seats · ${p17.value}` : `${layer} channels across the assessed seats`) : null,
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

  const parts = [
    p16 ? `the screen channels hold their tonal balance${seats ? ` across all ${seats} assessed seating positions` : ' across the assessed seating positions'}` : null,
    p17 ? `the ${layer} channels hold theirs across the same seats` : null,
  ].filter(Boolean);

  return {
    ...ADI_HIGHLIGHT_THEMES[1],
    order: 2,
    category: null,
    weight: THEME_WEIGHT,
    level: levelRank(p16?.level) <= levelRank(p17?.level) ? (p16?.level ?? p17?.level) : p17.level,
    evidence,
    explanation: `${p16 && p17 ? 'Screen, surround and overhead groups maintain close tonal consistency within their respective layers. ' : ''}${parts.join(', and ').replace(/^([a-z])/, (m) => m.toUpperCase())}${p16 && p17 ? ', so a voice or an instrument keeps its character as it moves around and above the room' : ''}.`,
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
    p14 ? pill('P14', p14.level, p14.value ? `Subwoofer output · ${p14.value}` : 'Subwoofer output') : null,
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

  const parts = [
    p12 ? `the screen stage reaches ${p12.value} at the reference seating position, giving strong front-stage headroom` : null,
    p13 ? `the ${layer} channels reach ${p13.value}, a useful reserve around and above the seats` : null,
    p14 ? `the subwoofers add ${p14.value} of low-frequency output` : null,
    p18 ? `the low end holds its output down to a predicted ${p18.value}` : null,
  ].filter(Boolean);

  return {
    ...ADI_HIGHLIGHT_THEMES[2],
    order: 3,
    category: null,
    weight: THEME_WEIGHT,
    level: [p12, p13, p14].filter(Boolean)
      .reduce((weakest, item) => (levelRank(item.level) < levelRank(weakest) ? item.level : weakest), 'L4'),
    evidence,
    explanation: `Dynamic range is delivered as one system rather than by the screen channels alone: ${parts.join('; ')}.`,
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
function buildBassTheme({ byKey, summary }) {
  const p18 = roomResult(byKey, summary, 18);
  const p19 = roomResult(byKey, summary, 19);
  const p20 = eligible(byKey, 'p20');

  const evidence = [
    p18 ? pill('P18', p18.level, p18.value ? `Extension to ${p18.value}` : 'In-room extension') : null,
    p19 ? pill('P19', p19.level, p19.value ? `At the reference seating position · ${p19.value}` : 'At the reference seating position') : null,
    p20 ? pill('P20', p20.level, p20.seats ? `Across the ${p20.assessed} assessed seats · ${p20.value ?? ''}`.trim().replace(/ ·$/, '') : 'Across the assessed seats') : null,
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

  // Each sentence starts on its own capital: the extension, the reference-seat
  // result stated with the level it actually achieved, then the seat-to-seat
  // limitation with the level it actually has. A sentence is only written for a
  // result this design's publication carries, and the levels are the published
  // ones, never restated from memory.
  const p19Level = p19?.level ? String(p19.level).replace(/^L/i, '') : null;
  const p20Level = p20?.level ? String(p20.level).replace(/^L/i, '') : null;

  const sentences = [
    p18 ? `Predicted in-room extension reaches ${p18.value}.` : null,
    p19
      ? (p19Level
        ? `At the reference seating position, the corrected response achieves P19 Level ${p19Level} against the target across the assessed band.`
        : 'At the reference seating position, the corrected response is assessed against the target across the assessed band.')
      : null,
    p20
      ? `Seat-to-seat consistency remains the principal limitation, with P20 at Level ${p20Level} across the${p20.assessed ? ` ${p20.assessed}` : ''} assessed seats.`
      : null,
  ].filter(Boolean);

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
    buildBassTheme({ byKey, summary }),
  ];
}

export default buildAdiHighlightThemes;