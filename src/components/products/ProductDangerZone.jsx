import React, { useState } from 'react';
import { AlertTriangle, Loader2, PowerOff, Trash2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return 'Price on request';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Price on request';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Admin-only Product Master lifecycle controls.
 * The edit modal is only mounted when the Product Master authority returns can_edit.
 * The backend function independently verifies the caller is an administrator.
 */
export default function ProductDangerZone({ product, onDone }) {
  const [workingAction, setWorkingAction] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  if (!product?.id) return null;

  const isActive = product.active !== false;
  const busy = Boolean(workingAction);

  const execute = async (action) => {
    setWorkingAction(action);
    setError('');
    try {
      const response = await base44.functions.invoke('manageProductLifecycle', {
        action,
        product_id: product.id,
      });
      if (response?.data?.success !== true) {
        throw new Error(response?.data?.error || `Could not ${action} the product.`);
      }
      await onDone?.();
    } catch (actionError) {
      setError(actionError?.message || `Could not ${action} the product.`);
    } finally {
      setWorkingAction('');
    }
  };

  return (
    <>
      <section className="rounded-xl border border-red-200 bg-red-50/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-red-800">Catalogue management</h3>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="max-w-md text-xs text-[#3E4349]">
              <div className="text-sm font-semibold text-[#1B1A1A]">Deactivate Product</div>
              <p className="mt-0.5">Removes it from the active Price List and all new-design selectors while keeping the Product Master record.</p>
            </div>
            <button
              type="button"
              disabled={busy || !isActive}
              onClick={() => execute('deactivate')}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {workingAction === 'deactivate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
              {isActive ? 'Deactivate Product' : 'Product is inactive'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-white p-3">
            <div className="max-w-md text-xs text-[#3E4349]">
              <div className="text-sm font-semibold text-[#1B1A1A]">Delete Product</div>
              <p className="mt-0.5">Permanently removes only this commercial Product Master record. Linked engineering registry data is left unchanged.</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError('');
                setDeleteConfirmOpen(true);
              }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Delete Product
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">{error}</div>
        )}
      </section>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-700"><Trash2 className="h-5 w-5" /></div>
                <div>
                  <h2 id="delete-product-title" className="text-lg font-bold text-[#1B1A1A]">Delete this product permanently?</h2>
                  <p className="mt-1 text-sm text-[#625143]">This cannot be undone from the Product Master.</p>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)} className="rounded-lg p-1.5 hover:bg-[#F4F3F1] disabled:opacity-50" aria-label="Close delete confirmation">
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="mt-5 space-y-3 rounded-xl border border-[#E7E5E1] bg-[#F8F8F7] p-4 text-sm">
              <div className="grid grid-cols-[90px_1fr] gap-3">
                <dt className="font-semibold text-[#625143]">Product</dt>
                <dd>{product.label || 'Unnamed product'}</dd>
              </div>
              <div className="grid grid-cols-[90px_1fr] gap-3">
                <dt className="font-semibold text-[#625143]">SKU</dt>
                <dd className="font-mono">{product.sku || '—'}</dd>
              </div>
              <div className="grid grid-cols-[90px_1fr] gap-3">
                <dt className="font-semibold text-[#625143]">Price</dt>
                <dd>{formatPrice(product.price_ex_vat)} ex VAT</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-[#625143]">The linked engineering registry record will not be deleted.</p>
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)} className="rounded-lg border border-[#DCDBD6] px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy} onClick={() => execute('delete')} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {workingAction === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Product Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
