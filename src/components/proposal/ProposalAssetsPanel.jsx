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
  groupImagesByScope,
  imageScopeLabel,
  resolveScopedSlotAssignments,
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
 */
export default function ProposalAssetsPanel({
  projectId,
  accountId,
  activeVersionId = null,
  scopeFilter = IMAGE_SCOPE_FILTER.ALL,
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
  const groups = useMemo(() => {
    const list = [];
    if (scopeFilter !== IMAGE_SCOPE_FILTER.VERSION) {
      list.push({
        key: 'project',
        scope: IMAGE_SCOPE.PROJECT,
        versionId: null,
        label: 'Project-wide',
        assets: grouped.project,
      });
    }

    if (scopeFilter !== IMAGE_SCOPE_FILTER.PROJECT) {
      const targets = scopeFilter === IMAGE_SCOPE_FILTER.VERSION
        ? grouped.versions.filter((entry) => entry.versionId === activeVersionId)
        : grouped.versions;
      // In the current-version view the version's gallery is shown even while it
      // is empty, so an image can be uploaded into it.
      if (scopeFilter === IMAGE_SCOPE_FILTER.VERSION && activeVersionId && targets.length === 0) {
        targets.push({ versionId: activeVersionId, assets: [] });
      }
      targets.forEach((entry) => list.push({
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
          scope: group.scope,
          version_id: group.scope === IMAGE_SCOPE.VERSION ? group.versionId : null,
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
   * Move an image between the project-wide gallery and the current version's.
   * The file, the caption, the record and the slot all stay as they are: the
   * image only changes which scope it belongs to.
   */
  const handleScopeChange = async (asset, nextScope) => {
    if (!asset?.id) return;
    const versionId = nextScope === IMAGE_SCOPE.VERSION ? activeVersionId : null;
    if (nextScope === IMAGE_SCOPE.VERSION && !versionId) return;
    try {
      await base44.entities.ProposalAsset.update(asset.id, {
        scope: nextScope,
        version_id: versionId,
      });
      setAssets((prev) => prev.map((a) => (
        a.id === asset.id ? { ...a, scope: nextScope, version_id: versionId } : a
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
            {groups.length > 1 && (
              <div className="flex items-baseline justify-between gap-4 border-t border-[#E5E1D8] pt-6">
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
            )}

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
                    {existing && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFECE4] pt-3">
                        <ImageScopeBadge asset={existing} versionNameById={versionNameById} />
                        <ImageScopeSelect
                          asset={existing}
                          activeVersionId={activeVersionId}
                          activeVersionName={versionNameById.get(activeVersionId) || null}
                          onChange={(nextScope) => handleScopeChange(existing, nextScope)}
                        />
                      </div>
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