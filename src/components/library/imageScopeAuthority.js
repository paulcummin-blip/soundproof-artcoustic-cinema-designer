/**
 * imageScopeAuthority.js
 * ----------------------
 * The scope rule for project images.
 *
 * Every image is either project-wide (it applies to the whole project) or
 * version-specific (it applies to one design version). Each scope keeps its own
 * Cover Image and Image 1 to Image 10, so a version-specific image never
 * displaces the project-wide image in the same slot.
 *
 * An image with no scope recorded is project-wide. That is what keeps every
 * image uploaded before scope existed visible, un-moved and un-reinterpreted.
 *
 * Composition uses version-specific images first for the version it is building,
 * and falls back to project-wide images for any slot the version does not fill.
 *
 * Pure functions: no fetching, no writing, no side effects.
 */

import {
  ASSET_SLOT,
  resolveSlotAssignments,
  slotNumber,
} from '@/components/proposal/assetSlotAuthority';

export const IMAGE_SCOPE = Object.freeze({
  PROJECT: 'project',
  VERSION: 'version',
});

/** The Library's Images filter. */
export const IMAGE_SCOPE_FILTER = Object.freeze({
  ALL: 'all',
  PROJECT: 'project',
  VERSION: 'version',
});

export const IMAGE_SCOPE_LABEL = Object.freeze({
  [IMAGE_SCOPE.PROJECT]: 'Project-wide',
});

/** The scope an image actually reads as: anything unstated is project-wide. */
export function resolveImageScope(asset) {
  const declared = asset?.scope || null;
  if (declared === IMAGE_SCOPE.VERSION && asset?.version_id) return IMAGE_SCOPE.VERSION;
  return IMAGE_SCOPE.PROJECT;
}

/** The version a version-specific image belongs to, else null. */
export function resolveImageVersionId(asset) {
  return resolveImageScope(asset) === IMAGE_SCOPE.VERSION ? asset.version_id : null;
}

/** The slot group an image belongs to: the project gallery, or one version's. */
export function scopeKeyFor(scope, versionId) {
  return scope === IMAGE_SCOPE.VERSION && versionId ? `version:${versionId}` : 'project';
}

export function scopeKeyOfAsset(asset) {
  return scopeKeyFor(resolveImageScope(asset), resolveImageVersionId(asset));
}

/** The scope key of one explicit version's gallery. */
export function versionScopeKey(versionId) {
  return versionId ? `version:${versionId}` : 'project';
}

/**
 * The Image Library's scopes, in order: Project-wide first, then every saved
 * version under its exact saved name.
 *
 * Each entry carries the scope key that both the upload-scope control and the
 * Library's filter use, so a version is chosen by name — never by a slot number,
 * and never by switching the project's active design version.
 *
 * @returns {Array<{key: string, scope: string, versionId: string|null, label: string, description: string, isActiveVersion: boolean}>}
 */
export function imageScopeOptions({ versions = [], activeVersionId = null } = {}) {
  const saved = (Array.isArray(versions) ? versions : [])
    .filter((version) => version && version.id)
    .slice()
    .sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));

  return [
    {
      key: 'project',
      scope: IMAGE_SCOPE.PROJECT,
      versionId: null,
      label: IMAGE_SCOPE_LABEL[IMAGE_SCOPE.PROJECT],
      description: 'Used by every design version: room renders, general project images and a shared cover.',
      isActiveVersion: false,
    },
    ...saved.map((version) => ({
      key: versionScopeKey(version.id),
      scope: IMAGE_SCOPE.VERSION,
      versionId: version.id,
      // The saved name is the label authority. It is never rebuilt from a slot.
      label: version.version_name || 'Version-specific',
      description: 'Used only by this design version.',
      isActiveVersion: version.id === activeVersionId,
    })),
  ];
}

/** The name one scope key states, from the project's saved version names. */
export function imageScopeKeyLabel(scopeKey, versionNameById = new Map()) {
  if (!scopeKey || scopeKey === 'project') return IMAGE_SCOPE_LABEL[IMAGE_SCOPE.PROJECT];
  const versionId = String(scopeKey).startsWith('version:')
    ? String(scopeKey).slice('version:'.length)
    : null;
  return versionId ? (versionNameById.get(versionId) || 'Version-specific') : IMAGE_SCOPE_LABEL[IMAGE_SCOPE.PROJECT];
}

/** The slot assignments of ONE scope. Each scope fills its own eleven slots. */
export function resolveScopedSlotAssignments(assets = [], scopeKey = 'project') {
  const scoped = (Array.isArray(assets) ? assets : []).filter(
    (asset) => asset && scopeKeyOfAsset(asset) === scopeKey,
  );
  return { ...resolveSlotAssignments(scoped), assets: scoped };
}

/**
 * The project's images grouped for display: the project-wide gallery first, then
 * one group per version that has version-specific images.
 */
export function groupImagesByScope(assets = []) {
  const project = [];
  const byVersion = new Map();

  (Array.isArray(assets) ? assets : []).forEach((asset) => {
    if (!asset) return;
    const versionId = resolveImageVersionId(asset);
    if (!versionId) {
      project.push(asset);
      return;
    }
    if (!byVersion.has(versionId)) byVersion.set(versionId, []);
    byVersion.get(versionId).push(asset);
  });

  return {
    project,
    versions: [...byVersion.entries()].map(([versionId, groupAssets]) => ({ versionId, assets: groupAssets })),
  };
}

/** The images the Library's filter shows. */
export function filterImagesByScope({ assets = [], filter = IMAGE_SCOPE_FILTER.ALL, activeVersionId = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  if (filter === IMAGE_SCOPE_FILTER.PROJECT) {
    return list.filter((asset) => !resolveImageVersionId(asset));
  }
  // One named version's gallery, chosen by name rather than by the open version.
  if (typeof filter === 'string' && filter.startsWith('version:')) {
    const versionId = filter.slice('version:'.length);
    if (!versionId) return [];
    return list.filter((asset) => resolveImageVersionId(asset) === versionId);
  }
  if (filter === IMAGE_SCOPE_FILTER.VERSION) {
    if (!activeVersionId) return [];
    return list.filter((asset) => resolveImageVersionId(asset) === activeVersionId);
  }
  return list;
}

/**
 * The image set one version's document uses: version-specific images first, then
 * project-wide images for the slots that version leaves free. A version-specific
 * image never mixes in without the version it belongs to being known.
 *
 * @returns {Array<{asset: Object, slot: string, origin: 'version'|'project'}>}
 */
export function imagesForVersion(assets = [], versionId = null) {
  const versionAssignments = versionId
    ? resolveScopedSlotAssignments(assets, scopeKeyFor(IMAGE_SCOPE.VERSION, versionId))
    : { byId: {} };
  const projectAssignments = resolveScopedSlotAssignments(assets, 'project');

  const list = Array.isArray(assets) ? assets : [];
  const byId = new Map(list.filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
  // slot → asset id, per scope.
  const invert = (byIdMap = {}) => {
    const bySlot = {};
    Object.entries(byIdMap).forEach(([id, slot]) => { bySlot[slot] = id; });
    return bySlot;
  };
  const versionBySlot = invert(versionAssignments.byId);
  const projectBySlot = invert(projectAssignments.byId);

  return Object.values(ASSET_SLOT)
    .map((slot) => {
      const versionAsset = byId.get(versionBySlot[slot]);
      if (versionAsset) return { asset: versionAsset, slot, origin: 'version' };
      const projectAsset = byId.get(projectBySlot[slot]);
      if (projectAsset) return { asset: projectAsset, slot, origin: 'project' };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => slotNumber(a.slot) - slotNumber(b.slot));
}

/**
 * The image set a document being built for one or more versions uses.
 *
 * One version — that version's own images first, with project-wide images
 * filling any slot the version leaves free.
 * Several versions (a comparison) — the project-wide images, followed by each
 * version's own images. A version-specific image is never mixed in silently: its
 * version name is stated with it.
 *
 * @returns {Array<Object>} the image records to compose with
 */
export function resolvePackImages({ assets = [], versionIds = [], versionNameById = new Map() } = {}) {
  const ids = (Array.isArray(versionIds) ? versionIds : []).filter(Boolean);

  if (ids.length <= 1) {
    const picked = imagesForVersion(assets, ids[0] || null);
    return picked.map(({ asset, slot }) => ({ ...asset, slot }));
  }

  const projectWide = imagesForVersion(assets, null)
    .map(({ asset, slot }) => ({ ...asset, slot }));

  const perVersion = ids.flatMap((versionId) => {
    const versionName = versionNameById.get(versionId) || null;
    const scoped = resolveScopedSlotAssignments(assets, scopeKeyFor(IMAGE_SCOPE.VERSION, versionId));
    const list = Array.isArray(assets) ? assets : [];
    const byId = new Map(list.filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
    return Object.entries(scoped.byId)
      .map(([id, slot]) => ({ asset: byId.get(id), slot }))
      .filter(({ asset }) => Boolean(asset))
      .map(({ asset, slot }) => ({
        ...asset,
        slot,
        // The version this image belongs to travels with it, so a comparison
        // never shows a version-specific image without saying which version.
        // The label is the exact saved name — it is never suffixed again, which
        // is what would turn "Level 1 version" into "Level 1 version version".
        caption: [asset.caption, versionName || null].filter(Boolean).join(' · '),
      }));
  });

  return [...projectWide, ...perVersion];
}

/**
 * The small scope label an image card carries: the exact saved version name for
 * a version-specific image, "Project-wide" otherwise. The saved name already
 * reads as a version ("Level 1 version"), so it is never suffixed again.
 */
export function imageScopeLabel(asset, versionNameById = new Map()) {
  const versionId = resolveImageVersionId(asset);
  if (!versionId) return IMAGE_SCOPE_LABEL[IMAGE_SCOPE.PROJECT];
  return versionNameById.get(versionId) || 'Version-specific';
}

/**
 * Where a NEW upload goes, from the Library's explicit upload-scope control.
 *
 * The chosen scope is the authority — never the gallery a card happens to sit
 * in — so an image is never written to a scope the designer did not choose. The
 * version scope needs the version that is open; without one it reads as
 * project-wide, which is also the default.
 */
export function resolveUploadTarget({
  uploadScope = IMAGE_SCOPE.PROJECT,
  activeVersionId = null,
  versionId = null,
  scopeKey = null,
} = {}) {
  // The explicit scope key (Project-wide, or one named version) is the strongest
  // statement and wins: a designer can upload to Level 4 version while Level 1
  // version is the open version. It falls back to the legacy scope + the version
  // that is open, and to project-wide when neither names a version.
  const key = scopeKey
    || versionScopeKey(versionId || (uploadScope === IMAGE_SCOPE.VERSION ? activeVersionId : null));

  if (typeof key === 'string' && key.startsWith('version:')) {
    const resolvedVersionId = key.slice('version:'.length);
    if (resolvedVersionId) {
      return {
        scope: IMAGE_SCOPE.VERSION,
        versionId: resolvedVersionId,
        scopeKey: versionScopeKey(resolvedVersionId),
      };
    }
  }
  return { scope: IMAGE_SCOPE.PROJECT, versionId: null, scopeKey: 'project' };
}

export default resolveScopedSlotAssignments;