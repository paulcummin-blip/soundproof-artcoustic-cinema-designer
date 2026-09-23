import React, { useState, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

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
export default function InlineRichTextEditor({ html, onSave, onDirty, onUnloadSave, editable = true, saveStatus = 'idle' }) {
  const editorRef = useRef(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const lastSavedHtml = useRef(html);
  const latestHtmlRef = useRef(html);
  const savingHtmlRef = useRef(html);
  const onSaveRef = useRef(onSave);
  const onDirtyRef = useRef(onDirty);
  const onUnloadSaveRef = useRef(onUnloadSave);
  onSaveRef.current = onSave;
  onDirtyRef.current = onDirty;
  onUnloadSaveRef.current = onUnloadSave;

  // Set initial content
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html || '';
      lastSavedHtml.current = html || '';
      latestHtmlRef.current = html || '';
    }
  }, [html]);

  // Update lastSavedHtml only when parent confirms save succeeded.
  // Uses savingHtmlRef (the content passed to onSave) so edits typed after
  // the save was initiated are still detected as unsaved on unmount.
  React.useEffect(() => {
    if (saveStatus === 'saved') {
      lastSavedHtml.current = savingHtmlRef.current;
    }
  }, [saveStatus]);

  const debounceTimer = useRef(null);

  const triggerSave = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const currentHtml = editorRef.current?.innerHTML || '';
      latestHtmlRef.current = currentHtml;
      if (currentHtml !== lastSavedHtml.current && onSaveRef.current) {
        savingHtmlRef.current = currentHtml;
        onSaveRef.current(currentHtml);
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
      const currentHtml = latestHtmlRef.current || '';
      if (currentHtml !== lastSavedHtml.current) {
        const fn = onUnloadSaveRef.current || onSaveRef.current;
        if (fn) fn(currentHtml);
      }
    };
  }, []);

  const handleInput = () => {
    latestHtmlRef.current = editorRef.current?.innerHTML || '';
    if (onDirtyRef.current) onDirtyRef.current();
    triggerSave();
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
    latestHtmlRef.current = editorRef.current?.innerHTML || '';
    if (onDirtyRef.current) onDirtyRef.current();
    triggerSave();
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
        className="proposal-editor-content outline-none prose prose-sm max-w-none focus:outline-none"
        style={{
          minHeight: '60px',
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          lineHeight: 1.7,
          color: '#1B1A1A',
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