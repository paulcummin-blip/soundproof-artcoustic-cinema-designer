// src/components/admin/speaker-db/SpeakerDbManufacturers.jsx
//
// Manufacturers section: list, create, edit, delete manufacturers.
// Uses SpeakerDbTable for search/filter/sort/pagination.

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";
import { Plus, Edit2, Trash2, X, SlidersHorizontal, Ban, CheckCircle2, Search } from "lucide-react";
import CandidateModelFinder from "@/components/admin/speaker-db/CandidateModelFinder";
import { dedicatedDiscoveryFor, missingDedicatedTargets } from "@/components/admin/speaker-db/manufacturerDiscovery";
import { ensureManufacturer } from "@/components/admin/speaker-db/model-first/modelFirstPersistence.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  danger: "#B23A3A",
};

function StatusBadge({ status }) {
  const color = status === "Active" ? BRAND.green : BRAND.subtext;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + "15", color }}
    >
      {status || "—"}
    </span>
  );
}

// The stored website is the authority domain — shown here so it can be checked
// before any discovery runs against it.
function domainOf(website) {
  if (!website) return "—";
  try {
    const url = new URL(String(website).includes("://") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "—";
  }
}

function truncate(text, max = 92) {
  const value = String(text || "");
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default function SpeakerDbManufacturers() {
  const [rows, setRows] = useState([]);
  const [finderManufacturer, setFinderManufacturer] = useState(null);
  const [addingRegistered, setAddingRegistered] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} for new | existing record
  const [formData, setFormData] = useState({ name: "", website: "", status: "Active", notes: "" });
  const [saving, setSaving] = useState(false);
  const [rulesEditing, setRulesEditing] = useState(null); // null | manufacturer record
  const [rulesForm, setRulesForm] = useState(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [existingRuleId, setExistingRuleId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.SpeakerManufacturer.list("name", 500);
      setRows(data || []);
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleNew = () => {
    setEditing({});
    setFormData({ name: "", website: "", status: "Active", notes: "" });
  };

  const handleEdit = (row) => {
    setEditing(row);
    setFormData({
      name: row.name || "",
      website: row.website || "",
      status: row.status || "Active",
      notes: row.notes || "",
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await base44.entities.SpeakerManufacturer.update(editing.id, formData);
      } else {
        await base44.entities.SpeakerManufacturer.create(formData);
      }
      setEditing(null);
      await loadData();
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm(`Delete manufacturer "${row.name}"? This will not delete its products.`)) return;
    try {
      await base44.entities.SpeakerManufacturer.delete(row.id);
      await loadData();
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Delete failed:", err);
    }
  };

  const handleToggleStatus = async (row) => {
    const next = row.status === "Inactive" ? "Active" : "Inactive";
    try {
      await base44.entities.SpeakerManufacturer.update(row.id, { status: next });
      await loadData();
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Status change failed:", err);
    }
  };

  // A registered dedicated-discovery manufacturer that is not in the database yet
  // is created from its own registry entry (name + official domain), so its
  // identity is never retyped, then its discovery runs immediately.
  const handleAddRegistered = async (target) => {
    setAddingRegistered(target.key);
    try {
      const manufacturer = await ensureManufacturer({ name: target.manufacturer_name, website: target.website });
      if (manufacturer?.id && target.notes) {
        await base44.entities.SpeakerManufacturer.update(manufacturer.id, { notes: target.notes });
      }
      await loadData();
      setFinderManufacturer(manufacturer);
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Could not add a registered manufacturer:", err);
    } finally {
      setAddingRegistered("");
    }
  };

  const handleEditRules = async (row) => {
    setRulesEditing(row);
    setRulesSaving(false);
    setExistingRuleId(null);
    setRulesForm({
      preferred_source_type: "",
      ignore_subwoofers: false,
      ignore_ceiling: false,
      primary_power_rating: "",
      primary_spl: "",
      preferred_frequency_response: "",
      product_index_url: "",
      pdf_first: false,
      crawler_enabled: false,
      auto_approve: false,
      requires_review: true,
    });
    try {
      const existing = await base44.entities.SpeakerManufacturerRule.filter({ manufacturer_id: row.id });
      if (existing && existing.length > 0) {
        const rule = existing[0];
        setExistingRuleId(rule.id);
        setRulesForm({
          preferred_source_type: rule.preferred_source_type || "",
          ignore_subwoofers: rule.ignore_subwoofers || false,
          ignore_ceiling: rule.ignore_ceiling || false,
          primary_power_rating: rule.primary_power_rating || "",
          primary_spl: rule.primary_spl || "",
          preferred_frequency_response: rule.preferred_frequency_response || "",
          product_index_url: rule.product_index_url || "",
          pdf_first: rule.pdf_first || false,
          crawler_enabled: rule.crawler_enabled || false,
          auto_approve: rule.auto_approve || false,
          requires_review: rule.requires_review !== false,
        });
      }
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Load rules failed:", err);
    }
  };

  const handleSaveRules = async () => {
    if (!rulesEditing) return;
    setRulesSaving(true);
    try {
      const payload = { ...rulesForm, manufacturer_id: rulesEditing.id };
      if (existingRuleId) {
        await base44.entities.SpeakerManufacturerRule.update(existingRuleId, payload);
      } else {
        await base44.entities.SpeakerManufacturerRule.create(payload);
      }
      setRulesEditing(null);
    } catch (err) {
      console.error("[SpeakerDbManufacturers] Save rules failed:", err);
    } finally {
      setRulesSaving(false);
    }
  };

  const columns = [
    { key: "name", label: "Manufacturer", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "website", label: "Official website", sortable: true, render: (r) => r.website ? <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: BRAND.green }}>{r.website}</a> : <span className="text-sm" style={{ color: BRAND.danger }}>Not set — no discovery domain</span> },
    { key: "domain", label: "Domain", render: (r) => <span className="text-sm" style={{ color: BRAND.subtext }}>{domainOf(r.website)}</span> },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    { key: "notes", label: "Notes", render: (r) => <span className="text-xs" style={{ color: BRAND.subtext }}>{truncate(r.notes)}</span> },
    {
      key: "actions", label: "", width: "230px", render: (r) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); setFinderManufacturer(r); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.green }}
            title="Find candidate models"
          >
            <Search className="w-3.5 h-3.5" /> Find models
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleEdit(r); }} className="p-1 rounded hover:bg-gray-100" title="Edit website"><Edit2 className="w-3.5 h-3.5" style={{ color: BRAND.subtext }} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(r); }} className="p-1 rounded hover:bg-gray-100" title={r.status === "Inactive" ? "Enable manufacturer" : "Disable manufacturer"}>
            {r.status === "Inactive"
              ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: BRAND.green }} />
              : <Ban className="w-3.5 h-3.5" style={{ color: BRAND.subtext }} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleEditRules(r); }} className="p-1 rounded hover:bg-gray-100" title="Manufacturer rules"><SlidersHorizontal className="w-3.5 h-3.5" style={{ color: BRAND.green }} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r); }} className="p-1 rounded hover:bg-red-50" title="Delete manufacturer"><Trash2 className="w-3.5 h-3.5" style={{ color: BRAND.danger, opacity: 0.6 }} /></button>
        </div>
      ),
    },
  ];

  const missingTargets = missingDedicatedTargets(rows.map((row) => row.name));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm" style={{ color: BRAND.subtext }}>
          {rows.length} manufacturer{rows.length !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-2">
          {missingTargets.map((target) => (
            <button
              key={target.key}
              onClick={() => handleAddRegistered(target)}
              disabled={addingRegistered === target.key}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ border: `1px solid ${BRAND.green}`, color: BRAND.green, opacity: addingRegistered === target.key ? 0.5 : 1 }}
              title={`Registered for dedicated discovery at ${target.website}`}
            >
              <Plus className="w-4 h-4" />
              {addingRegistered === target.key ? "Adding…" : `Add ${target.manufacturer_name} & find models`}
            </button>
          ))}
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ background: BRAND.btn, color: BRAND.btnText }}
          >
            <Plus className="w-4 h-4" /> Add Manufacturer
          </button>
        </div>
      </div>

      {missingTargets.length > 0 && (
        <div className="mb-3 text-xs" style={{ color: BRAND.subtext }}>
          {missingTargets.map((target) => target.manufacturer_name).join(", ")} {missingTargets.length === 1 ? "is" : "are"} registered
          for dedicated discovery — the official domain is already recorded, so adding the manufacturer and finding its models is one step.
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading…</div>
      ) : (
        <SpeakerDbTable
          columns={columns}
          rows={rows}
          searchableKeys={["name", "website"]}
          filters={[{ key: "status", label: "Status", options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] }]}
          rowKey={(r) => r.id}
        />
      )}

      {/* Edit / Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }} onClick={() => setEditing(null)}>
          <div className="rounded-lg p-6 w-full max-w-md" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: BRAND.text }}>
                {editing.id ? "Edit Manufacturer" : "Add Manufacturer"}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" style={{ color: BRAND.subtext }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Website</label>
                <input type="text" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} placeholder="https://…" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Status</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md text-sm" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !formData.name.trim()} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: BRAND.green, color: "#fff", opacity: saving || !formData.name.trim() ? 0.5 : 1 }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manufacturer Rules modal */}
      {rulesEditing && rulesForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }} onClick={() => setRulesEditing(null)}>
          <div className="rounded-lg p-6 w-full max-w-lg" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold" style={{ color: BRAND.text }}>Manufacturer Rules</h3>
                <div className="text-sm" style={{ color: BRAND.subtext }}>{rulesEditing.name}</div>
              </div>
              <button onClick={() => setRulesEditing(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" style={{ color: BRAND.subtext }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Preferred Source Type</label>
                <select value={rulesForm.preferred_source_type} onChange={(e) => setRulesForm({ ...rulesForm, preferred_source_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                  <option value="">—</option>
                  <option value="Official Product Page">Official Product Page</option>
                  <option value="Official PDF">Official PDF</option>
                  <option value="Engineering Document">Engineering Document</option>
                  <option value="Support Article">Support Article</option>
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                  <input type="checkbox" checked={rulesForm.ignore_subwoofers} onChange={(e) => setRulesForm({ ...rulesForm, ignore_subwoofers: e.target.checked })} className="w-4 h-4" />
                  Ignore Subwoofers
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                  <input type="checkbox" checked={rulesForm.ignore_ceiling} onChange={(e) => setRulesForm({ ...rulesForm, ignore_ceiling: e.target.checked })} className="w-4 h-4" />
                  Ignore Ceiling
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Primary Power Rating</label>
                  <select value={rulesForm.primary_power_rating} onChange={(e) => setRulesForm({ ...rulesForm, primary_power_rating: e.target.value })}
                    className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                    <option value="">—</option>
                    <option value="AES">AES</option>
                    <option value="Long Term IEC">Long Term IEC</option>
                    <option value="Rated IEC">Rated IEC</option>
                    <option value="Peak">Peak</option>
                    <option value="Program">Program</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Primary SPL</label>
                  <select value={rulesForm.primary_spl} onChange={(e) => setRulesForm({ ...rulesForm, primary_spl: e.target.value })}
                    className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                    <option value="">—</option>
                    <option value="Continuous">Continuous</option>
                    <option value="Peak">Peak</option>
                    <option value="Calculated">Calculated</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Preferred Frequency Response</label>
                <select value={rulesForm.preferred_frequency_response} onChange={(e) => setRulesForm({ ...rulesForm, preferred_frequency_response: e.target.value })}
                  className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
                  <option value="">—</option>
                  <option value="-3dB">-3dB</option>
                  <option value="-6dB">-6dB</option>
                  <option value="Manufacturer Default">Manufacturer Default</option>
                </select>
              </div>

              {/* Crawler Configuration — designed to become the crawler config, even though crawling doesn't exist yet */}
              <div className="pt-3 mt-3" style={{ borderTop: `1px solid ${BRAND.border}` }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: BRAND.green }}>Crawler Configuration</div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>Product Index URL</label>
                  <input type="text" value={rulesForm.product_index_url || ""} onChange={(e) => setRulesForm({ ...rulesForm, product_index_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }} placeholder="https://manufacturer.com/products" />
                </div>
                <div className="flex items-center gap-6 mt-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                    <input type="checkbox" checked={rulesForm.pdf_first || false} onChange={(e) => setRulesForm({ ...rulesForm, pdf_first: e.target.checked })} className="w-4 h-4" />
                    PDF First
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                    <input type="checkbox" checked={rulesForm.crawler_enabled || false} onChange={(e) => setRulesForm({ ...rulesForm, crawler_enabled: e.target.checked })} className="w-4 h-4" />
                    Crawler Enabled
                  </label>
                </div>
                <div className="flex items-center gap-6 mt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                    <input type="checkbox" checked={rulesForm.auto_approve || false} onChange={(e) => setRulesForm({ ...rulesForm, auto_approve: e.target.checked })} className="w-4 h-4" />
                    Auto Approve
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BRAND.text }}>
                    <input type="checkbox" checked={rulesForm.requires_review !== false} onChange={(e) => setRulesForm({ ...rulesForm, requires_review: e.target.checked })} className="w-4 h-4" />
                    Requires Review
                  </label>
                </div>
                <div className="text-xs mt-2" style={{ color: BRAND.subtext }}>
                  Initially disabled for all manufacturers. Enabled per-manufacturer when ready.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRulesEditing(null)} className="px-4 py-2 rounded-md text-sm" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>Cancel</button>
              <button onClick={handleSaveRules} disabled={rulesSaving} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: BRAND.green, color: "#fff", opacity: rulesSaving ? 0.5 : 1 }}>
                {rulesSaving ? "Saving…" : "Save Rules"}
              </button>
            </div>
          </div>
        </div>
      )}

      {finderManufacturer && (
        <CandidateModelFinder
          manufacturer={finderManufacturer}
          discoveryFunction={dedicatedDiscoveryFor(finderManufacturer.name)?.function_name || "discoverCandidateModels"}
          discoveryLabel={dedicatedDiscoveryFor(finderManufacturer.name)?.scope_label || ""}
          onClose={() => setFinderManufacturer(null)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}