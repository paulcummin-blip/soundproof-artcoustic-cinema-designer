import React, { useMemo } from 'react';

/**
 * SubwooferInstanceList
 *
 * Display-only view of canonical subwooferInstances, grouped by design group
 * (front / rear). Reads exclusively from appState.subwooferInstances — never
 * from front_subs_cfg / rear_subs_cfg.
 *
 * Stage 2B.1: visibility only. No controls, no mutations, no drag wiring.
 */
function formatPos(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)} m`;
}

function InstanceRow({ instance, selected, onSelect }) {
  const id = instance?.id ?? '—';
  const model = instance?.model ?? '—';
  const enabled = instance?.enabled !== false;
  const x = formatPos(instance?.position?.x);
  const y = formatPos(instance?.position?.y);

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
      <div className="ml-auto flex gap-3 text-[#625143]">
        <span>X: <span className="text-[#1B1A1A] font-medium">{x}</span></span>
        <span>Y: <span className="text-[#1B1A1A] font-medium">{y}</span></span>
      </div>
    </div>
  );
}

function GroupSection({ title, instances, selectedSubId, onSelect }) {
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
        <p className="text-[11px] text-[#625143] italic">No subwoofer instances.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-[#DCDBD6] pt-3">
      <h5 className="text-[13px] font-semibold text-[#1B1A1A] mb-2">
        Instances <span className="text-[#625143] font-normal">(display only)</span>
      </h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GroupSection
          title="Front"
          instances={frontInstances}
          selectedSubId={selectedSubId}
          onSelect={setSelectedSubId}
        />
        <GroupSection
          title="Rear"
          instances={rearInstances}
          selectedSubId={selectedSubId}
          onSelect={setSelectedSubId}
        />
      </div>
      {otherInstances.length > 0 && (
        <div className="mt-2">
          <GroupSection
            title="Other"
            instances={otherInstances}
            selectedSubId={selectedSubId}
            onSelect={setSelectedSubId}
          />
        </div>
      )}
    </div>
  );
}