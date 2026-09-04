import React, { useMemo, useState } from 'react';
import { useSubwooferCompatibilityActions } from '@/components/hooks/useSubwooferCompatibilityActions';
import { subwooferDisplayLabel } from '@/components/utils/subwooferDisplayLabel';

/**
 * SubwooferInstanceList
 *
 * View + position editing of canonical subwooferInstances, grouped by design
 * group (front / rear). Reads exclusively from appState.subwooferInstances.
 *
 * Stage 2B.3: X/Y position editing via updateInstancePosition (canonical-first
 * commit). Model, quantity, drag, symmetry, and recommendation logic untouched.
 */

function PositionInput({ label, value, onCommit, disabled }) {
  const [draft, setDraft] = useState(() => (Number.isFinite(Number(value)) ? String(Number(value).toFixed(2)) : ''));

  // Sync external changes (drag, recommendation) into the field when not focused.
  const external = Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '';
  const [focused, setFocused] = useState(false);

  React.useEffect(() => {
    if (!focused) {
      setDraft(external);
    }
  }, [external, focused]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      onCommit(n);
    } else {
      setDraft(external);
    }
  };

  return (
    <label className="flex items-center gap-1 text-[#625143]">
      <span className="text-[10px] font-medium">{label}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={draft}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        className="w-14 h-6 px-1 text-[11px] text-center bg-white border border-[#DCDBD6] rounded focus:border-[#213428] focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

function InstanceRow({ instance, selected, onSelect, onPositionChange, canEdit }) {
  const id = instance?.id ?? '—';
  const model = subwooferDisplayLabel(instance?.model) || '—';
  const enabled = instance?.enabled !== false;
  const px = Number(instance?.position?.x);
  const py = Number(instance?.position?.y);

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[11px] cursor-pointer transition-colors ${
        selected
          ? 'border-[#213428] bg-[#213428]/8 ring-1 ring-[#213428]/30'
          : 'border-[#E7E4DF] bg-white/60 hover:border-[#213428]/40 hover:bg-white'
      }`}
    >
      <div className="shrink-0 w-20 truncate font-mono text-[#625143]" title={id}>
        {id}
      </div>
      <div className="shrink-0 w-20 truncate font-medium text-[#1B1A1A]" title={model}>
        {model}
      </div>
      <div className="shrink-0 w-14">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            enabled
              ? 'bg-[#213428]/10 text-[#213428]'
              : 'bg-[#DCDBD6] text-[#625143]'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>
      <div className="ml-auto flex gap-2" onClick={(e) => e.stopPropagation()}>
        <PositionInput
          label="X"
          value={px}
          disabled={!canEdit || !enabled}
          onCommit={(n) => onPositionChange(id, { x: n, y: py })}
        />
        <PositionInput
          label="Y"
          value={py}
          disabled={!canEdit || !enabled}
          onCommit={(n) => onPositionChange(id, { x: px, y: n })}
        />
      </div>
    </div>
  );
}

function GroupSection({ title, instances, selectedSubId, onSelect, onPositionChange, canEdit }) {
  if (!instances || instances.length === 0) {
    return (
      <div>
        <h6 className="text-[12px] font-semibold text-[#1B1A1A] mb-1">{title}</h6>
        <p className="text-[11px] text-[#625143] italic">No instances</p>
      </div>
    );
  }
  return (
    <div>
      <h6 className="text-[12px] font-semibold text-[#1B1A1A] mb-1">
        {title} <span className="text-[#625143] font-normal">({instances.length})</span>
      </h6>
      <div className="space-y-1">
        {instances.map((inst) => (
          <InstanceRow
            key={inst?.id ?? `inst-${Math.random()}`}
            instance={inst}
            selected={selectedSubId != null && inst?.id === selectedSubId}
            onSelect={() => onSelect(inst?.id ?? null)}
            onPositionChange={onPositionChange}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
}

export default function SubwooferInstanceList({ appState }) {
  const instances = Array.isArray(appState?.subwooferInstances)
    ? appState.subwooferInstances
    : [];
  const selectedSubId = appState?.selectedSubId ?? null;
  const setSelectedSubId = appState?.setSelectedSubId;

  const compat = useSubwooferCompatibilityActions(
    appState,
    appState?.frontSubsCfg,
    appState?.rearSubsCfg
  );
  const canEdit = compat.hasCanonicalInstances;

  const handlePositionChange = (id, position) => {
    compat.updateInstancePosition(id, position);
  };

  const { frontInstances, rearInstances, otherInstances } = useMemo(() => {
    const front = [];
    const rear = [];
    const other = [];
    for (const inst of instances) {
      const group = String(inst?.legacyGroup ?? inst?.group ?? '').toLowerCase();
      if (group === 'front') {
        front.push(inst);
      } else if (group === 'rear') {
        rear.push(inst);
      } else {
        other.push(inst);
      }
    }
    return { frontInstances: front, rearInstances: rear, otherInstances: other };
  }, [instances]);

  if (instances.length === 0) {
    return (
      <div className="mt-4 border-t border-[#DCDBD6] pt-3">
        <h5 className="text-[13px] font-semibold text-[#1B1A1A] mb-1">Instances</h5>
        <p className="text-[11px] text-[#625143] italic">No subwoofer instances yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-[#DCDBD6] pt-3">
      <h5 className="text-[13px] font-semibold text-[#1B1A1A] mb-2">
        Instances <span className="text-[#625143] font-normal">(position editable)</span>
      </h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GroupSection
          title="Front"
          instances={frontInstances}
          selectedSubId={selectedSubId}
          onSelect={setSelectedSubId}
          onPositionChange={handlePositionChange}
          canEdit={canEdit}
        />
        <GroupSection
          title="Rear"
          instances={rearInstances}
          selectedSubId={selectedSubId}
          onSelect={setSelectedSubId}
          onPositionChange={handlePositionChange}
          canEdit={canEdit}
        />
      </div>
      {otherInstances.length > 0 && (
        <div className="mt-2">
          <GroupSection
            title="Other"
            instances={otherInstances}
            selectedSubId={selectedSubId}
            onSelect={setSelectedSubId}
            onPositionChange={handlePositionChange}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
}