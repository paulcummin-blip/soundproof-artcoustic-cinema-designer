import React from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { formatDate } from "@/lib/commercial/accountAccessOverview";

const VISIBLE_LIMIT = 12;

/**
 * Projects stamped to this account through the existing ownership fields.
 * Props: row
 */
export default function AccountDrawerProjects({ row }) {
  const projects = [...(row?.projects || [])].sort((a, b) =>
    String(b?.updated_date || "").localeCompare(String(a?.updated_date || ""))
  );
  const visible = projects.slice(0, VISIBLE_LIMIT);

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7E5E1] px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#625143]" />
          <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Projects</h3>
        </div>
        <span className="rounded-full border border-[#DCDBD6] px-2.5 py-0.5 text-[11px] font-semibold text-[#3E4349]">
          {projects.length}
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="px-4 py-5 text-[13px] text-[#3E4349]">No projects yet.</div>
      ) : (
        <>
          <div className="divide-y divide-[#EDEBE7]">
            {visible.map((project) => (
              <div key={project.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#1B1A1A]">
                    {project.name || "Untitled project"}
                  </div>
                  <div className="truncate text-[11px] text-[#625143]">
                    {project.client_name ? `${project.client_name} · ` : ""}
                    {project.project_status || project.lifecycle_status || "—"} · updated{" "}
                    {formatDate(project.updated_date)}
                  </div>
                </div>
                <a
                  href={`/RoomDesigner?project=${encodeURIComponent(project.id)}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#DCDBD6] px-2.5 py-1.5 text-[11px] font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50"
                >
                  Open
                  <ChevronRight className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
          {projects.length > visible.length && (
            <div className="border-t border-[#EDEBE7] px-4 py-2.5 text-[11px] text-[#625143]">
              Showing {visible.length} of {projects.length} projects.
            </div>
          )}
        </>
      )}
    </section>
  );
}