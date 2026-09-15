import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useProductMaster } from '@/components/products/useProductMaster';
import ProductDangerZone from '@/components/products/ProductDangerZone';
import {
  defaultProductRolesForEngineeringKey,
  effectiveProductRoles,
  getProductTechnicalStatus,
  productEngineeringKey,
  getModelDisplayOrder,
  PRODUCT_ENGINEERING_OPTIONS,
  PRODUCT_ROLE_LABELS,
  PRODUCT_ROLE_OPTIONS,
} from '@/components/products/productMaster';

const VAT_RATE = 0.2;
const CATEGORIES = ['All', 'Loudspeaker', 'Subwoofer', 'Amplifier', 'Acoustic Treatment', 'Accessory'];
const EDIT_CATEGORIES = CATEGORIES.slice(1);

function money(value) {
  if (value === null || value === undefined || value === '') return 'Price on request';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Price on request';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount);
}

function statusStyle(status) {
  if (status === 'Complete') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'Partial') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
}

function emptyDraft(records) {
  const maxOrder = Math.max(-1, ...records.map((record) => Number(record.selector_order)).filter(Number.isFinite));
  return {
    sku: '',
    label: '',
    category: 'Loudspeaker',
    price_ex_vat: '',
    active: true,
    engineering_key: '',
    roles: [],
    selector_order: maxOrder + 1,
    catalog_version: 1,
  };
}

function draftFromProduct(product) {
  return {
    ...product,
    price_ex_vat: product.price_ex_vat === null || product.price_ex_vat === undefined
      ? ''
      : String(product.price_ex_vat),
    active: product.active !== false,
    engineering_key: product.engineering_key || productEngineeringKey(product),
    roles: effectiveProductRoles(product),
  };
}

function ProductEditor({ product, records, onClose, onSaved }) {
  const isNew = !product?.id;
  const [draft, setDraft] = useState(() => isNew ? emptyDraft(records) : draftFromProduct(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const needsEngineering = draft.category === 'Loudspeaker' || draft.category === 'Subwoofer';
  const technical = getProductTechnicalStatus(draft);

  const selectEngineeringModel = (engineeringKey) => {
    const option = PRODUCT_ENGINEERING_OPTIONS.find((candidate) => candidate.value === engineeringKey);
    setDraft((current) => ({
      ...current,
      engineering_key: engineeringKey,
      category: option ? (option.category === 'SUBWOOFERS' ? 'Subwoofer' : 'Loudspeaker') : current.category,
      label: isNew && !current.label ? (option?.label || current.label) : current.label,
      sku: isNew && !current.sku ? engineeringKey : current.sku,
      roles: current.roles.length ? current.roles : defaultProductRolesForEngineeringKey(engineeringKey),
    }));
  };

  const toggleRole = (role) => {
    setDraft((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((value) => value !== role)
        : [...current.roles, role],
    }));
  };

  const save = async () => {
    const sku = String(draft.sku || '').trim().toLowerCase();
    const label = String(draft.label || '').trim();
    if (!sku || !label) {
      setError('Product ID / SKU and product name are required.');
      return;
    }
    if (needsEngineering && !String(draft.engineering_key || '').trim()) {
      setError('Select the verified engineering model before saving this acoustic product.');
      return;
    }
    if (isNew && records.some((record) => (
      record.trashed !== true
      && String(record.sku || '').trim().toLowerCase() === sku
    ))) {
      setError('That Product ID / SKU already exists.');
      return;
    }
    const price = draft.price_ex_vat === '' ? null : Number(draft.price_ex_vat);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError('Price must be a positive number or left blank for Price on request.');
      return;
    }

    const payload = {
      sku,
      label,
      category: draft.category,
      price_ex_vat: price,
      active: draft.active !== false,
      engineering_key: needsEngineering ? String(draft.engineering_key).trim() : null,
      roles: needsEngineering ? draft.roles : [],
      selector_order: Number(draft.selector_order),
      catalog_version: 1,
    };

    setSaving(true);
    setError('');
    try {
      const response = await base44.functions.invoke('saveProductMaster', {
        product_id: isNew ? null : product.id,
        product: payload,
      });
      if (response?.data?.error) throw new Error(response.data.error);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError?.message || 'The product could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[#E7E5E1] bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">{isNew ? 'Add product' : 'Edit product'}</h2>
            <p className="mt-1 text-xs text-[#625143]">Commercial authority only. Acoustic engineering data remains read-only.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-[#F4F3F1]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6 p-6">
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide">Product</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Product name
                <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="mt-1 w-full rounded-lg border border-[#DCDBD6] px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium">Product ID / SKU
                <input value={draft.sku} disabled={!isNew} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} className="mt-1 w-full rounded-lg border border-[#DCDBD6] px-3 py-2 font-mono font-normal disabled:bg-[#F4F3F1]" />
              </label>
              <label className="text-sm font-medium">Category
                <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 font-normal">
                  {EDIT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Retail price ex VAT
                <input type="number" min="0" step="0.01" value={draft.price_ex_vat} onChange={(event) => setDraft({ ...draft, price_ex_vat: event.target.value })} placeholder="Price on request" className="mt-1 w-full rounded-lg border border-[#DCDBD6] px-3 py-2 font-normal" />
              </label>
              {needsEngineering && (
                <label className="text-sm font-medium sm:col-span-2">Verified engineering model
                  <select value={draft.engineering_key || ''} onChange={(event) => selectEngineeringModel(event.target.value)} className="mt-1 w-full rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 font-normal">
                    <option value="">Select the acoustic model used by calculations</option>
                    {PRODUCT_ENGINEERING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label} — {option.application}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-[#625143]">Links this commercial SKU to existing verified acoustic data; it does not copy or invent specifications.</span>
                </label>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide">Applications in Sound Proof</h3>
            <p className="mb-3 text-xs text-[#625143]">Choose exactly where this product may be selected in new designs. Active controls commercial availability.</p>
            <label className="mb-4 flex items-center gap-3 rounded-lg border border-[#DCDBD6] p-3 text-sm font-semibold">
              <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="h-4 w-4" />
              Active product
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRODUCT_ROLE_OPTIONS.map((role) => (
                <label key={role.value} className="flex items-center gap-3 rounded-lg border border-[#E7E5E1] px-3 py-2 text-sm">
                  <input type="checkbox" checked={draft.roles.includes(role.value)} onChange={() => toggleRole(role.value)} className="h-4 w-4" />
                  {role.label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#DCDBD6] bg-[#F8F8F7] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide">Technical data</h3>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(technical.status)}`}>{technical.status}</span>
            </div>
            <p className="mt-2 text-sm text-[#3E4349]">{technical.message}</p>
            <div className="mt-3 text-xs text-[#625143]">
              Engineering link: <span className="font-mono">{draft.engineering_key || String(draft.sku || '').split(':')[0] || 'Not linked'}</span>
            </div>
            {technical.details.length > 0 && (
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-[#3E4349] sm:grid-cols-2">
                {technical.details.map((detail) => {
                  const [label, ...valueParts] = detail.split(':');
                  return (
                    <div key={detail} className="flex gap-1">
                      <dt className="font-semibold">{label}:</dt>
                      <dd>{valueParts.join(':').trim()}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {(technical.missing.length > 0 || technical.warnings.length > 0) && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#625143]">
                {technical.missing.map((item) => <li key={item}>Required: {item}</li>)}
                {technical.warnings.map((item) => <li key={item}>Optional completion: {item}</li>)}
              </ul>
            )}
          </section>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

          {!isNew && (
            <ProductDangerZone
              product={product}
              onDone={async () => { await onSaved(); onClose(); }}
            />
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#E7E5E1] bg-white px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#DCDBD6] px-4 py-2 text-sm font-semibold">Cancel</button>
          <button disabled={saving} onClick={save} className="flex items-center gap-2 rounded-lg bg-[#213428] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save product
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PriceList() {
  const master = useProductMaster(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [editMode, setEditMode] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [expanded, setExpanded] = useState(null);
  const migrationStarted = useRef(false);

  useEffect(() => {
    if (!master.canEdit || migrationStarted.current) return;
    migrationStarted.current = true;
    base44.functions.invoke('seedProductPrices', {})
      .then(() => master.refetch())
      .catch(() => {
        // Existing products remain readable through legacy-compatible role mapping.
        // The next admin visit can safely retry the idempotent metadata migration.
      });
  }, [master.canEdit, master.refetch]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return master.products
      .filter((item) => showInactive || item.active !== false)
      .filter((item) => category === 'All' || item.category === category)
      .filter((item) => editMode || !/\s\(Surround\)\s*$/.test(String(item.label || '')))
      .filter((item) => !query
        || String(item.label || '').toLowerCase().includes(query)
        || String(item.sku || '').toLowerCase().includes(query))
      .sort((a, b) => {
        const categoryDifference = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
        if (categoryDifference !== 0) return categoryDifference;
        const displayA = getModelDisplayOrder(productEngineeringKey(a));
        const displayB = getModelDisplayOrder(productEngineeringKey(b));
        const useDisplayA = displayA !== Number.MAX_SAFE_INTEGER;
        const useDisplayB = displayB !== Number.MAX_SAFE_INTEGER;
        if (useDisplayA || useDisplayB) return displayA - displayB;
        const orderA = Number.isFinite(Number(a.selector_order)) ? Number(a.selector_order) : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.selector_order)) ? Number(b.selector_order) : Number.MAX_SAFE_INTEGER;
        return orderA - orderB || String(a.label || '').localeCompare(String(b.label || ''));
      });
  }, [master.products, search, category, showInactive, editMode]);

  const startEdit = (product) => setEditorProduct(product || null);
  const closeEditor = () => setEditorProduct(undefined);

  return (
    <div className="min-h-screen bg-[rgb(248,248,247)] p-6 text-[#1B1A1A]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-bold">{editMode ? 'Product Master' : 'Price List'}</h1>
            <p className="mt-1 text-sm text-[#3E4349]">
              {editMode
                ? 'Single authority for product identity, availability, selector roles and retail pricing.'
                : `Current ${master.territory} retail pricing.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!master.loading && <div className="text-sm text-[#625143]">{filtered.length} products</div>}
            {master.canEdit && (
              <>
                {editMode && (
                  <button onClick={() => startEdit(null)} className="flex items-center gap-2 rounded-lg border border-[#213428] px-3 py-2 text-sm font-semibold text-[#213428]">
                    <Plus className="h-4 w-4" /> Add product
                  </button>
                )}
                <button onClick={() => setEditMode((value) => !value)} className="rounded-lg bg-[#213428] px-4 py-2 text-sm font-semibold text-white">
                  {editMode ? 'Done editing' : 'Edit products'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-xl border border-[#DCDBD6] bg-white p-4 sm:grid-cols-[1fr_240px_auto]">
          <label className="relative block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#625143]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or SKU" className="w-full rounded-lg border border-[#DCDBD6] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#213428]" />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-sm outline-none focus:border-[#213428]">
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
          {editMode && (
            <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-[#DCDBD6] px-3 py-2 text-sm">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Show inactive
            </label>
          )}
        </div>

        {master.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {master.error?.message || 'The Product Master could not be loaded.'}
            <button onClick={() => master.refetch()} className="ml-3 font-semibold underline">Try again</button>
          </div>
        ) : master.loading ? (
          <div className="py-16 text-center text-sm text-[#3E4349]"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Loading products…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#DCDBD6] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[rgb(244,243,241)] text-left text-[11px] uppercase tracking-wider text-[#625143]">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    {editMode && <th className="px-4 py-3">Sound Proof roles</th>}
                    {editMode && <th className="px-4 py-3">Technical data</th>}
                    {editMode && <th className="px-4 py-3">Status</th>}
                    {master.canViewPrices && <th className="px-4 py-3 text-right">Ex VAT</th>}
                    {master.canViewPrices && <th className="px-4 py-3 text-right">Inc VAT</th>}
                    {editMode && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const technical = getProductTechnicalStatus(item);
                    const roles = effectiveProductRoles(item);
                    const isExpanded = expanded === (item.id || item.sku);
                    return (
                      <React.Fragment key={item.id || item.sku}>
                        <tr className={`border-t border-[#E7E5E1] ${item.active === false ? 'bg-[#F8F8F7] opacity-70' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold">{item.label || 'Unnamed product'}</div>
                            {editMode && <div className="mt-0.5 font-mono text-[11px] text-[#625143]">{item.sku}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#3E4349]">{item.category || '—'}</td>
                          {editMode && (
                            <td className="max-w-[260px] px-4 py-3 text-xs text-[#3E4349]">
                              {roles.length ? roles.map((role) => PRODUCT_ROLE_LABELS[role] || role).join(', ') : 'Not used in Room Designer'}
                            </td>
                          )}
                          {editMode && (
                            <td className="px-4 py-3">
                              <button onClick={() => setExpanded(isExpanded ? null : (item.id || item.sku))} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(technical.status)}`}>
                                {technical.status}
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            </td>
                          )}
                          {editMode && (
                            <td className="px-4 py-3 text-xs font-semibold">
                              {item.active === false ? 'Inactive' : 'Active'}
                            </td>
                          )}
                          {master.canViewPrices && <td className="px-4 py-3 text-right text-sm">{money(item.price_ex_vat)}</td>}
                          {master.canViewPrices && <td className="px-4 py-3 text-right text-sm font-semibold">{item.price_ex_vat == null ? 'Price on request' : money(Number(item.price_ex_vat) * (1 + VAT_RATE))}</td>}
                          {editMode && (
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => startEdit(item)} className="rounded-lg border border-[#DCDBD6] p-2 hover:bg-[#F4F3F1]" aria-label={`Edit ${item.label}`}><Pencil className="h-4 w-4" /></button>
                            </td>
                          )}
                        </tr>
                        {editMode && isExpanded && (
                          <tr className="border-t border-[#E7E5E1] bg-[#F8F8F7]">
                            <td colSpan={8} className="px-4 py-4 text-sm text-[#3E4349]">
                              <div className="flex items-start gap-3">
                                {technical.calculable ? <Check className="mt-0.5 h-4 w-4 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-red-700" />}
                                <div>
                                  <div className="font-semibold text-[#1B1A1A]">{technical.message}</div>
                                  <div className="mt-1 text-xs">Engineering link: <span className="font-mono">{item.engineering_key || String(item.sku).split(':')[0] || 'Not linked'}</span></div>
                                  {technical.details.length > 0 && (
                                    <div className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                      {technical.details.map((detail) => <div key={detail}>{detail}</div>)}
                                    </div>
                                  )}
                                  {technical.missing.length > 0 && <div className="mt-2 text-xs">Missing: {technical.missing.join(', ')}</div>}
                                  {technical.warnings.length > 0 && <div className="mt-1 text-xs">Optional completion: {technical.warnings.join(', ')}</div>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <div className="p-10 text-center text-sm text-[#3E4349]">No matching products.</div>}
          </div>
        )}
      </div>

      {master.canEdit && editorProduct !== undefined && (
        <ProductEditor product={editorProduct} records={master.products} onClose={closeEditor} onSaved={master.refetch} />
      )}
    </div>
  );
}