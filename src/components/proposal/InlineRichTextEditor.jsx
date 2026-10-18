import React, { useState, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

/**
 * Inline rich text editor for proposal sections.
 * Uses contentEditable for WYSIWYG editing — no iframe, no preview mode.
 * The document IS the editor.
 *
 * Features:
 * - Inline editing (click to edit, type directly)
 * - Floating toolbar on selection (bold, italic, headings, lists, links)
 * - Auto-save (debounced, calls onSave with HTML)
 * - "Saving.../Saved" indicator
 *
 * Props:
 * - html: string (initial HTML content)
 * - onSave: (html) => Promise<void>
 * - editable: boolean (default true)
 * - saveStatus: 'idle' | 'saving' | 'saved' | 'failed' | 'unsaved'
 */
export default function InlineRichTextEditor({
  html,
  onSave,
  onDirty,
  onUnloadSave,
  editable = true,
  saveStatus = 'idle',
  // The two halves of a highlighted ADI edit. The editor asks for the highlighted
  // wording to be improved, puts the improved wording back in its place itself, and
  // then hands the editor's own copy over to be saved — so nothing outside the
  // highlighted text is ever touched by anything but this editor.
  onImproveSelection = null,
  onApplyAdiSelection = null,
}) {
  const editorRef = useRef(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [adiBusy, setAdiBusy] = useState(false);
  const latestDraftRef = useRef({ html: html || '', editedAt: null });
  const dirtySinceSaveRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onDirtyRef = useRef(onDirty);
  const onUnloadSaveRef = useRef(onUnloadSave);
  const onImproveSelectionRef = useRef(onImproveSelection);
  const onApplyAdiSelectionRef = useRef(onApplyAdiSelection);
  onSaveRef.current = onSave;
  onDirtyRef.current = onDirty;
  onUnloadSaveRef.current = onUnloadSave;
  onImproveSelectionRef.current = onImproveSelection;
  onApplyAdiSelectionRef.current = onApplyAdiSelection;

  // Set initial content
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html || '';
      latestDraftRef.current = { html: html || '', editedAt: null };
      dirtySinceSaveRef.current = false;
    }
  }, [html]);

  const debounceTimer = useRef(null);

  const triggerSave = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const draft = latestDraftRef.current;
      if (!dirtySinceSaveRef.current || !draft.editedAt || !onSaveRef.current) return;

      try {
        const outcome = await onSaveRef.current(draft.html, draft.editedAt);
        const latest = latestDraftRef.current;
        if (
          outcome?.ok &&
          latest.html === draft.html &&
          latest.editedAt === draft.editedAt
        ) {
          dirtySinceSaveRef.current = false;
        }
      } catch (error) {
        // Parent owns the visible failed/dirty state.
      }
    }, 1500);
  }, []);

  // Flush unsaved content on unmount via keepalive (survives page teardown).
  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      const draft = latestDraftRef.current;
      if (dirtySinceSaveRef.current && draft.editedAt) {
        const fn = onUnloadSaveRef.current || onSaveRef.current;
        if (fn) fn(draft.html, draft.editedAt);
      }
    };
  }, []);

  // ── IMPROVE THE HIGHLIGHTED TEXT (ADI) ──
  // Only the highlighted span is improved. The range is held before the call and
  // restored after it, because the provider takes long enough for the browser to
  // drop the selection; the improved wording is then inserted in that one place, and
  // the copy around it is not rewritten. The server proves exactly that against the
  // stored copy before it saves anything, so an edit that changed anything else is
  // refused with the copy as it was.
  const runAdiSelection = useCallback(async () => {
    if (adiBusy || !onImproveSelectionRef.current || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0).cloneRange();
    const selectionText = range.toString();
    if (!selectionText.trim()) return;

    setAdiBusy(true);
    try {
      const outcome = await onImproveSelectionRef.current(selectionText);
      const improved = outcome?.improved_text;
      // A refusal keeps the copy that is already here: nothing is inserted, and the
      // designer reads why in the notice beside the toolbar.
      if (!improved || outcome?.kept_original === true || outcome?.applied === true) return;

      const restored = window.getSelection();
      restored.removeAllRanges();
      restored.addRange(range);
      document.execCommand('insertText', false, improved);

      const body = editorRef.current?.innerHTML || '';
      if (onApplyAdiSelectionRef.current) {
        await onApplyAdiSelectionRef.current({
          selectionText,
          improvedSelection: improved,
          body,
        });
      }
    } finally {
      setAdiBusy(false);
      setShowToolbar(false);
    }
  }, [adiBusy]);

  const markDirty = () => {
    const currentHtml = editorRef.current?.innerHTML || '';
    const previousTime = Date.parse(latestDraftRef.current.editedAt || '');
    const nextTime = Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0);
    const editedAt = new Date(nextTime).toISOString();

    latestDraftRef.current = { html: currentHtml, editedAt };
    dirtySinceSaveRef.current = true;
    if (onDirtyRef.current) onDirtyRef.current(currentHtml, editedAt);
    triggerSave();
  };

  const handleInput = () => {
    markDirty();
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current) {
      setShowToolbar(false);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setShowToolbar(false);
      return;
    }
    setToolbarPos({
      top: rect.top - editorRect.top - 44,
      left: rect.left - editorRect.left + rect.width / 2,
    });
    setShowToolbar(true);
  };

  const exec = (command, value) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    markDirty();
  };

  const toolbarBtn = (label, command, value) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        exec(command, value);
      }}
      className="px-2 py-1 text-xs text-white/90 hover:bg-white/20 rounded transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="relative">
      {/* Floating toolbar */}
      {showToolbar && editable && (
        <div
          className="absolute z-50 flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg"
          style={{
            top: `${toolbarPos.top}px`,
            left: `${toolbarPos.left}px`,
            transform: 'translateX(-50%)',
            backgroundColor: '#1B1A1A',
          }}
        >
          {toolbarBtn('B', 'bold')}
          {toolbarBtn('I', 'italic')}
          {toolbarBtn('U', 'underline')}
          <div className="w-px h-4 bg-white/20" />
          {toolbarBtn('H2', 'formatBlock', '<h2>')}
          {toolbarBtn('H3', 'formatBlock', '<h3>')}
          <div className="w-px h-4 bg-white/20" />
          {toolbarBtn('• List', 'insertUnorderedList')}
          {toolbarBtn('1. List', 'insertOrderedList')}
          <div className="w-px h-4 bg-white/20" />
          {toolbarBtn('Link', 'createLink')}
          {/* The editorial action for a sentence or a paragraph: the highlighted
              text alone is improved, in place, and nothing else is touched. */}
          {onImproveSelection && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  runAdiSelection();
                }}
                disabled={adiBusy}
                title="Improve the highlighted wording with ADI"
                data-adi-improve="selection"
                className="px-2 py-1 text-xs text-white/90 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
              >
                {adiBusy ? 'ADI is improving…' : 'Improve with ADI'}
              </button>
            </>
          )}
        </div>
      )}

      {/* The editable document */}
      <div
        ref={editorRef}
        contentEditable={editable}
        suppressContentEditableWarning
        onInput={handleInput}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}
        onBlur={() => setTimeout(() => setShowToolbar(false), 200)}
        className="proposal-editor-content proposal-body outline-none prose prose-sm max-w-none focus:outline-none"
        style={{
          minHeight: '60px',
          // Proposal body type — Didact Gothic, Century Gothic fallback.
          // Never a serif: the document must not fall back to a mismatched face.
          ...proposalRoleStyle('body'),
          color: '#1B1A1A',
          // A quiet outline marks manual edit mode. Inset, so nothing reflows.
          ...(editable ? { boxShadow: 'inset 0 0 0 1px #DCDBD6', borderRadius: 6 } : {}),
        }}
      />

      {/* Save indicator */}
      <div className="flex items-center gap-1 mt-1 text-xs text-[#625143] h-4">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </>
        )}
        {saveStatus === 'saved' && <span className="text-green-700">✓ Saved</span>}
        {saveStatus === 'failed' && (
          <span className="text-red-600">⚠ Save failed — your edit was not saved. Try editing again.</span>
        )}
        {saveStatus === 'unsaved' && (
          <span className="text-amber-700">● Unsaved changes</span>
        )}
      </div>
    </div>
  );
}