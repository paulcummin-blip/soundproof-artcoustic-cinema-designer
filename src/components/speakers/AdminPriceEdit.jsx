// Admin-only inline price editor for Speaker Database product cards.
//
// Writes ONLY to the canonical ProductPrice entity (never to Speaker.price
// or any local/speaker-database price field). Finds the ProductPrice record
// by SKU (normalised model key); updates price_ex_vat if found, or creates
// a new ProductPrice record if none exists for that SKU.
//
// Normal dealer users never see this component — the parent gates on
// User.role === 'admin'. ProductPrice RLS also blocks non-admin writes
// server-side, so a browser-manufactured request cannot mutate prices.
//
// Engineering speaker data (sensitivity, impedance, max power, dispersion,
// frequency response, dimensions, polar data, etc.) is NOT editable here —
// price only.

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const CATEGORY_MAP = {
  main: 'Loudspeaker',
  center: 'Loudspeaker',
  surround: 'Loudspeaker',
  overhead: 'Loudspeaker',
  subwoofer: 'Subwoofer',
};

export default function AdminPriceEdit({ sku, modelLabel, speakerType, currentPrice, onSaved }) {
  const [open, setOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleOpen = () => {
    setNewPrice(currentPrice != null ? String(currentPrice) : '');
    setError(null);
    setOpen(true);
  };

  const handleCancel = () => {
    setOpen(false);
    setNewPrice('');
    setError(null);
  };

  const handleSave = async () => {
    const parsed = parseFloat(newPrice);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid non-negative price');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const existing = await base44.entities.ProductPrice.filter({ sku });
      if (Array.isArray(existing) && existing.length > 0) {
        await base44.entities.ProductPrice.update(existing[0].id, { price_ex_vat: parsed });
      } else {
        await base44.entities.ProductPrice.create({
          sku,
          label: modelLabel,
          category: CATEGORY_MAP[speakerType] || 'Loudspeaker',
          price_ex_vat: parsed,
          active: true,
        });
      }
      setOpen(false);
      setNewPrice('');
      if (onSaved) onSaved();
    } catch (err) {
      setError('Failed to save price');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        style={{
          fontSize: 11,
          color: '#625143',
          textDecoration: 'underline',
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: 2,
        }}
      >
        Edit Price
      </button>
    );
  }

  return (
    <div style={{ marginTop: 6, padding: 8, border: '1px solid #DCDBD6', borderRadius: 6, background: '#F8F8F7' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#1B1A1A', marginBottom: 2 }}>{modelLabel}</div>
      <div style={{ fontSize: 10, color: '#625143', marginBottom: 4 }}>SKU: {sku}</div>
      <div style={{ fontSize: 11, color: '#3E4349', marginBottom: 4 }}>
        Current: £{Number(currentPrice || 0).toLocaleString()}
      </div>
      <input
        type="number"
        value={newPrice}
        onChange={(e) => setNewPrice(e.target.value)}
        placeholder="New price (ex VAT)"
        style={{
          width: '100%',
          padding: '5px 8px',
          border: '1px solid #DCDBD6',
          borderRadius: 4,
          fontSize: 12,
          marginBottom: 6,
          outline: 'none',
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: '#B23A3A', marginBottom: 4 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '5px 12px',
            borderRadius: 4,
            border: '1px solid #213428',
            background: '#213428',
            color: '#FFFFFF',
            fontSize: 11,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          style={{
            padding: '5px 12px',
            borderRadius: 4,
            border: '1px solid #DCDBD6',
            background: '#FFFFFF',
            color: '#3E4349',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}