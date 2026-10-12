import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListMusic } from "lucide-react";
import CurrentSpeakerDesignDialog from "@/components/roomdesigner/CurrentSpeakerDesignDialog";

/**
 * CurrentSpeakerDesignButton
 *
 * The header action that opens the read-only current speaker design panel for the
 * version on screen. Presentation only: the design facts are supplied by the
 * caller (Room Designer) and the project/version identity by the header, so the
 * button never reads or writes the design itself.
 */
export default function CurrentSpeakerDesignButton({
  speakerDesign = null,
  projectName = null,
  clientName = null,
  versionName = null,
  updatedDate = null,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="font-medium whitespace-nowrap"
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <ListMusic className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
        Current Speaker Design
      </Button>

      <CurrentSpeakerDesignDialog
        open={open}
        onOpenChange={setOpen}
        speakerDesign={speakerDesign}
        projectName={projectName}
        clientName={clientName}
        versionName={versionName}
        updatedDate={updatedDate}
      />
    </>
  );
}