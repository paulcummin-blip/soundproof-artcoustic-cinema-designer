// src/components/versions/ActiveVersionCard.jsx
//
// The prominent version identity block at the top of Room Designer: the design
// version currently being edited, in a card treatment rather than small inline
// text, with an explicit Current / Viewing saved version badge and
// click-to-rename.
//
// Presentation only: every value arrives as a prop and the only write it
// requests is a rename, through onRename.

import React, { useEffect, useRef, useState } from 'react';
import { Edit2 } from 'lucide-react';
import { VERSION_NAME_MAX_LENGTH, sanitiseVersionName } from '@/lib/versionAuthority';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#625143',
  border: '#DCDBD6',
  green: '#213428',
  accent: '#C9A227',
};

/** The badge shown beside the version name. */
export function versionStatusBadge(isCurrent) {
  return isCurrent
    ? { label: 'Current', background: '#E9EFE9', color: BRAND.green, border: '#C9D6CB' }
    : { label: 'Viewing saved version', background: '#FBF3E4', color: '#8A6A21', border: '#EBDCBB' };
}

export default function ActiveVersionCard({
  versionName = null,
  updatedAt = null,
  isCurrent = true,
  loading = false,
  disabled = false,
  autoEdit = false,
  onAutoEditHandled = null,
  onRename = null,
  compact = false,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const name = typeof versionName === 'string' ? versionName.trim() : '';
  const badge = versionStatusBadge(isCurrent);

  // A rename requested elsewhere (a new design option, or the Projects page)
  // opens this field directly, selected, so the designer can type a name.
  useEffect(() => {
    if (!autoEdit || !name) return;
    setValue(name);
    setEditing(true);
    onAutoEditHandled?.();
  }, [autoEdit, name, onAutoEditHandled]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = sanitiseVersionName(value);
    setEditing(false);
    if (next && next !== name) await onRename?.(next);
  };

  const startEditing = () => {
    if (disabled || loading || !name) return;
    setValue(name);
    setEditing(true);
  };

  const cardPadding = compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5';
  const nameFontSize = compact ? 15 : 20;
  const nameLineHeight = compact ? 1.2 : 1.15;

  return (
    <div
      className={`flex items-stretch gap-2 rounded-lg ${cardPadding}`}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BRAND.border}`,
        borderLeft: `4px solid ${isCurrent ? BRAND.green : BRAND.accent}`,
        boxShadow: compact ? 'none' : '0 1px 2px rgba(27, 26, 26, 0.06)',
      }}
    >
      <div className="min-w-0 flex-1">
        {!compact && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: BRAND.subtext,
            }}
          >
            Active Version
          </div>
        )}

        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={value}
            maxLength={VERSION_NAME_MAX_LENGTH}
            onChange={(event) => setValue(event.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(false);
              }
            }}
            className={`${compact ? '' : 'mt-1'} w-full rounded px-2 py-1 outline-none`}
            style={{
              border: `1px solid ${BRAND.green}`,
              color: BRAND.text,
              fontFamily: 'Didact Gothic, sans-serif',
              fontSize: nameFontSize,
              fontWeight: 700,
              background: '#FFFFFF',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            disabled={disabled || loading}
            className={`${compact ? '' : 'mt-0.5'} flex items-center gap-2 text-left disabled:cursor-default`}
            title={loading ? 'Loading version…' : 'Click to rename this version'}
          >
            <span
              style={{
                fontSize: nameFontSize,
                fontWeight: 700,
                lineHeight: nameLineHeight,
                color: loading ? BRAND.subtext : BRAND.text,
                fontFamily: 'Didact Gothic, sans-serif',
              }}
            >
              {loading ? 'Loading…' : (name || 'Untitled version')}
            </span>
            {!loading && name && <Edit2 className={compact ? 'w-3 h-3 opacity-40' : 'w-3.5 h-3.5 opacity-40'} />}
          </button>
        )}

        <div className={`${compact ? 'mt-0.5' : 'mt-1.5'} flex flex-wrap items-center gap-2`}>
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              background: badge.background,
              color: badge.color,
              border: `1px solid ${badge.border}`,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {badge.label}
          </span>
          {!compact && updatedAt && (
            <span style={{ fontSize: 11, color: BRAND.subtext }}>
              Updated {updatedAt}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}