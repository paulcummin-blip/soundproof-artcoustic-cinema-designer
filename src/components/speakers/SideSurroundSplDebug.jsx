import React from 'react';
import { formatDb } from '@/components/utils/formatDb';

function fmt(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(2)}${suffix}`;
  }
  return String(value);
}

function DebugRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E6E4DD] py-1 last:border-b-0">
      <span className="text-[#625143]">{label}</span>
      <span className="text-right font-mono text-[#1B1A1A] break-all">{value}</span>
    </div>
  );
}

export default function SideSurroundSplDebug({ roles = [], surrounds = {}, displayedSpl }) {
  const rows = roles
    .map((role) => ({ role, data: surrounds?.[role] }))
    .filter(({ data }) => data && Number.isFinite(data.value));

  if (rows.length === 0) return null;

  return (
    <details className="mt-3 rounded-md border border-dashed border-[#DCDBD6] bg-[#F8F8F7] px-2 py-1 text-[10px]" closed="true">
      <summary className="cursor-pointer select-none text-[#625143] font-semibold">debug: Side Surrounds SPL source</summary>
      <div className="mt-2 space-y-2">
        <DebugRow label="card formatted SPL" value={Number.isFinite(displayedSpl) ? formatDb(displayedSpl) : '—'} />
        {rows.map(({ role, data }) => {
          const debug = data?.debug || {};
          return (
            <div key={role} className="rounded border border-[#E6E4DD] bg-white p-2">
              <div className="mb-1 font-semibold text-[#213428]">{role}</div>
              <DebugRow label="selected role" value={fmt(debug.role || role)} />
              <DebugRow label="model key" value={fmt(debug.modelKey)} />
              <DebugRow label="model label" value={fmt(debug.modelLabel)} />
              <DebugRow label="raw stored SPL" value={fmt(data.value, ' dB')} />
              <DebugRow label="formatted role SPL" value={formatDb(data.value)} />
              <DebugRow label="distance to RSP" value={fmt(debug.distanceM, ' m')} />
              <DebugRow label="distance loss" value={fmt(debug.distanceLossDb, ' dB')} />
              <DebugRow label="sensitivity used" value={fmt(debug.sensitivityUsedDb, ' dB')} />
              <DebugRow label="power handling used" value={fmt(debug.powerHandlingW, ' W')} />
              <DebugRow label="amplifier power used" value={fmt(debug.ampPowerW, ' W')} />
              <DebugRow label="available power used" value={fmt(debug.availablePowerW, ' W')} />
              <DebugRow label="1m amp-limited SPL" value={fmt(debug.spl1mAmpLimitedDb, ' dB')} />
              <DebugRow label="max continuous SPL cap" value={fmt(debug.maxContinuousSplCapDb, ' dB')} />
              <DebugRow label="1m capped SPL" value={fmt(debug.spl1mCappedDb, ' dB')} />
              <DebugRow label="room support" value={fmt(debug.roomSupportDb, ' dB')} />
              <DebugRow label="final raw SPL" value={fmt(debug.finalRawSplDb, ' dB')} />
            </div>
          );
        })}
      </div>
    </details>
  );
}