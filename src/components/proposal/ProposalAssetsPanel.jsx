import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ImageOff } from 'lucide-react';
import ImageUploadField from '@/components/proposal/ImageUploadField';
import {
  ASSET_SLOT_OPTIONS,
  resolveSlotAssignments,
  slotAssetType,
  slotNumber,
} from '@/components/proposal/assetSlotAuthority';

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
export default function ProposalAssetsPanel({ projectId, accountId }) {
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

  const { bySlot, surplus } = useMemo(() => resolveSlotAssignments(assets), [assets]);
  const assetForSlot = (slot) => bySlot[slot] || null;

  const handleUpload = async (slot, url) => {
    const existing = assetForSlot(slot);
    try {
      if (existing) {
        // Replacing an image keeps the record, its caption and its identity.
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
        });
      }
      await load();
    } catch (err) {
      console.error('Failed to save image:', err);
      alert('Failed to save image. Please try again.');
    }
  };

  const handleRemove = async (slot) => {
    const existing = assetForSlot(slot);
    if (!existing) return;
    try {
      await base44.entities.ProposalAsset.delete(existing.id);
      await load();
    } catch (err) {
      console.error('Failed to remove image:', err);
    }
  };

  const handleCaption = async (slot, caption) => {
    const existing = assetForSlot(slot);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ASSET_SLOT_OPTIONS.map(({ slot, label }) => {
          const existing = assetForSlot(slot);
          return (
            <div key={slot} className="bg-white border border-[#DCDBD6] rounded-lg p-4">
              <ImageUploadField
                label={label}
                value={existing?.file_url || null}
                onUpload={(url) => handleUpload(slot, url)}
                onRemove={() => handleRemove(slot)}
                caption={existing?.caption || ''}
                onCaptionChange={(cap) => handleCaption(slot, cap)}
              />
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
    </div>
  );
}