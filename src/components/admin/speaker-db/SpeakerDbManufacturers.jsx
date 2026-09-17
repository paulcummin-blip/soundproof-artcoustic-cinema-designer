// src/components/admin/speaker-db/SpeakerDbManufacturers.jsx
//
// Manufacturers section: list, create, edit, delete manufacturers.
// Uses SpeakerDbTable for search/filter/sort/pagination.

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";
import { Plus, Edit2, Trash2, X, SlidersHorizontal } from "lucide-react";

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

export default function SpeakerDbManufacturers() {
  const [rows, setRows] = useState([]);
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
    { key: "name", label: "Name", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "website", label: "Website", sortable: true, render: (r) => r.website ? <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: BRAND.green }}>{r.website}</a> : "—" },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", label: "", width: "130px", render: (r) => (
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); handleEditRules(r); }} className="p-1 rounded hover:bg-gray-100" title="Manufacturer rules"><SlidersHorizontal className="w-3.5 h-3.5" style={{ color: BRAND.green }} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleEdit(r); }} className="p-1 rounded hover:bg-gray-100" title="Edit manufacturer"><Edit2 className="w-3.5 h-3.5" style={{ color: BRAND.subtext }} /></button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r); }} className="p-1 rounded hover:bg-red-50" title="Delete manufacturer"><Trash2 className="w-3.5 h-3.5" style={{ color: BRAND.danger, opacity: 0.6 }} /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm" style={{ color: BRAND.subtext }}>
          {rows.length} manufacturer{rows.length !== 1 ? "s" : ""}
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          style={{ background: BRAND.btn, color: BRAND.btnText }}
        >
          <Plus className="w-4 h-4" /> Add Manufacturer
        </button>
      </div>

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
    </div>
  );
}