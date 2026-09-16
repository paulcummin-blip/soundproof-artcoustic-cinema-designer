// src/components/utils/appStateHelpers.js
//
// Pure helper functions extracted from AppStateProvider for modularity.
// These handle subwoofer instance restoration, seating normalisation,
// and room element normalisation for autosave restore.

import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import {
  MIGRATION_STATE,
  INSTANCE_STATUS,
} from "@/components/utils/subwooferInstanceCompatibility";
import {
  validateInstances,
  bassInputAdapter,
  normaliseLegacySubwoofers,
} from "@/components/utils/subwooferInstanceMigration";

const isCfgUsableForMigration = (cfg) => {
  if (!cfg || typeof cfg !== "object") return false;
  const hasModel = typeof cfg.model === "string" && cfg.model.trim().length > 0;
  const hasCount = Number.isFinite(Number(cfg.count)) && Number(cfg.count) > 0;
  return hasModel || hasCount;
};

export const restoreSubwooferInstancesFromAutosave = (payload) => {
  if (!payload) {
    return { instances: [], status: INSTANCE_STATUS.VALID, migration: MIGRATION_STATE.NONE, subwoofers: [] };
  }

  const orientationMeta = {
    frontOrientation: payload.frontSubsCfg?.orientation ?? null,
    rearOrientation: payload.rearSubsCfg?.orientation ?? null,
  };

  const hasField = Object.prototype.hasOwnProperty.call(payload, "subwooferInstances");

  if (hasField) {
    const raw = payload.subwooferInstances;
    if (!Array.isArray(raw)) {
      return { instances: [], status: INSTANCE_STATUS.ERROR, migration: MIGRATION_STATE.NONE, subwoofers: [] };
    }
    const validation = validateInstances(raw);
    if (!validation.valid) {
      return { instances: [], status: INSTANCE_STATUS.ERROR, migration: MIGRATION_STATE.NONE, subwoofers: [] };
    }
    const enabled = raw.filter((i) => i?.enabled !== false);
    const subwoofers = enabled.length > 0 ? bassInputAdapter(enabled, orientationMeta) : [];
    return { instances: raw, status: INSTANCE_STATUS.VALID, migration: MIGRATION_STATE.PERSISTED, subwoofers };
  }

  const frontCfg = payload.frontSubsCfg;
  const rearCfg = payload.rearSubsCfg;
  if (isCfgUsableForMigration(frontCfg) || isCfgUsableForMigration(rearCfg)) {
    const roomDims = payload.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
    const migrated = normaliseLegacySubwoofers(frontCfg, rearCfg, roomDims, null);
    const enabled = migrated.filter((i) => i?.enabled !== false);
    const subwoofers = enabled.length > 0 ? bassInputAdapter(enabled, orientationMeta) : [];
    return { instances: migrated, status: INSTANCE_STATUS.VALID, migration: MIGRATION_STATE.RUNTIME_MIGRATED, subwoofers };
  }

  return { instances: [], status: INSTANCE_STATUS.VALID, migration: MIGRATION_STATE.NONE, subwoofers: [] };
};

export const enforceOnePrimary = (seats, dims, mlpBasis = "front") => {
  if (!Array.isArray(seats) || seats.length === 0) return seats;
  const W = Number(dims?.widthM ?? dims?.width) || 4.5;
  const L = Number(dims?.lengthM ?? dims?.length) || 6.0;
  try {
    const { seatsWithFlags } = computeMLPAndPrimary(seats, W, L, mlpBasis, null);
    if (!Array.isArray(seatsWithFlags) || seatsWithFlags.length === 0) return seats;
    const primaries = seatsWithFlags.filter(s => s.isPrimary);
    const rspId = primaries.length > 0 ? primaries[0].id : seatsWithFlags[0].id;
    const collapsed = seatsWithFlags.map(s => ({ ...s, isPrimary: s.id === rspId }));
    return collapsed;
  } catch {
    return seats.map((s, i) => ({ ...s, isPrimary: i === 0 }));
  }
};

export const normaliseSeatingPositions = (seats, roomDims) => {
  if (!Array.isArray(seats)) return [];

  const widthM = Number(roomDims?.widthM ?? roomDims?.width) || 4.5;
  const lengthM = Number(roomDims?.lengthM ?? roomDims?.length) || 6.0;

  const MIN = 0.40;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const minX = MIN;
  const maxX = Math.max(minX, widthM - MIN);
  const minY = MIN;
  const maxY = Math.max(minY, lengthM - MIN);

  return seats
    .map((s, i) => {
      const px = s?.x ?? s?.position?.x;
      const py = s?.y ?? s?.position?.y;
      const pz = s?.z ?? s?.position?.z;

      const x = Number(px);
      const y = Number(py);
      const z = Number.isFinite(Number(pz)) ? Number(pz) : 1.2;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      return {
        ...s,
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
        z,
        id: s?.id ?? `seat-${i + 1}`,
        rowNumber: Number.isInteger(s?.rowNumber) ? s.rowNumber : s?.rowNumber,
        position: undefined
      };
    })
    .filter(Boolean);
};

export function normaliseRoomElements(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter(Boolean)
    .map((el, i) => {
      const id = el.id ?? el._id ?? (i + 1);
      const type = el.type ?? "door";
      const wall = el.wall ?? "front";
      const length_m = Number.isFinite(el.length_m) ? el.length_m : 0.9;
      const thickness_m = Number.isFinite(el.thickness_m) ? el.thickness_m : 0.05;
      const pos_m = Number.isFinite(el.pos_m) ? el.pos_m : 0;

      const label = (el.label ?? el.__label ?? "").toString();

      const x_lens_m = Number.isFinite(Number(el?.x_lens_m)) ? Number(el.x_lens_m) : undefined;
      const y_lens_m = Number.isFinite(Number(el?.y_lens_m)) ? Number(el.y_lens_m) : undefined;
      const z_lens_m = Number.isFinite(Number(el?.z_lens_m)) ? Number(el.z_lens_m) : undefined;
      const body_width_m = Number.isFinite(Number(el?.body_width_m)) ? Number(el.body_width_m) : undefined;
      const body_height_m = Number.isFinite(Number(el?.body_height_m)) ? Number(el.body_height_m) : undefined;
      const body_depth_m = Number.isFinite(Number(el?.body_depth_m)) ? Number(el.body_depth_m) : undefined;

      return {
        ...el,
        id,
        _id: id,
        type,
        wall,
        length_m,
        thickness_m,
        pos_m,
        label,
        __label: label,
        ...(x_lens_m !== undefined && { x_lens_m }),
        ...(y_lens_m !== undefined && { y_lens_m }),
        ...(z_lens_m !== undefined && { z_lens_m }),
        ...(body_width_m !== undefined && { body_width_m }),
        ...(body_height_m !== undefined && { body_height_m }),
        ...(body_depth_m !== undefined && { body_depth_m }),
      };
    });
}