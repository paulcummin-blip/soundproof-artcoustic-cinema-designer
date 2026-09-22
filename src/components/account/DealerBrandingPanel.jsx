import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import ImageUploadField from "@/components/proposal/ImageUploadField";

const DEFAULTS = {
  company_name: "",
  dealer_logo_url: null,
  white_logo_url: null,
  hero_background_url: null,
  display_name_override: "",
  tagline: "",
};

const inputClasses =
  "bg-white border border-[#DCDBD6] rounded-md px-3 py-2 text-[#1B1A1A] focus-visible:ring-0 focus-visible:border-[#213428]";
const labelClasses = "text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]";

/**
 * DealerBrandingPanel — form for managing the dealer's hero banner branding.
 * Stores into the BrandAsset entity (one record per account).
 */
export default function DealerBrandingPanel({ accountId }) {
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
      console.error("Failed to load brand assets:", err);
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
      console.error("Failed to save brand assets:", err);
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!accountId) {
    return (
      <div className="py-16 text-center text-[#8A8477] border-t border-[#E5E1D8]">
        Dealer branding is dealer-account-specific. Your admin account does not have dealer branding.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-[#A79E8C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Company Logo */}
      <div className="space-y-2">
        <Label className={labelClasses}>Company Logo</Label>
        <p className="text-xs text-[#8A8477]">
          Shown in the hero banner alongside the Sound Proof logo. Use a transparent PNG for best results.
        </p>
        <ImageUploadField
          label="Company Logo"
          value={form.dealer_logo_url}
          onUpload={(url) => update("dealer_logo_url", url)}
          onRemove={() => update("dealer_logo_url", null)}
          showCaption={false}
        />
      </div>

      {/* White Logo (for dark backgrounds) */}
      <div className="space-y-2">
        <Label className={labelClasses}>White Logo (for dark backgrounds)</Label>
        <p className="text-xs text-[#8A8477]">
          Used when a hero background image is uploaded. Recommended for legibility on dark overlays.
        </p>
        <ImageUploadField
          label="White Logo"
          value={form.white_logo_url}
          onUpload={(url) => update("white_logo_url", url)}
          onRemove={() => update("white_logo_url", null)}
          showCaption={false}
        />
      </div>

      {/* Hero Background Image */}
      <div className="space-y-2">
        <Label className={labelClasses}>Hero Background Image</Label>
        <p className="text-xs text-[#8A8477]">
          Displayed behind the hero banner with a subtle blur and dark overlay. If omitted, a neutral Sound Proof background is used.
        </p>
        <ImageUploadField
          label="Hero Background Image"
          value={form.hero_background_url}
          onUpload={(url) => update("hero_background_url", url)}
          onRemove={() => update("hero_background_url", null)}
          showCaption={false}
        />
      </div>

      {/* Optional Company Display Name Override */}
      <div className="space-y-2">
        <Label className={labelClasses}>Company Display Name (optional)</Label>
        <p className="text-xs text-[#8A8477]">
          Overrides the company name shown in the hero banner. Leave blank to use the company name from your Brand Assets.
        </p>
        <Input
          value={form.display_name_override || ""}
          onChange={(e) => update("display_name_override", e.target.value)}
          className={inputClasses}
          placeholder="e.g. iCubed Home Cinema"
        />
      </div>

      {/* Optional Company Tagline */}
      <div className="space-y-2">
        <Label className={labelClasses}>Company Tagline (optional)</Label>
        <p className="text-xs text-[#8A8477]">
          A short tagline shown beneath the dealer name in the hero banner.
        </p>
        <Input
          value={form.tagline || ""}
          onChange={(e) => update("tagline", e.target.value)}
          className={inputClasses}
          placeholder="e.g. Premium Home Cinema Installation"
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-4 pt-6 border-t border-[#E5E1D8]">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ backgroundColor: "#213428", color: "#FFFFFF" }}
          className="rounded-md px-6 py-2.5 text-xs uppercase tracking-[0.14em] hover:bg-[#3E4349]"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {saving ? "Saving..." : "Save Dealer Branding"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-[#213428]">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}