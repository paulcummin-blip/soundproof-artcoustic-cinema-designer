import React from "react";

export default function DiagnosticSection({ title, children }) {
  return <section className="mt-3"><div className="mb-1 font-semibold text-slate-900">{title}</div>{children}</section>;
}