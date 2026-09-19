import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import ImageUploadField from '@/components/proposal/ImageUploadField';
import ColourField from '@/components/proposal/ColourField';

const DEFAULTS = {
  company_name: '',
  dealer_logo_url: null,
  white_logo_url: null,
  address: '',
  telephone: '',
  email: '',
  website: '',
  about_us: '',
  why_choose_us: '',
  warranty: '',
  terms_conditions: '',
  primary_colour: '#213428',
  secondary_colour: '#3E4349',
  accent_colour: '#625143',
};

/**
 * Brand Assets panel — global to the dealer account.
 * Loads the single BrandAsset record for the account (if any),
 * or creates one on first save. All fields are editable.
 *
 * Props:
 * - accountId: string (null for admin users)
 */
export default function BrandAssetsPanel({ accountId }) {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await base44.entities.BrandAsset.filter({ account_id: accountId });
      const existing = Array.isArray(results) && results.length > 0 ? results[0] : null;
      setRecord(existing);
      setForm({ ...DEFAULTS, ...existing });
    } catch (err) {
      console.error('Failed to load brand assets:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, account_id: accountId };
      if (record) {
        const updated = await base44.entities.BrandAsset.update(record.id, payload);
        setRecord(updated);
      } else {
        const created = await base44.entities.BrandAsset.create(payload);
        setRecord(created);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save brand assets:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!accountId) {
    return (
      <div className="p-8 text-center text-[#625143] bg-white border border-[#DCDBD6] rounded-lg">
        Brand assets are dealer-account-specific. Your admin account does not have brand assets.
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
    <div className="space-y-6 bg-white border border-[#DCDBD6] rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">Company Name</Label>
          <Input
            value={form.company_name}
            onChange={(e) => update('company_name', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            placeholder="e.g. Artcoustic UK"
          />
        </div>

        <ImageUploadField
          label="Dealer Logo"
          value={form.dealer_logo_url}
          onUpload={(url) => update('dealer_logo_url', url)}
          onRemove={() => update('dealer_logo_url', null)}
          showCaption={false}
        />
        <ImageUploadField
          label="White Logo (for dark backgrounds)"
          value={form.white_logo_url}
          onUpload={(url) => update('white_logo_url', url)}
          onRemove={() => update('white_logo_url', null)}
          showCaption={false}
        />

        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">Address</Label>
          <Textarea
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            rows={2}
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-[#3E4349]">Telephone</Label>
          <Input
            value={form.telephone}
            onChange={(e) => update('telephone', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
          />
        </div>
        <div>
          <Label className="text-sm font-medium text-[#3E4349]">Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
          />
        </div>
        <div>
          <Label className="text-sm font-medium text-[#3E4349]">Website</Label>
          <Input
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            placeholder="https://..."
          />
        </div>

        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">About Us</Label>
          <Textarea
            value={form.about_us}
            onChange={(e) => update('about_us', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            rows={4}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">Why Choose Us</Label>
          <Textarea
            value={form.why_choose_us}
            onChange={(e) => update('why_choose_us', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            rows={4}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">Warranty</Label>
          <Textarea
            value={form.warranty}
            onChange={(e) => update('warranty', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            rows={3}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-sm font-medium text-[#3E4349]">Terms & Conditions</Label>
          <Textarea
            value={form.terms_conditions}
            onChange={(e) => update('terms_conditions', e.target.value)}
            className="bg-white border-[#DCDBD6] text-[#1B1A1A] mt-1"
            rows={4}
          />
        </div>

        <ColourField
          label="Primary Colour"
          value={form.primary_colour}
          onChange={(hex) => update('primary_colour', hex)}
        />
        <ColourField
          label="Secondary Colour"
          value={form.secondary_colour}
          onChange={(hex) => update('secondary_colour', hex)}
        />
        <ColourField
          label="Accent Colour"
          value={form.accent_colour}
          onChange={(hex) => update('accent_colour', hex)}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ backgroundColor: '#213428', color: '#FFFFFF' }}
          className="hover:bg-[#3E4349]"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Saving...' : 'Save Brand Assets'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}