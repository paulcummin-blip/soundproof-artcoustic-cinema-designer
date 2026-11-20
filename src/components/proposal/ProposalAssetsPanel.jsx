import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ImageOff } from 'lucide-react';
import ImageUploadField from '@/components/proposal/ImageUploadField';
import {
  ASSET_SLOT_OPTIONS,
  isCoverAsset,
  slotAssetType,
  slotNumber,
} from '@/components/proposal/assetSlotAuthority';
import {
  IMAGE_SCOPE,
  IMAGE_SCOPE_FILTER,
  IMAGE_SCOPE_LABEL,
  groupImagesByScope,
  imageScopeLabel,
  resolveScopedSlotAssignments,
  resolveUploadTarget,
} from '@/components/library/imageScopeAuthority';
import ImageScopeBadge from '@/components/library/ImageScopeBadge';
import ImageScopeSelect from '@/components/library/ImageScopeSelect';
import ImageProposalControls from '@/components/library/ImageProposalControls';
import {
  IMAGE_PRESENTATION,
  IMAGE_PURPOSE,
  comparisonGroupsOf,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

/**
 * Project gallery panel — Image 1 to Image 10, labelled sequentially.
 *
 * One image at most is the cover, marked by a "Use as cover" checkbox that sets
 * the existing `usage` field to 'cover'. Selecting another cover automatically
 * releases the previous one; no image is moved, re-uploaded or swapped. Captions
 * explain what each image is, so no image has to be declared as a front view, a
 * plan or a construction shot. Images uploaded under the older labelled model
 * appear in the slot their type maps to (see assetSlotAuthority) and are stamped
 * with that slot the next time they are edited.
 *
 * Props:
 * - projectId: string (null if no active project)
 * - accountId: string (null for admin)
 * - scopeFilter: which gallery is shown — 'all', 'project', or one version's
 *   scope key ('version:<id>'). The gallery shown IS the scope its slots write
 *   to, and every card states that scope, so an image is never written to a
 *   scope that is not on screen.
 * - versions: the project's saved versions — the name authority, and the options
 *   on each stored image's scope choice.
 */
export default function ProposalAssetsPanel({
  projectId,
  accountId,
  activeVersionId = null,
  scopeFilter = IMAGE_SCOPE_FILTER.ALL,
  versions = [],
  versionNameById = new Map(),
}) {
  const [assets, setAssets] = useState([]);
  const [projectName, setProjectName] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [assetResults, projectResults] = await Promise.all([
        base44.entities.ProposalAsset.filter({ project_id: projectId }),
        base44.entities.Project.filter({ id: projectId }),
      ]);
      setAssets(assetResults || []);
      setProjectName(projectResults?.[0]?.name || 'Untitled Project');
    } catch (err) {
      console.error('Failed to load project images:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupImagesByScope(assets), [assets]);

  // The comparison groups this project's images already name, offered as a
  // shortcut on each card so a second image joins the same group by name. Read
  // from the one comparison authority, never re-derived here.
  const comparisonGroupOptions = useMemo(
    () => comparisonGroupsOf(assets).map((group) => group.name),
    [assets],
  );

  // The galleries on screen: the project-wide gallery, and each version's own.
  // Each scope fills its own Cover Image and Image 1 to Image 10, so an image
  // assigned to a version never displaces the project-wide image in that slot.
  // The galleries on screen, from the Library's scope. 'all' lists every gallery
  // the project holds — the project-wide gallery first, then each version that
  // has images of its own. A named scope shows that gallery alone, even while it
  // is still empty, so its slots can be filled.
  const groups = useMemo(() => {
    const list = [];
    const scopedVersionKey = typeof scopeFilter === 'string' && scopeFilter.startsWith('version:')
      ? scopeFilter
      : (scopeFilter === IMAGE_SCOPE_FILTER.VERSION && activeVersionId ? `version:${activeVersionId}` : null);

    if (!scopedVersionKey) {
      list.push({
        key: 'project',
        scope: IMAGE_SCOPE.PROJECT,
        versionId: null,
        label: IMAGE_SCOPE_LABEL[IMAGE_SCOPE.PROJECT],
        assets: grouped.project,
      });
    }

    if (scopedVersionKey) {
      const versionId = scopedVersionKey.slice('version:'.length);
      list.push({
        key: scopedVersionKey,
        scope: IMAGE_SCOPE.VERSION,
        versionId,
        label: imageScopeLabel({ scope: IMAGE_SCOPE.VERSION, version_id: versionId }, versionNameById),
        assets: grouped.versions.find((entry) => entry.versionId === versionId)?.assets || [],
      });
    } else if (scopeFilter !== IMAGE_SCOPE_FILTER.PROJECT) {
      grouped.versions.forEach((entry) => list.push({
        key: `version:${entry.versionId}`,
        scope: IMAGE_SCOPE.VERSION,
        versionId: entry.versionId,
        label: imageScopeLabel({ scope: IMAGE_SCOPE.VERSION, version_id: entry.versionId }, versionNameById),
        assets: entry.assets,
      }));
    }

    return list;
  }, [grouped, scopeFilter, activeVersionId, versionNameById]);

  const assignmentsFor = useCallback(
    (group) => resolveScopedSlotAssignments(assets, group.key),
    [assets],
  );

  const handleUpload = async (group, slot, url) => {
    const existing = assignmentsFor(group).bySlot[slot] || null;
    try {
      if (existing) {
        // Replacing an image keeps the record, its caption, its scope and its identity.
        await base44.entities.ProposalAsset.update(existing.id, {
          file_url: url,
          slot,
          asset_type: slotAssetType(slot),
        });
      } else {
        await base44.entities.ProposalAsset.create({
          project_id: projectId,
          account_id: accountId,
          slot,
          asset_type: slotAssetType(slot),
          file_url: url,
          caption: '',
          order_index: slotNumber(slot) ?? 0,
          category: 'Other',
          proposal_importance: 'Preferred',
          // The scope of the section this card sits in is written, and the card
          // states it — an image can never land in a scope that is not on screen.
          scope: group.scope,
          version_id: group.versionId,
          // Sound Proof default presentation settings for a newly uploaded image.
          // Both remain editable per image afterwards, and a replaced image keeps
          // the settings its record already holds (the replace path never writes
          // these fields), so previously uploaded images are left untouched.
          image_purpose: IMAGE_PURPOSE.WHOLE_ROOM,
          image_presentation: IMAGE_PRESENTATION.FULL_WIDTH,
        });
      }
      await load();
    } catch (err) {
      console.error('Failed to save image:', err);
      alert('Failed to save image. Please try again.');
    }
  };

  const handleRemove = async (group, slot) => {
    const existing = assignmentsFor(group).bySlot[slot] || null;
    if (!existing) return;
    try {
      await base44.entities.ProposalAsset.delete(existing.id);
      await load();
    } catch (err) {
      console.error('Failed to remove image:', err);
    }
  };

  const handleCaption = async (group, slot, caption) => {
    const existing = assignmentsFor(group).bySlot[slot] || null;
    if (!existing) return;
    try {
      // Stamping the slot here is what moves a legacy image onto the simple
      // gallery model — the file, the caption and the record all stay.
      await base44.entities.ProposalAsset.update(existing.id, { caption, slot });
      setAssets((prev) => prev.map((a) => (a.id === existing.id ? { ...a, caption, slot } : a)));
    } catch (err) {
      console.error('Failed to update caption:', err);
    }
  };

  /**
   * Move an image between the project-wide gallery and any saved version's. The
   * file, the caption, the record and the slot all stay as they are: the image
   * only changes which scope it belongs to.
   */
  const handleScopeChange = async (asset, nextScopeKey) => {
    if (!asset?.id) return;
    const target = resolveUploadTarget({ scopeKey: nextScopeKey });
    try {
      await base44.entities.ProposalAsset.update(asset.id, {
        scope: target.scope,
        version_id: target.versionId,
      });
      setAssets((prev) => prev.map((a) => (
        a.id === asset.id ? { ...a, scope: target.scope, version_id: target.versionId } : a
      )));
    } catch (err) {
      console.error('Failed to change image scope:', err);
      alert('Failed to change this image scope. Please try again.');
    }
  };

  /** Whether the proposal's image plan may place this image. */
  const handleUsageChange = async (asset, usage) => {
    if (!asset?.id) return;
    try {
      await base44.entities.ProposalAsset.update(asset.id, { usage });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, usage } : a)));
    } catch (err) {
      console.error('Failed to change image usage:', err);
      alert('Failed to change this image usage. Please try again.');
    }
  };

  /** The seating-style alternative this image stands for, if any. */
  const handleSeatingChange = async (asset, seating_style) => {
    if (!asset?.id) return;
    const value = seating_style || null;
    try {
      await base44.entities.ProposalAsset.update(asset.id, { seating_style: value });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, seating_style: value } : a)));
    } catch (err) {
      console.error('Failed to change the seating option:', err);
      alert('Failed to change this seating option. Please try again.');
    }
  };

  /**
   * How this image is presented in the proposal: the large editorial image, a
   * smaller whole drawing that is never cropped, or a smaller editorial crop.
   * A stored presentation preference only — the file, the caption, the scope,
   * the slot, the seating grouping, the comparison and every engineering value
   * stay exactly as they are.
   */
  const handlePresentationChange = async (asset, value) => {
    if (!asset?.id) return;
    const patch = { image_presentation: value || null };
    try {
      await base44.entities.ProposalAsset.update(asset.id, patch);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
    } catch (err) {
      console.error('Failed to change the image presentation:', err);
      alert('Failed to change this image presentation. Please try again.');
    }
  };

  /**
   * What this image is intended to communicate. The composer reads it to keep
   * the image near the copy it explains, and to know whether it is a drawing that
   * must be shown whole. Editorial context only: nothing about the stored file,
   * the caption, the scope, the seating grouping, the comparison or any
   * engineering value changes.
   */
  const handlePurposeChange = async (asset, value) => {
    if (!asset?.id) return;
    const patch = { image_purpose: value || null };
    try {
      await base44.entities.ProposalAsset.update(asset.id, patch);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
    } catch (err) {
      console.error('Failed to change the image purpose:', err);
      alert('Failed to change this image purpose. Please try again.');
    }
  };

  /**
   * PLACE WITH — the Proposal section an Inline Detail image is composed with. It
   * is the ONLY authority for that image's section: the composer reads this value
   * and infers nothing from the purpose, the product, the file name or the space
   * left on a page. An Inline Detail image with no section stored here is placed
   * nowhere until the designer chooses one.
   */
  const handleSectionTargetChange = async (asset, value) => {
    if (!asset?.id) return;
    const patch = { section_target: value || null };
    try {
      await base44.entities.ProposalAsset.update(asset.id, patch);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
    } catch (err) {
      console.error('Failed to change the image section:', err);
      alert('Failed to change this image’s section. Please try again.');
    }
  };

  /** Which part of the frame this image's crops keep. */
  const handleFocalChange = async (asset, patch) => {
    if (!asset?.id) return;
    try {
      await base44.entities.ProposalAsset.update(asset.id, patch);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
    } catch (err) {
      console.error('Failed to change the focal point:', err);
      alert('Failed to change this focal point. Please try again.');
    }
  };

  /**
   * This image's part in a deliberate comparison: whether it is marked, which
   * group it belongs to, what option it stands for, the group's message and
   * where it reads. Presentation only — the file, the caption, the scope and
   * every engineering value stay exactly as they are.
   */
  const handleComparisonChange = async (asset, patch) => {
    if (!asset?.id) return;
    try {
      await base44.entities.ProposalAsset.update(asset.id, patch);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
    } catch (err) {
      console.error('Failed to change the comparison:', err);
      alert('Failed to change this comparison. Please try again.');
    }
  };

  /**
   * Mark one image as the cover, or clear the cover. Only the existing `usage`
   * field moves: 'cover' marks the cover, 'gallery' releases it. The file, the
   * caption, the scope and the slot all stay exactly as they are, and selecting
   * another cover automatically releases the previous one. Deleting the cover
   * image clears the selection safely — no other image is silently made the
   * cover.
   */
  const handleCoverChange = async (group, asset, makeCover) => {
    if (!asset?.id) return;
    try {
      if (makeCover) {
        const scoped = assignmentsFor(group).assets || [];
        const previousCover = scoped.find((a) => a.id !== asset.id && isCoverAsset(a));
        if (previousCover) {
          await base44.entities.ProposalAsset.update(previousCover.id, { usage: 'gallery' });
        }
        await base44.entities.ProposalAsset.update(asset.id, { usage: 'cover' });
      } else {
        await base44.entities.ProposalAsset.update(asset.id, { usage: 'gallery' });
      }
      await load();
    } catch (err) {
      console.error('Failed to change the cover image:', err);
      alert('Failed to change the cover image. Please try again.');
    }
  };

  if (!projectId) {
    return (
      <div className="p-8 text-center bg-white border border-[#DCDBD6] rounded-lg">
        <ImageOff className="w-8 h-8 text-[#625143] mx-auto mb-3" />
        <p className="text-[#625143]">
          No active project selected. Open a project from the Projects page first.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#DCDBD6] rounded-lg p-4">
        <div className="text-xs font-semibold text-[#625143] uppercase tracking-wide">Active Project</div>
        <div className="text-lg font-bold text-[#213428] mt-1" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
          {projectName}
        </div>
      </div>

      {groups.map((group) => {
        const { bySlot, surplus, assets: scopedAssets } = assignmentsFor(group);
        return (
          <section key={group.key} className="space-y-4" data-image-group={group.key}>
            {/* The section states, in the saved version's own words, what its
                slots are used by. */}
            <div className="border-t border-[#E5E1D8] pt-6">
              <div className="flex items-baseline justify-between gap-4">
                <h3
                  className="text-[13px] uppercase tracking-[0.16em] text-[#625143]"
                  style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                >
                  {group.label}
                </h3>
                <span className="text-xs text-[#8A8477]">
                  {scopedAssets.length} {scopedAssets.length === 1 ? 'image' : 'images'}
                </span>
              </div>
              <p className="text-xs text-[#8A8477] mt-1" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                {group.scope === IMAGE_SCOPE.VERSION
                  ? `Images in this section are used by ${group.label} only.`
                  : 'Images in this section are used by every design version.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ASSET_SLOT_OPTIONS.map(({ slot, label }) => {
                const existing = bySlot[slot] || null;
                return (
                  <div key={slot} className="bg-white border border-[#DCDBD6] rounded-lg p-4">
                    <ImageUploadField
                      label={label}
                      value={existing?.file_url || null}
                      onUpload={(url) => handleUpload(group, slot, url)}
                      onRemove={() => handleRemove(group, slot)}
                      caption={existing?.caption || ''}
                      onCaptionChange={(cap) => handleCaption(group, slot, cap)}
                    />
                    {/* Every card states its scope: a filled card the scope the
                        image is used by, an empty slot the scope a new upload
                        will be written to. */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFECE4] pt-3">
                      {existing ? (
                        <>
                          <ImageScopeBadge asset={existing} versionNameById={versionNameById} />
                          <ImageScopeSelect
                            asset={existing}
                            versions={versions}
                            activeVersionId={activeVersionId}
                            onChange={(nextScopeKey) => handleScopeChange(existing, nextScopeKey)}
                          />
                        </>
                      ) : (
                        <>
                          <span
                            className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]"
                            style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                          >
                            New upload
                          </span>
                          <ImageScopeBadge
                            asset={{ scope: group.scope, version_id: group.versionId }}
                            versionNameById={versionNameById}
                          />
                        </>
                      )}
                    </div>

                    {/* The proposal-side choices for this one image: whether it
                        may be placed, as what, and how its crop is framed. */}
                    {existing && (
                      <ImageProposalControls
                        asset={existing}
                        isCover={isCoverAsset(existing)}
                        comparisonGroupOptions={comparisonGroupOptions}
                        onUsageChange={(usage) => handleUsageChange(existing, usage)}
                        onSeatingChange={(value) => handleSeatingChange(existing, value)}
                        onPresentationChange={(value) => handlePresentationChange(existing, value)}
                        onPurposeChange={(value) => handlePurposeChange(existing, value)}
                        onSectionTargetChange={(value) => handleSectionTargetChange(existing, value)}
                        onFocalChange={(patch) => handleFocalChange(existing, patch)}
                        onComparisonChange={(patch) => handleComparisonChange(existing, patch)}
                        onCoverChange={(makeCover) => handleCoverChange(group, existing, makeCover)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {surplus.length > 0 && (
              <p className="text-xs text-[#625143]">
                {surplus.length} further stored {surplus.length === 1 ? 'image is' : 'images are'} not shown in
                these ten slots. They are kept safe and are not deleted — remove an image above to free a slot.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}