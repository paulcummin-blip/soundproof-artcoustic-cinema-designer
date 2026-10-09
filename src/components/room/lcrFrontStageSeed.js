// components/room/lcrFrontStageSeed.js
// Pure helpers for LCR front-stage seeding, soundbar resolution, and the
// LCR/subwoofer clash check. No React — safe to import anywhere.

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { resolveSoundbarMetaM } from '@/components/models/speakers/soundbarCabinetVariant';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { computeTvVerticalCentreM } from '@/components/roomdesigner/utils/lcrHeightAuthority';
import { resolveInitialLcrPosition } from '@/components/room/placement/initialSpeakerPlacement';
import {
  CENTRE_CABINET_ROLES,
  defaultCentreCabinetOrientation,
  isCentreCabinetRole,
  normaliseCabinetOrientation,
} from '@/components/utils/frontStageModeAuthority';

export const CENTER_ONLY_SOUNDBAR_LABELS = ['C-1', 'C4-1', 'Multi (Mono)', 'HSPL (Mono)'];
export const INTEGRATED_LCR_SOUNDBAR_LABELS = ['Multi (LCR)', 'HSPL (LCR)'];

export function buildRoleMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || '').toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s);
  });
  return m;
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

export function hasFrontLcrSubClash({ speakers, frontSubs, frontSubsCfg }) {
  const lcrRoles = new Set(['FL', 'FC', 'FR', 'FCL', 'FCR']);
  const lcrRects = (Array.isArray(speakers) ? speakers : [])
    .filter((speaker) => lcrRoles.has(getCanonicalRole(speaker?.role)))
    .map((speaker) => {
      const x = Number(speaker?.position?.x);
      const z = Number(speaker?.position?.z);
      const meta = getSpeakerModelMeta(speaker?.model);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom: z - height / 2, top: z + height / 2 };
    })
    .filter(Boolean);

  const frontSubRects = (Array.isArray(frontSubs) ? frontSubs : [])
    .filter((sub) => sub?.group === 'front' || String(sub?.role || '').toUpperCase().startsWith('SUBF'))
    .map((sub) => {
      const x = Number.isFinite(Number(sub?.position?.x)) ? Number(sub.position.x) : Number(sub?.x);
      const bottom = Number.isFinite(Number(sub?.bottomHeightM))
        ? Number(sub.bottomHeightM)
        : Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
          ? Number(frontSubsCfg.bottomHeightM)
          : 0.05;
      const model = sub?.model || frontSubsCfg?.model;
      const orientation = sub?.orientation || frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(model, orientation);
      const width = Number(meta?.widthM);
      const height = Number(meta?.heightM);
      if (![x, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { left: x - width / 2, right: x + width / 2, bottom, top: bottom + height };
    })
    .filter(Boolean);

  if (lcrRects.length === 0 || frontSubRects.length === 0) return false;
  return lcrRects.some((lcrRect) => frontSubRects.some((subRect) => rectsOverlap(lcrRect, subRect)));
}

/**
 * The soundbar's catalogue metadata with the INSTALLED cabinet length applied.
 *
 * A TV-linked soundbar (C4-1, Multi, HSPL) is published in several cabinet
 * lengths; the one installed is the catalogue length closest to the screen's
 * PHYSICAL width — never its diagonal, never a fixed default. The shared variant
 * authority owns that decision, so the height and depth read here are the ones
 * every drawing uses.
 */
export function resolveSoundbarMeta(modelLabel, screen) {
  return resolveSoundbarMetaM(modelLabel, screen, { tvPresetKey: screen?.tvPresetKey || null });
}

export function buildFrontStageSeed({
  baseModelLabel,
  frontStageMode,
  soundbarModelLabel,
  centreModelLabel = null,
  centreOrientation = null,
  dimensions,
  screen,
  splConfig,
  setSpeakers,
  rsp = null,
  screenFrontPlaneM = null,
  lcrAimMode = 'flat',
  getModelDimsM,
}) {
  setSpeakers(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const by = buildRoleMap(list);

    const isCentreLike = (role) => {
      const r = String(role || '').trim().toUpperCase();
      return r === 'FC' || r === 'C' || r === 'CENTER' || r === 'CENTRE';
    };
    const LCR_ROLES_SET = new Set(['FL', 'FR']);
    const filtered = list.filter(s => {
      const canon = getCanonicalRole(s.role);
      // The dual-centre cabinets are owned by this seed in EVERY mode: they are
      // re-created only in dual-centre mode and removed otherwise, so switching
      // front stage never leaves a stale cabinet behind.
      if (isCentreCabinetRole(canon)) return false;
      return !LCR_ROLES_SET.has(canon) && !isCentreLike(String(s.role || '').trim().toUpperCase());
    });

    const roomW = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
    const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;

    const defaultY = 0.20;
    // TV vertical centre — the canonical FL/FR auto-height target.
    const tvCentreM = computeTvVerticalCentreM(screen, dimensions);
    const defaultZ = Number.isFinite(Number(splConfig?.lcrHeightM))
      ? Number(splConfig.lcrHeightM)
      : roomH * 0.5;
    const spread = Math.min(1.2, roomW * 0.22);
    const midX = roomW / 2;

    // Height authority per role. In center_only mode FL/FR follow the TV
    // centreline (lcrLRHeightM, then the TV centre); everything else follows the
    // centre/soundbar authority (lcrHeightM).
    const heightForRole = (role) => {
      const isLr = role === 'FL' || role === 'FR';
      if (frontStageMode === 'center_only' && isLr) {
        return Number.isFinite(Number(splConfig?.lcrLRHeightM))
          ? Number(splConfig.lcrLRHeightM)
          : tvCentreM;
      }
      if (frontStageMode === 'dual_centre' && isCentreCabinetRole(role)) {
        // The cabinets' acoustic centre DEFAULTS to the TV vertical midpoint —
        // 50% of the screen height above its actual position above the floor —
        // the same TV geometry authority that drives the L/R height. A designer's
        // manual override (lcrHeightManual, saved as lcrHeightM) always wins.
        return splConfig?.lcrHeightManual === true && Number.isFinite(Number(splConfig?.lcrHeightM))
          ? Number(splConfig.lcrHeightM)
          : tvCentreM;
      }
      return defaultZ;
    };

    // ONE initial placement authority for the front stage.
    //
    // A speaker that is already installed — or that the designer has placed by
    // hand — keeps the position it has, and is only pushed clear of the front
    // wall when the newly assigned model's depth requires it. A role that has
    // no equipment yet is resolved to its FINAL position in this same state
    // update, so the first frame it is visible is already correct and no later
    // effect has to move it.
    const placeRole = (role, model, existing, orientation = null) => {
      const existingPos = existing?.position;
      const existingModel = String(existing?.model ?? '').trim().toLowerCase();
      const alreadyInstalled = !!existingModel && existingModel !== 'off' && existingModel !== 'none';
      const userPlaced = existing?.positionSource === 'user';
      const x0 = Number(existingPos?.x);
      const y0 = Number(existingPos?.y);
      const hasExisting = Number.isFinite(x0) && Number.isFinite(y0);

      const resolved = resolveInitialLcrPosition({
        role,
        model,
        // A centre cabinet is placed from its INSTALLED footprint, so a vertical
        // cabinet hugs the TV edge with its rotated width.
        orientation,
        roomDims: dimensions,
        rsp,
        screenFrontPlaneM,
        screen,
        lcrHeightM: heightForRole(role),
        lcrAimMode,
        fallbackSpreadM: spread,
        getModelDimsM,
      });

      if (!resolved) return hasExisting ? existingPos : null;
      if (!hasExisting || (!alreadyInstalled && !userPlaced)) {
        return { x: resolved.x, y: resolved.y, z: resolved.z };
      }

      // Preserve the existing installation position; keep the cabinet clear of
      // the front wall for the new model's projected depth.
      return { x: x0, y: Math.max(y0, resolved.y), z: resolved.z };
    };

    const FL = by.get('FL') || { role: 'FL', id: 'FL-1', draggable: true };
    const FC = by.get('FC') || { role: 'FC', id: 'FC-1', draggable: true };
    const FR = by.get('FR') || { role: 'FR', id: 'FR-1', draggable: true };

    const soundbarLabel = soundbarModelLabel || null;
    // The centre label carries the dual-centre cabinet model — ONE model for both
    // physical centre cabinets. The soundbar slot is untouched for the other modes.
    const centreLabel = centreModelLabel || null;

    // The orientation the cabinets are INSTALLED in: the designer's own choice is
    // always preserved, a newly created cabinet starts in the product's own form.
    const cabinetOrientation = (existing) => {
      const recorded = String(existing?.orientation || '').trim();
      if (recorded) return normaliseCabinetOrientation(recorded);
      if (centreOrientation) return normaliseCabinetOrientation(centreOrientation);
      return defaultCentreCabinetOrientation(centreLabel, screen?.tvPresetKey || null);
    };

    const fallbackPosition = (role) => {
      if (isCentreCabinetRole(role)) {
        const left = getCanonicalRole(role) === CENTRE_CABINET_ROLES.left;
        return { x: left ? midX - spread : midX + spread, y: defaultY, z: heightForRole(role) };
      }
      return {
        x: role === 'FL' ? midX - spread : role === 'FR' ? midX + spread : midX,
        y: defaultY,
        z: heightForRole(role),
      };
    };

    if (frontStageMode === 'integrated_lcr' && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: placeRole('FC', soundbarLabel, FC) || fallbackPosition('FC'),
          rotation: FC.rotation || { x: 0, y: 0, z: 0 },
        },
      ];
    }

    if (frontStageMode === 'center_only' && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FL,
          role: 'FL',
          id: FL.id || 'FL-1',
          model: baseModelLabel,
          position: placeRole('FL', baseModelLabel, FL) || fallbackPosition('FL'),
          rotation: FL.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: placeRole('FC', soundbarLabel, FC) || fallbackPosition('FC'),
          rotation: FC.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FR,
          role: 'FR',
          id: FR.id || 'FR-1',
          model: baseModelLabel,
          position: placeRole('FR', baseModelLabel, FR) || fallbackPosition('FR'),
          rotation: FR.rotation || { x: 0, y: 0, z: 0 },
        },
      ];
    }

    // ── Dual centre (TV) ────────────────────────────────────────────────────
    // FL/FR are placed by the SAME standard authority as the 'standard' mode
    // (this mode never moves them), plus the two physical centre cabinets
    // flanking the TV. Both cabinets carry the SAME centre model and are fed
    // from the ONE centre channel: no extra channel, no Dolby layout change.
    if (frontStageMode === 'dual_centre' && centreLabel) {
      const FCL = by.get('FCL') || { role: 'FCL', id: 'FCL-1', draggable: true };
      const FCR = by.get('FCR') || { role: 'FCR', id: 'FCR-1', draggable: true };

      return [
        ...filtered,
        {
          ...FL,
          role: 'FL',
          id: FL.id || 'FL-1',
          model: baseModelLabel,
          position: placeRole('FL', baseModelLabel, FL) || fallbackPosition('FL'),
          rotation: FL.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FCL,
          role: 'FCL',
          id: FCL.id || 'FCL-1',
          model: centreLabel,
          orientation: cabinetOrientation(FCL),
          position: placeRole('FCL', centreLabel, FCL, cabinetOrientation(FCL)) || fallbackPosition('FCL'),
          rotation: FCL.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FCR,
          role: 'FCR',
          id: FCR.id || 'FCR-1',
          model: centreLabel,
          orientation: cabinetOrientation(FCR),
          position: placeRole('FCR', centreLabel, FCR, cabinetOrientation(FCR)) || fallbackPosition('FCR'),
          rotation: FCR.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FR,
          role: 'FR',
          id: FR.id || 'FR-1',
          model: baseModelLabel,
          position: placeRole('FR', baseModelLabel, FR) || fallbackPosition('FR'),
          rotation: FR.rotation || { x: 0, y: 0, z: 0 },
        },
      ];
    }

    return [
      ...filtered,
      {
        ...FL,
        role: 'FL',
        id: FL.id || 'FL-1',
        model: baseModelLabel,
        position: placeRole('FL', baseModelLabel, FL) || fallbackPosition('FL'),
        rotation: FL.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FC,
        role: 'FC',
        id: FC.id || 'FC-1',
        model: baseModelLabel,
        position: placeRole('FC', baseModelLabel, FC) || fallbackPosition('FC'),
        rotation: FC.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FR,
        role: 'FR',
        id: FR.id || 'FR-1',
        model: baseModelLabel,
        position: placeRole('FR', baseModelLabel, FR) || fallbackPosition('FR'),
        rotation: FR.rotation || { x: 0, y: 0, z: 0 },
      },
    ];
  });
}