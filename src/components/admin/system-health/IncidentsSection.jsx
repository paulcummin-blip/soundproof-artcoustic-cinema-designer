import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import IncidentStatusBadge, { NotificationStatusBadge, SeverityBadge } from './IncidentStatusBadge';
import IncidentDetailDrawer from './IncidentDetailDrawer';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  border: '#DCDBD6',
  bg: 'rgb(248 248 247)',
  card: '#FFFFFF',
  hover: '#F5F4F0',
};

const FILTERS = [
  { key: 'all', label: 'All incidents' },
  { key: 'open', label: 'Open' },
  { key: 'critical', label: 'Critical' },
  { key: 'repeated', label: 'Repeated failures' },
  { key: 'recovered', label: 'Recovered operations' },
  { key: 'notification_failed', label: 'Notification failures' },
];

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function matchesFilter(incident, filter) {
  switch (filter) {
    case 'open':
      return incident.incident_status === 'open' || incident.incident_status === 'investigating';
    case 'critical':
      return incident.severity === 'critical';
    case 'repeated':
      return (incident.occurrence_count || 1) > 1;
    case 'recovered':
      return incident.recovery_successful === true;
    case 'notification_failed':
      return incident.notification_status === 'failed';
    default:
      return true;
  }
}

export default function IncidentsSection() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedIncident, setSelectedIncident] = useState(null);

  const loadIncidents = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const page = await base44.entities.SystemHealthIncident.filter(
        {},
        { sort: '-last_detected_at', limit: 50 },
      );
      setIncidents(Array.isArray(page) ? page : page?.items || []);
    } catch (err) {
      setError(err?.message || 'Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  // Deep-link: auto-open the incident referenced in ?incident=INC-XXXX so
  // alert emails link directly to the correct incident.
  useEffect(() => {
    if (incidents.length === 0 || selectedIncident) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('incident');
      if (!ref) return;
      const match = incidents.find((i) => i.incident_reference === ref);
      if (match) setSelectedIncident(match);
    } catch {
      // URL parsing is best-effort.
    }
  }, [incidents, selectedIncident]);

  if (!isAdmin) return null;

  const filtered = incidents.filter((i) => matchesFilter(i, activeFilter));

  const counts = {
    open: incidents.filter((i) => i.incident_status === 'open' || i.incident_status === 'investigating').length,
    critical: incidents.filter((i) => i.severity === 'critical').length,
    repeated: incidents.filter((i) => (i.occurrence_count || 1) > 1).length,
    recovered: incidents.filter((i) => i.recovery_successful === true).length,
    notification_failed: incidents.filter((i) => i.notification_status === 'failed').length,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 10 }}>
        System Health Incidents
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Open', value: counts.open, color: '#B23A3A' },
          { label: 'Critical', value: counts.critical, color: '#B23A3A' },
          { label: 'Repeated', value: counts.repeated, color: '#625143' },
          { label: 'Recovered', value: counts.recovered, color: '#213428' },
          { label: 'Notification failed', value: counts.notification_failed, color: '#B23A3A' },
        ].map((s) => (
          <div key={s.label} style={{
            padding: '10px 16px', background: BRAND.card, border: `1px solid ${BRAND.border}`,
            borderRadius: 8, minWidth: 120,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: `1px solid ${activeFilter === f.key ? BRAND.text : BRAND.border}`,
              background: activeFilter === f.key ? BRAND.text : BRAND.card,
              color: activeFilter === f.key ? '#FFFFFF' : BRAND.subtext,
              fontFamily: 'inherit',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Incidents table */}
      <div style={{
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: BRAND.subtext, fontSize: 13 }}>
            Loading incidents…
          </div>
        ) : error ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#B23A3A', fontSize: 13 }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: BRAND.subtext, fontSize: 13 }}>
            No incidents match this filter.
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 80px 70px 60px 70px 100px',
              padding: '10px 16px', background: '#F5F4F0',
              borderBottom: `1px solid ${BRAND.border}`,
              fontSize: 10, fontWeight: 700, color: BRAND.subtext,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              <div>Reference</div>
              <div>Operation</div>
              <div>Severity</div>
              <div>Count</div>
              <div>Status</div>
              <div>Notify</div>
              <div>Last detected</div>
            </div>
            {/* Rows */}
            {filtered.map((incident) => (
              <div
                key={incident.id}
                onClick={() => setSelectedIncident(incident)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 80px 70px 60px 70px 100px',
                  padding: '12px 16px', alignItems: 'center',
                  borderBottom: `1px solid ${BRAND.border}`,
                  cursor: 'pointer', fontSize: 12, color: BRAND.text,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 600, fontSize: 11 }}>{incident.incident_reference}</div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{incident.operation || '—'}</div>
                  <div style={{fontSize:11,marginTop:3}}>{[incident.account_name,incident.project_name,incident.client_name,incident.version_name].filter(Boolean).join(' · ') || (incident.test_run_id ? 'Administrator test' : 'Open for identity details')}</div>
                  <div style={{ fontSize: 10, color: BRAND.subtext, marginTop: 2 }}>
                    {incident.error_code?.replace(/_/g, ' ') || '—'}
                  </div>
                </div>
                <div><SeverityBadge severity={incident.severity} /></div>
                <div style={{ fontWeight: 600 }}>{incident.occurrence_count || 1}</div>
                <div><IncidentStatusBadge status={incident.incident_status} /></div>
                <div><NotificationStatusBadge status={incident.notification_status} /></div>
                <div style={{ fontSize: 11, color: BRAND.subtext }}>{formatTime(incident.last_detected_at)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {selectedIncident && (
        <IncidentDetailDrawer
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onUpdated={() => { setSelectedIncident(null); loadIncidents(); }}
        />
      )}
    </div>
  );
}