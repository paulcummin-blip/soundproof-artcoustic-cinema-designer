import React, { useState } from 'react';
import { AlertTriangle, Archive, Loader2, Trash2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { effectiveProductRoles, PRODUCT_ROLE_LABELS } from '@/components/products/productMaster';

/**
 * Admin-only Danger Zone for the Product Master edit modal.
 * Provides Deactivate (toggle active) and Move to Trash (with reference check).
 * Hard delete is intentionally not available.
 * Non-admins never reach this component — the edit modal is admin-gated upstream.
 */
export default function ProductDangerZone({ product, onDone }) {
  const [phase, setPhase] = useState('idle');
  const [action, setAction] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [error, setError] = useState('');

  const isActive = product?.active !== false;
  const roles = effectiveProductRoles(product);
  const roleLabels = roles.length
    ? roles.map((r) => PRODUCT_ROLE_LABELS[r] || r).join(', ')
    : 'Not used in Room Designer';

  const checkReferences = async () => {
    setPhase('checking');
    setError('');
    try {
      const response = await base44.functions.invoke('manageProductLifecycle', {
        action: 'check_references',
        product_id: product.id,
        sku: product.sku,
      });
      const data = response?.data || {};
      setReferenceData(data);
      return data;
    } catch (err) {
      setError(err?.message || 'Could not check product references.');
      setPhase('idle');
      return null;
    }
  };

  const handleDeactivate = async () => {
    setAction('deactivate');
    const data = await checkReferences();
    if (data) setPhase('confirm');
  };

  const handleTrash = async () => {
    setAction('trash');
    const data = await checkReferences();
    if (!data) return;
    setPhase(data.can_trash ? 'confirm' : 'blocked');
  };

  const executeDeactivate = async () => {
    setPhase('working');
    setError('');
    try {
      await base44.entities.ProductPrice.update(product.id, { active: !isActive });
      onDone();
    } catch (err) {
      setError(err?.message || 'Could not update the product.');
      setPhase('confirm');
    }
  };

  const executeTrash = async () => {
    setPhase('working');
    setError('');
    try {
      const response = await base44.functions.invoke('manageProductLifecycle', {
        action: 'trash',
        product_id: product.id,
        sku: product.sku,
      });
      if (response?.data?.trashed) {
        onDone();
      } else {
        throw new Error(response?.data?.error || 'Could not trash the product.');
      }
    } catch (err) {
      setError(err?.message || 'Could not trash the product.');
      setPhase('confirm');
    }
  };

  const reset = () => {
    setPhase('idle');
    setAction(null);
    setReferenceData(null);
    setError('');
  };

  const busy = phase === 'checking' || phase === 'working';

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-700" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-red-800">Danger Zone</h3>
      </div>

      {phase === 'idle' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DCDBD6] bg-white p-3">
            <div className="text-xs text-[#3E4349]">
              <div className="text-sm font-semibold text-[#1B1A1A]">
                {isActive ? 'Deactivate product' : 'Activate product'}
              </div>
              <p className="mt-0.5">
                {isActive
                  ? 'Removes the product from new-design selectors and hides it from the active Price List. Historical projects are preserved.'
                  : 'Restores the product to new-design selectors and the active Price List.'}
              </p>
            </div>
            <button
              onClick={handleDeactivate}
              className="whitespace-nowrap rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-sm font-semibold text-[#3E4349] hover:bg-[#F4F3F1]"
            >
              {isActive ? 'Deactivate product' : 'Activate product'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-white p-3">
            <div className="text-xs text-[#3E4349]">
              <div className="text-sm font-semibold text-[#1B1A1A]">Move to Trash</div>
              <p className="mt-0.5">
                Removes the product from the Product Master entirely. Only available for products not referenced by any saved project. Hard delete is not available.
              </p>
            </div>
            <button
              onClick={handleTrash}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Move to Trash
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 p-4 text-sm text-[#3E4349]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === 'checking' ? 'Checking references…' : 'Processing…'}
        </div>
      )}

      {phase === 'confirm' && referenceData && (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#DCDBD6] bg-white p-4 text-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#625143]">
              {action === 'deactivate'
                ? (isActive ? 'Confirm deactivation' : 'Confirm activation')
                : 'Confirm move to trash'}
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="font-semibold text-[#625143]">Product name:</dt>
                <dd>{product.label}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold text-[#625143]">SKU:</dt>
                <dd className="font-mono">{product.sku}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold text-[#625143]">Current roles:</dt>
                <dd>{roleLabels}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold text-[#625143]">Reference count:</dt>
                <dd>
                  {referenceData.reference_count} saved project{referenceData.reference_count === 1 ? '' : 's'}
                  {action === 'deactivate' && (
                    <span className="ml-1 text-xs text-[#625143]">(preserved for historical projects)</span>
                  )}
                </dd>
              </div>
            </dl>
            {action === 'trash' && (
              <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-800">
                This will hide the product from the Product Master. The record is preserved in the database but no longer visible. Hard delete is not available.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={reset} className="rounded-lg border border-[#DCDBD6] px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              onClick={action === 'deactivate' ? executeDeactivate : executeTrash}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                action === 'trash' ? 'bg-red-700 hover:bg-red-800' : 'bg-[#213428] hover:bg-[#1a2a20]'
              }`}
            >
              {action === 'trash' ? <Trash2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {action === 'deactivate'
                ? (isActive ? 'Confirm deactivate' : 'Confirm activate')
                : 'Confirm move to trash'}
            </button>
          </div>
        </div>
      )}

      {phase === 'blocked' && referenceData && (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-white p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-bold text-red-800">
              <X className="h-4 w-4" /> Cannot move to trash
            </div>
            <p className="text-[#3E4349]">
              This product is referenced by <strong>{referenceData.reference_count}</strong> saved project{referenceData.reference_count === 1 ? '' : 's'} and cannot be trashed.
            </p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-[#3E4349]">
              {referenceData.references.map((ref) => (
                <li key={ref.project_id} className="flex gap-1">
                  <span className="font-semibold">{ref.project_name || 'Untitled'}</span>
                  {ref.client_name && <span className="text-[#625143]">— {ref.client_name}</span>}
                  <span className="text-[#625143]">({ref.fields.join(', ')})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#625143]">
              Deactivate it instead to preserve historical projects while removing it from new selections.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={reset} className="rounded-lg border border-[#DCDBD6] px-4 py-2 text-sm font-semibold">
              Close
            </button>
            <button
              onClick={reset}
              className="rounded-lg bg-[#213428] px-4 py-2 text-sm font-semibold text-white"
            >
              Deactivate instead
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
    </section>
  );
}