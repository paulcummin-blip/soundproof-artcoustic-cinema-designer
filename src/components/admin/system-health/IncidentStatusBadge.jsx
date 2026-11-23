import React from 'react';

const STATUS_COLORS = {
  open: '#B23A3A',
  investigating: '#625143',
  resolved: '#213428',
  dismissed: '#8A8477',
};

const NOTIFICATION_COLORS = {
  pending: '#625143',
  sent: '#213428',
  failed: '#B23A3A',
  not_required: '#8A8477',
  skipped: '#8A8477',
};

const SEVERITY_COLORS = {
  critical: '#B23A3A',
  high: '#625143',
  medium: '#3E4349',
  low: '#8A8477',
};

export function IncidentStatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#8A8477';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      border: `1px solid ${color}`, fontSize: 11, fontWeight: 600, color,
      background: '#FFFFFF',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}

export function NotificationStatusBadge({ status }) {
  const color = NOTIFICATION_COLORS[status] || '#8A8477';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, color,
      border: `1px solid ${color}`, background: '#FFFFFF',
    }}>
      {status}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const color = SEVERITY_COLORS[severity] || '#8A8477';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#FFFFFF',
      background: color, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {severity}
    </span>
  );
}

export default IncidentStatusBadge;