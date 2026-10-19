import React, { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Pencil, Power, RefreshCw, GitMerge } from 'lucide-react';

/**
 * AdiKnowledgeRow
 * ---------------
 * ONE LEARNED MATTER, AS A MASTER ADMIN SEES AND CORRECTS IT.
 *
 * Why it exists: the record states the design condition it belongs to, the canonical
 * rationale, how confident ADI is, how many separate projects have given that reason
 * and when it was last confirmed. The five curation decisions are on the row itself —
 * approve, edit the wording, disable or enable, merge a duplicate into it, reset its
 * confidence — so a record is never more than one action from being right.
 */
const STATUS_LABEL = {
  candidate: 'Candidate',
  strengthened: 'Strengthened candidate',
  learned: 'Learned rationale',
  disabled: 'Disabled',
};

const BAND_STYLE = {
  high: 'bg-[#213428] text-white',
  moderate: 'bg-[#EFE9DC] text-[#625143]',
  low: 'bg-[#F3F1EC] text-[#8A8477]',
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdiKnowledgeRow({ record = null, records = [], busy = null, onAction }) {
  const [editing, setEditing] = useState(false);
  const [wording, setWording] = useState(record?.canonical_meaning || '');
  const [mergeInto, setMergeInto] = useState('');

  if (!record) return null;
  const condition = (record.condition_text || []).join(' · ');
  const others = (Array.isArray(records) ? records : []).filter((item) => item.id !== record.id);
  const isBusy = Boolean(busy) && String(busy) === String(record.id || record.knowledge_key);
  const disabled = record.status === 'disabled';

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
            {condition || 'Design condition not stated'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#8A8477]">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${BAND_STYLE[record.confidence_band] || BAND_STYLE.low}`}>
              {String(record.confidence_band || 'low').toUpperCase()} CONFIDENCE
            </span>
            <span>{STATUS_LABEL[record.status] || record.status}</span>
            <span>· Seen in {record.seen_projects || 0} project{record.seen_projects === 1 ? '' : 's'}</span>
            {formatDate(record.last_confirmed_at) && <span>· Last confirmed {formatDate(record.last_confirmed_at)}</span>}
          </div>
        </div>
        {record.admin_edited && (
          <span className="text-[11px] text-[#8A8477]">Edited by {record.admin_edited_by || 'admin'}</span>
        )}
      </div>

      {record.contested && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[#E8D9C7] bg-[#FBF7F1] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-[#B4652A]" />
          <div className="text-[11px] leading-relaxed text-[#6B4A2A]">
            A later answer disagrees with this rationale, so ADI has returned to asking. Confidence has been
            reduced until a person settles it.
            {record.contested_answer && (
              <div className="mt-1 italic">“{record.contested_answer}”</div>
            )}
          </div>
        </div>
      )}

      {editing ? (
        <div className="mt-3">
          <textarea
            value={wording}
            onChange={(event) => setWording(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-[#DCDBD6] p-2 text-xs text-[#3E4349] focus:border-[#213428] focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const done = await onAction?.('edit', { id: record.id, value: wording });
                if (done) setEditing(false);
              }}
              className="rounded-md border border-[#213428] bg-[#213428] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save wording
            </button>
            <button
              type="button"
              onClick={() => { setWording(record.canonical_meaning || ''); setEditing(false); }}
              className="rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-[#3E4349]">{record.canonical_meaning}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onAction?.('approve', { id: record.id })}
          className="inline-flex items-center gap-1 rounded-md border border-[#213428] bg-white px-3 py-1.5 text-xs font-semibold text-[#213428] disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349] disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onAction?.(disabled ? 'enable' : 'disable', { id: record.id })}
          className="inline-flex items-center gap-1 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349] disabled:opacity-50"
        >
          <Power className="h-3.5 w-3.5" /> {disabled ? 'Enable' : 'Disable'}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onAction?.('reset_confidence', { id: record.id })}
          className="inline-flex items-center gap-1 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349] disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reset confidence
        </button>

        {others.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <select
              value={mergeInto}
              onChange={(event) => setMergeInto(event.target.value)}
              className="rounded-md border border-[#D9D5CE] bg-white px-2 py-1.5 text-xs text-[#3E4349]"
            >
              <option value="">Merge a duplicate into this…</option>
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.condition_text || []).join(', ') || item.knowledge_key}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isBusy || !mergeInto}
              onClick={async () => {
                const done = await onAction?.('merge', {
                  id: mergeInto,
                  intoId: record.id,
                });
                if (done) setMergeInto('');
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349] disabled:opacity-50"
            >
              <GitMerge className="h-3.5 w-3.5" /> Merge
            </button>
          </span>
        )}

        {isBusy && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#8A8477]">
            <Check className="h-3.5 w-3.5" /> Applying…
          </span>
        )}
      </div>

      {(record.merged_from || []).length > 0 && (
        <div className="mt-2 text-[11px] text-[#8A8477]">
          Merged from {record.merged_from.join(', ')}
        </div>
      )}
    </div>
  );
}