import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ImageOff } from 'lucide-react';
import ImageUploadField from '@/components/proposal/ImageUploadField';
import {
  ASSET_SLOT_OPTIONS,
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

/**
 * Project gallery panel — one Cover Image plus Image 1 to Image 10.
 *
 * Captions explain what each image is, so no image has to be declared as a front
 * view, a plan or a construction shot. Images uploaded under the older labelled
 * model appear in the slot their type maps to (see assetSlotAuthority) and are
 * stamped with that slot the next time they are edited.
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