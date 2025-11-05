
import React from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch"; // Import the Switch component
import { useAppState } from "@/lib/state/app-state"; // Assuming the path to your app state hook

export default function OverlaysMenu() {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  // Integrate useAppState hook to manage overlay states
  const { overlays, setOverlays, enableFrontWides, setEnableFrontWides } = useAppState();

  React.useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Overlays"
      >
        <Layers className="w-4 h-4" />
        <span className="ml-2 hidden md:inline">Overlays</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          {/* New functional Front Wides toggle section */}
          <div className="p-3 border-b">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm">Front Wides</span>
              <Switch
                checked={enableFrontWides}
                onCheckedChange={setEnableFrontWides}
              />
            </div>
          </div>

          {/* Existing "preview only" section */}
          <div className="p-3 border-b">
            <p className="text-sm font-medium">Other Overlays (preview only)</p>
            <p className="text-xs text-muted-foreground">
              These toggles are non-functional for now.
            </p>
          </div>
          <ul className="p-2 text-sm">
            {[
              "Sightlines",
              "Surround Angle Gaps (Param 5)",
              "Off‑Axis Coverage",
              "Bass Heatmap",
              "Room Elements",
            ].map((label) => (
              <li
                key={label}
                className="flex items-center gap-2 px-2 py-2 rounded hover:bg-accent cursor-default"
              >
                <input
                  type="checkbox"
                  disabled
                  className="accent-foreground cursor-not-allowed"
                />
                <span className="text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 border-t">
            <span className="text-xs text-muted-foreground">
              Coming soon: more live toggles.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
