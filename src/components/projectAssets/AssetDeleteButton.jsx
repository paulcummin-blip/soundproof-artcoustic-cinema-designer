/**
 * AssetDeleteButton
 * -----------------
 * A compact trash-icon button that opens a confirmation dialog identifying the
 * exact asset, then deletes only that one stored record.
 *
 * Self-contained: owns its open state, its confirmation dialog, the delete
 * call and its loading/error state. The parent only needs to pass the record,
 * a human label for the confirmation copy, and an optional onDeleted callback.
 *
 * Never deletes on the first click. The dialog requires explicit confirmation.
 */
import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteProjectAsset } from './deleteProjectAsset';

/**
 * @param {Object}   props
 * @param {Object}   props.record        - the asset record to delete
 * @param {'export'|'image'} props.kind  - record entity kind
 * @param {string}   props.assetLabel    - exact asset name shown in the dialog
 * @param {string}   props.typeLabel     - e.g. "Technical Report", "image"
 * @param {() => void} [props.onDeleted]  - called after a successful delete
 */
export default function AssetDeleteButton({ record, kind, assetLabel, typeLabel, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleConfirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      await deleteProjectAsset(record, kind);
      onDeleted?.();
      setOpen(false);
    } catch (e) {
      setErr(e?.message || 'This asset could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  const typeWord = typeLabel || 'asset';
  const title = `Delete this ${typeWord}?`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-[#E2DED7] transition-colors shrink-0"
        title={`Delete ${assetLabel || typeWord}`}
        aria-label={`Delete ${assetLabel || typeWord}`}
      >
        <Trash2 className="w-3 h-3" style={{ color: '#9B3A3A' }} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (!busy) setOpen(false); }}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-[#DCDBD6] bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
              {title}
            </h3>
            <p className="mt-2 text-sm text-[#3E4349] leading-relaxed">
              This will remove the selected file from Project Assets. Other documents and project versions will not be affected.
            </p>
            {assetLabel && (
              <p className="mt-2 text-xs text-[#8B8378] break-all" title={assetLabel}>
                {assetLabel}
              </p>
            )}
            {err && (
              <p className="mt-2 text-xs text-[#9B3A3A]">{err}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-sm font-medium border border-[#DCDBD6] text-[#3E4349] bg-white hover:bg-[#F8F8F7] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-[#9B3A3A] hover:bg-[#8A2F2F] disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}