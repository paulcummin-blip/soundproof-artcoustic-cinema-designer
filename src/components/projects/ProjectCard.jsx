import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Ruler, Volume2, Trash2, ArrowRight, MoreVertical, BarChart4 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StatusBadge from "@/components/ui/StatusBadge";

function text(v, fb = "—") {
  if (v == null) return fb;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (typeof v.name === "string") return v.name;
    if (typeof v.model === "string") return v.model;
    try { return JSON.stringify(v); } catch { return fb; }
  }
  return fb;
}

function ProjectCard({ project, onDelete }) {
  if (!project) return null;
  if (typeof project !== 'object') return null;

  const getStatusLabel = () => {
    const raw = (project.status || project.project_status || "").toString().toLowerCase();
    if (raw === "prospective" || raw === "lead" || raw === "prospect") return "Prospective";
    if (raw === "on_hold") return "On Hold";
    if (raw === "live" || raw === "in_progress" || raw === "active" || (!raw && !project.completed)) return "In Progress";
    if (raw.includes("won") || raw === "completed") return "Won – Completed";
    if (raw.includes("lost")) return "Lost – Completed";
    return "Prospective";
  };

  const handleNavigate = (page) => {
    window.location.href = `/${page}?project=${project.id}`;
  };

  const handleDeleteClick = () => {
    const safeName = text(project?.name, "this project");
    const confirmed = window.confirm(`Are you sure you want to delete "${safeName}"? This action cannot be undone.`);
    if (confirmed && onDelete) onDelete(project.id);
  };

  const splConfig = project?.spl_config || {};
  const p12Level = splConfig.p12_level;
  const p12Mode = splConfig.p12_mode === 'anechoic' ? 'Recommended' : 'Minimum';

  return (
    <Card className="bg-white border-[#DCDBD6] flex flex-col hover:border-[#A3A3A3] transition-colors duration-300 relative overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-[#1B1A1A] truncate font-header">
              {text(project?.name, 'Untitled Project')}
            </CardTitle>
            <p className="text-sm text-[#3E4349] font-body">
              {text(project?.client_name, 'No client specified')}
            </p>
            <div className="mt-2">
              <StatusBadge value={getStatusLabel()} />
            </div>
          </div>
          {project.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-[#3E4349] hover:text-[#1B1A1A] flex-shrink-0" aria-label="Open project actions">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                <DropdownMenuItem onClick={() => handleNavigate('RoomDesigner')} className="cursor-pointer hover:!bg-[#F8F8F7]">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Open Designer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleNavigate('RP22Report')} className="cursor-pointer hover:!bg-[#F8F8F7]">
                  <BarChart4 className="w-4 h-4 mr-2" />
                  View RP22 Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer !text-red-500 hover:!bg-red-500/10">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-2 font-body">
        <div className="flex items-center gap-2 text-sm text-[#3E4349]">
          <Ruler className="w-4 h-4 text-[#3E4349]" />
          <span>Room: {text(project?.room_length, 'N/A')}m × {text(project?.room_width, 'N/A')}m</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#3E4349]">
          <Volume2 className="w-4 h-4 text-[#3E4349]" />
          <span>Config: {text(project?.dolby_config, 'N/A')}</span>
        </div>
        {p12Level && (
          <div className="flex items-center gap-2 text-sm text-[#3E4349]">
            <BarChart4 className="w-4 h-4 text-[#3E4349]" />
            <span>P12 — Level {p12Level} ({p12Mode})</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-[#F8F8F7] p-4 mt-auto border-t border-[#DCDBD6]">
      </CardFooter>
    </Card>
  );
}

export default React.memo(ProjectCard);