import React from "react";

export default function Panel({ title, children, bordered = true, padded = true, className = "" }) {
  return (
    <div className={`rounded-xl shadow-sm bg-white ${bordered ? 'border border-[#DCDBD6]' : ''} ${padded ? 'p-6' : ''} ${className} relative overflow-hidden`}>
      {title && (
        <h3 className="text-xl uppercase tracking-wider font-header mb-6 text-[#1B1A1A]">
          {title}
        </h3>
      )}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}