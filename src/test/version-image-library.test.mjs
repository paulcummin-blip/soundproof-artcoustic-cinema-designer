// version-image-library.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's version-aware image library.
//
//   TEST 1  Both saved versions are named exactly as saved
//   TEST 2  Image 1 uploaded project-wide shows Project-wide and is used by both
//   TEST 3  Image 1 uploaded under Level 1 version is used by Level 1 only
//   TEST 4  Image 1 uploaded under Level 4 version is used by Level 4 only
//   TEST 5  Choosing Level 4 version uploads to Level 4 without switching the
//           project's active version
//   TEST 6  Labels stay official saved names when the active version changes
//   TEST 7  A comparison groups by version and keeps Project-wide images shared
//   TEST 8  A proposal's cover is the covered version's own, else project-wide
//
// The rules under test, derived exactly as the Library derives them: scopes are
// the saved versions themselves, named by ProjectVersion.version_name, and a
// single-version document uses that version's images first with the project-wide
// gallery filling any slot it leaves free.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  IMAGE_SCOPE,
  filterImagesByScope,
  imageScopeKeyLabel,
  imageScopeLabel,
  imageScopeOptions,
  imagesForVersion,
  resolveCoverAsset,
  resolvePackImages,
  resolveUploadTarget,
} from '../components/library/imageScopeAuthority.js';

const VERSION_1 = { id: 'version-1', version_number: 1, version_name: 'Level 1 version' };
const VERSION_4 = { id: 'version-4', version_number: 4, version_name: 'Level 4 version' };
const VERSIONS = [VERSION_1, VERSION_4];
const versionNameById = new Map(VERSIONS.map((v) => [v.id, v.version_name]));

const image = (id, slot, { scope = IMAGE_SCOPE.PROJECT, versionId = null, caption = '' } = {}) => ({
  id,
  slot,
  scope,
  version_id: versionId,
  caption,
  file_url: `https://files.example/${id}.jpg`,
});

/** The scope options the Image Library offers, exactly as the control builds them. */
const scopeOptions = (activeVersionId = null) => imageScopeOptions({ versions: VERSIONS, activeVersionId });

/** The record a new image is written as, from the scope chosen in the Library. */
const newImage = (id, slot, scopeKey) => {
  const target = resolveUploadTarget({ scopeKey });
  return image(id, slot, { scope: target.scope, versionId: target.versionId });
};

/* ── TEST 1 — both versions are named exactly as saved ──────────────────── */

test('TEST 1 — the Image Library names every saved version exactly, never by slot number', () => {
  const labels = scopeOptions(VERSION_1.id).map((option) => option.label);

  assert.deepEqual(labels, ['Project-wide', 'Level 1 version', 'Level 4 version']);
  labels.slice(1).forEach((label) => {
    assert.ok(!/^V\d$/.test(label), 'no V1 / V2 style labels');
    assert.ok(!/^Version \d/.test(label), 'no generic "Version 1" labels');
  });
  assert.deepEqual(
    scopeOptions().map((option) => option.key),
    ['project', 'version:version-1', 'version:version-4'],
    'each scope has its own key: the project gallery, and one per version',
  );
  assert.equal(imageScopeLabel({ scope: 'version', version_id: 'version-4' }, versionNameById), 'Level 4 version');
  assert.equal(imageScopeKeyLabel('version:version-4', versionNameById), 'Level 4 version');
});

/* ── TEST 2 — project-wide Image 1 ─────────────────────────────────────── */

test('TEST 2 — Image 1 uploaded under Project-wide shows Project-wide and is used by both versions', () => {
  const projectImage1 = newImage('project-1', 'image_1', 'project');

  assert.equal(projectImage1.scope, IMAGE_SCOPE.PROJECT);
  assert.equal(projectImage1.version_id, null);
  assert.equal(imageScopeLabel(projectImage1, versionNameById), 'Project-wide');
  assert.deepEqual(
    imagesForVersion([projectImage1], VERSION_1.id).map(({ asset }) => asset.id),
    ['project-1'],
    'Level 1 version reports use it',
  );
  assert.deepEqual(
    imagesForVersion([projectImage1], VERSION_4.id).map(({ asset }) => asset.id),
    ['project-1'],
    'Level 4 version reports use it too, until a version-specific Image 1 overrides it',
  );
});

/* ── TEST 3 — version images do not leak between versions ───────────────── */

test('TEST 3 — Image 1 under Level 1 version is used by Level 1 only', () => {
  const level1Image1 = newImage('v1-1', 'image_1', 'version:version-1');

  assert.equal(level1Image1.scope, IMAGE_SCOPE.VERSION);
  assert.equal(level1Image1.version_id, 'version-1');
  assert.equal(imageScopeLabel(level1Image1, versionNameById), 'Level 1 version');
  assert.deepEqual(
    imagesForVersion([level1Image1], VERSION_1.id).map(({ asset, origin }) => [asset.id, origin]),
    [['v1-1', 'version']],
  );
  assert.deepEqual(imagesForVersion([level1Image1], VERSION_4.id), [], 'never a Level 4 version image');
  assert.deepEqual(
    filterImagesByScope({ assets: [level1Image1], filter: 'version:version-4' }),
    [],
    'and it is absent from the Level 4 version gallery',
  );
});

/* ── TEST 4 — the version image wins the slot it fills ─────────────────── */

test('TEST 4 — a version image takes the slot, and project-wide fills the rest', () => {
  const projectCover = newImage('project-cover', 'cover', 'project');
  const projectImage1 = newImage('project-1', 'image_1', 'project');
  const level4Cover = newImage('v4-cover', 'cover', 'version:version-4');
  const assets = [projectCover, projectImage1, level4Cover];

  const level4 = imagesForVersion(assets, VERSION_4.id);
  assert.deepEqual(
    level4.map(({ asset, slot, origin }) => [asset.id, slot, origin]),
    [['v4-cover', 'cover', 'version'], ['project-1', 'image_1', 'project']],
    'the Level 4 cover overrides, and Image 1 is still the shared project-wide image',
  );

  const level1 = imagesForVersion(assets, VERSION_1.id);
  assert.deepEqual(
    level1.map(({ asset, origin }) => [asset.id, origin]),
    [['project-cover', 'project'], ['project-1', 'project']],
    'Level 1 version falls back to the project-wide gallery entirely',
  );
});

/* ── TEST 5 — Level 4 uploads without switching the active version ──────── */

test('TEST 5 — choosing Level 4 version uploads there while Level 1 version stays open', () => {
  const target = resolveUploadTarget({ scopeKey: 'version:version-4' });

  assert.deepEqual(target, {
    scope: IMAGE_SCOPE.VERSION,
    versionId: 'version-4',
    scopeKey: 'version:version-4',
  }, 'the chosen scope decides, not the version that is open');

  // The version that is open is Level 1, and that does not change the target.
  assert.equal(imageScopeLabel({ scope: target.scope, version_id: target.versionId }, versionNameById), 'Level 4 version');

  const level4Image1 = newImage('v4-1', 'image_1', 'version:version-4');
  assert.equal(level4Image1.version_id, 'version-4');
  assert.deepEqual(imagesForVersion([level4Image1], VERSION_1.id), [], 'not a Level 1 image');
  assert.deepEqual(
    imagesForVersion([level4Image1], VERSION_4.id).map(({ asset }) => asset.id),
    ['v4-1'],
    'used by Level 4 version only',
  );
});

/* ── TEST 6 — labels do not depend on the active version ────────────────── */

test('TEST 6 — switching the active version leaves every label an official saved name', () => {
  const withLevel1Open = scopeOptions(VERSION_1.id);
  const withLevel4Open = scopeOptions(VERSION_4.id);

  assert.deepEqual(
    withLevel1Open.map((option) => option.label),
    withLevel4Open.map((option) => option.label),
    'the names never change with the open version',
  );
  assert.equal(withLevel1Open.find((o) => o.key === 'version:version-1').isActiveVersion, true);
  assert.equal(withLevel4Open.find((o) => o.key === 'version:version-4').isActiveVersion, true);
  withLevel4Open.forEach((option) => {
    if (option.scope !== 'version') return;
    assert.equal(option.label, versionNameById.get(option.versionId), 'the saved name, verbatim');
  });
});

/* ── TEST 7 — a comparison groups by version ────────────────────────────── */

test('TEST 7 — a comparison keeps Project-wide shared and labels each version’s images', () => {
  const assets = [
    newImage('project-1', 'image_1', 'project'),
    newImage('v1-2', 'image_2', 'version:version-1'),
    newImage('v4-2', 'image_2', 'version:version-4'),
  ];

  const pack = resolvePackImages({
    assets,
    versionIds: [VERSION_1.id, VERSION_4.id],
    versionNameById,
  });

  assert.deepEqual(pack.map((asset) => asset.id), ['project-1', 'v1-2', 'v4-2']);
  assert.equal(pack[0].caption, '', 'the shared project-wide image stays unlabelled');
  assert.match(pack[1].caption, /Level 1 version/, 'the Level 1 image states its version');
  assert.match(pack[2].caption, /Level 4 version/, 'and the Level 4 image states its own');
  assert.ok(
    !pack[1].caption.includes('version version'),
    'the saved name is never suffixed again',
  );
});

/* ── TEST 8 — the cover follows the same rule ───────────────────────────── */

test('TEST 8 — a proposal cover is the covered version’s own, else the project-wide cover', () => {
  const projectCover = newImage('project-cover', 'cover', 'project');
  const level4Cover = newImage('v4-cover', 'cover', 'version:version-4');
  const assets = [projectCover, level4Cover];

  assert.equal(resolveCoverAsset(assets, [VERSION_4.id])?.id, 'v4-cover', 'Level 4 version uses its own cover');
  assert.equal(resolveCoverAsset(assets, [VERSION_1.id])?.id, 'project-cover', 'Level 1 version falls back to the shared cover');
  assert.equal(resolveCoverAsset(assets, [VERSION_1.id, VERSION_4.id])?.id, 'project-cover', 'a comparison opens with the shared cover');
  assert.equal(resolveCoverAsset([level4Cover], [VERSION_1.id, VERSION_4.id])?.id, 'v4-cover', 'and uses a covered version’s cover when there is no shared one');
  assert.equal(resolveCoverAsset([], [VERSION_1.id]), null, 'no images, no cover');
});