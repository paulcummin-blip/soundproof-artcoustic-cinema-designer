// src/pages/AdminSpeakerProductDetail.jsx
//
// Product detail page for a single SpeakerProduct.
// Tabs: General, Specifications, Sources, Validation, History.
// Specifications tab groups fields into Physical, Electrical, Acoustic, Metadata.

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Save, Plus, Trash2, ExternalLink } from "lucide-react";

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
  { key: "validation", label: "Validation" },
  { key: "history", label: "History" },
];

// Field groups for the Specifications tab
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

function SpecField({ field, value, onChange }) {
  const inputStyle = {
    border: `1px solid ${BRAND.border}`,
    color: BRAND.text,
    background: BRAND.card,
  };

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
  const [validations, setValidations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

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
            status: "Unknown",
            official_product_url: "",
            official_pdf_url: "",
            specification_version: "",
            notes: "",
          });
          setSources([]);
          setValidations([]);
          setHistory([]);
        } else {
          const products = await base44.entities.SpeakerProduct.filter({ id: productId });
          const p = products?.[0];
          if (!mounted) return;
          setProduct(p);
          setFormData(p || {});

          const [srcs, vals, hist] = await Promise.all([
            base44.entities.SpeakerSource.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerValidation.filter({ product_id: productId }, "-created_date", 100),
            base44.entities.SpeakerChangeHistory.filter({ product_id: productId }, "-created_date", 100),
          ]);
          if (!mounted) return;
          setSources(srcs || []);
          setValidations(vals || []);
          setHistory(hist || []);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const man = manufacturers.find((m) => m.id === formData.manufacturer_id);
        const payload = { ...formData, manufacturer_name: man?.name || "" };
        const created = await base44.entities.SpeakerProduct.create(payload);
        // Log creation in change history
        await base44.entities.SpeakerChangeHistory.create({
          product_id: created.id,
          field_changed: "product",
          old_value: "",
          new_value: created.full_product_name || created.model,
          source: "Manual Edit",
          change_type: "Created",
        });
        navigate(`/admin/speaker-database/product/${created.id}`);
      } else {
        const man = manufacturers.find((m) => m.id === formData.manufacturer_id);
        const payload = { ...formData, manufacturer_name: man?.name || formData.manufacturer_name };
        // Track changed fields
        const changes = [];
        for (const key of Object.keys(payload)) {
          if (key === "id" || key === "created_date" || key === "updated_date" || key === "created_by_id") continue;
          const oldVal = product[key];
          const newVal = payload[key];
          if (String(oldVal ?? "") !== String(newVal ?? "")) {
            changes.push({ product_id: productId, field_changed: key, old_value: String(oldVal ?? ""), new_value: String(newVal ?? ""), source: "Manual Edit", change_type: "Manual Edit" });
          }
        }
        await base44.entities.SpeakerProduct.update(productId, payload);
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
            <select value={formData.manufacturer_id || ""} onChange={(e) => handleFieldChange("manufacturer_id", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}>
              <option value="">Select…</option>
              {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Model *</label>
            <input type="text" value={formData.model || ""} onChange={(e) => handleFieldChange("model", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Series</label>
            <input type="text" value={formData.series || ""} onChange={(e) => handleFieldChange("series", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Full Product Name</label>
            <input type="text" value={formData.full_product_name || ""} onChange={(e) => handleFieldChange("full_product_name", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Category</label>
              <select value={formData.category || "Other"} onChange={(e) => handleFieldChange("category", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                {["LCR", "On Wall", "In Wall", "Surround", "Other"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Status</label>
              <select value={formData.status || "Unknown"} onChange={(e) => handleFieldChange("status", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                {["Current", "Discontinued", "Coming Soon", "Unknown"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Official Product URL</label>
            <input type="text" value={formData.official_product_url || ""} onChange={(e) => handleFieldChange("official_product_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Official PDF URL</label>
            <input type="text" value={formData.official_pdf_url || ""} onChange={(e) => handleFieldChange("official_pdf_url", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} placeholder="https://…" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Specification Version</label>
            <input type="text" value={formData.specification_version || ""} onChange={(e) => handleFieldChange("specification_version", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Notes</label>
            <textarea value={formData.notes || ""} onChange={(e) => handleFieldChange("notes", e.target.value)} disabled={!editMode && !isNew} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} rows={3} />
          </div>
        </div>
      )}

      {/* Specifications Tab */}
      {tab === "specifications" && (
        <div className="space-y-6">
          {SPEC_GROUPS.map((group) => (
            <div key={group.label} className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: BRAND.green }}>{group.label}</h3>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {group.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>{field.label}</label>
                    {editMode || isNew ? (
                      <SpecField field={field} value={formData[field.key]} onChange={handleFieldChange} />
                    ) : (
                      <div className="px-2 py-1.5 text-sm rounded-md" style={{ background: "#F8F8F7", color: BRAND.text, minHeight: 34, display: "flex", alignItems: "center" }}>
                        {field.type === "boolean" ? (formData[field.key] ? "Yes" : "No") : (formData[field.key] != null && formData[field.key] !== "" ? String(formData[field.key]) : "—")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
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

      {/* Validation Tab */}
      {tab === "validation" && (
        <div>
          {validations.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No validation warnings for this product.</div>
          ) : (
            <div className="space-y-2">
              {validations.map((v) => (
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
                  <span className="font-medium text-sm" style={{ color: BRAND.text, width: 180 }}>{h.field_changed}</span>
                  <span className="text-sm" style={{ color: BRAND.subtext, width: 120 }}>{h.old_value || "—"}</span>
                  <span style={{ color: BRAND.subtext }}>→</span>
                  <span className="text-sm" style={{ color: BRAND.text, width: 120 }}>{h.new_value || "—"}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: BRAND.subtext + "15", color: BRAND.subtext }}>{h.change_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}