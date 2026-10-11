/**
 * ComparisonMessagePrompt
 * -----------------------
 * The one question proposal creation asks when the project's Library holds
 * comparison images: "What are we comparing, and what is the message?"
 *
 * It is asked only for a comparison group that states no message of its own, so
 * a designer who has already written the note is never asked again — and it is
 * never a blocker: the brief stays optional and the proposal generates either
 * way. Where no message exists anywhere, the comparison page falls back to the
 * neutral text, which is stated here so nothing is a surprise on the page.
 *
 * The message is saved onto the group's own images (its comparison note), which
 * is the single authority the printed pack and the editor preview both read. It
 * is presentation only: no engineering value, no result and no saved report is
 * involved.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  COMPARISON_MESSAGE_HELPER,
  COMPARISON_MESSAGE_QUESTION,
  NEUTRAL_COMPARISON_MESSAGE,
  comparisonGroupsOf,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

const FONT = { fontFamily: 'Didact Gothic, sans-serif' };

export default function ComparisonMessagePrompt({ projectId }) {
  const [groups, setGroups] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingGroup, setSavingGroup] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setGroups([]);
      return;
    }
    try {
      const assets = await base44.entities.ProposalAsset.filter({ project_id: projectId });
      // Only a group with no note of its own is asked about: a message already
      // written in the Library is used exactly as it stands.
      setGroups(comparisonGroupsOf(assets || []).filter((group) => group.message_source !== 'image_note'));
    } catch (err) {
      console.error('Failed to read the project comparison images:', err);
      setGroups([]);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (group) => {
    const message = (drafts[group.id] || '').trim();
    if (!message || group.images.length === 0) return;
    setSavingGroup(group.id);
    setError(null);
    try {
      await Promise.all(group.images.map((image) => base44.entities.ProposalAsset.update(image.id, {
        comparison_note: message,
      })));
      await load();
    } catch (err) {
      console.error('Failed to save the comparison message:', err);
      setError('The comparison message could not be saved. You can add it later in Project Library.');
    } finally {
      setSavingGroup(null);
    }
  };

  if (!projectId || groups.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-[#DCDBD6] bg-[#FBFBF9] p-4">
      <h4 className="text-sm font-semibold text-[#1B1A1A]" style={FONT}>
        {COMPARISON_MESSAGE_QUESTION}
      </h4>
      <p className="text-[11px] text-[#625143] leading-relaxed mt-1">
        {COMPARISON_MESSAGE_HELPER} This message is printed above both options on the
        comparison page. It is optional — without a message the page states that these are
        two visual options for the same design.
      </p>

      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]" style={FONT}>
              {group.name}
            </div>
            <p className="text-[11px] text-[#8A8477] mt-1" style={FONT}>
              {group.images.length} image{group.images.length === 1 ? '' : 's'} on this page
            </p>
            <textarea
              value={drafts[group.id] ?? ''}
              rows={5}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [group.id]: event.target.value }))}
              placeholder={NEUTRAL_COMPARISON_MESSAGE}
              className="mt-2 w-full p-3 text-sm text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave(group)}
                disabled={!(drafts[group.id] || '').trim() || savingGroup === group.id}
                className="px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-40 transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {savingGroup === group.id ? 'Saving…' : 'Use this message'}
              </button>
              <span className="text-[11px] text-[#8A8477]" style={FONT}>
                Skip to continue without one.
              </span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[11px] text-[#7A2E10]">{error}</p>
      )}
    </div>
  );
}