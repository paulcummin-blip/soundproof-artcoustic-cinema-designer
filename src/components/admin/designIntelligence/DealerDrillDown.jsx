/**
 * DealerDrillDown.jsx
 * --------------------
 * The dealer drill-down panel: shows a selected dealer's projects,
 * specification patterns, current design values, room sizes, and
 * available engineering results. Allows an administrator to open
 * the actual project from the report.
 */

import React, { useMemo } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { BRAND, Button, Pill, Th, Td, TABLE_WRAP, TABLE } from '@/components/admin/intelligence/IntelligenceUi';
import { formatMoney, formatDate, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard from './IntelligenceCard';
import { buildRoomSizeSummary } from '@/lib/commercial/designIntelligence/roomSizeAnalysis';
import { buildEngineeringCoverage } from '@/lib/commercial/designIntelligence/engineeringCoverage';

export default function DealerDrillDown({ dealer, onBack }) {
  const families = dealer?.families || [];
  const roomSummary = useMemo(() => buildRoomSizeSummary(families), [families]);
  const engCoverage = useMemo(() => buildEngineeringCoverage(families), [families]);

  if (!dealer) return null;

  return (
    <IntelligenceCard
      title={dealer.dealerName}
      subtitle={`${dealer.territory || 'Territory unknown'} · ${families.length} project(s) · ${dealer.accountType || 'Unknown type'}`}
      actions={
        <Button variant="secondary" onClick={onBack}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Back to overview
          </span>
        </Button>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.accent, marginBottom: 4 }}>Projects</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text }}>{formatNumber(families.length)}</div>
          </div>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.accent, marginBottom: 4 }}>Valid rooms</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text }}>{formatNumber(roomSummary.validRoomCount)}</div>
          </div>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.accent, marginBottom: 4 }}>Published</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text }}>{formatNumber(engCoverage.publishedCount)}</div>
          </div>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.accent, marginBottom: 4 }}>Live value (ex VAT)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text }}>
              {families.filter((f) => f.liveValue !== null).reduce((s, f) => s + (Number(f.liveValue) || 0), 0) > 0
                ? formatMoney(families.filter((f) => f.liveValue !== null).reduce((s, f) => s + (Number(f.liveValue) || 0), 0), 'GBP')
                : '—'}
            </div>
          </div>
        </div>

        <div style={TABLE_WRAP}>
          <table style={TABLE}>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Client</Th>
                <Th>Config</Th>
                <Th align="right">Live value</Th>
                <Th align="right">Quoted value</Th>
                <Th>Published</Th>
                <Th>Created</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => (
                <tr key={family.id}>
                  <Td>
                    <div style={{ fontWeight: 600, color: BRAND.text }}>{family.name}</div>
                    {family.reference && <div style={{ fontSize: 11, color: BRAND.muted }}>{family.reference}</div>}
                  </Td>
                  <Td>{family.client || '—'}</Td>
                  <Td>{family.variations?.find((v) => v.isActive)?.format || '—'}</Td>
                  <Td align="right" mono>{family.liveValue !== null ? formatMoney(family.liveValue, 'GBP') : '—'}</Td>
                  <Td align="right" mono>{family.quotedValue !== null ? formatMoney(family.quotedValue, 'GBP') : '—'}</Td>
                  <Td>
                    {family.variations?.find((v) => v.isActive)?.publicationSummary
                      ? <Pill tone="good">Yes</Pill>
                      : <Pill tone="neutral">No</Pill>}
                  </Td>
                  <Td>{family.createdDate ? formatDate(family.createdDate) : '—'}</Td>
                  <Td>
                    <a
                      href={`/RoomDesigner?projectId=${family.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this project in the Room Designer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 12,
                        color: BRAND.primary,
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      Open <ExternalLink size={11} />
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IntelligenceCard>
  );
}