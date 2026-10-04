/**
 * atAGlanceVersions.js
 * --------------------
 * The per-version block on the at-a-glance page of a comparison.
 *
 * A comparison covers two or more design versions, so a page that summarises one
 * system would show the client a single design while the document is about
 * several. Everything the versions can differ on is therefore stated once per
 * version, and it is read from the SAME calculated comparison rows the Key
 * Differences table prints, so the page and the table can never state a
 * different value for the same area.
 *
 * The project identity and the room itself stay shared facts: they belong to the
 * project, not to one design option. The design version card is left out here,
 * because each version block is titled with the exact saved version name.
 *
 * Pure: no React, no calculation.
 */

/** The shared project facts, stated once for the document. */
const COMPARISON_PROJECT_CARD_LABELS = Object.freeze([
  'Project',
  'Client',
  'Project reference',
  'Prepared date',
]);

/**
 * The shared room facts. Only the room itself is shared: the screen, the
 * seating, the viewing geometry and the acoustic treatment are all assessed per
 * design version, so they are stated in that version's own block.
 */
const COMPARISON_ROOM_CARD_LABELS = Object.freeze(['Room size', 'Screen', 'Seating', 'Viewing geometry', 'Acoustic treatment']);

/** The comparison rows that carry the facts the at-a-glance page states. */
export const GLANCE_ROW_LABELS = Object.freeze([
  { key: 'system_layout', label: 'System layout' },
  { key: 'lcr', label: 'LCR' },
  { key: 'surrounds', label: 'Surrounds / wides' },
  { key: 'overheads', label: 'Overheads' },
  { key: 'subwoofers', label: 'Subwoofers' },
  { key: 'p12', label: 'Screen Dynamic Range / P12' },
  { key: 'p13', label: 'Non-screen Dynamic Range / P13' },
  { key: 'p14', label: 'LFE / subwoofer Dynamic Range / P14' },
  { key: 'p18', label: 'Bass extension / P18' },
  { key: 'p19', label: 'Bass response at RSP / P19' },
  { key: 'p20', label: 'Bass consistency / P20' },
]);

const cardsFrom = (cards, labels) => (Array.isArray(cards) ? cards : [])
  .filter((card) => labels.includes(String(card?.label || '')))
  .filter((card) => card?.value);

/**
 * The at-a-glance model for a comparison: the shared project and room facts, and
 * one block per selected version.
 *
 * @param {Object} input
 * @param {Array<{ key: string, values: string[] }>} input.comparisonRows — the
 *   calculated comparison rows stored on the report's Key Differences section
 * @param {Array<{ version_id, label, version_name }>} input.comparisonVersions —
 *   the option columns, in report order
 * @param {Array<{ label: string, value: string }>} input.projectCards
 * @param {Array<{ label: string, value: string }>} input.roomCards
 * @returns {{ projectCards: Array, roomCards: Array, versionGroups: Array<{ name: string, cards: Array }> }}
 */
export function buildComparisonGlance({
  comparisonRows = null,
  comparisonVersions = null,
  projectCards = [],
  roomCards = [],
} = {}) {
  const versions = Array.isArray(comparisonVersions) ? comparisonVersions : [];
  const rows = Array.isArray(comparisonRows) ? comparisonRows : [];
  const empty = { projectCards: [], roomCards: [], versionGroups: [] };
  // Fewer than two versions with a calculated table is not a comparison, and the
  // page keeps its single-system form.
  if (versions.length < 2 || rows.length === 0) return empty;

  const byKey = new Map(rows.map((row) => [String(row?.key || ''), row]));
  const versionGroups = versions
    .map((version, index) => ({
      name: version?.version_name || version?.label || `Option ${String.fromCharCode(65 + index)}`,
      cards: GLANCE_ROW_LABELS
        .map(({ key, label }) => ({ label, value: byKey.get(key)?.values?.[index] || null }))
        .filter((card) => card.value),
    }))
    .filter((group) => group.cards.length > 0);

  if (versionGroups.length === 0) return empty;

  return {
    projectCards: cardsFrom(projectCards, COMPARISON_PROJECT_CARD_LABELS),
    roomCards: cardsFrom(roomCards, COMPARISON_ROOM_CARD_LABELS),
    versionGroups,
  };
}

export default buildComparisonGlance;