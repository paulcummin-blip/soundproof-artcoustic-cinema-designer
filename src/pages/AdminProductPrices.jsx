import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, AlertTriangle } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  amber: "#F5F0E6",
  amberBorder: "#D4A84A",
  green: "#213428",
};

const VAT_RATE = 0.2;
const CATEGORIES = ["Loudspeaker", "Subwoofer", "Amplifier", "Acoustic Treatment", "Accessory"];

const fmtGBP = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const incVat = (exVat) => {
  if (exVat === null || exVat === undefined || exVat === '') return null;
  const n = Number(exVat);
  if (!Number.isFinite(n)) return null;
  return n * (1 + VAT_RATE);
};

export default function AdminProductPrices() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [records, setRecords] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.ProductPrice.list('-created_date', 500);
      setRecords(list || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load prices');
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const startEdit = (rec) => {
    setEditingId(rec.id);
    setDraft({
      label: rec.label || '',
      category: rec.category || 'Loudspeaker',
      price_ex_vat: rec.price_ex_vat === null || rec.price_ex_vat === undefined ? '' : String(rec.price_ex_vat),
      active: rec.active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const priceRaw = draft.price_ex_vat;
      const priceExVat = priceRaw === '' || priceRaw === null || priceRaw === undefined
        ? null
        : Number(priceRaw);
      await base44.entities.ProductPrice.update(id, {
        label: draft.label.trim() || 'Unnamed',
        category: draft.category,
        price_ex_vat: priceExVat,
        active: draft.active,
      });
      await load();
      setEditingId(null);
      setDraft(null);
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: BRAND.btnText, fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  const sorted = (records || []).slice().sort((a, b) => {
    const catDiff = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return String(a.sku).localeCompare(String(b.sku));
  });

  const missingCount = (records || []).filter(r => r.price_ex_vat === null || r.price_ex_vat === undefined).length;

  const thStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: BRAND.subtext, textAlign: 'left', padding: '10px 12px', borderBottom: `1px solid ${BRAND.border}` };
  const tdStyle = { padding: '8px 12px', borderBottom: `1px solid ${BRAND.border}`, fontSize: 13, color: BRAND.text };

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Admin Dashboard</a>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Product Prices</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Canonical retail price authority. Retail inc VAT is derived at {Math.round(VAT_RATE * 100)}%.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {records && (
            <div style={{ fontSize: 13, color: BRAND.subtext }}>
              {records.length} products
              {missingCount > 0 && (
                <span style={{ marginLeft: 8, color: '#B8860B', fontWeight: 600 }}>
                  · {missingCount} price not set
                </span>
              )}
            </div>
          )}
          <button
            onClick={load}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 13, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#FDEDED', border: '1px solid #E88', color: '#A33', fontSize: 13 }}>
          {error}
        </div>
      )}

      {records === null ? (
        <div style={{ textAlign: 'center', padding: 48, color: BRAND.subtext }}>
          <Loader2 className="animate-spin" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
          Loading prices…
        </div>
      ) : records.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: BRAND.subtext, background: BRAND.card, border: `1px dashed ${BRAND.border}`, borderRadius: 12 }}>
          No product prices found. Run the seed function to populate.
        </div>
      ) : (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Category</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Retail ex VAT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Retail inc VAT</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Active</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((rec) => {
                  const isEditing = editingId === rec.id;
                  const isMissing = rec.price_ex_vat === null || rec.price_ex_vat === undefined;
                  const rowBg = isMissing ? BRAND.amber : 'transparent';
                  const draftMissing = draft && (draft.price_ex_vat === '' || draft.price_ex_vat === null);
                  const draftIncVat = draft ? incVat(draft.price_ex_vat === '' ? null : Number(draft.price_ex_vat)) : null;

                  return (
                    <tr key={rec.id} style={{ background: isEditing ? '#F0EDE8' : rowBg }}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {rec.sku}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <Input
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                            style={{ fontSize: 13, padding: '4px 8px', width: '100%', minWidth: 180 }}
                          />
                        ) : (
                          rec.label || '—'
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <Select
                            value={draft.category}
                            onValueChange={(v) => setDraft({ ...draft, category: v })}
                          >
                            <SelectTrigger style={{ fontSize: 13, padding: '4px 8px', minWidth: 140 }}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          rec.category || '—'
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={draft.price_ex_vat}
                            placeholder="price not set"
                            onChange={(e) => setDraft({ ...draft, price_ex_vat: e.target.value })}
                            style={{ fontSize: 13, padding: '4px 8px', width: 120, textAlign: 'right', marginLeft: 'auto' }}
                          />
                        ) : isMissing ? (
                          <span style={{ color: '#B8860B', fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            <AlertTriangle style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            Price not set
                          </span>
                        ) : (
                          fmtGBP(rec.price_ex_vat)
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: BRAND.subtext }}>
                        {isEditing
                          ? (draftMissing ? <span style={{ color: '#B8860B', fontSize: 11 }}>—</span> : fmtGBP(draftIncVat))
                          : (isMissing ? <span style={{ color: '#B8860B' }}>—</span> : fmtGBP(incVat(rec.price_ex_vat)))
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {isEditing ? (
                          <Switch
                            checked={draft.active}
                            onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                          />
                        ) : (
                          <Switch
                            checked={rec.active !== false}
                            disabled
                          />
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              onClick={() => saveEdit(rec.id)}
                              disabled={saving}
                              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: 'none', background: BRAND.green, color: '#fff', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              {saving ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Check style={{ width: 12, height: 12 }} />}
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${BRAND.border}`, background: 'transparent', color: BRAND.text, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(rec)}
                            style={{ padding: "4px 12px", fontSize: 12, borderRadius: 6, border: `1px solid ${BRAND.border}`, background: 'transparent', color: BRAND.text, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}