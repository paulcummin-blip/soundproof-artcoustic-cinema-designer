// src/pages/AdminSpeakerProductDetail.jsx
//
// Product detail page for a single SpeakerProduct.
// Tabs: General, Specifications, Sources, Data Quality, History.
// Specifications are stored in SpeakerSpecification (one-to-one via current_specification_id).
// General tab holds product identity, category (physical form), role, status, and images.
// An "Engineering Analysis" section is reserved (empty) for future engineering outputs.

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Save, Plus, Trash2, ExternalLink, Calculator } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  green: "#213428",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  danger: "#B23A3A",
};

const TABS = [
  { key: "general", label: "General" },
  { key: "specifications", label: "Specifications" },
  { key: "sources", label: "Sources" },
  { key: "documents", label: "Documents" },
  { key: "dataQuality", label: "Data Quality" },
  { key: "history", label: "History" },
];

// Field groups for the Specifications tab (now stored in SpeakerSpecification)
const SPEC_GROUPS = [
  {
    label: "Physical",
    fields: [
      { key: "cabinet_type", label: "Cabinet Type", type: "text" },
      { key: "mounting_type", label: "Mounting Type", type: "text" },
      { key: "woofer_count", label: "Woofer Count", type: "number" },
      { key: "woofer_size", label: "Woofer Size", type: "text" },
      { key: "midrange_count", label: "Midrange Count", type: "number" },
      { key: "midrange_size", label: "Midrange Size", type: "text" },
      { key: "tweeter_description", label: "Tweeter Description", type: "text" },
      { key: "compression_driver", label: "Compression Driver", type: "boolean" },
      { key: "coaxial", label: "Coaxial", type: "boolean" },
      { key: "height_mm", label: "Height (mm)", type: "number" },
      { key: "width_mm", label: "Width (mm)", type: "number" },
      { key: "depth_mm", label: "Depth (mm)", type: "number" },
      { key: "weight_kg", label: "Weight (kg)", type: "number" },
    ],
  },
  {
    label: "Electrical",
    fields: [
      { key: "sensitivity_db", label: "Sensitivity (dB)", type: "number" },
      { key: "nominal_impedance_ohm", label: "Nominal Impedance (Ω)", type: "number" },
      { key: "minimum_impedance_ohm", label: "Minimum Impedance (Ω)", type: "number" },
      { key: "recommended_amp_min_w", label: "Recommended Amp Min (W)", type: "number" },
      { key: "recommended_amp_max_w", label: "Recommended Amp Max (W)", type: "number" },
      { key: "long_term_iec_power_w", label: "Long Term IEC Power (W)", type: "number" },
      { key: "rated_iec_power_w", label: "Rated IEC Power (W)", type: "number" },
      { key: "aes_power_w", label: "AES Power (W)", type: "number" },
      { key: "peak_power_w", label: "Peak Power (W)", type: "number" },
    ],
  },
  {
    label: "Acoustic",
    fields: [
      { key: "frequency_response_low_hz", label: "Frequency Response Low (Hz)", type: "number" },
      { key: "frequency_response_high_hz", label: "Frequency Response High (Hz)", type: "number" },
      { key: "frequency_response_tolerance", label: "Frequency Response Tolerance", type: "text" },
      { key: "max_continuous_spl_db", label: "Max Continuous SPL (dB)", type: "number" },
      { key: "max_peak_spl_db", label: "Max Peak SPL (dB)", type: "number" },
      { key: "horizontal_dispersion_deg", label: "Horizontal Dispersion (°)", type: "number" },
      { key: "vertical_dispersion_deg", label: "Vertical Dispersion (°)", type: "number" },
      { key: "thx_certification", label: "THX Certification", type: "text" },
    ],
  },
  {
    label: "Metadata",
    fields: [
      { key: "primary_source", label: "Primary Source", type: "text" },
      { key: "confidence", label: "Confidence", type: "select", options: ["", "A", "B", "C", "D"] },
      { key: "evidence_quality", label: "Evidence Quality", type: "select", options: ["", "Manufacturer Published", "Manufacturer Calculated", "Engineering Estimate", "Unknown"] },
      { key: "last_verified", label: "Last Verified", type: "date" },
    ],
  },
];

const inputStyle = { border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card };

function SpecField({ field, value, onChange }) {
  if (field.type === "boolean") {
    return (
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(field.key, e.target.checked)} className="w-4 h-4" />
    );
  }
  if (field.type === "select") {
    return (
      <select value={value || ""} onChange={(e) => onChange(field.key, e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle}>
        {field.options.map((opt) => <option key={opt} value={opt}>{opt || "—"}</option>)}
      </select>
    );
  }
  if (field.type === "date") {
    return (
      <input type="date" value={value || ""} onChange={(e) => onChange(field.key, e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(field.key, field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
      className="w-full px-2 py-1.5 rounded text-sm outline-none"
      style={inputStyle}
    />
  );
}

export default function AdminSpeakerProductDetail() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState("general");
  const [product, setProduct] = useState(null);
  const [manufacturers, setManufacturers] = useState([]);
  const [sources, setSources] = useState([]);
  const [dataQuality, setDataQuality] = useState([]);
  const [history, setHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [specData, setSpecData] = useState({});
  const [specId, setSpecId] = useState(null);
  const [allSpecs, setAllSpecs] = useState([]);
  const [changeReason, setChangeReason] = useState("Manual Correction");

  const isNew = productId === "new";

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    (async () => {
      try {
        const mans = await base44.entities.SpeakerManufacturer.list("name", 500);
        if (!mounted) return;
        setManufacturers(mans || []);

        if (isNew) {
          setProduct({});
          setFormData({
            manufacturer_id: "",
            model: "",
            series: "",
            full_product_name: "",
            category: "Other",
            role: "Flexible",
            status: "Unknown",
            import_status: "Manual",
            official_product_url: "",
            official_pdf_url: "",
            hero_image_url: "",
            thumbnail_image_url: "",
            diagram_image_url: "",
            notes: "",
          });
          setSpecData({ version_label: "Current", is_current: true, approval_status: "Draft" });
          setSources([]);
          setDataQuality([]);
          setHistory([]);
          setDocuments([]);
        } else {
          const products = await base44.entities.SpeakerProduct.filter({ id: productId });
          const p = products?.[0];
          if (!mounted) return;
          setProduct(p);
          setFormData(p || {});

          const [srcs, dq, hist, specs, docs] = await Promise.all([
            base44.entities.SpeakerSource.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerDataQuality.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerChangeHistory.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerSpecification.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerDocument.filter({ product_id: productId }, "-created_date", 100),
          ]);
          if (!mounted) return;
          setSources(srcs || []);
          setDataQuality(dq || []);
          setHistory(hist || []);
          setDocuments(docs || []);

          // Use the current specification (is_current=true, or the first one)
          const specList = specs || [];
          setAllSpecs(specList);
          const currentSpec = specList.find((s) => s.is_current) || specList[0] || null;
          if (currentSpec) {
            setSpecId(currentSpec.id);
            setSpecData(currentSpec);
          } else {
            setSpecId(null);
            setSpecData({ version_label: "Current", is_current: true, product_id: productId, approval_status: "Draft" });
          }
        }
      } catch (err) {
        console.error("[AdminSpeakerProductDetail] Load failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [productId, isAdmin, isNew]);

  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSpecChange = (key, value) => {
    setSpecData((prev) => ({ ...prev, [key]: value }));
  };

  const handleFieldAuthorityChange = (fieldKey, authorityValue) => {
    setSpecData((prev) => {
      const currentAuthority = prev.field_authority || {};
      const nextAuthority = { ...currentAuthority };
      if (authorityValue) {
        nextAuthority[fieldKey] = authorityValue;
      } else {
        delete nextAuthority[fieldKey];
      }
      return { ...prev, field_authority: nextAuthority };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const man = manufacturers.find((m) => m.id === formData.manufacturer_id);
        const payload = { ...formData, manufacturer_name: man?.name || "" };
        const created = await base44.entities.SpeakerProduct.create(payload);
        // Create the initial specification record
        const specRecord = await base44.entities.SpeakerSpecification.create({
          ...specData,
          product_id: created.id,
          version_label: specData.version_label || "Current",
          is_current: true,
        });
        // Link the spec to the product
        await base44.entities.SpeakerProduct.update(created.id, { current_specification_id: specRecord.id });
        // Log creation in change history
        await base44.entities.SpeakerChangeHistory.create({
          product_id: created.id,
          field_changed: "product",
          old_value: "",
          new_value: created.full_product_name || created.model,
          source: "Manual Edit",
          change_type: "Created",
          change_reason: changeReason || "Manual Correction",
        });
        navigate(`/admin/speaker-database/product/${created.id}`);
      } else {
        const man = manufacturers.find((m) => m.id === formData.manufacturer_id);
        const payload = { ...formData, manufacturer_name: man?.name || formData.manufacturer_name };
        // Track changed product fields
        const changes = [];
        for (const key of Object.keys(payload)) {
          if (key === "id" || key === "created_date" || key === "updated_date" || key === "created_by_id") continue;
          const oldVal = product[key];
          const newVal = payload[key];
          if (String(oldVal ?? "") !== String(newVal ?? "")) {
            changes.push({ product_id: productId, field_changed: key, old_value: String(oldVal ?? ""), new_value: String(newVal ?? ""), source: "Manual Edit", change_type: "Manual Edit", change_reason: changeReason || "Manual Correction" });
          }
        }
        await base44.entities.SpeakerProduct.update(productId, payload);

        // Save specification
        if (specId) {
          await base44.entities.SpeakerSpecification.update(specId, specData);
        } else {
          const specRecord = await base44.entities.SpeakerSpecification.create({
            ...specData,
            product_id: productId,
            version_label: specData.version_label || "Current",
            is_current: true,
          });
          setSpecId(specRecord.id);
          await base44.entities.SpeakerProduct.update(productId, { current_specification_id: specRecord.id });
        }

        // Log changes
        if (changes.length > 0) {
          await base44.entities.SpeakerChangeHistory.bulkCreate(changes);
        }
        setProduct({ ...formData });
        setEditMode(false);
        // Reload history
        const hist = await base44.entities.SpeakerChangeHistory.filter({ product_id: productId }, "-created_date", 100);
        setHistory(hist || []);
      }
    } catch (err) {
      console.error("[AdminSpeakerProductDetail] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSource = async () => {
    try {
      await base44.entities.SpeakerSource.create({
        product_id: productId,
        source_type: "Official Product Page",
        url: "",
        date_checked: new Date().toISOString().split("T")[0],
        notes: "",
      });
      const srcs = await base44.entities.SpeakerSource.filter({ product_id: productId }, "-created_date", 100);
      setSources(srcs || []);
    } catch (err) {
      console.error("[AdminSpeakerProductDetail] Add source failed:", err);
    }
  };

  const handleDeleteSource = async (sourceId) => {
    try {
      await base44.entities.SpeakerSource.delete(sourceId);
      setSources(sources.filter((s) => s.id !== sourceId));
    } catch (err) {
      console.error("[AdminSpeakerProductDetail] Delete source failed:", err);
    }
  };

  const handleAddDocument = async () => {
    try {
      await base44.entities.SpeakerDocument.create({
        product_id: productId,
        document_type: "PDF",
        url: "",
        title: "",
        date_checked: new Date().toISOString().split("T")[0],
        notes: "",
      });
      const docs = await base44.entities.SpeakerDocument.filter({ product_id: productId }, "-created_date", 100);
      setDocuments(docs || []);
    } catch (err) {
      console.error("[AdminSpeakerProductDetail] Add document failed:", err);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      await base44.entities.SpeakerDocument.delete(docId);
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch (err) {
      console.error("[AdminSpeakerProductDetail] Delete document failed:", err);
    }
  };

  if (isLoadingAuth) return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: BRAND.btnText, fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Loading product…</div>;

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin/speaker-database" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Speaker Database</a>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: BRAND.text }}>
            {isNew ? "New Product" : (formData.full_product_name || formData.model || "Untitled Product")}
          </h1>
          {formData.manufacturer_name && <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>{formData.manufacturer_name}</div>}
        </div>
        <div className="flex items-center gap-2">
          {editMode || isNew ? (
            <>
              {!isNew && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: BRAND.subtext }}>Reason:</span>
                  <select value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="px-2 py-1.5 rounded text-sm outline-none" style={inputStyle}>
                    <option value="Manual Correction">Manual Correction</option>
                    <option value="Manufacturer Specification Update">Manufacturer Specification Update</option>
                    <option value="Crawler Import">Crawler Import</option>
                    <option value="Document Revision">Document Revision</option>
                    <option value="URL Change">URL Change</option>
                    <option value="Metadata Update">Metadata Update</option>
                    <option value="Status Change">Status Change</option>
                    <option value="Administrative">Administrative</option>
                  </select>
                </div>
              )}
              {!isNew && <button onClick={() => { setEditMode(false); setFormData(product); }} className="px-4 py-2 rounded-md text-sm" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>Cancel</button>}
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium" style={{ background: BRAND.green, color: "#fff", opacity: saving ? 0.5 : 1 }}>
                <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: BRAND.btn, color: BRAND.btnText }}>Edit</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b mb-6" style={{ borderColor: BRAND.border }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{
            color: tab === t.key ? BRAND.green : BRAND.subtext,
            borderBottom: tab === t.key ? `2px solid ${BRAND.green}` : "2px solid transparent",
            fontWeight: tab === t.key ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* General Tab */}
      {tab === "general" && (
        <div className="rounded-lg p-6 space-y-4" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 600 }}>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Manufacturer *</label>
            <select value={formData.manufacturer_id || ""} onChange={(e) => handleFieldChange("manufacturer_id", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle}>
              <option value="">Select…</option>
              {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Model *</label>
            <input type="text" value={formData.model || ""} onChange={(e) => handleFieldChange("model", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Series</label>
            <input type="text" value={formData.series || ""} onChange={(e) => handleFieldChange("series", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Full Product Name</label>
            <input type="text" value={formData.full_product_name || ""} onChange={(e) => handleFieldChange("full_product_name", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Category</label>
              <select value={formData.category || "Other"} onChange={(e) => handleFieldChange("category", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle}>
                {["On Wall", "In Wall", "Freestanding", "Other"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Role</label>
              <select value={formData.role || "Flexible"} onChange={(e) => handleFieldChange("role", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle}>
                {["LCR", "Surround", "Both", "Wide", "Height", "Flexible"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Status</label>
              <select value={formData.status || "Unknown"} onChange={(e) => handleFieldChange("status", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle}>
                {["Current", "Discontinued", "Coming Soon", "Hidden", "Archived", "Unknown"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Import Status</label>
              <select value={formData.import_status || "Manual"} onChange={(e) => handleFieldChange("import_status", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle}>
                {["Manual", "Imported", "Verified", "Needs Review", "Locked"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Official Product URL</label>
            <input type="text" value={formData.official_product_url || ""} onChange={(e) => handleFieldChange("official_product_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Official PDF URL</label>
            <input type="text" value={formData.official_pdf_url || ""} onChange={(e) => handleFieldChange("official_pdf_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} placeholder="https://…" />
          </div>
          {/* Product Images */}
          <div className="pt-2" style={{ borderTop: `1px solid ${BRAND.border}` }} />
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.green }}>Product Images</div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Hero Image URL</label>
            <input type="text" value={formData.hero_image_url || ""} onChange={(e) => handleFieldChange("hero_image_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Thumbnail Image URL</label>
            <input type="text" value={formData.thumbnail_image_url || ""} onChange={(e) => handleFieldChange("thumbnail_image_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Diagram Image URL</label>
            <input type="text" value={formData.diagram_image_url || ""} onChange={(e) => handleFieldChange("diagram_image_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Notes</label>
            <textarea value={formData.notes || ""} onChange={(e) => handleFieldChange("notes", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} rows={3} />
          </div>
        </div>
      )}

      {/* Specifications Tab */}
      {tab === "specifications" && (
        <div className="space-y-6">
          {/* Current Specification — explicit pointer: Product → Current Specification → Specification History */}
          <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.green }}>Current Specification</h3>
              {specData.approval_status && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{
                  background: specData.approval_status === "Approved" ? BRAND.green + "15"
                    : specData.approval_status === "Awaiting Review" ? "#9A6E00" + "15"
                    : specData.approval_status === "Superseded" ? "#625143" + "15"
                    : specData.approval_status === "Archived" ? "#625143" + "15"
                    : BRAND.subtext + "15",
                  color: specData.approval_status === "Approved" ? BRAND.green
                    : specData.approval_status === "Awaiting Review" ? "#9A6E00"
                    : specData.approval_status === "Superseded" ? "#625143"
                    : specData.approval_status === "Archived" ? "#625143"
                    : BRAND.subtext,
                }}>{specData.approval_status}</span>
              )}
            </div>
            <div className="text-xs mb-4" style={{ color: BRAND.subtext }}>
              Product → <span style={{ color: BRAND.green, fontWeight: 600 }}>Current Specification</span> → Specification History. Older specifications remain archived.
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "260px 1fr" }}>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Version Label</label>
                {editMode || isNew ? (
                  <input type="text" value={specData.version_label || ""} onChange={(e) => handleSpecChange("version_label", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} placeholder="e.g. 2026, v1.2" />
                ) : (
                  <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                    {specData.version_label || "Current"}
                  </div>
                )}
              </div>
              <div className="text-xs flex items-center" style={{ color: BRAND.subtext }}>
                Specifications are stored separately from product identity, allowing future versioning (2026, 2027, 2028) without changing the Product record.
              </div>
            </div>

            {/* Approval — separate from Confidence (data quality) and Import Status (pipeline origin) */}
            <div className="pt-4 mt-4" style={{ borderTop: `1px solid ${BRAND.border}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: BRAND.green }}>Approval</div>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Approval Status</label>
                  {editMode || isNew ? (
                    <select value={specData.approval_status || "Draft"} onChange={(e) => handleSpecChange("approval_status", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle}>
                      <option value="Draft">Draft</option>
                      <option value="Awaiting Review">Awaiting Review</option>
                      <option value="Approved">Approved</option>
                      <option value="Superseded">Superseded</option>
                      <option value="Archived">Archived</option>
                    </select>
                  ) : (
                    <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                      {specData.approval_status || "Draft"}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Reviewed By</label>
                  {editMode || isNew ? (
                    <input type="text" value={specData.reviewed_by || ""} onChange={(e) => handleSpecChange("reviewed_by", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} placeholder="e.g. Paul" />
                  ) : (
                    <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                      {specData.reviewed_by || "—"}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Reviewed Date</label>
                  {editMode || isNew ? (
                    <input type="date" value={specData.reviewed_date || ""} onChange={(e) => handleSpecChange("reviewed_date", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                  ) : (
                    <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                      {specData.reviewed_date ? new Date(specData.reviewed_date).toLocaleDateString("en-GB") : "—"}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Approved By</label>
                  {editMode || isNew ? (
                    <input type="text" value={specData.approved_by || ""} onChange={(e) => handleSpecChange("approved_by", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} placeholder="e.g. Paul" />
                  ) : (
                    <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                      {specData.approved_by || "—"}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Approved Date</label>
                  {editMode || isNew ? (
                    <input type="date" value={specData.approved_date || ""} onChange={(e) => handleSpecChange("approved_date", e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                  ) : (
                    <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                      {specData.approved_date ? new Date(specData.approved_date).toLocaleDateString("en-GB") : "—"}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs mt-2" style={{ color: BRAND.subtext }}>
                Separate from Confidence (data quality) and Import Status (pipeline origin). Records who checked and who signed off.
              </div>
            </div>
          </div>

          {SPEC_GROUPS.map((group) => (
            <div key={group.label} className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: BRAND.green }}>{group.label}</h3>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {group.fields.map((field) => {
                  const authority = specData.field_authority?.[field.key];
                  return (
                  <div key={field.key}>
                    <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>{field.label}</label>
                    {editMode || isNew ? (
                      <>
                        <SpecField field={field} value={specData[field.key]} onChange={handleSpecChange} />
                        <select
                          value={authority || ""}
                          onChange={(e) => handleFieldAuthorityChange(field.key, e.target.value)}
                          className="w-full mt-1 px-1.5 py-1 rounded text-xs outline-none"
                          style={inputStyle}
                        >
                          <option value="">Authority: —</option>
                          <option value="Official PDF">PDF</option>
                          <option value="Official Product Page">Product Page</option>
                          <option value="Engineering Document">Engineering Doc</option>
                          <option value="Support Article">Support Article</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                          {field.type === "boolean" ? (specData[field.key] ? "Yes" : "No") : (specData[field.key] != null && specData[field.key] !== "" ? String(specData[field.key]) : "—")}
                        </div>
                        {authority && (
                          <div className="text-xs mt-0.5" style={{ color: BRAND.subtext }}>↳ {authority}</div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Engineering Analysis — reserved, completely empty. No placeholder fields. */}
          <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: "#F8F8F7" }}>
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4" style={{ color: BRAND.subtext }} />
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Engineering Analysis</h3>
            </div>
            <div className="text-xs" style={{ color: BRAND.subtext }}>
              Reserved for future engineering outputs — estimated clean SPL, P12 capability, P13 capability, dynamic range prediction, listening distance recommendations, and upgrade analysis.
              These are engineering models, not manufacturer data; they are computed downstream by the RP22 engine. Nothing is stored or calculated here yet.
            </div>
          </div>

          {/* Specification History — archived older specifications */}
          {!isNew && allSpecs.length > 1 && (
            <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: BRAND.green }}>Specification History</h3>
              <div className="space-y-2">
                {allSpecs
                  .filter((s) => s.id !== specId)
                  .map((s) => (
                    <div key={s.id} className="flex items-center gap-4 p-3 rounded-md" style={{ background: "#F8F8F7" }}>
                      <span className="text-sm font-medium" style={{ color: BRAND.text, width: 120 }}>{s.version_label || "—"}</span>
                      <span className="text-xs" style={{ color: BRAND.subtext }}>
                        {s.is_current ? "Current" : "Archived"}
                      </span>
                      {s.approval_status && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          background: s.approval_status === "Approved" ? BRAND.green + "15" : s.approval_status === "Awaiting Review" ? "#9A6E00" + "15" : (s.approval_status === "Superseded" || s.approval_status === "Archived") ? "#625143" + "15" : BRAND.subtext + "15",
                          color: s.approval_status === "Approved" ? BRAND.green : s.approval_status === "Awaiting Review" ? "#9A6E00" : (s.approval_status === "Superseded" || s.approval_status === "Archived") ? "#625143" : BRAND.subtext,
                        }}>{s.approval_status}</span>
                      )}
                      {s.reviewed_by && <span className="text-xs" style={{ color: BRAND.subtext }}>Reviewed by {s.reviewed_by}</span>}
                      <span className="text-xs ml-auto" style={{ color: BRAND.subtext }}>
                        {s.created_date ? new Date(s.created_date).toLocaleDateString("en-GB") : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sources Tab */}
      {tab === "sources" && (
        <div>
          {!isNew && (
            <button onClick={handleAddSource} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium mb-4" style={{ background: BRAND.btn, color: BRAND.btnText }}>
              <Plus className="w-4 h-4" /> Add Source
            </button>
          )}
          {sources.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No sources recorded.</div>
          ) : (
            <div className="space-y-2">
              {sources.map((src) => (
                <div key={src.id} className="flex items-center gap-4 p-4 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
                  <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: "160px 1fr 120px" }}>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Type</div>
                      <div className="text-sm" style={{ color: BRAND.text }}>{src.source_type}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>URL</div>
                      {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm underline flex items-center gap-1" style={{ color: BRAND.green }}>{src.url} <ExternalLink className="w-3 h-3" /></a> : <span className="text-sm" style={{ color: BRAND.subtext }}>—</span>}
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Date Checked</div>
                      <div className="text-sm" style={{ color: BRAND.text }}>{src.date_checked ? new Date(src.date_checked).toLocaleDateString("en-GB") : "—"}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteSource(src.id)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" style={{ color: BRAND.danger, opacity: 0.6 }} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {tab === "documents" && (
        <div>
          {!isNew && (
            <button onClick={handleAddDocument} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium mb-4" style={{ background: BRAND.btn, color: BRAND.btnText }}>
              <Plus className="w-4 h-4" /> Add Document
            </button>
          )}
          {documents.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No documents recorded.</div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 p-4 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
                  <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: "140px 1fr 120px" }}>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Type</div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: BRAND.green + "15", color: BRAND.green }}>{doc.document_type}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>URL</div>
                      {doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm underline flex items-center gap-1" style={{ color: BRAND.green }}>{doc.title || doc.url} <ExternalLink className="w-3 h-3" /></a> : <span className="text-sm" style={{ color: BRAND.subtext }}>—</span>}
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Date Checked</div>
                      <div className="text-sm" style={{ color: BRAND.text }}>{doc.date_checked ? new Date(doc.date_checked).toLocaleDateString("en-GB") : "—"}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDocument(doc.id)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" style={{ color: BRAND.danger, opacity: 0.6 }} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Data Quality Tab */}
      {tab === "dataQuality" && (
        <div>
          {dataQuality.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No data quality issues for this product.</div>
          ) : (
            <div className="space-y-2">
              {dataQuality.map((v) => (
                <div key={v.id} className="flex items-center gap-4 p-4 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: v.severity === "Critical" ? BRAND.danger + "15" : v.severity === "Warning" ? "#9A6E0015" : BRAND.subtext + "15", color: v.severity === "Critical" ? BRAND.danger : v.severity === "Warning" ? "#9A6E00" : BRAND.subtext }}>{v.severity}</span>
                  <span className="font-medium text-sm" style={{ color: BRAND.text }}>{v.field}</span>
                  <span className="text-sm flex-1" style={{ color: BRAND.subtext }}>{v.message}</span>
                  <span className="text-xs" style={{ color: BRAND.subtext }}>{v.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div>
          {history.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No change history for this product.</div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-4 p-4 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
                  <span className="text-xs" style={{ color: BRAND.subtext, width: 100 }}>{h.created_date ? new Date(h.created_date).toLocaleDateString("en-GB") : "—"}</span>
                  <span className="font-medium text-sm" style={{ color: BRAND.text, width: 160 }}>{h.field_changed}</span>
                  <span className="text-sm" style={{ color: BRAND.subtext, width: 100 }}>{h.old_value || "—"}</span>
                  <span style={{ color: BRAND.subtext }}>→</span>
                  <span className="text-sm" style={{ color: BRAND.text, width: 100 }}>{h.new_value || "—"}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: BRAND.subtext + "15", color: BRAND.subtext }}>{h.change_type}</span>
                  {h.change_reason && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: BRAND.green + "15", color: BRAND.green }}>{h.change_reason}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}