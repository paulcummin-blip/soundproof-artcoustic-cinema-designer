/**
 * reportProductsSelected.js
 * -------------------------
 * THE product specification a report states for one design version, in the exact
 * form the Technical Report's "Products Selected" block prints:
 *
 *   LCR                 Q8-5 × 3
 *   SURROUNDS           Q6-3 × 6
 *   OVERHEADS           Spitfire Cloud × 6
 *   SUBWOOFERS          SUB4-12 × 2 (front), SUB4-12 × 2 (rear)
 *   ACOUSTIC TREATMENT  Artcoustic Abfuser × 8
 *
 * One derivation, two consumers: the Technical Report renders it, and the
 * per-version frozen Engineering Snapshot carries it so a System Design
 * Comparison column states the same products as that version's report. A
 * comparison can therefore never show a different package from the report the
 * client was given.
 *
 * Read-only and pure: every value comes from the version's own frozen inputs
 * (its placed speakers, its subwoofer configuration and its acoustic treatment
 * selection). Nothing is inferred, recalculated or graded, and no other version's
 * products can reach it.
 */

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getSpeakerVisibilityFor } from '@/components/AppStateProvider';
import { centreCabinetOrientation, isCentreCabinetRole, isCentreChannelRole } from '@/components/utils/frontStageModeAuthority';

/**
 * The design's own visibility rule for a layout: which channel roles the layout
 * actually has. The Technical Report passes its live rule; a frozen snapshot
 * derives the same rule from the version's own Dolby configuration, so both
 * state the same speakers.
 */
export function layoutVisibilityFilter(dolbyConfig, sevenBedLayoutType) {
  const visible = getSpeakerVisibilityFor(dolbyConfig, sevenBedLayoutType);
  return (role) => {
    const code = String(role || '').toUpperCase().trim();
    if (!code) return false;
    if (code.startsWith('LFE')) return false;
    // The dual-centre physical cabinets are part of the front stage whenever they
    // are installed: they are the centre channel's own cabinets, not a channel
    // the layout has to contain.
    if (isCentreCabinetRole(code)) return true;
    if (/^(SL|SR)\d+$/.test(code)) return visible.has(code.slice(0, 2));
    return visible.has(code);
  };
}

const NONE = 'None specified';

/** The layer keys this authority states, in the order the report prints them. */
export const PRODUCTS_SELECTED_ROWS = Object.freeze([
  { key: 'lcr', area: 'LCR' },
  { key: 'surrounds', area: 'Surrounds / wides' },
  { key: 'overheads', area: 'Overheads' },
  { key: 'subwoofers', area: 'Subwoofers' },
  { key: 'acoustic_treatment', area: 'Acoustic treatment' },
]);

/** The speaker role codes that belong to each loudspeaker layer. */
const LCR_ROLES = Object.freeze(['FL', 'FC', 'FR', 'L', 'C', 'R', 'FCL', 'FCR']);
const SURROUND_ROLES = Object.freeze(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'LS', 'RS', 'LR', 'RR', 'FWL', 'FWR']);

const normaliseModel = (model) => ((!model || model === 'off' || model === 'none') ? null : String(model).trim());

/** The display name of a model: the registry label, else a tidied model key. */
export function productDisplayName(modelKey) {
  if (!modelKey) return null;
  const meta = getSpeakerModelMeta(modelKey);
  if (meta?.label && !meta.notFound) return meta.label;
  return String(modelKey).trim()
    .replace(/[_-][sml]$/i, '')
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** "Model × 3" when there is more than one, otherwise the plain model name. */
const countLabel = (name, count) => (count > 1 ? `${name} × ${count}` : name);

/**
 * The layer a placed speaker belongs to, using the same role codes the report
 * groups by.
 */
function layerForRole(role) {
  const code = String(role || '').toUpperCase();
  if (LCR_ROLES.includes(code)) return 'lcr';
  if (SURROUND_ROLES.includes(code) || /^(SL|SR)\d+$/.test(code)) return 'surrounds';
  if (code.startsWith('T') || code.startsWith('U')) return 'overheads';
  return null;
}

/**
 * The subwoofer rows: the version's own front and rear configuration, each
 * stating its model and its count. When a version carries no configuration but
 * does carry subwoofer instances, the instances are grouped by their own group,
 * so the front/rear layout is still stated from the version's real subwoofers.
 */
function subwooferRows({ frontSubsCfg, rearSubsCfg, subwooferInstances }) {
  const rows = [];
  const addGroup = (cfg, side) => {
    const count = Number(cfg?.count) || 0;
    const model = normaliseModel(cfg?.model);
    if (count <= 0 || !model) return;
    const name = productDisplayName(model) || model;
    const base = count > 1 ? `${name} × ${count}` : name;
    rows.push(side ? `${base} (${side})` : base);
  };

  addGroup(frontSubsCfg, 'front');
  addGroup(rearSubsCfg, 'rear');
  if (rows.length > 0) return rows;

  const instances = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((instance) => instance?.enabled !== false && instance?.model);
  if (instances.length === 0) return [NONE];

  const byGroup = new Map();
  for (const instance of instances) {
    const side = String(instance.legacyGroup ?? instance.group ?? '').toLowerCase();
    const group = side === 'front' || side === 'rear' ? side : 'other';
    const entry = byGroup.get(group) || { models: new Map(), total: 0 };
    const name = productDisplayName(instance.model) || instance.model;
    entry.models.set(name, (entry.models.get(name) || 0) + 1);
    entry.total += 1;
    byGroup.set(group, entry);
  }

  const groupRows = [];
  for (const [group, entry] of byGroup) {
    const models = [...entry.models.entries()]
      .map(([name, count]) => countLabel(name, count))
      .sort()
      .join(', ');
    groupRows.push(group === 'other' ? models : `${models} (${group})`);
  }
  return groupRows.length > 0 ? groupRows : [NONE];
}

/**
 * The products selected in ONE design version.
 *
 * @param {Object} input
 * @param {Array}  [input.placedSpeakers] — that version's placed speakers
 * @param {Object} [input.frontSubsCfg] — its front subwoofer configuration
 * @param {Object} [input.rearSubsCfg] — its rear subwoofer configuration
 * @param {Array}  [input.subwooferInstances] — its subwoofer instances
 * @param {boolean} [input.acousticTreatmentEnabled]
 * @param {number}  [input.selectedAbfuserQty]
 * @param {Function} [input.isVisible] — (role, model) => boolean, the design's own visibility rule
 * @returns {{ lcr: string[], surrounds: string[], overheads: string[], subwoofers: string[], acoustic_treatment: string[], rows: Array<{ key, area, value }> }}
 */
export function buildProductsSelected({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  subwooferInstances = [],
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
  isVisible = null,
} = {}) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const visible = typeof isVisible === 'function' ? isVisible : () => true;
  const activeSpeakers = speakers.filter((speaker) => visible(speaker?.role, speaker?.model) !== false);

  const byLayer = { lcr: new Map(), surrounds: new Map(), overheads: new Map() };
  // The centre channel's own cabinets, counted apart from the left/right so the
  // dual-centre stage can state its two physical cabinets explicitly.
  const lcrLeftRight = new Map();
  const lcrCentre = new Map();
  const isCentreSpeakerRole = (role) => isCentreChannelRole(role) || isCentreCabinetRole(role);

  for (const speaker of activeSpeakers) {
    const modelKey = normaliseModel(speaker?.model);
    if (!modelKey) continue;
    const layer = layerForRole(speaker?.role);
    if (!layer) continue;
    const name = productDisplayName(modelKey) || modelKey;
    byLayer[layer].set(name, (byLayer[layer].get(name) || 0) + 1);
    if (layer === 'lcr') {
      const bucket = isCentreSpeakerRole(speaker?.role) ? lcrCentre : lcrLeftRight;
      bucket.set(name, (bucket.get(name) || 0) + 1);
    }
  }

  const layerList = (layer) => {
    const models = [...byLayer[layer].entries()].map(([name, count]) => countLabel(name, count)).sort();
    return models.length > 0 ? models : [NONE];
  };

  /**
   * The LCR row.
   *
   * A single centre cabinet (or none) states the front stage exactly as before —
   * one grouped list ("Q8-5 × 3").
   *
   * Two physical centre cabinets (the dual-centre front stage) are stated as
   * CABINETS fed from the one centre channel: the left/right cabinets and the
   * centre cabinets are named separately, and the centre count is the number of
   * physical cabinets. The row never claims two centre channels.
   */
  const lcrList = () => {
    const centreTotal = [...lcrCentre.values()].reduce((sum, n) => sum + n, 0);
    if (centreTotal <= 1) return layerList('lcr');
    // The equipment schedule states the installed orientation of the cabinets.
    const orientationLabel = centreCabinetOrientation(activeSpeakers) === 'vertical' ? ' (vertical)' : '';
    const rows = [
      ...[...lcrLeftRight.entries()].map(([name, count]) => countLabel(name, count)).sort(),
      ...[...lcrCentre.entries()]
        .map(([name, count]) => `${countLabel(name, count)} centre cabinets${orientationLabel}`)
        .sort(),
    ];
    return rows.length > 0 ? rows : [NONE];
  };

  const treatmentQty = Math.floor(Number(selectedAbfuserQty) || 0);
  const acousticTreatment = (acousticTreatmentEnabled && treatmentQty > 0)
    ? [`Artcoustic Abfuser × ${treatmentQty}`]
    : [NONE];

  const products = {
    lcr: lcrList(),
    surrounds: layerList('surrounds'),
    overheads: layerList('overheads'),
    subwoofers: subwooferRows({ frontSubsCfg, rearSubsCfg, subwooferInstances }),
    acoustic_treatment: acousticTreatment,
  };

  return {
    ...products,
    rows: PRODUCTS_SELECTED_ROWS.map(({ key, area }) => ({ key, area, value: products[key].join(', ') })),
  };
}

export default buildProductsSelected;