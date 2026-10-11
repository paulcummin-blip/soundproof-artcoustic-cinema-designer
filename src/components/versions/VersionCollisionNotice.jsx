/**
 * VersionCollisionNotice
 * ----------------------
 * Shown wherever saved versions are listed, when two records occupy the same
 * version slot and could not be resolved automatically.
 *
 * Nothing has been discarded and nothing has been decided: both records are kept
 * and both are listed, and the designer is told the slot needs a look before it
 * is used. Presentation only.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

const BRAND = {
  border: '#E4D9BF',
  background: '#FDFAF3',
  label: '#7A5A10',
  text: '#625143',
};

export default function VersionCollisionNotice({ collisions = [], className = '' }) {
  const groups = Array.isArray(collisions) ? collisions.filter(Boolean) : [];
  if (groups.length === 0) return null;

  return (
    <div
      className={`px-3 py-2.5 text-xs rounded-md ${className}`}
      style={{ background: BRAND.background, border: `1px solid ${BRAND.border}` }}
      data-version-collision="true"
    >
      {groups.map((collision) => {
        const slot = Number.isFinite(Number(collision.versionNumber))
          ? `Version ${collision.versionNumber}`
          : 'A version slot';
        const count = (collision.versionIds || []).length;
        return (
          <div
            key={`${collision.projectId || 'project'}::${collision.versionNumber}`}
            className="flex items-start gap-2"
            data-version-collision-slot={collision.versionNumber}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: BRAND.label }} />
            <span style={{ color: BRAND.text }}>
              <strong style={{ color: BRAND.label }}>{slot}: {count} saved records share this slot.</strong>{' '}
              Both are kept and listed — please review them before using this version.
            </span>
          </div>
        );
      })}
    </div>
  );
}