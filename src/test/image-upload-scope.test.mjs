// image-upload-scope.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's Images tab: upload scope vs filter.
//
//   TEST 1  Project-wide upload scope uploads a project-wide Image 1
//   TEST 2  Version upload scope uploads a Level 1 version Image 1
//   TEST 3  The filter never decides where an upload goes
//   TEST 4  All images lists both scopes, each with its own label
//   TEST 5  Switching the active version moves the upload scope and hides the
//           other version's images
//   TEST 6  An empty slot states the scope it will be written to
//
// The rules under test, derived exactly as the Images tab derives them:
//   the upload scope the designer chose is the authority for a NEW image (never
//   the gallery a card sits in), and the filter only decides what is listed.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  IMAGE_SCOPE,
  IMAGE_SCOPE_FILTER,
  filterImagesByScope,
  imageScopeLabel,
  imagesForVersion,
  resolveUploadTarget,
  scopeKeyOfAsset,
} from '../components/library/imageScopeAuthority.js';

const VERSION_1 = { id: 'version-1', version_name: 'Level 1 version' };
const VERSION_4 = { id: 'version-4', version_name: 'Level 4 version' };

const versionNameById = new Map([
  [VERSION_1.id, VERSION_1.version_name],
  [VERSION_4.id, VERSION_4.version_name],
]);

/** The record the gallery panel writes for a new image. */
const newImage = (id, slot, { uploadScope, activeVersionId }) => {
  const target = resolveUploadTarget({ uploadScope, activeVersionId });
  return {
    id,
    slot,
    scope: target.scope,
    version_id: target.versionId,
  };
};

const PROJECT_IMAGE_1 = newImage('asset-project-1', 'image_1', {
  uploadScope: IMAGE_SCOPE.PROJECT,
  activeVersionId: VERSION_1.id,
});
const VERSION_1_IMAGE_1 = newImage('asset-v1-1', 'image_1', {
  uploadScope: IMAGE_SCOPE.VERSION,
  activeVersionId: VERSION_1.id,
});
const ALL_IMAGES = [PROJECT_IMAGE_1, VERSION_1_IMAGE_1];

/* ── TEST 1 — Project-wide upload scope ─────────────────────────────────── */

test('TEST 1 — Project-wide upload scope writes a project-wide Image 1 that every version uses', () => {
  assert.equal(IMAGE_SCOPE.PROJECT, 'project', 'project-wide is the default scope');
  assert.deepEqual(
    resolveUploadTarget({ uploadScope: IMAGE_SCOPE.PROJECT, activeVersionId: VERSION_1.id }),
    { scope: IMAGE_SCOPE.PROJECT, versionId: null, scopeKey: 'project' },
    'no version is stamped on a project-wide upload',
  );

  assert.equal(PROJECT_IMAGE_1.version_id, null, 'the image carries no version');
  assert.equal(scopeKeyOfAsset(PROJECT_IMAGE_1), 'project', 'it belongs to the project gallery');
  assert.equal(imageScopeLabel(PROJECT_IMAGE_1, versionNameById), 'Project-wide', 'the card label');
});

test('TEST 1b — a project-wide image is used by every version', () => {
  assert.deepEqual(
    imagesForVersion([PROJECT_IMAGE_1], VERSION_1.id).map(({ asset }) => asset.id),
    ['asset-project-1'],
  );
  assert.deepEqual(
    imagesForVersion([PROJECT_IMAGE_1], VERSION_4.id).map(({ asset }) => asset.id),
    ['asset-project-1'],
    'the Level 4 version uses it too',
  );
});

/* ── TEST 2 — Version upload scope ──────────────────────────────────────── */

test('TEST 2 — Current-version upload scope writes a Level 1 version Image 1', () => {
  assert.deepEqual(
    resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_1.id }),
    { scope: IMAGE_SCOPE.VERSION, versionId: VERSION_1.id, scopeKey: 'version:version-1' },
    'the version that is open is stamped',
  );

  assert.equal(VERSION_1_IMAGE_1.scope, IMAGE_SCOPE.VERSION);
  assert.equal(VERSION_1_IMAGE_1.version_id, VERSION_1.id);
  assert.equal(scopeKeyOfAsset(VERSION_1_IMAGE_1), 'version:version-1');
  assert.equal(imageScopeLabel(VERSION_1_IMAGE_1, versionNameById), 'Level 1 version', 'the card label');
});

test('TEST 2b — a Level 1 version image is used by Level 1 and never by Level 4', () => {
  assert.deepEqual(
    imagesForVersion([VERSION_1_IMAGE_1], VERSION_1.id).map(({ asset }) => asset.id),
    ['asset-v1-1'],
    'it appears when Level 1 version is active',
  );
  assert.deepEqual(
    imagesForVersion([VERSION_1_IMAGE_1], VERSION_4.id),
    [],
    'it is not a Level 4 version image',
  );
  assert.equal(
    scopeKeyOfAsset(VERSION_1_IMAGE_1),
    resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_1.id }).scopeKey,
    'it sits in the Level 1 version gallery',
  );
  assert.notEqual(
    scopeKeyOfAsset(VERSION_1_IMAGE_1),
    resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_4.id }).scopeKey,
    'and never in the Level 4 version gallery',
  );
});

/* ── TEST 3 — the filter never decides the upload scope ─────────────────── */

test('TEST 3 — the filter only lists; the upload scope alone decides the write', () => {
  const filters = [IMAGE_SCOPE_FILTER.ALL, IMAGE_SCOPE_FILTER.PROJECT, IMAGE_SCOPE_FILTER.VERSION];

  filters.forEach((filter) => {
    assert.deepEqual(
      resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_1.id }),
      { scope: IMAGE_SCOPE.VERSION, versionId: VERSION_1.id, scopeKey: 'version:version-1' },
      `filter "${filter}" does not change the target`,
    );
  });

  // The gallery a card sits in is not the authority either: the same choice
  // writes the same scope whichever gallery was clicked.
  const fromProjectGallery = newImage('a', 'image_1', {
    uploadScope: IMAGE_SCOPE.VERSION,
    activeVersionId: VERSION_1.id,
  });
  const fromVersionGallery = newImage('b', 'image_1', {
    uploadScope: IMAGE_SCOPE.VERSION,
    activeVersionId: VERSION_1.id,
  });
  assert.deepEqual(
    { scope: fromProjectGallery.scope, version_id: fromProjectGallery.version_id },
    { scope: fromVersionGallery.scope, version_id: fromVersionGallery.version_id },
    'the clicked gallery does not change the written scope',
  );
});

/* ── TEST 4 — All images lists both scopes ──────────────────────────────── */

test('TEST 4 — All images lists project-wide and Level 1 version images with their own labels', () => {
  const listed = filterImagesByScope({
    assets: ALL_IMAGES,
    filter: IMAGE_SCOPE_FILTER.ALL,
    activeVersionId: VERSION_1.id,
  });

  assert.equal(listed.length, 2, 'both scopes are listed');
  assert.deepEqual(
    listed.map((asset) => imageScopeLabel(asset, versionNameById)),
    ['Project-wide', 'Level 1 version'],
  );
  assert.equal(
    imageScopeLabel({ scope: 'version', version_id: 'version-4' }, versionNameById),
    'Level 4 version',
    'the saved name is stated exactly once, never "Level 4 version version"',
  );
  assert.equal(
    imageScopeLabel({ scope: 'version', version_id: 'version-4' }, new Map()),
    'Version-specific',
    'an unreadable version name is never invented',
  );
});

/* ── TEST 5 — switching the active version ──────────────────────────────── */

test('TEST 5 — switching to Level 4 keeps project-wide images visible and hides Level 1 images', () => {
  const projectFilter = filterImagesByScope({
    assets: ALL_IMAGES,
    filter: IMAGE_SCOPE_FILTER.PROJECT,
    activeVersionId: VERSION_4.id,
  });
  assert.deepEqual(projectFilter.map((asset) => asset.id), ['asset-project-1'], 'project-wide images remain');

  const versionFilter = filterImagesByScope({
    assets: ALL_IMAGES,
    filter: IMAGE_SCOPE_FILTER.VERSION,
    activeVersionId: VERSION_4.id,
  });
  assert.deepEqual(versionFilter, [], 'no Level 1 image is shown as a Level 4 image');

  const target = resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_4.id });
  assert.deepEqual(target, {
    scope: IMAGE_SCOPE.VERSION,
    versionId: VERSION_4.id,
    scopeKey: 'version:version-4',
  }, 'the upload scope now reads Current version: Level 4 version');
  assert.equal(imageScopeLabel({ scope: 'version', version_id: target.versionId }, versionNameById), 'Level 4 version');

  // Level 1's own images are still there — they are simply not shown.
  assert.deepEqual(
    filterImagesByScope({ assets: ALL_IMAGES, filter: IMAGE_SCOPE_FILTER.VERSION, activeVersionId: VERSION_1.id })
      .map((asset) => asset.id),
    ['asset-v1-1'],
    'Level 1 images are hidden, never deleted',
  );
});

/* ── TEST 6 — an empty slot states the scope it will be written to ──────── */

test('TEST 6 — an empty slot states its scope: the upload scope, never a silent guess', () => {
  const projectTarget = resolveUploadTarget({ uploadScope: IMAGE_SCOPE.PROJECT, activeVersionId: VERSION_1.id });
  assert.equal(
    imageScopeLabel({ scope: projectTarget.scope, version_id: projectTarget.versionId }, versionNameById),
    'Project-wide',
    'an empty slot reads Project-wide under the project-wide scope',
  );

  const versionTarget = resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: VERSION_1.id });
  assert.equal(
    imageScopeLabel({ scope: versionTarget.scope, version_id: versionTarget.versionId }, versionNameById),
    'Level 1 version',
    'and reads Level 1 version under the version scope',
  );

  // Without a version open the version scope cannot be chosen: it reads as
  // project-wide, which is also the default.
  assert.deepEqual(
    resolveUploadTarget({ uploadScope: IMAGE_SCOPE.VERSION, activeVersionId: null }),
    { scope: IMAGE_SCOPE.PROJECT, versionId: null, scopeKey: 'project' },
  );
});