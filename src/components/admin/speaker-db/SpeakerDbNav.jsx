// src/components/admin/speaker-db/SpeakerDbNav.jsx
//
// Horizontal sub-navigation for the Speaker Capability Database admin section.
// Tabs: Dashboard, Manufacturers, Products, Validation, Change History, Settings.

import React from "react";
import { LayoutDashboard, Building2, Package, AlertCircle, History, Settings } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  green: "#213428",
  activeBg: "#E8E6E0",
};

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "manufacturers", label: "Manufacturers", icon: Building2 },
  { key: "products", label: "Products", icon: Package },
  { key: "validation", label: "Validation", icon: AlertCircle },
  { key: "history", label: "Change History", icon: History },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function SpeakerDbNav({ active, onChange }) {
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b"
      style={{ borderColor: BRAND.border, marginBottom: 24 }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              color: isActive ? BRAND.green : BRAND.subtext,
              borderBottom: isActive ? `2px solid ${BRAND.green}` : "2px solid transparent",
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}