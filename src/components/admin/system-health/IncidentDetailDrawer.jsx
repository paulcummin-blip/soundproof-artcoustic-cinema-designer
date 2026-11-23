import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import IncidentStatusBadge, { NotificationStatusBadge, SeverityBadge } from './IncidentStatusBadge';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  border: '#DCDBD6',
  card: '#FFFFFF',
  btn: '#1B1A1A',
  btnText: '#FFFFFF',
};

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'dismissed'];

export default function IncidentDetailDrawer({ incident, onClose, onUpdated }) {
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [identity, setIdentity] = useState({ dealerName: null, projectName: null, clientName: null, loading: false });

  // Resolve the account (dealer) and project names when the drawer opens.
  // Never invents identity information — unresolved values stay null.
  useEffect(() => {
    if (!incident) return;
    let cancelled = false;
    setIdentity({ dealerName: null, projectName: null, clientName: null, loading: true });
    (async () => {
      const result = { dealerName: null, projectName: null, clientName: null };
      try {
        if (incident.account_id) {
          const acctPage = await base44.entities.Account.filter({ id: incident.account_id }, { limit: 1 });
          const acct = (acctPage?.items || [])[0] || null;
          if (acct?.name) result.dealerName = acct.name;
        }
      } catch { /* fail-open */ }
      try {
        if (incident.project_id) {
          const projPage = await base44.entities.Project.filter({ id: incident.project_id }, { limit: 1 });
          const proj = (projPage?.items || [])[0] || null;
          if (proj?.name) result.projectName = proj.name;
          if (proj?.client_name) result.clientName = proj.client_name;
        }
      } catch { /* fail-open */ }
      if (!cancelled) setIdentity({ ...result, loading: false });
    })();
    return () => { cancelled = true; };
  }, [incident?.id]);

  if (!incident) return null;

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    setError(null);
    try {
      await base44.functions.invoke('manageSystemHealthIncident', {
        action: 'update_status',
        incident_id: incident.id,
        status: newStatus,
      });
      onUpdated();
    } catch (err) {
      setError(err?.message || 'Failed to update incident status.');
    } finally {
      setUpdating(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setUpdating(true);
    setError(null);
    try {
      await base44.functions.invoke('manageSystemHealthIncident', {
        action: 'add_note',
        incident_id: incident.id,
        note: note.trim(),
      });
      setNote('');
      onUpdated();
    } catch (err) {
      setError(err?.message || 'Failed to add note.');
    } finally {
      setUpdating(false);
    }
  };

  const recoveryText = incident.recovery_attempted
    ? (incident.recovery_successful
      ? '✓ Automatic recovery succeeded.'
      : '✗ Automatic recovery attempted but failed.')
    : 'No automatic recovery was attempted.';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.3)', display: 'flex',
      justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxWidth: 520, height: '100%',
          background: BRAND.card, borderLeft: `1px solid ${BRAND.border}`,
          overflowY: 'auto', padding: 24, boxShadow: '-4px 0 12px rgba(0,0,0,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, fontFamily: 'Didact Gothic, sans-serif' }}>
              {incident.incident_reference}
            </div>
            <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>
              {incident.component} / {incident.operation}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', fontSize: 18, cursor: 'pointer',
            color: BRAND.subtext, padding: 4,
          }}>×</button>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <SeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.incident_status} />
          <NotificationStatusBadge status={incident.notification_status} />
        </div>

        {/* Details */}
        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          <DetailRow label="Error code" value={incident.error_code?.replace(/_/g, ' ') || '—'} />
          <DetailRow label="First detected" value={formatTime(incident.first_detected_at)} />
          <DetailRow label="Last detected" value={formatTime(incident.last_detected_at)} />
          <DetailRow label="Occurrences" value={String(incident.occurrence_count || 1)} />
          <DetailRow
            label="Dealer"
            value={identity.loading
              ? 'Resolving…'
              : identity.dealerName
                ? `${identity.dealerName} (${incident.account_id?.slice(0, 12)}…)`
                : (incident.account_id || '—')}
          />
          <DetailRow
            label="Project"
            value={identity.loading
              ? 'Resolving…'
              : identity.projectName
                ? `${identity.projectName}${identity.clientName ? ` (${identity.clientName})` : ''}`
                : (incident.project_id || '—')}
          />
          <DetailRow label="Proposal ID" value={incident.proposal_id || '—'} />
          <DetailRow label="Generation audit" value={incident.proposal_generation_id || '—'} />
        </div>

        {/* Diagnostic summary */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Diagnostic summary
          </div>
          <div style={{
            fontSize: 12, color: BRAND.text, background: '#F5F4F0',
            padding: 12, borderRadius: 8, border: `1px solid ${BRAND.border}`,
            lineHeight: 1.5,
          }}>
            {incident.diagnostic_summary || 'No diagnostic summary available.'}
          </div>
        </div>

        {/* Recovery */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Recovery
          </div>
          <div style={{ fontSize: 12, color: BRAND.text }}>{recoveryText}</div>
          {incident.recovery_summary && (
            <div style={{ marginTop: 4, fontSize: 12, color: BRAND.subtext }}>{incident.recovery_summary}</div>
          )}
        </div>

        {/* Notification failure */}
        {incident.notification_status === 'failed' && (
          <div style={{ marginBottom: 20, padding: 10, background: '#FBEAEA', borderRadius: 8, border: '1px solid #B23A3A' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B23A3A', marginBottom: 4 }}>Notification failed</div>
            <div style={{ fontSize: 12, color: BRAND.text }}>{incident.notification_error || 'Unknown error.'}</div>
          </div>
        )}

        {/* Admin notes */}
        {incident.admin_notes && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Admin notes
            </div>
            <div style={{
              fontSize: 12, color: BRAND.text, whiteSpace: 'pre-wrap',
              background: '#F5F4F0', padding: 12, borderRadius: 8, border: `1px solid ${BRAND.border}`,
              lineHeight: 1.5,
            }}>
              {incident.admin_notes}
            </div>
          </div>
        )}

        {/* Add note */}
        <div style={{ marginBottom: 20 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add an investigation note…"
            style={{
              width: '100%', minHeight: 60, padding: 10, fontSize: 12,
              border: `1px solid ${BRAND.border}`, borderRadius: 8,
              fontFamily: 'inherit', color: BRAND.text, resize: 'vertical',
            }}
          />
          <button
            onClick={addNote}
            disabled={updating || !note.trim()}
            style={{
              marginTop: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
              background: BRAND.btn, color: BRAND.btnText, border: 'none',
              borderRadius: 6, cursor: updating || !note.trim() ? 'default' : 'pointer',
              opacity: updating || !note.trim() ? 0.5 : 1, fontFamily: 'inherit',
            }}
          >
            Add note
          </button>
        </div>

        {/* Status management */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Incident status
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updating || s === incident.incident_status}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${s === incident.incident_status ? BRAND.text : BRAND.border}`,
                  background: s === incident.incident_status ? BRAND.text : BRAND.card,
                  color: s === incident.incident_status ? '#FFFFFF' : BRAND.subtext,
                  borderRadius: 6, cursor: updating || s === incident.incident_status ? 'default' : 'pointer',
                  opacity: updating ? 0.6 : 1, fontFamily: 'inherit',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 10, background: '#FBEAEA', borderRadius: 8, fontSize: 12, color: '#B23A3A' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
      <div style={{ width: 120, flexShrink: 0, color: '#737373', fontWeight: 600 }}>{label}:</div>
      <div style={{ color: '#0a0a0a', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}