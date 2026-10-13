/**
 * LibraryArchiveSection
 * ---------------------
 * The Project Library's archived documents, behind ONE collapsible heading.
 *
 * Current files stay on the page exactly as they are. Everything the design has
 * moved past — a design version's archived reports, a proposal's older issued
 * PDFs — is kept here instead, so the Library's first reading is what the project
 * holds now and its history is one click away rather than in the way.
 *
 * Rules this component holds:
 *   - Nothing archived means nothing rendered: there is no empty archive heading.
 *   - Collapsed by default. The heading and its chevron both toggle it, with a
 *     short, quiet transition, and the state is remembered for the session.
 *   - The heading states how many documents are inside, so a folded section is
 *     never a mystery.
 *   - The rows inside are the caller's own: the same rows, the same layout, the
 *     same information and the same actions. Nothing here classifies a document,
 *     opens it, downloads it or changes it. The only grouping stated is by
 *     document type — Project Reports / Proposals — and only when the archive
 *     actually holds more than one kind.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { ARCHIVE_SECTION_LABEL } from './librarySourceStatus';
import { useLibraryArchiveExpansion } from './useLibraryArchiveExpansion';

/**
 * @param {Object} props
 * @param {Array<{key: string, label: string, entries: Array<Object>}>} props.groups
 *   the archived documents, already grouped (see groupArchivedDocuments).
 * @param {(entry: Object) => React.ReactNode} props.renderEntry
 *   renders one archived document with the caller's own row.
 * @param {string|null} [props.helper] the sentence shown above the rows.
 * @param {string} [props.className] spacing for the section's own place.
 */
export default function LibraryArchiveSection({
  groups = [],
  renderEntry,
  helper = null,
  className = '',
}) {
  const { expanded, toggle } = useLibraryArchiveExpansion();

  const visibleGroups = (Array.isArray(groups) ? groups : [])
    .filter((group) => (group?.entries?.length || 0) > 0);
  const count = visibleGroups.reduce((total, group) => total + group.entries.length, 0);

  // An archive with nothing in it is not shown at all.
  if (count === 0 || typeof renderEntry !== 'function') return null;

  // A single kind states no sub-heading: the rows are already what the heading says.
  const showGroupHeadings = visibleGroups.length > 1;

  return (
    <section className={className} data-library-archive="true" data-archive-count={count}>
      {/* Collapsed without re-mounting the rows: the panel animates on its own
          grid row, and the hidden content leaves the tab order with it. */}
      <style>{`
        .library-archive__panel {
          display: grid; grid-template-rows: 0fr;
          transition: grid-template-rows 220ms ease;
        }
        .library-archive__panel.is-expanded { grid-template-rows: 1fr; }
        .library-archive__inner {
          min-height: 0; overflow: hidden;
          opacity: 0; visibility: hidden;
          transition: opacity 160ms ease, visibility 0s linear 220ms;
        }
        .library-archive__panel.is-expanded .library-archive__inner {
          opacity: 1; visibility: visible;
          transition: opacity 200ms ease 60ms, visibility 0s;
        }
      `}</style>

      <h3 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="group flex w-full items-center justify-between gap-4 border-t border-[#E5E1D8] pt-3 pb-2 text-left"
        >
          <span
            className="text-[13px] uppercase tracking-[0.16em] text-[#625143] transition-colors group-hover:text-[#3E4349]"
            style={{ fontFamily: REPORT_FONT_BODY }}
          >
            {ARCHIVE_SECTION_LABEL} ({count})
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[#8A8477] transition-transform duration-200 group-hover:text-[#3E4349] ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>

      <div
        className={`library-archive__panel${expanded ? ' is-expanded' : ''}`}
        data-archive-expanded={expanded ? 'true' : 'false'}
      >
        <div className="library-archive__inner">
          {helper && (
            <p
              className="text-xs text-[#8A8477] mb-3 mt-1 max-w-3xl leading-relaxed"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              {helper}
            </p>
          )}

          {visibleGroups.map((group) => (
            <div key={group.key} className="pt-1">
              {showGroupHeadings && (
                <div
                  className="text-[11px] uppercase tracking-[0.14em] text-[#A79E8C] mb-2"
                  style={{ fontFamily: REPORT_FONT_BODY }}
                >
                  {group.label}
                </div>
              )}
              {group.entries.map((entry, index) => (
                <React.Fragment key={entry?.record?.id || entry?.id || `${group.key}-${index}`}>
                  {renderEntry(entry)}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}