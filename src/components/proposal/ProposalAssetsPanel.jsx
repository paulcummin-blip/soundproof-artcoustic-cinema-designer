import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Upload, ImageOff } from 'lucide-react';
import ImageUploadField from '@/components/proposal/ImageUploadField';
import GalleryDragList from '@/components/proposal/GalleryDragList';

const SINGLE_ASSET_TYPES = [
  { value: 'hero_render', label: 'Hero Render' },
  { value: 'front_view', label: 'Front View' },
  { value: 'rear_view', label: 'Rear View' },
  { value: 'plan', label: 'Plan' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'construction', label: 'Construction' },
];

/**
 * Proposal Assets panel — per-project visual assets for proposals.
 * Supports single-image asset types (hero render, front/rear views, etc.)
 * and a drag-orderable gallery.
 *
 * Props:
 * - projectId: string (null if no active project)
 * - accountId: string (null for admin)
 */
export default function ProposalAssetsPanel({ projectId, accountId }) {
  const [assets, setAssets] = useState([]);
  const [projectName, setProjectName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryInputRef = React.useRef(null);

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
      console.error('Failed to load proposal assets:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const getSingle = (type) => assets.find((a) => a.asset_type === type) || null;
  const getGallery = () =>
    assets
      .filter((a) => a.asset_type === 'gallery')
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  // ── Single asset handlers ──
  const handleSingleUpload = async (type, url) => {
    const existing = getSingle(type);
    try {
      if (existing) {
        await base44.entities.ProposalAsset.update(existing.id, { file_url: url });
      } else {
        await base44.entities.ProposalAsset.create({
          project_id: projectId,
          account_id: accountId,
          asset_type: type,
          file_url: url,
          caption: '',
          order_index: 0,
        });
      }
      await load();
    } catch (err) {
      console.error('Failed to save asset:', err);
      alert('Failed to save asset. Please try again.');
    }
  };

  const handleSingleRemove = async (type) => {
    const existing = getSingle(type);
    if (!existing) return;
    try {
      await base44.entities.ProposalAsset.delete(existing.id);
      await load();
    } catch (err) {
      console.error('Failed to remove asset:', err);
    }
  };

  const handleSingleCaption = async (type, caption) => {
    const existing = getSingle(type);
    if (!existing) return;
    try {
      await base44.entities.ProposalAsset.update(existing.id, { caption });
      await load();
    } catch (err) {
      console.error('Failed to update caption:', err);
    }
  };

  // ── Gallery handlers ──
  const handleGalleryUpload = async (file) => {
    if (!file) return;
    setGalleryUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      const gallery = getGallery();
      const nextIndex = gallery.length > 0 ? Math.max(...gallery.map((g) => g.order_index || 0)) + 1 : 0;
      await base44.entities.ProposalAsset.create({
        project_id: projectId,
        account_id: accountId,
        asset_type: 'gallery',
        file_url,
        caption: '',
        order_index: nextIndex,
      });
      await load();
    } catch (err) {
      console.error('Gallery upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setGalleryUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleGalleryReorder = async (reorderedItems) => {
    // Optimistic update
    setAssets((prev) => {
      const nonGallery = prev.filter((a) => a.asset_type !== 'gallery');
      return [...nonGallery, ...reorderedItems.map((item, i) => ({ ...item, order_index: i }))];
    });
    try {
      await base44.entities.ProposalAsset.bulkUpdate(
        reorderedItems.map((item, i) => ({ id: item.id, order_index: i }))
      );
    } catch (err) {
      console.error('Failed to reorder gallery:', err);
      await load();
    }
  };

  const handleGalleryCaption = async (id, caption) => {
    try {
      await base44.entities.ProposalAsset.update(id, { caption });
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, caption } : a)));
    } catch (err) {
      console.error('Failed to update caption:', err);
    }
  };

  const handleGalleryDelete = async (id) => {
    try {
      await base44.entities.ProposalAsset.delete(id);
      await load();
    } catch (err) {
      console.error('Failed to delete gallery image:', err);
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

  const galleryItems = getGallery();

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#DCDBD6] rounded-lg p-4">
        <div className="text-xs font-semibold text-[#625143] uppercase tracking-wide">Active Project</div>
        <div className="text-lg font-bold text-[#213428] mt-1" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
          {projectName}
        </div>
      </div>

      {/* Single-asset grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SINGLE_ASSET_TYPES.map((type) => {
          const existing = getSingle(type.value);
          return (
            <div key={type.value} className="bg-white border border-[#DCDBD6] rounded-lg p-4">
              <ImageUploadField
                label={type.label}
                value={existing?.file_url || null}
                onUpload={(url) => handleSingleUpload(type.value, url)}
                onRemove={() => handleSingleRemove(type.value)}
                caption={existing?.caption || ''}
                onCaptionChange={(cap) => handleSingleCaption(type.value, cap)}
              />
            </div>
          );
        })}
      </div>

      {/* Gallery section */}
      <div className="bg-white border border-[#DCDBD6] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#3E4349]">Gallery Images</h3>
          <button
            type="button"
            onClick={() => !galleryUploading && galleryInputRef.current?.click()}
            disabled={galleryUploading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-[#DCDBD6] text-[#3E4349] hover:bg-[#F5F4F0] transition-colors disabled:opacity-50"
          >
            {galleryUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Add Image
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files[0] && handleGalleryUpload(e.target.files[0])}
          />
        </div>
        {galleryItems.length === 0 ? (
          <p className="text-sm text-[#625143] text-center py-6">No gallery images yet. Click "Add Image" to upload.</p>
        ) : (
          <GalleryDragList
            items={galleryItems}
            onReorder={handleGalleryReorder}
            onCaptionChange={handleGalleryCaption}
            onDelete={handleGalleryDelete}
          />
        )}
      </div>
    </div>
  );
}