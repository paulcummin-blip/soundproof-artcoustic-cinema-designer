import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Label } from '@/components/ui/label';

const MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

/**
 * Rich text editor field using react-quill (snow theme).
 * Used for marketing copy and legal text that needs formatting.
 *
 * Props:
 * - label: string
 * - value: string (HTML)
 * - onChange: (html) => void
 */
export default function RichTextField({ label, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[#3E4349]">{label}</Label>
      <div className="rounded-lg overflow-hidden border border-[#DCDBD6] [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-[#DCDBD6] [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[100px] [&_.ql-editor]:text-sm">
        <ReactQuill
          theme="snow"
          value={value || ''}
          onChange={onChange}
          modules={MODULES}
        />
      </div>
    </div>
  );
}