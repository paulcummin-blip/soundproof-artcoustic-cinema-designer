/**
 * speakerDesignRows.js
 * --------------------
 * THE current speaker design of one design version, stated position by position
 * in the order the report's equipment schedule reads:
 *
 *   Front left / Front right → Centre → Side surrounds → Front wides →
 *   Rear surrounds → Overheads → Subwoofers
 *
 * This is a finer reading of the ONE product authority the report already uses
 * (src/components/report/reportProductsSelected.js): the same visibility rule,
 * the same registry display names, the same dual-centre cabinet rule and the same
 * subwoofer derivation. No model name, no count and no channel is worked out
 * here, so the panel can never state a different system from the report the
 * client was given. Nothing is calculated, graded or inferred, and no role that
 * the design does not contain is ever invented.
 *
 * The two cells read as:
 *
 *   MODEL — the product name alone, with no count printed beside it;
 *   QTY   — a plain number: the physical loudspeakers at that position. One each
 *           where left and right have their own rows, two for a pair that shares
 *           one row, two for two centre loudspeakers. Never a unit, never a
 *           wording.
 *
 * Read-only and pure.
 */

import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { productDisplayName, subwooferEntries } from '@/components/report/reportProductsSelected';
import { centreCabinetOrientation, hasInstalledModel } from '@/components/utils/frontStageModeAuthority';
import { frontStagePlacementNote } from '@/components/models/screen/frontStagePlacementAuthority';

/** The layer headings, in the order the panel states them. */
export const SPEAKER_DESIGN_GROUPS = Object.freeze([
  { key: 'front_stage', title: 'Front stage' },
  { key: 'surrounds', title: 'Surrounds / wides' },
  { key: 'overheads', title: 'Overheads' },
  { key: 'subwoofers', title: 'Subwoofers' },
]);

/**
 * The position rows, in the order above. `key` is the canonical role the row
 * states; left and right halves of one position share their row.
 */
// The front stage's placement note is NOT written here. It is read from the
// version's own saved screen construction (see frontStageNote below), so a
// loudspeaker is never said to sit behind a screen the design does not have.
const POSITION_ROWS = Object.freeze([
  { key: 'FL', group: 'front_stage', position: 'Front left' },
  { key: 'FR', group: 'front_stage', position: 'Front right' },
  { key: 'FC', group: 'front_stage', position: 'Centre' },
  { key: 'SL', group: 'surrounds', position: 'Side surrounds' },
  { key: 'LW', group: 'surrounds', position: 'Front wides' },
  { key: 'SBL', group: 'surrounds', position: 'Rear surrounds' },
  { key: 'TFL', group: 'overheads', position: 'Top front' },
  { key: 'TML', group: 'overheads', position: 'Top middle' },
  { key: 'TRL', group: 'overheads', position: 'Top rear' },
  { key: 'TBL', group: 'overheads', position: 'Top back' },
  { key: 'UFL', group: 'overheads', position: 'Up-firing front' },
  { key: 'UBL', group: 'overheads', position: 'Up-firing back' },
]);

/** The canonical role of the centre channel, whose cabinets form its own row. */
const CENTRE_ROW_KEY = 'FC';

/**
 * Which position row a role belongs to. Both halves of a pair share one row
 * ("SL"/"SR" → Side surrounds), and legacy aliases arrive here already
 * canonicalised ("RL" → SBL). An unrecognised role maps to nothing and is
 * skipped rather than guessed into a row.
 */
const ROLE_TO_ROW = Object.freeze({
  FL: 'FL', FR: 'FR',
  SL: 'SL', SR: 'SL',
  LW: 'LW', RW: 'LW',
  SBL: 'SBL', SBR: 'SBL',
  TFL: 'TFL', TFR: 'TFL',
  TML: 'TML', TMR: 'TML',
  TRL: 'TRL', TRR: 'TRL',
  TBL: 'TBL', TBR: 'TBL',
  UFL: 'UFL', UFR: 'UFL',
  UBL: 'UBL', UBR: 'UBL',
});

const ROW_BY_KEY = new Map(POSITION_ROWS.map((row) => [row.key, row]));

/** Whether the installed centre channel role is one of its own physical cabinets. */
const isCentreRole = (canon) => canon === CENTRE_ROW_KEY || canon === 'FCL' || canon === 'FCR';

const isInstalledModel = (value) => {
  const model = String(value ?? '').trim();
  return !!model && model !== 'off' && model !== 'none';
};

const countLabel = (name, count) => (count > 1 ? `${name} × ${count}` : name);

/** The row's QTY: the number of physical loudspeakers the position holds. */
const rowTotal = (models) => [...models.values()].reduce((sum, count) => sum + count, 0);

const sumModels = (models) => [...models.values()].reduce((sum, count) => sum + count, 0);

/** The row's model cell: each model with its own count, in the schedule's style. */
const modelCell = (models) =>
  [...models.entries()].map(([name, count]) => countLabel(name, count)).sort().join(', ');

/**
 * The row's model cell as the Speaker Design document states it: the model names
 * alone, once each. How many speakers there are belongs to the Qty column, never
 * to the name, so a name is not printed beside its own count. A number that is
 * part of the product name ("EVOLVE 2-1", "ARCHITECT 2-1", "SUB3-12") is the name
 * and is passed through untouched.
 */
const modelNamesCell = (models) => [...models.keys()].sort().join(', ');

/**
 * The front stage's placement note, read from the VERSION'S OWN saved display
 * identity, screen construction and loudspeaker positions — see
 * frontStagePlacementAuthority.js, the ONE authority for that statement. A
 * placement the saved facts do not establish is never stated here.
 */
function frontStageNote({ screen, rowKey, speakers }) {
  return frontStagePlacementNote({ screen, rowKey, speakers });
}

/**
 * The current speaker design of ONE design version.
 *
 * @param {Object} input
 * @param {Array}    [input.placedSpeakers] — the version's placed speakers
 * @param {Object}   [input.frontSubsCfg] — its front subwoofer configuration
 * @param {Object}   [input.rearSubsCfg] — its rear subwoofer configuration
 * @param {Array}    [input.subwooferInstances] — its subwoofer instances
 * @param {Object}   [input.screen] — the version's saved display identity and screen construction
 * @param {Function} [input.isVisible] — (role, model) => boolean, the design's own visibility rule
 * @returns {{ groups: Array<{ key, title, rows }>, rows: Array<Object>, isEmpty: boolean }}
 */
export function buildSpeakerDesignRows({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  subwooferInstances = [],
  screen = null,
  isVisible = null,
} = {}) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const visible = typeof isVisible === 'function' ? isVisible : () => true;
  const active = speakers.filter((speaker) => visible(speaker?.role, speaker?.model) !== false);

  const byRow = new Map();
  const centreModels = new Map();
  // Each row's own loudspeakers, kept so the placement note is proven from the
  // positions of the very speakers the row states.
  const rowSpeakers = new Map();
  const centreSpeakers = [];

  for (const speaker of active) {
    if (!isInstalledModel(speaker?.model)) continue;
    const canon = getCanonicalRole(speaker?.role).replace(/\d+$/, '');
    const name = productDisplayName(String(speaker.model).trim()) || String(speaker.model).trim();

    if (isCentreRole(canon)) {
      centreModels.set(name, (centreModels.get(name) || 0) + 1);
      centreSpeakers.push(speaker);
      continue;
    }

    const rowKey = ROLE_TO_ROW[canon];
    if (!rowKey) continue; // an unknown role is never invented into a row
    const models = byRow.get(rowKey) || new Map();
    models.set(name, (models.get(name) || 0) + 1);
    byRow.set(rowKey, models);
    const list = rowSpeakers.get(rowKey) || [];
    list.push(speaker);
    rowSpeakers.set(rowKey, list);
  }

  const rows = [];

  // The centre channel: one cabinet is stated as the centre channel, while two
  // physical cabinets are stated as the centre's own cabinets — the same rule the
  // equipment schedule uses. It is ONE channel either way, and it is never
  // described as anything else. QTY holds the physical count (2 for two cabinets)
  // and the dual-centre wording belongs to the model cell's note.
  const centreTotal = sumModels(centreModels);
  if (centreTotal > 0) {
    const centreRow = ROW_BY_KEY.get(CENTRE_ROW_KEY);
    const dual = centreTotal > 1;
    const orientation = dual ? centreCabinetOrientation(active) === 'vertical' : false;
    rows.push({
      key: CENTRE_ROW_KEY,
      group: centreRow.group,
      position: 'Centre',
      model: modelCell(centreModels),
      modelNames: modelNamesCell(centreModels),
      quantity: centreTotal,
      quantityLabel: String(centreTotal),
      note: dual
        ? `Dual physical centre cabinets, one logical centre channel${orientation ? ' · cabinets mounted vertically' : ''}`
        : centreRow.note || frontStageNote({ screen, rowKey: CENTRE_ROW_KEY, speakers: centreSpeakers }),
    });
  }

  for (const row of POSITION_ROWS) {
    if (row.key === CENTRE_ROW_KEY) continue; // already stated above
    const models = byRow.get(row.key);
    if (!models || models.size === 0) continue; // an absent role is omitted, not invented
    rows.push({
      key: row.key,
      group: row.group,
      position: row.position,
      model: modelCell(models),
      modelNames: modelNamesCell(models),
      quantity: rowTotal(models),
      quantityLabel: String(rowTotal(models)),
      note: row.note || (row.group === 'front_stage'
        ? frontStageNote({ screen, rowKey: row.key, speakers: rowSpeakers.get(row.key) || [] })
        : null),
    });
  }

  // Subwoofers come from the version's own configuration, through the same
  // derivation the schedule states them with.
  for (const entry of subwooferEntries({ frontSubsCfg, rearSubsCfg, subwooferInstances })) {
    const models = new Map(entry.models.map(({ name, count }) => [name, count]));
    rows.push({
      key: `SUB_${entry.side || 'other'}`,
      group: 'subwoofers',
      position: entry.side === 'front' ? 'Front subwoofers' : entry.side === 'rear' ? 'Rear subwoofers' : 'Subwoofers',
      model: modelCell(models),
      modelNames: modelNamesCell(models),
      quantity: entry.total,
      quantityLabel: String(entry.total),
      note: null,
    });
  }

  const groups = SPEAKER_DESIGN_GROUPS
    .map((group) => ({ ...group, rows: rows.filter((row) => row.group === group.key) }))
    .filter((group) => group.rows.length > 0);

  return { groups, rows, isEmpty: rows.length === 0 };
}

export default buildSpeakerDesignRows;