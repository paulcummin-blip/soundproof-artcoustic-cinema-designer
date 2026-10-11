/**
 * ImageComparisonControls
 * -----------------------
 * The designer's COMPARISON controls for ONE Library image.
 *
 *   Comparison image — marks this image as one option in a deliberate comparison
 *   Comparison group — which comparison set it belongs to (its page's title)
 *   Option label     — what this option is, shown under the image
 *   Message          — the designer's own words, shown above both options
 *   Display order    — which option reads first
 *
 * A comparison is the designer's stated intent: nothing here is inferred from a
 * caption or the image itself. The message is used exactly as written — where no
 * note exists anywhere for the group, the comparison page carries neutral text
 * instead. Presentation only: nothing here changes the stored file, the caption,
 * the scope or any engineering value.
 */

import React, { useEffect, useState } from 'react';
import {
  COMPARISON_MESSAGE_HELPER,
  DEFAULT_COMPARISON_GROUP,
  comparisonGroupNameOf,
  comparisonNoteOf,
  comparisonOptionLabelOf,
  comparisonOrderOf,
  isComparisonImage,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

const FONT = { fontFamily: 'Didact Gothic, sans-serif' };

const FIELD_CLASS = 'w-full text-[11px] text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded px-2 py-1 focus:outline-none focus:border-[#213428]';

export default function ImageComparisonControls({
  asset,
  // The comparison groups already named on this project, offered as a shortcut
  // so two images are put in the same group by name, not by retyping it.
  groupOptions = [],
  onChange,
}) {
  const enabled = isComparisonImage(asset);

  // Typed values are held locally and committed when the field is left, so a
  // save happens once per edit rather than once per keystroke.
  const [group, setGroup] = useState(comparisonGroupNameOf(asset) || '');
  const [label, setLabel] = useState(comparisonOptionLabelOf(asset) || '');
  const [note, setNote] = useState(comparisonNoteOf(asset) || '');
  const [order, setOrder] = useState(comparisonOrderOf(asset) ?? '');

  useEffect(() => {
    setGroup(comparisonGroupNameOf(asset) || '');
    setLabel(comparisonOptionLabelOf(asset) || '');
    setNote(comparisonNoteOf(asset) || '');
    setOrder(comparisonOrderOf(asset) ?? '');
  }, [asset?.id]);

  if (!asset) return null;

  const commit = (patch) => {
    if (typeof onChange === 'function') onChange(patch);
  };

  const toggleComparison = () => {
    // Turning the mark off never erases what was typed: it is a presentation
    // mark, so the group, the label, the message and the order all stay and are
    // read again the moment the image is marked once more.
    commit({ comparison_enabled: !enabled });
  };

  return (
    <div className="mt-3 border-t border-[#EFECE4] pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C]" style={FONT}>
            Comparison
          </span>
          <span className="block text-[10px] text-[#8A8477] mt-0.5" style={FONT}>
            {enabled
              ? 'Shown on its group’s own comparison page.'
              : 'One option in a comparison, e.g. two seating styles.'}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleComparison}
          aria-pressed={enabled}
          className={`text-[11px] px-2 py-1 rounded border transition-colors whitespace-nowrap ${
            enabled
              ? 'border-[#213428] text-[#213428] bg-[#F5F4F0]'
              : 'border-[#DCDBD6] text-[#8A8477] bg-white hover:text-[#625143]'
          }`}
          style={FONT}
        >
          {enabled ? 'Comparison image' : 'Mark as comparison'}
        </button>
      </div>

      {enabled && (
        <>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Comparison group
            </label>
            <input
              type="text"
              value={group || ''}
              list="comparison-group-options"
              placeholder="e.g. Seating Style Options"
              onChange={(event) => setGroup(event.target.value)}
              onBlur={() => commit({ comparison_group: (group || '').trim() || null })}
              className={FIELD_CLASS}
              style={FONT}
            />
            <datalist id="comparison-group-options">
              {groupOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
            <p className="text-[10px] text-[#8A8477] mt-1" style={FONT}>
              Images in the same group share one page. Blank uses “{DEFAULT_COMPARISON_GROUP}”.
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Option label
            </label>
            <input
              type="text"
              value={label || ''}
              placeholder="e.g. Relaxed sofa seating"
              onChange={(event) => setLabel(event.target.value)}
              onBlur={() => commit({ comparison_option_label: (label || '').trim() || null })}
              className={FIELD_CLASS}
              style={FONT}
            />
            <p className="text-[10px] text-[#8A8477] mt-1" style={FONT}>
              Shown under this image. Blank uses the image caption.
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Display order
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={order}
              placeholder="1"
              onChange={(event) => setOrder(event.target.value)}
              onBlur={() => commit({
                comparison_order: order === '' || order === null ? null : Number(order),
              })}
              className={FIELD_CLASS}
              style={FONT}
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Comparison message
            </label>
            <textarea
              value={note || ''}
              rows={4}
              placeholder="What should the client understand from this comparison?"
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => commit({ comparison_note: (note || '').trim() || null })}
              className={`${FIELD_CLASS} resize-y`}
              style={{ ...FONT, lineHeight: 1.5 }}
            />
            <p className="text-[10px] text-[#8A8477] mt-1" style={FONT}>
              {COMPARISON_MESSAGE_HELPER} It is printed as written.
            </p>
          </div>
        </>
      )}
    </div>
  );
}