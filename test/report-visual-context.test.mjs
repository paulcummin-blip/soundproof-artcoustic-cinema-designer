/**
 * report-visual-context.test.mjs
 * ------------------------------
 * STAGE 2 — IMAGE SELECTION, proven on the real Project Library records the app
 * holds today, with no AI call anywhere in this file.
 *
 * The fixtures below are the actual ProposalAsset rows read from this app's
 * database, verbatim: Genesis AV and Marquee Home, both scopes and both asset
 * generations. Barton Solutions has no images at all, which is also a case that
 * must behave: the text-only writing path continues normally.
 *
 * What is being proved:
 *   - whole-room views are chosen first, and alternatives are never mistaken for
 *     the selected design;
 *   - the designer's own hidden-from-document flag is respected;
 *   - plans and dimensioned drawings are left out of the initial visual context;
 *   - an image belonging to another version is never used for this one;
 *   - between two and four images are chosen where that many are available;
 *   - a picture is identified by its record and its file, NEVER by its storage
 *     URL, so a re-signed link cannot move the identity and replacing the file
 *     does;
 *   - the block the writer reads states what the images may and may not be used
 *     for, and carries no address.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_VISUAL_IMAGES,
  REPORT_VISUAL_CONTEXT_VERSION,
  VISUAL_CONTEXT_RULE,
  VISUAL_EXCLUSION,
  VISUAL_NEVER_RULE,
  VISUAL_REFUSAL,
  buildReportVisualContext,
  selectVisualImages,
  visualContextSources,
  visualFileName,
  visualImageIdentity,
  writerVisualBlock,
} from '../base44/shared/reportDesignIntent/reportVisualContext.js';
// The frontend reaches the SAME authority through the root `shared/` re-export and
// the src adapter. Reading all three here proves they resolve to one implementation.
import * as viaRootShared from '../shared/reportDesignIntent/reportVisualContext.js';
import * as viaSrcAdapter from '../src/shared/reportVisualContext.js';
import { assertWriterInputCarriesNoLiveState } from '../base44/shared/proposalWriter/writerPromptBuilder.js';

const APP = 'https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b';

/** Genesis AV — as stored today: three whole-room views and four seating options. */
const GENESIS_ASSETS = [
  { id: 'g-cover', slot: 'cover', asset_type: 'cover_image', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/704681f3e_Image21.png` },
  { id: 'g-i1', slot: 'image_1', asset_type: 'gallery', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/0f8e408f5_Image.png` },
  { id: 'g-i2', slot: 'image_2', asset_type: 'gallery', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/ce1af49e2_Image3.png` },
  { id: 'g-i3', slot: 'image_3', asset_type: 'gallery', image_purpose: 'seating_option', scope: 'project', usage: 'gallery', file_url: `${APP}/1bb41c1d9_Image6.png` },
  { id: 'g-i4', slot: 'image_4', asset_type: 'gallery', image_purpose: 'seating_option', scope: 'project', usage: 'gallery', file_url: `${APP}/f2d9994aa_Image9.png` },
  { id: 'g-i5', slot: 'image_5', asset_type: 'gallery', image_purpose: 'seating_option', scope: 'project', usage: 'gallery', file_url: `${APP}/665031271_Screenshot2026-10-13at150716.png` },
  { id: 'g-i6', slot: 'image_6', asset_type: 'gallery', image_purpose: 'seating_option', scope: 'project', usage: 'gallery', file_url: `${APP}/180fea68d_Screenshot2026-10-13at151515.png` },
];

/** Marquee Home — three whole-room views, one dimensioned drawing, plus legacy rows. */
const MARQUEE_ASSETS = [
  { id: 'm-cover', slot: 'cover', asset_type: 'cover_image', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/e8fb60992_CinematicWarmMinimalistMediaLounge.png` },
  { id: 'm-i1', slot: 'image_1', asset_type: 'gallery', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/e5aabe09b_Image3.png` },
  { id: 'm-i2', slot: 'image_2', asset_type: 'gallery', image_purpose: 'whole_room', scope: 'project', usage: 'gallery', file_url: `${APP}/a4e806601_WarmCinematicLivingRoomRetreat.png` },
  { id: 'm-i3', slot: 'image_3', asset_type: 'gallery', image_purpose: 'layout_drawing', scope: 'project', usage: 'gallery', file_url: `${APP}/b301109b7_Screenshot2026-10-14at124659.png` },
  // Uploaded under the previous model: no purpose, no scope, no slot.
  { id: 'm-leg-cover', asset_type: 'cover_image', usage: 'gallery', file_url: `${APP}/aa7b64e2e_Image2.png` },
  { id: 'm-leg-front', asset_type: 'front_view', usage: 'gallery', file_url: `${APP}/40bfaf878_Image2.png` },
  { id: 'm-leg-rear', asset_type: 'rear_view', usage: 'gallery', file_url: `${APP}/311792f54_Image1.png` },
  { id: 'm-leg-i3', slot: 'image_3', asset_type: 'gallery', usage: 'gallery', file_url: `${APP}/cb3336686_FinalOption6.png` },
];

const idsOf = (context) => context.images.map((image) => image.id);
const reasonFor = (context, id) => context.rejected.find((row) => row.id === id)?.reason;

describe('Stage 2 — Project Library image selection', () => {
  it('one authority, reachable from the server path, the root shared path and the src adapter', () => {
    expect(viaRootShared.REPORT_VISUAL_CONTEXT_VERSION).toBe(REPORT_VISUAL_CONTEXT_VERSION);
    expect(viaSrcAdapter.REPORT_VISUAL_CONTEXT_VERSION).toBe(REPORT_VISUAL_CONTEXT_VERSION);
    expect(viaSrcAdapter.buildReportVisualContext).toBe(buildReportVisualContext);
  });

  it('chooses the whole-room views of Genesis and never an offered seating option', () => {
    const context = buildReportVisualContext({ assets: GENESIS_ASSETS, versionId: 'v1' });

    console.log('[visual] Genesis', JSON.stringify({
      available: context.available,
      chosen: idsOf(context),
      roles: context.images.map((image) => image.role),
      rejected: context.rejected,
      fingerprint: context.fingerprint,
    }));

    expect(context.version).toBe(REPORT_VISUAL_CONTEXT_VERSION);
    expect(context.available).toBe(true);
    expect(idsOf(context)).toEqual(['g-cover', 'g-i1', 'g-i2']);
    expect(context.images.map((image) => image.role)).toEqual(['whole_room', 'whole_room', 'whole_room']);
    // Nothing else was silently dropped: every remaining image is stated as rejected,
    // and every one of them for the same honest reason.
    expect(context.rejected).toHaveLength(4);
    for (const id of ['g-i3', 'g-i4', 'g-i5', 'g-i6']) {
      expect(reasonFor(context, id)).toBe(VISUAL_EXCLUSION.SEATING_OPTION);
    }
  });

  it('chooses whole-room views for Marquee, leaves out the dimensioned drawing, and caps at four', () => {
    const context = buildReportVisualContext({ assets: MARQUEE_ASSETS, versionId: 'v1' });

    console.log('[visual] Marquee', JSON.stringify({
      available: context.available,
      chosen: idsOf(context),
      roles: context.images.map((image) => image.role),
      rejected: context.rejected,
      fingerprint: context.fingerprint,
    }));

    expect(context.available).toBe(true);
    expect(context.images.length).toBe(MAX_VISUAL_IMAGES);
    // The cover leads, then the gallery slots in order, then a legacy room view.
    expect(idsOf(context).slice(0, 3)).toEqual(['m-cover', 'm-i1', 'm-i2']);
    expect(reasonFor(context, 'm-i3')).toBe(VISUAL_EXCLUSION.TECHNICAL_DRAWING);
    // A legacy record with no purpose is read by what it was uploaded as: a room view.
    expect(context.images.every((image) => image.role === 'whole_room' || image.role === 'other')).toBe(true);
  });

  it('states that Barton Solutions has no images, and offers no context at all', () => {
    const context = buildReportVisualContext({ assets: [], versionId: 'v1' });
    expect(context.available).toBe(false);
    expect(context.reason).toBe(VISUAL_REFUSAL.NO_IMAGES);
    expect(context.images).toEqual([]);
    expect(context.fingerprint).toBeNull();
    expect(writerVisualBlock(context)).toBeNull();
    expect(visualContextSources(context)).toEqual([]);
  });

  it('respects the designer hiding an image, and offers nothing rather than a wrong room', () => {
    const hidden = GENESIS_ASSETS.map((asset) => ({ ...asset, usage: 'do_not_use' }));
    const hiddenAll = buildReportVisualContext({ assets: hidden, versionId: 'v1' });
    expect(hiddenAll.available).toBe(false);
    expect(hiddenAll.reason).toBe(VISUAL_REFUSAL.NO_ELIGIBLE_IMAGES);
    expect(hiddenAll.rejected).toHaveLength(GENESIS_ASSETS.length);
    expect(hiddenAll.rejected.every((row) => row.reason === VISUAL_EXCLUSION.HIDDEN)).toBe(true);

    // Hiding the cover alone simply promotes the next whole-room view.
    const oneHidden = buildReportVisualContext({
      assets: GENESIS_ASSETS.map((asset) => (asset.id === 'g-cover' ? { ...asset, usage: 'do_not_use' } : asset)),
      versionId: 'v1',
    });
    expect(oneHidden.available).toBe(true);
    expect(idsOf(oneHidden)).toEqual(['g-i1', 'g-i2']);
  });

  it('never presents a comparison option as the selected design', () => {
    const asOptions = GENESIS_ASSETS.map((asset) => (
      asset.image_purpose === 'whole_room' ? { ...asset, comparison_enabled: true } : asset
    ));
    const context = buildReportVisualContext({ assets: asOptions, versionId: 'v1' });
    expect(context.available).toBe(false);
    expect(reasonFor(context, 'g-cover')).toBe(VISUAL_EXCLUSION.COMPARISON_OPTION);
  });

  it('uses an image for this version only, and never another version’s', () => {
    const shared = { ...GENESIS_ASSETS[1] };
    const mine = { ...GENESIS_ASSETS[0], id: 'g-v1', scope: 'version', version_id: 'v1' };
    const theirs = { ...GENESIS_ASSETS[2], id: 'g-v2', scope: 'version', version_id: 'v2' };

    const forV1 = buildReportVisualContext({ assets: [shared, mine, theirs], versionId: 'v1' });
    expect(idsOf(forV1)).toContain('g-v1');
    expect(idsOf(forV1)).not.toContain('g-v2');
    expect(reasonFor(forV1, 'g-v2')).toBe(VISUAL_EXCLUSION.OTHER_VERSION);

    const forV2 = buildReportVisualContext({ assets: [shared, mine, theirs], versionId: 'v2' });
    expect(idsOf(forV2)).toContain('g-v2');
    expect(idsOf(forV2)).not.toContain('g-v1');
  });

  it('identifies a picture by its record and its file, never by a storage URL', () => {
    const context = buildReportVisualContext({ assets: GENESIS_ASSETS, versionId: 'v1' });

    // The fetch address travels for the call only, and is nowhere in the identity.
    expect(visualContextSources(context)).toHaveLength(3);
    expect(visualContextSources(context)[0]).toContain('http');
    const identityText = JSON.stringify(context.images.map((image) => image.identity));
    expect(identityText).not.toContain('http');
    expect(JSON.stringify(context.fingerprint)).not.toContain('http');
    expect(context.fingerprint).toMatch(/^vc1-/);
    // The file's own name IS part of the identity: it changes when the picture is replaced.
    expect(context.images[0].identity.file).toBe('704681f3e_Image21.png');
    expect(visualFileName(`${APP}/a_b.png?sig=xyz#frag`)).toBe('a_b.png');
    expect(visualFileName(null)).toBeNull();

    // A re-signed or re-hosted URL, same picture: the identity does not move.
    const resigned = buildReportVisualContext({
      assets: GENESIS_ASSETS.map((asset) => ({
        ...asset,
        file_url: asset.file_url.replace('https://base44.app', 'https://cdn.example.test').concat('?sig=2026'),
      })),
      versionId: 'v1',
    });
    expect(resigned.fingerprint).toBe(context.fingerprint);

    // The picture itself replaced: the identity moves.
    const replaced = buildReportVisualContext({
      assets: GENESIS_ASSETS.map((asset) => (
        asset.id === 'g-cover' ? { ...asset, file_url: `${APP}/999999999_Image21.png` } : asset
      )),
      versionId: 'v1',
    });
    expect(replaced.fingerprint).not.toBe(context.fingerprint);

    // A caption rewritten: the description of the picture has changed.
    const recaptioned = buildReportVisualContext({
      assets: GENESIS_ASSETS.map((asset) => (
        asset.id === 'g-i1' ? { ...asset, caption: 'The room as the client first sees it' } : asset
      )),
      versionId: 'v1',
    });
    expect(recaptioned.fingerprint).not.toBe(context.fingerprint);

    // A different design's pictures: a different identity, never the same one.
    const other = buildReportVisualContext({ assets: MARQUEE_ASSETS, versionId: 'v1' });
    expect(other.fingerprint).not.toBe(context.fingerprint);
  });

  it('gives the writer the images as context, never as evidence, and gives it no address', () => {
    const context = buildReportVisualContext({ assets: GENESIS_ASSETS, versionId: 'v1' });
    const block = writerVisualBlock(context);

    console.log('[visual] writer block', JSON.stringify(block));

    expect(block.rule).toBe(VISUAL_CONTEXT_RULE);
    expect(block.never).toBe(VISUAL_NEVER_RULE);
    expect(block.image_count).toBe(3);
    expect(block.fingerprint).toBe(context.fingerprint);
    expect(block.images).toEqual([
      { role: 'whole_room', caption: null },
      { role: 'whole_room', caption: null },
      { role: 'whole_room', caption: null },
    ]);
    // No address, no file name, no id: the writer reads what each picture is FOR.
    const text = JSON.stringify(block);
    expect(text).not.toContain('http');
    expect(text).not.toContain('base44.app');
    expect(Object.keys(block).sort()).toEqual([
      'available', 'fingerprint', 'image_count', 'images', 'never', 'rule', 'selection', 'writing',
    ]);

    // And the block survives the writer input's own live-state guard, which exists to
    // stop live design state reaching a draft.
    expect(() => assertWriterInputCarriesNoLiveState({ design_visual_context: block })).not.toThrow();
  });

  it('audits every image it considered, so a selection can always be read back', () => {
    const { images, considered, eligible_count } = selectVisualImages(GENESIS_ASSETS, { versionId: 'v1' });
    expect(images).toHaveLength(3);
    expect(eligible_count).toBe(3);
    expect(considered).toHaveLength(GENESIS_ASSETS.length);
    expect(considered.filter((row) => row.eligible)).toHaveLength(3);
    expect(considered.filter((row) => !row.eligible).every((row) => row.reason === VISUAL_EXCLUSION.SEATING_OPTION)).toBe(true);
  });
});