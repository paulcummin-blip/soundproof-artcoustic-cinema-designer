/**
 * resolveFrontStageRoles.js
 * -------------------------
 * The SCREEN STAGE as the design actually builds it, stated position by
 * position.
 *
 * The proposal's equipment authority must never infer the screen channels from
 * the Dolby layout. A 9.1.6 layout has one left, one centre and one right
 * channel — but the design may build that one centre channel from TWO physical
 * cabinets. Collapsing the stage into a single "LCR" row whose model is the
 * left/right model states equipment the design does not have.
 *
 * Two shapes are returned:
 *
 *   single centre — one centre cabinet (or none): the stage keeps the single
 *                   grouped "LCR" row the reports have always printed.
 *   dual centre   — two physical centre cabinets fed from ONE centre channel:
 *                   the left/right pair and the centre cabinets are named
 *                   separately, and the centre row states the physical cabinet
 *                   count, never a second channel.
 *
 * Physical cabinets are counted from the design's own placed speakers, never
 * from the channel count, and the layout itself is never changed here.
 *
 * Pure: no React, no calculation, no grading, no writes.
 */

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { canonicalProductId } from '@/components/utils/modelKeyNormaliser';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import {
  centreCabinetOrientation,
  centreCabinets,
  detectDualCentreStage,
  DUAL_CENTRE_CABINET_COUNT,
} from '@/components/utils/frontStageModeAuthority';

/** The roles the left and right screen channels are placed as. */
const LEFT_RIGHT_CODES = Object.freeze(['FL', 'FR', 'L', 'R']);
/** The roles each screen-channel side is placed as, read on its own. */
const LEFT_CODES = Object.freeze(['FL', 'L']);
const RIGHT_CODES = Object.freeze(['FR', 'R']);
/** The roles a SINGLE centre cabinet is placed as. */
const SINGLE_CENTRE_CODES = Object.freeze(['FC', 'C']);

/** A model is installed when it names a real product (not the off/none sentinels). */
function isInstalled(model) {
  const value = String(model ?? '').trim().toLowerCase();
  return !!value && value !== 'off' && value !== 'none';
}

/** The first installed model placed at one of these roles, canonicalised. */
function modelAt(list, codes) {
  for (const speaker of list) {
    const code = String(getCanonicalRole(speaker?.role) || '').toUpperCase();
    if (!codes.includes(code)) continue;
    if (isInstalled(speaker?.model)) return canonicalProductId(speaker.model);
  }
  return null;
}

/** What the catalogue says about a model, with the model itself as the fallback label. */
function metaFor(modelKey) {
  const meta = getSpeakerModelMeta(modelKey);
  return {
    label: meta?.label || modelKey,
    category: meta?.category || 'Unknown',
    found: !meta?.notFound,
  };
}

/**
 * The screen stage of one design version.
 *
 * @param {Array} placedSpeakers — the version's own placed speakers
 * @returns {{
 *   structure: 'dual_centre'|'single_centre',
 *   leftRightModel: string|null, leftRightLabel: string|null,
 *   centreModel: string|null, centreLabel: string|null,
 *   centreCabinets: number, logicalCentreChannels: number,
 *   orientation: string|null
 * }|null} — null when no screen-channel speaker is placed at all
 */
export function resolveFrontStage(placedSpeakers = []) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const dual = detectDualCentreStage(list);
  const cabinets = dual ? centreCabinets(list) : [];
  const centreModel = dual
    ? canonicalProductId(cabinets[0]?.model)
    : modelAt(list, SINGLE_CENTRE_CODES);
  const leftRightModel = modelAt(list, LEFT_RIGHT_CODES);
  // Each side on its own, so a stage whose sides differ is still stated for the
  // side each model is actually placed at.
  const leftModel = modelAt(list, LEFT_CODES);
  const rightModel = modelAt(list, RIGHT_CODES);
  const hasCentre = !!centreModel && isInstalled(centreModel);

  if (!hasCentre && !leftRightModel) return null;

  // The stage is ONE model across its screen channels only when the centre really
  // is the model the sides are built from. A centre of its own model — the normal
  // mixed front stage — is a second position and is never described as the
  // left/right model, which is how the centre used to disappear from a proposal.
  const mixedCentre = hasCentre && !dual
    && (centreModel !== leftModel || centreModel !== rightModel);

  return {
    structure: dual && hasCentre ? 'dual_centre'
      : (mixedCentre ? 'mixed_centre' : 'single_centre'),
    leftRightModel,
    leftRightLabel: leftRightModel ? metaFor(leftRightModel).label : null,
    leftModel,
    rightModel,
    leftLabel: leftModel ? metaFor(leftModel).label : null,
    rightLabel: rightModel ? metaFor(rightModel).label : null,
    centreModel: hasCentre ? centreModel : null,
    centreLabel: hasCentre ? metaFor(centreModel).label : null,
    // Physical cabinets, counted from the design's own speakers.
    centreCabinets: dual && hasCentre
      ? (cabinets.length || DUAL_CENTRE_CABINET_COUNT)
      : (hasCentre ? 1 : 0),
    // ONE centre channel either way: two cabinets are never two channels.
    logicalCentreChannels: 1,
    orientation: dual ? centreCabinetOrientation(list) : null,
  };
}

/** Whether the stage is the dual-centre arrangement, with a model to state. */
export function isDualCentreStage(frontStage) {
  return frontStage?.structure === 'dual_centre' && !!frontStage.centreModel;
}

/**
 * Whether the stage carries a centre of its own model, built from one cabinet.
 * The centre and the left/right sides are then two positions, never one "LCR".
 */
export function isMixedCentreStage(frontStage) {
  return frontStage?.structure === 'mixed_centre' && !!frontStage.centreModel;
}

/**
 * Whether the stage is stated POSITION BY POSITION rather than as the single
 * grouped "LCR" row: true for a dual-centre stage and for a mixed stage. Only a
 * stage whose centre really is the left/right model collapses into one row.
 */
export function frontStageStatesPositions(frontStage) {
  return isDualCentreStage(frontStage) || isMixedCentreStage(frontStage);
}

/** "2 × C4-1 dual physical centre cabinets" — the equipment wording of the centre row. */
export function centreCabinetsStatement(frontStage) {
  const count = Number(frontStage?.centreCabinets) || DUAL_CENTRE_CABINET_COUNT;
  const label = frontStage?.centreLabel || 'centre';
  return `${count} × ${label} dual physical centre cabinets`;
}

/** One product-role entry, in the shape the reports and the pack already read. */
function productRole({
  role,
  role_description,
  position_label,
  model,
  channel_count,
  cabinet_count = null,
  quantity = null,
  structure = null,
  orientation = null,
  model_statement = null,
}) {
  const meta = metaFor(model);
  return {
    role,
    role_description,
    position_label,
    model_key: model,
    model_label: meta.label,
    category: meta.category,
    found_in_registry: meta.found,
    channel_count,
    cabinet_count,
    // The physical loudspeakers this position holds, for the package's own Qty
    // column: one each where the sides have their own row, two for a pair that
    // shares one, and the centre's own cabinet count for a dual centre.
    quantity,
    structure,
    orientation,
    model_statement: model_statement || meta.label,
  };
}

/**
 * The dual-centre screen stage as TWO positions: the left/right pair and the
 * centre cabinets. Returns [] for every other stage, so the single-centre
 * package keeps exactly the row it has always had.
 */
export function frontStageProductRoles(frontStage) {
  if (!frontStageStatesPositions(frontStage)) return [];
  const roles = [];

  if (isDualCentreStage(frontStage)) {
    if (frontStage.leftRightModel) {
      roles.push(productRole({
        role: 'front_left_right',
        role_description: 'Front left and right channels',
        position_label: 'Front Left / Right',
        model: frontStage.leftRightModel,
        // Two screen channels, one cabinet each.
        channel_count: 2,
        quantity: 2,
      }));
    }
    roles.push(productRole({
      role: 'centre',
      role_description: 'Centre channel (two physical cabinets, one logical centre channel)',
      position_label: 'Centre',
      model: frontStage.centreModel,
      channel_count: frontStage.logicalCentreChannels,
      cabinet_count: frontStage.centreCabinets,
      quantity: frontStage.centreCabinets,
      structure: 'dual-centre',
      orientation: frontStage.orientation || null,
      model_statement: centreCabinetsStatement(frontStage),
    }));
    return roles;
  }

  // The mixed front stage: the two screen-channel sides and the centre of its own
  // model, stated exactly as the Speaker Design states them. The sides share one
  // row when they are the same model, and are named for the side they serve when
  // they are not: no model is ever stated for a position it is not placed at.
  if (frontStage.leftModel && frontStage.leftModel === frontStage.rightModel) {
    roles.push(productRole({
      role: 'front_left_right',
      role_description: 'Front left and right channels',
      position_label: 'Front Left / Right',
      model: frontStage.leftModel,
      channel_count: 2,
      quantity: 2,
    }));
  } else {
    if (frontStage.leftModel) {
      roles.push(productRole({
        role: 'front_left',
        role_description: 'Front left channel',
        position_label: 'Front left',
        model: frontStage.leftModel,
        channel_count: 1,
        quantity: 1,
      }));
    }
    if (frontStage.rightModel) {
      roles.push(productRole({
        role: 'front_right',
        role_description: 'Front right channel',
        position_label: 'Front right',
        model: frontStage.rightModel,
        channel_count: 1,
        quantity: 1,
      }));
    }
  }
  roles.push(productRole({
    role: 'centre',
    role_description: 'Centre channel',
    position_label: 'Centre',
    model: frontStage.centreModel,
    channel_count: 1,
    cabinet_count: 1,
    quantity: 1,
    structure: 'mixed-centre',
  }));
  return roles;
}

/**
 * The screen stage in one sentence, for the writer's facts. Names the layout it
 * leaves unchanged when the design states one, so no sentence can read the
 * centre as a second channel.
 */
export function frontStageStatement(frontStage, layout = null) {
  if (!isDualCentreStage(frontStage)) return null;
  const count = Number(frontStage.centreCabinets) || DUAL_CENTRE_CABINET_COUNT;
  const cabinets = `${count} ${frontStage.centreLabel} cabinet${count === 1 ? '' : 's'}`;
  const leftRight = frontStage.leftRightLabel
    ? `${frontStage.leftRightLabel} loudspeakers for the left and right channels`
    : `${cabinets} for the screen channels`;
  const layoutText = layout ? `stays ${layout}` : 'is unchanged';
  return `The screen stage uses ${leftRight}, with ${cabinets} used as a dual physical centre arrangement. `
    + `The ${count} centre cabinets remain one logical centre channel, so the Dolby layout ${layoutText}.`;
}

export default resolveFrontStage;