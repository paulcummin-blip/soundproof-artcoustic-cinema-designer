/**
 * FollowUpDialog.jsx
 * -------------------
 * Modal dialog for creating and updating DealerFollowUp records.
 * Admin enters: conversation notes, discovered reason, status, contact date,
 * next contact date. The observation and suggested question are carried from
 * the opportunity signal and shown read-only.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';

export default function FollowUpDialog({ opportunity, existing, onClose, onSave }) {
  const [status, setStatus] = useState(existing?.status || 'awaiting_follow_up');
  const [contactDate, setContactDate] = useState(
    existing?.contact_date ? existing.contact_date.slice(0, 10) : ''
  );
  const [nextContactDate, setNextContactDate] = useState(existing?.next_contact_date || '');
  const [conversationNotes, setConversationNotes] = useState(existing?.conversation_notes || '');
  const [discoveredReason, setDiscoveredReason] = useState(existing?.discovered_reason || '');

  if (!opportunity) return null;

  const handleSave = async () => {
    const data = {
      account_id: opportunity.accountId,
      account_name: opportunity.dealerName,
      project_id: null,
      project_name: null,
      opportunity_key: opportunity.opportunityKey,
      opportunity_type: opportunity.opportunityType,
      observation: opportunity.observation,
      reason: opportunity.reason,
      suggested_question: opportunity.suggestedQuestion || '',
      conversation_notes: conversationNotes || null,
      discovered_reason: discoveredReason || null,
      status,
      contact_date: contactDate ? new Date(contactDate).toISOString() : null,
      next_contact_date: nextContactDate || null,
      created_by_name: '',
    };
    const success = await onSave(data, existing?.id);
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
          maxWidth: 520,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: BRAND.text }}>Follow-up: {opportunity.dealerName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.muted }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ background: '#F8F8F7', border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 10, fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
            <div><strong style={{ color: BRAND.text }}>Observed:</strong> {opportunity.observation}</div>
            <div style={{ marginTop: 4 }}><strong style={{ color: BRAND.text }}>Why:</strong> {opportunity.reason}</div>
            {opportunity.suggestedQuestion && (
              <div style={{ marginTop: 4 }}><strong style={{ color: BRAND.text }}>Suggested question:</strong> {opportunity.suggestedQuestion}</div>
            )}
          </div>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
            >
              <option value="awaiting_follow_up">Awaiting follow-up</option>
              <option value="relevant">Relevant</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </Field>

          <Field label="Contact date">
            <input
              type="date"
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Next contact date">
            <input
              type="date"
              value={nextContactDate}
              onChange={(e) => setNextContactDate(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Conversation notes">
            <textarea
              value={conversationNotes}
              onChange={(e) => setConversationNotes(e.target.value)}
              placeholder="What was discussed..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <Field label="Discovered reason">
            <textarea
              value={discoveredReason}
              onChange={(e) => setDiscoveredReason(e.target.value)}
              placeholder="What you actually found out in the conversation..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={onSave._saving}>
            {existing ? 'Update record' : 'Save record'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid ${BRAND.border}`,
  fontSize: 13,
  color: BRAND.text,
  background: '#FFFFFF',
  outline: 'none',
};

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}