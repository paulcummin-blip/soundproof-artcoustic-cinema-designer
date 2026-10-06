/**
 * ProposalEditFields
 * ------------------
 * The nine sections of a proposal's generated copy, editable as wording only.
 *
 * What the designer can change is the text. What they cannot touch is not on this
 * form at all: the claim IDs each section stands on are carried by the save, the
 * section IDs and their order are the contract's, and no fingerprint, snapshot ID
 * or piece of evidence is present as a value. Saving appends a new edit record and
 * never replaces the copy that is shown.
 *
 * Props:
 * - fields: the contract's sections, with their text and word limits
 * - busy: a save is in flight
 * - readOnly: the proposal is archived
 * - lastSave: the result of the most recent save
 * - revertTargets: the copies a revert may restore
 * - onSave(drafts): save the wording
 * - onRevert(editId|null): restore a copy
 */

import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';

const COLORS = {
  card: '#FFFFFF',
  border: '#DCDBD6',
  primary: '#213428',
  body: '#3E4349',
  muted: '#8A8477',
  review: '#8B4A2B',
  ready: '#213428',
};

const LABEL = {
  fontFamily: FONT_BODY,
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: COLORS.muted,
};

const BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  fontFamily: FONT_BODY,
  fontSize: 12,
  borderRadius: 6,
  cursor: 'pointer',
};

const countWords = (text) => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
};

const revertLabel = (target) => {
  if (!target.edit_id) return 'Original generated copy';
  const when = target.edited_at ? new Date(target.edited_at).toLocaleString() : '';
  return `Edit ${target.edit_number ?? ''}${when ? ` · ${when}` : ''}`.trim();
};

export default function ProposalEditFields({
  fields = [],
  busy = false,
  readOnly = false,
  lastSave = null,
  revertTargets = [],
  onSave,
  onRevert,
}) {
  const [drafts, setDrafts] = useState({});
  const [revertId, setRevertId] = useState('');

  useEffect(() => {
    const next = {};
    for (const field of fields) next[field.section] = field.text;
    setDrafts(next);
  }, [fields]);

  const dirty = useMemo(
    () => fields.some((field) => (drafts[field.section] ?? field.text) !== field.text),
    [fields, drafts],
  );

  return (
    <div style={{ background: COLORS.card, borderTop: `1px solid ${COLORS.border}`, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, color: COLORS.primary }}>
          Edit the copy
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            aria-label="Copy to restore"
            value={revertId}
            disabled={busy || readOnly}
            onChange={(event) => setRevertId(event.target.value)}
            style={{ ...LABEL, textTransform: 'none', letterSpacing: 0, padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#FFFFFF', color: COLORS.body }}
          >
            {revertTargets.map((target) => (
              <option key={target.edit_id || 'original'} value={target.edit_id || ''}>
                {revertLabel(target)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || readOnly}
            onClick={() => { onRevert?.(revertId || null); setRevertId(''); }}
            style={{ ...BUTTON, background: '#F8F8F7', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, opacity: busy || readOnly ? 0.5 : 1 }}
          >
            <RotateCcw style={{ width: 14, height: 14 }} />
            Revert
          </button>
          <button
            type="button"
            disabled={busy || readOnly || !dirty}
            onClick={() => onSave?.(drafts)}
            style={{ ...BUTTON, background: COLORS.primary, color: '#FFFFFF', border: `1px solid ${COLORS.primary}`, opacity: busy || readOnly || !dirty ? 0.5 : 1 }}
          >
            <Save style={{ width: 14, height: 14 }} />
            {busy ? 'Saving…' : 'Save as a new edit'}
          </button>
        </div>
      </div>

      <p style={{ margin: '8px 0 0', fontFamily: FONT_BODY, fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
        Saving adds an edit. Nothing is overwritten and no earlier copy is changed. Figures, performance levels,
        products and the evidence behind each section come from the reports and cannot be edited here.
      </p>

      {lastSave && (
        <p style={{
          margin: '10px 0 0',
          fontFamily: FONT_BODY,
          fontSize: 13,
          color: lastSave.ok && lastSave.valid ? COLORS.ready : COLORS.review,
          fontWeight: 600,
        }}
        >
          {!lastSave.ok && (lastSave.message || 'The edit could not be saved.')}
          {lastSave.ok && lastSave.valid && `Edit ${lastSave.editNumber ?? ''} saved and validated. Ready to issue.`}
          {lastSave.ok && !lastSave.valid && `Edit ${lastSave.editNumber ?? ''} saved. Needs review before it can be issued.`}
        </p>
      )}

      {lastSave?.ok && !lastSave.valid && lastSave.issues?.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontFamily: FONT_BODY, fontSize: 13, color: COLORS.review, lineHeight: 1.55 }}>
          {lastSave.issues.map((entry) => (
            <li key={`${entry.code}-${entry.section}-${entry.detail}`}>
              {entry.section ? `${entry.section}: ` : ''}
              {entry.detail || entry.code}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        {fields.map((field) => {
          const value = drafts[field.section] ?? '';
          const words = countWords(value);
          const over = words > field.word_limit;
          return (
            <div key={field.section}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <label htmlFor={`copy-${field.section}`} style={{ ...LABEL, letterSpacing: 0, textTransform: 'none', fontSize: 13, color: COLORS.primary }}>
                  {field.title}
                </label>
                <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: over ? COLORS.review : COLORS.muted }}>
                  {`${words} / ${field.word_limit} words`}
                </span>
              </div>
              <textarea
                id={`copy-${field.section}`}
                value={value}
                readOnly={readOnly}
                disabled={readOnly}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [field.section]: event.target.value }))}
                rows={4}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '10px 12px',
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: COLORS.body,
                  border: `1px solid ${over ? '#E4C9BC' : COLORS.border}`,
                  borderRadius: 6,
                  resize: 'vertical',
                  background: readOnly ? '#F8F8F7' : '#FFFFFF',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}