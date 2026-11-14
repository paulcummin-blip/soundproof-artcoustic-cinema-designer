/**
 * ProposalActivityCharts.jsx
 * --------------------------
 * Two monthly proposal-creation charts: proposal creation events and unique
 * projects with proposals. Both use the same monthly buckets so the admin can
 * compare event volume against unique project coverage.
 *
 * Read-only presentation. No writes.
 */

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';

export default function ProposalActivityCharts({ timeline, currency, sectorLabel }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: BRAND.subtext, fontSize: 13 }}>
        No proposal activity to display.
      </div>
    );
  }

  const data = timeline.map((bucket) => ({
    label: bucket.label,
    'Proposal events': bucket.events,
    'Unique projects': bucket.uniqueProjects,
  }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          Proposal creation events
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 16 }}>
          {sectorLabel ? `${sectorLabel} — ` : ''}Every genuine proposal creation, by month
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND.subtext }} axisLine={{ stroke: BRAND.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: BRAND.subtext }} axisLine={{ stroke: BRAND.border }} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar dataKey="Proposal events" fill="#213428" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          Unique projects with proposals
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 16 }}>
          {sectorLabel ? `${sectorLabel} — ` : ''}Distinct projects that received a proposal, by month
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND.subtext }} axisLine={{ stroke: BRAND.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: BRAND.subtext }} axisLine={{ stroke: BRAND.border }} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar dataKey="Unique projects" fill="#625143" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}