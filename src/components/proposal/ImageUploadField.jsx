import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2 } from 'lucide-react';

/**
 * Reusable image upload field with preview, remove, and optional caption.
 * Used for brand logos and single-asset proposal images.
 *
 * Props:
 * - label: string
 * - value: string (current file_url or null)
 * - onUpload: (url) => void
 * - onRemove: () => void
 * - caption: string (optional)
 * - onCaptionChange: (value) => void (optional, fires on blur)
 * - showCaption: boolean (default true)
 */
export default function ImageUploadField({
  label,
  value,
  onUpload,
  onRemove,
  caption,
  onCaptionChange,
  showCaption = true,
}) {
  const [uploading, setUploading] = useState(false);
  const [localCaption, setLocalCaption] = useState(caption || '');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setLocalCaption(caption || '');
  }, [caption]);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      onUpload(file_url);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[#3E4349]">{label}</Label>
      {value ? (
        <div className="space-y-2">
          <div className="relative group">
            <img
              src={value}
              alt={label}
              className="w-full h-40 object-contain rounded-lg border border-[#DCDBD6] bg-[#F5F4F0]"
            />
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {showCaption && onCaptionChange && (
            <Input
              value={localCaption}
              onChange={(e) => setLocalCaption(e.target.value)}
              onBlur={() => onCaptionChange(localCaption)}
              placeholder="Caption..."
              className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
            />
          )}
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-[#DCDBD6] rounded-lg cursor-pointer hover:border-[#213428] hover:bg-[#F5F4F0] transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
          ) : (
            <>
              <Upload className="w-6 h-6 text-[#625143] mb-2" />
              <span className="text-sm text-[#625143]">Click to upload</span>
            </>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}