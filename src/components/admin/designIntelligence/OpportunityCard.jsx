/**
 * OpportunityCard.jsx
 * --------------------
 * Shared card for each opportunity signal in the account-management view.
 * Shows: Dealer → Recorded observation → Suggested question → Follow-up status.
 * Allows the admin to log a follow-up.
 */

import React from 'react';
import { Plus, Check, X, Clock, Phone } from 'lucide-react';
import { BRAND, Pill, Button } from '@/components/admin/intelligence/IntelligenceUi';
import { formatDate } from '@/lib/commercial/projectReporting/formatMoney';

const STATUS_TONES = {
  relevant: 'good',
  dismissed: 'neutral',
  awaiting_follow_up: 'warn',
};

const STATUS_LABELS = {
  relevant: 'Relevant',
  dismissed: 'Dismissed',
  awaiting_follow_up: 'Awaiting follow-up',
};

export default function OpportunityCard({ opportunity, followUp, onLogFollowUp, sectorLabel }) {
  const sectorTag = sectorLabel || opportunity.sectorKey || '—';

  return (
    <div style={{
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      background: BRAND.card,
      padding: 14,
      display: 'grid',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.text }}>
            {opportunity.dealerName}
          </div>
          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2 }}>
            {sectorTag}{opportunity.territory ? ` · ${opportunity.territory}` : ''}
            {opportunity.dealerGroup ? ` · ${opportunity.dealerGroup}` : ''}
          </div>
        </div>
        {followUp ? (
          <Pill tone={STATUS_TONES[followUp.status] || 'neutral'} title={followUp.conversation_notes || followUp.reason}>
            {STATUS_LABELS[followUp.status] || followUp.status}
          </Pill>
        ) : (
          <Pill tone="neutral">No follow-up</Pill>
        )}
      </div>

      <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
        <strong style={{ color: BRAND.text }}>Observed:</strong> {opportunity.observation}
      </div>

      <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
        <strong style={{ color: BRAND.text }}>Why:</strong> {opportunity.reason}
      </div>

      {opportunity.suggestedQuestion && (
        <div style={{
          fontSize: 12,
          color: BRAND.info,
          lineHeight: 1.5,
          background: BRAND.infoBg,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 6,
          padding: '6px 10px',
        }}>
          <strong>Suggested question:</strong> {opportunity.suggestedQuestion}
        </div>
      )}

      {followUp && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: BRAND.muted }}>
          {followUp.contact_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Phone size={11} /> Last contact: {formatDate(followUp.contact_date)}
            </span>
          )}
          {followUp.next_contact_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Clock size={11} /> Next: {formatDate(followUp.next_contact_date)}
            </span>
          )}
          {followUp.conversation_notes && (
            <span title={followUp.conversation_notes} style={{ fontStyle: 'italic', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{followUp.conversation_notes}"
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => onLogFollowUp(opportunity, followUp)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {followUp ? 'Update follow-up' : 'Log follow-up'}
          </span>
        </Button>
      </div>
    </div>
  );
}