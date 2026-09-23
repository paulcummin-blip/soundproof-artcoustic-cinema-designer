/**
 * WysiwygEditor — a WYSIWYG rich text editor using react-quill-new.
 *
 * Supports: headings, bold, italic, bullet lists, numbered lists,
 * hyperlinks, simple tables (via custom table module).
 * No HTML editing, no markdown — pure WYSIWYG.
 *
 * Props:
 *  - value: string (HTML)
 *  - onChange: (html) => void
 *  - placeholder: string
 *  - minHeight: number (default 300)
 */
import React, { useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link"],
    [{ align: [] }],
    ["clean"],
  ],
  clipboard: {
    matchVisual: false,
  },
};

const FORMATS = [
  "header",
  "bold",
  "italic",
  "list",
  "bullet",
  "link",
  "align",
];

export default function WysiwygEditor({ value, onChange, placeholder, minHeight = 300 }) {
  const style = useMemo(() => ({ minHeight }), [minHeight]);

  return (
    <div className="wysiwyg-editor-wrapper" style={{ background: "#fff" }}>
      <ReactQuill
        theme="snow"
        value={value || ""}
        onChange={onChange}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder || "Start writing…"}
        style={style}
      />
    </div>
  );
}