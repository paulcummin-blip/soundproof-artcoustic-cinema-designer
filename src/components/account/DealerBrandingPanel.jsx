import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import ImageUploadField from "@/components/proposal/ImageUploadField";
import { loadDealerBrand, saveDealerBrand } from "@/components/account/dealerBrandAuthority";
import { LOGO_UPLOAD_CONFIG, HERO_UPLOAD_CONFIG } from "@/components/utils/brandAssetValidation";

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
  const recordRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);

  const load = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const existing = await loadDealerBrand(accountId);
      recordRef.current = existing;
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

  const persist = useCallback((values, failureMessage = "Failed to save dealer branding. Please try again.") => {
    pendingSavesRef.current += 1;
    setSaving(true);

    const operation = saveQueueRef.current.then(async () => {
      const savedRecord = await saveDealerBrand({
        accountId,
        record: recordRef.current,
        values,
      });
      recordRef.current = savedRecord;
      setRecord(savedRecord);
      setForm((previous) => ({ ...previous, ...savedRecord }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      return savedRecord;
    });

    saveQueueRef.current = operation.catch(() => undefined);
    return operation
      .catch((err) => {
        console.error("Failed to save brand assets:", err);
        alert(failureMessage);
        throw err;
      })
      .finally(() => {
        pendingSavesRef.current -= 1;
        if (pendingSavesRef.current === 0) setSaving(false);
      });
  }, [accountId]);

  const updateAndPersist = (field, value) => {
    update(field, value);
    void persist(
      { [field]: value },
      "The image uploaded, but its branding reference could not be saved. Please try again.",
    ).catch(() => undefined);
  };

  const handleSave = () => {
    void persist(form).catch(() => undefined);
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
          SVG (preferred) or transparent PNG. Minimum 1200px wide. Aspect ratio approximately 4:1 to 1:1. No JPG, WebP, or screenshots.
        </p>
        <ImageUploadField
          label="Company Logo"
          value={form.dealer_logo_url}
          onUpload={(url) => updateAndPersist("dealer_logo_url", url)}
          onRemove={() => updateAndPersist("dealer_logo_url", null)}
          showCaption={false}
          accept={LOGO_UPLOAD_CONFIG.accept}
          validate={LOGO_UPLOAD_CONFIG.validate}
        />
      </div>

      {/* White Logo (for dark backgrounds) */}
      <div className="space-y-2">
        <Label className={labelClasses}>White Logo (for dark backgrounds)</Label>
        <p className="text-xs text-[#8A8477]">
          Required for dark hero images. Same standards as the company logo — SVG or transparent PNG, minimum 1200px wide.
        </p>
        <ImageUploadField
          label="White Logo"
          value={form.white_logo_url}
          onUpload={(url) => updateAndPersist("white_logo_url", url)}
          onRemove={() => updateAndPersist("white_logo_url", null)}
          showCaption={false}
          accept={LOGO_UPLOAD_CONFIG.accept}
          validate={LOGO_UPLOAD_CONFIG.validate}
        />
      </div>

      {/* Hero Background Image */}
      <div className="space-y-2">
        <Label className={labelClasses}>Hero Background Image</Label>
        <p className="text-xs text-[#8A8477]">
          JPG or PNG. Minimum 2400×900px, recommended 3200×1200px. Architectural, cinema, interior, or premium residential imagery. No screenshots or images containing text.
        </p>
        <ImageUploadField
          label="Hero Background Image"
          value={form.hero_background_url}
          onUpload={(url) => updateAndPersist("hero_background_url", url)}
          onRemove={() => updateAndPersist("hero_background_url", null)}
          showCaption={false}
          accept={HERO_UPLOAD_CONFIG.accept}
          validate={HERO_UPLOAD_CONFIG.validate}
        />
      </div>

      {/* Optional Company Display Name Override */}
      <div className="space-y-2">
        <Label className={labelClasses}>Company Display Name (optional)</Label>
        <p className="text-xs text-[#8A8477]">
          Shown in the hero banner when no dealer logo is uploaded. Leave blank to use the company name from your Brand Assets.
        </p>
        <Input
          value={form.display_name_override || ""}
          onChange={(e) => update("display_name_override", e.target.value)}
          onBlur={() => void persist({ display_name_override: form.display_name_override }).catch(() => undefined)}
          className={inputClasses}
          placeholder="e.g. iCubed Home Cinema"
        />
      </div>

      {/* Optional Company Tagline */}
      <div className="space-y-2">
        <Label className={labelClasses}>Company Tagline (optional)</Label>
        <p className="text-xs text-[#8A8477]">
          A short tagline for proposals and other dealer materials. Not shown in the hero banner.
        </p>
        <Input
          value={form.tagline || ""}
          onChange={(e) => update("tagline", e.target.value)}
          onBlur={() => void persist({ tagline: form.tagline }).catch(() => undefined)}
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