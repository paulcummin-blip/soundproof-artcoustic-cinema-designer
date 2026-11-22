/**
 * EnhancedDealerDetail.jsx
 * --------------------------
 * Expanded inline detail for a single dealer row in the Account Management
 * table. Shows: dealer identity, why flagged, project activity, project
 * sizes/values, follow-up notes, suggested questions, next contact date,
 * links to dealer account and projects, and the Change Category control.
 */

import React from 'react';
import { Phone, Tag, ExternalLink, Calendar, FolderOpen, TrendingUp, Edit3 } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatMoney, formatDate, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { OPPORTUNITY_CATEGORIES, MANUAL_CATEGORY_LABELS } from '@/lib/commercial/designIntelligence/accountManagementConfig';

const FOLLOWUP_STATUS_LABELS = {
  relevant: 'Relevant',
  dismissed: 'Dismissed',
  awaiting_follow_up: 'Awaiting',
};

export default function EnhancedDealerDetail({ dealer, onLogFollowUp, onChangeCategory }) {
  const signals = dealer.signals || [];
  const hasSignals = signals.length > 0;
  const projectSummary = dealer.projectSummary;
  const followUp = dealer.followUpRecord;

  // Primary signal for follow-up reference
  const primarySignal = signals[0] || {
    opportunityKey: `manual:${dealer.accountId}`,
    opportunityType: dealer.opportunitySource === 'manual' ? 'manual' : 'needs_attention',
    accountId: dealer.accountId,
    dealerName: dealer.dealerName,
    observation: dealer.primaryObservation,
    reason: dealer.manualOverride?.reason || 'No specific signal — see project activity below.',
    suggestedQuestion: null,
  };

  return (
    <div style={{ background: '#FAFAF8', padding: '14px 18px', display: 'grid', gap: 12 }}>
      {/* Header: category + source badge + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>{dealer.dealerName}</span>
          {dealer.accountType && (
            <Pill tone="neutral">{dealer.accountType}</Pill>
          )}
          <Pill tone={dealer.opportunitySource === 'manual' ? 'warn' : 'neutral'}>
            {dealer.opportunitySource === 'manual' ? 'Manually assigned' : 'System identified'}
          </Pill>
          {dealer.followUpDue && <Pill tone="bad">Follow-up due</Pill>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="secondary" onClick={() => onChangeCategory(dealer)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={12} /> Change Category
            </span>
          </Button>
          <Button variant="secondary" onClick={() => onLogFollowUp(primarySignal, followUp)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Phone size={12} /> {followUp ? 'Update follow-up' : 'Log follow-up'}
            </span>
          </Button>
        </div>
      </div>

      {/* Why flagged */}
      <div style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 6,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Why Sound Proof flagged this dealer
        </div>
        {dealer.manualOverride ? (
          <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
            <strong style={{ color: BRAND.text }}>Manual assignment:</strong>{' '}
            {MANUAL_CATEGORY_LABELS[dealer.manualOverride.manual_category] || dealer.manualOverride.manual_category}
            {dealer.manualOverride.reason && <span> — {dealer.manualOverride.reason}</span>}
            <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 2 }}>
              Assigned by {dealer.manualOverride.assigned_by || 'admin'} on {formatDate(dealer.manualOverride.assigned_at)}
            </div>
          </div>
        ) : hasSignals ? (
          signals.map((signal) => (
            <div key={signal.opportunityKey} style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
              <strong style={{ color: BRAND.text }}>{signal.opportunityType.replace(/_/g, ' ')}:</strong>{' '}
              {signal.observation}
              {signal.reason && <div style={{ color: BRAND.muted }}>Reason: {signal.reason}</div>}
              {signal.suggestedQuestion && (
                <div style={{
                  fontSize: 12, color: BRAND.info, lineHeight: 1.5,
                  background: BRAND.infoBg, borderRadius: 6, padding: '4px 8px', marginTop: 4,
                }}>
                  <strong>Suggested question:</strong> {signal.suggestedQuestion}
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.5 }}>
            {dealer.systemCategory === OPPORTUNITY_CATEGORIES.INSUFFICIENT_EVIDENCE
              ? 'Has project history but no signals passed the action thresholds.'
              : 'No project activity recorded.'}
          </div>
        )}
      </div>

      {/* Project activity */}
      {projectSummary && (
        <div style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          padding: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <FolderOpen size={12} /> Project activity
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            <Metric label="Projects" value={formatNumber(projectSummary.count)} />
            {projectSummary.latestDate && (
              <Metric label="Latest" value={formatDate(projectSummary.latestDate)} icon={<Calendar size={10} />} />
            )}
            {projectSummary.liveValue !== null && (
              <Metric label="Live value" value={formatMoney(projectSummary.liveValue, 'GBP')} icon={<TrendingUp size={10} />} />
            )}
            {projectSummary.quotedValue !== null && (
              <Metric label="Quoted" value={formatMoney(projectSummary.quotedValue, 'GBP')} />
            )}
          </div>
          {projectSummary.projects.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {projectSummary.projects.slice(0, 5).map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: BRAND.subtext }}>
                  <span>
                    <strong style={{ color: BRAND.text }}>{p.name || 'Unnamed'}</strong>
                    {p.client && <span style={{ color: BRAND.muted }}> · {p.client}</span>}
                    {p.config && <span style={{ color: BRAND.muted }}> · {p.config}</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.liveValue !== null && <span style={{ fontSize: 11, color: BRAND.muted }}>{formatMoney(p.liveValue, 'GBP')}</span>}
                    <a
                      href={`/RoomDesigner?projectId=${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: BRAND.primary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11 }}
                    >
                      Open <ExternalLink size={10} />
                    </a>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Follow-up notes */}
      {followUp && (
        <div style={{
          background: BRAND.warnBg,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          color: BRAND.subtext,
          lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Follow-up record
          </div>
          <strong style={{ color: BRAND.text }}>Status:</strong>{' '}
          {FOLLOWUP_STATUS_LABELS[followUp.status] || followUp.status}
          {followUp.contact_date && <span> · Last contact: {formatDate(followUp.contact_date)}</span>}
          {followUp.next_contact_date && <span> · Next: {formatDate(followUp.next_contact_date)}</span>}
          {followUp.conversation_notes && (
            <div style={{ marginTop: 4, fontStyle: 'italic' }}>Notes: "{followUp.conversation_notes}"</div>
          )}
          {followUp.discovered_reason && (
            <div style={{ marginTop: 2, fontStyle: 'italic', color: BRAND.muted }}>Discovered: "{followUp.discovered_reason}"</div>
          )}
        </div>
      )}

      {/* Links */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={`/admin/accounts/${dealer.accountId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: BRAND.primary, textDecoration: 'none', fontWeight: 600,
          }}
        >
          <ExternalLink size={11} /> Dealer account
        </a>
        {projectSummary && projectSummary.projects.length > 0 && (
          <a
            href={`/admin/accounts/${dealer.accountId}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: BRAND.primary, textDecoration: 'none', fontWeight: 600,
            }}
          >
            <FolderOpen size={11} /> {projectSummary.count} project(s)
          </a>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 2 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{value}</div>
    </div>
  );
}