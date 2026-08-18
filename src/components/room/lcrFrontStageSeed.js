// components/room/lcrFrontStageSeed.js
// Pure helpers for LCR front-stage seeding, soundbar resolution, and the
// LCR/subwoofer clash check. No React — safe to import anywhere.

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

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

export function resolveSoundbarMeta(modelLabel, screen) {
  const tvPresetKey = screen?.tvPresetKey || null;
  return getSpeakerModelMeta(modelLabel, tvPresetKey);
}

export function buildFrontStageSeed({ baseModelLabel, frontStageMode, soundbarModelLabel, dimensions, screen, splConfig, setSpeakers }) {
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
      return !LCR_ROLES_SET.has(canon) && !isCentreLike(String(s.role || '').trim().toUpperCase());
    });

    const roomW = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
    const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;
    const screenHeightFromFloorM = Number(screen?.heightFromFloorM) || 0.5;
    const visibleWidthInches = Number(screen?.visibleWidthInches) || 100;
    const aspectRatio = String(screen?.aspectRatio || '16:9');
    const [arW, arH] = aspectRatio.split(':').map(Number);
    const ratio = (arW && arH) ? arW / arH : 16 / 9;
    const viewableWidthM = visibleWidthInches * 0.0254;
    const viewableHeightM = viewableWidthM / ratio;
    const screenBottomM = screenHeightFromFloorM;

    const defaultY = 0.20;
    const lcrHeightM = Number(splConfig?.lcrHeightM);
    const lcrLRHeightM = Number(splConfig?.lcrLRHeightM);
    const defaultZ = Number.isFinite(lcrHeightM) ? lcrHeightM : roomH * 0.5;
    // In center_only mode, L/R use their own stored height if available
    const defaultLRZ = (frontStageMode === 'center_only' && Number.isFinite(lcrLRHeightM))
      ? lcrLRHeightM
      : defaultZ;
    const spread = Math.min(1.2, roomW * 0.22);
    const midX = roomW / 2;

    const FL = by.get('FL') || { role: 'FL', id: 'FL-1', draggable: true };
    const FC = by.get('FC') || { role: 'FC', id: 'FC-1', draggable: true };
    const FR = by.get('FR') || { role: 'FR', id: 'FR-1', draggable: true };

    const soundbarLabel = soundbarModelLabel || null;
    const soundbarMeta = soundbarLabel ? resolveSoundbarMeta(soundbarLabel, screen) : null;
    const soundbarHeightM = Number(soundbarMeta?.heightM) || 0;
    const soundbarCenterZ = soundbarMeta
      ? Math.max(soundbarHeightM / 2, screenBottomM - 0.02 - (soundbarHeightM / 2))
      : defaultZ;

    if (frontStageMode === 'integrated_lcr' && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: { x: midX, y: defaultY, z: defaultZ },
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
          position: { ...(FL.position || { x: midX - spread, y: defaultY, z: defaultLRZ }), z: defaultLRZ },
          rotation: FL.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FC,
          role: 'FC',
          id: FC.id || 'FC-1',
          model: soundbarLabel,
          position: { x: midX, y: defaultY, z: defaultZ },
          rotation: FC.rotation || { x: 0, y: 0, z: 0 },
        },
        {
          ...FR,
          role: 'FR',
          id: FR.id || 'FR-1',
          model: baseModelLabel,
          position: { ...(FR.position || { x: midX + spread, y: defaultY, z: defaultLRZ }), z: defaultLRZ },
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
        position: { x: midX - spread, y: defaultY, z: defaultZ },
        rotation: FL.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FC,
        role: 'FC',
        id: FC.id || 'FC-1',
        model: baseModelLabel,
        position: { x: midX, y: defaultY, z: defaultZ },
        rotation: FC.rotation || { x: 0, y: 0, z: 0 },
      },
      {
        ...FR,
        role: 'FR',
        id: FR.id || 'FR-1',
        model: baseModelLabel,
        position: { x: midX + spread, y: defaultY, z: defaultZ },
        rotation: FR.rotation || { x: 0, y: 0, z: 0 },
      },
    ];
  });
}