/**
 * ChangeCategoryDialog.jsx
 * --------------------------
 * Modal dialog for manually assigning or changing a dealer's opportunity
 * category, or returning the dealer to automatic classification.
 *
 * Manual categories: Overlooked, Need Attention, Emerging, No current opportunity.
 * Follow-ups Due is NOT available here — it remains date-driven.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { MANUAL_CATEGORY_VALUES, MANUAL_CATEGORY_LABELS } from '@/lib/commercial/designIntelligence/accountManagementConfig';

const OPTIONS = [
  { value: MANUAL_CATEGORY_VALUES.OVERLOOKED, label: 'Overlooked', description: 'Relationship review warranted' },
  { value: MANUAL_CATEGORY_VALUES.NEEDS_ATTENTION, label: 'Need Attention', description: 'Onboarding follow-up needed' },
  { value: MANUAL_CATEGORY_VALUES.EMERGING, label: 'Emerging', description: 'Developing activity' },
  { value: MANUAL_CATEGORY_VALUES.NO_CURRENT_OPPORTUNITY, label: 'No current opportunity', description: 'Reviewed, nothing to act on now' },
];

export default function ChangeCategoryDialog({ dealer, currentOverride, onClose, onSave, onRemoveAuto }) {
  const [selected, setSelected] = useState(currentOverride?.manual_category || '');
  const [reason, setReason] = useState(currentOverride?.reason || '');

  if (!dealer) return null;

  const handleSave = async () => {
    if (!selected) return;
    const success = await onSave({
      account_id: dealer.accountId,
      account_name: dealer.dealerName,
      manual_category: selected,
      reason: reason || null,
    });
    if (success) onClose();
  };

  const handleReturnToAuto = async () => {
    const success = await onRemoveAuto(dealer.accountId);
    if (success) onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }} onClick={onClose}>
      <div
        style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: BRAND.text }}>Category: {dealer.dealerName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.muted }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: BRAND.subtext }}>
          <strong style={{ color: BRAND.text }}>Current:</strong>{' '}
          {currentOverride
            ? <Pill tone="warn">Manually assigned: {MANUAL_CATEGORY_LABELS[currentOverride.manual_category] || currentOverride.manual_category}</Pill>
            : <Pill tone="neutral">System identified: {dealer.systemCategory || dealer.opportunityCategory}</Pill>}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Assign manual category
        </div>
        <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: `2px solid ${selected === opt.value ? BRAND.primary : BRAND.border}`,
                background: selected === opt.value ? '#F6F3EE' : '#FFFFFF',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: `2px solid ${selected === opt.value ? BRAND.primary : BRAND.border}`,
                flexShrink: 0,
                background: selected === opt.value ? BRAND.primary : 'transparent',
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.text }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: BRAND.muted }}>{opt.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Reason (encouraged)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you assigning this category?"
            rows={2}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${BRAND.border}`,
              fontSize: 13,
              color: BRAND.text,
              background: '#FFFFFF',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {currentOverride && (
            <Button variant="secondary" onClick={handleReturnToAuto}>
              Return to automatic
            </Button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!selected}>
              Save category
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}