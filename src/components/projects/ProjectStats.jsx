import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Layers3,
  Users,
  Ruler,
  Volume2
} from "lucide-react";

export default function ProjectStats({ projects = [], loading }) {
  const totalProjects = (projects || []).length;
  const uniqueClients = new Set((projects || []).map(p => p.client_name).filter(Boolean)).size;

  const statCards = [
    { title: "Total Projects", value: totalProjects, icon: Layers3 },
    { title: "Active Clients", value: uniqueClients, icon: Users },
    { title: "Avg. Room Size", value: "35m²", icon: Ruler },
    { title: "Most Common Config", value: "7.1.4", icon: Volume2 },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i} className="bg-white border-[#DCDBD6] animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 bg-[#EBEBEB] rounded w-2/3"></div>
              <div className="h-5 w-5 bg-[#EBEBEB] rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-[#EBEBEB] rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map(stat => (
        <Card key={stat.title} className="bg-white border-[#DCDBD6]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#3E4349] font-body">{stat.title}</CardTitle>
            <stat.icon className="w-4 h-4 text-[#3E4349]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1B1A1A]">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}