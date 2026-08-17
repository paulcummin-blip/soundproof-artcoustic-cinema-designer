// Status panel shown inside NewProjectDialog when backend project creation
// returns a controlled non-success state.
//
// States handled:
//   OUT_OF_CAPACITY     — dedicated panel with Purchase Projects action
//   ACCOUNT_NOT_LINKED  — account setup issue, contact support
//   CREATION_FAILED     — generic retry message, no stack traces

import React from "react";
import { Button } from "@/components/ui/button";

export default function CreateProjectStatusPanel({ status, onPurchaseProjects, onRetry, onClose }) {
  if (status === 'OUT_OF_CAPACITY') {
    return (
      <div className="space-y-6 font-body py-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-[#1B1A1A]">
            You're out of Professional Projects
          </h3>
          <p className="text-sm text-[#3E4349]">
            Purchase additional projects to start a new professional design.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#DCDBD6] text-[#3E4349]"
          >
            Cancel
          </Button>
          <Button
            onClick={onPurchaseProjects}
            style={{ backgroundColor: "#1B1A1A", color: "#FFFFFF" }}
          >
            Purchase Projects
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'ACCOUNT_NOT_LINKED') {
    return (
      <div className="space-y-6 font-body py-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-[#1B1A1A]">Account not linked</h3>
          <p className="text-sm text-[#3E4349]">
            Your Sound Proof login has not yet been linked to a dealer account.
            Please contact Sound Proof support.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={onClose}
            style={{ backgroundColor: "#1B1A1A", color: "#FFFFFF" }}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  // CREATION_FAILED (default)
  return (
    <div className="space-y-6 font-body py-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-[#1B1A1A]">
          We couldn't create the project
        </h3>
        <p className="text-sm text-[#3E4349]">
          Please try again. If the problem continues, contact Sound Proof support.
        </p>
      </div>
      <div className="flex justify-center gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="border-[#DCDBD6] text-[#3E4349]"
        >
          Cancel
        </Button>
        <Button
          onClick={onRetry}
          style={{ backgroundColor: "#1B1A1A", color: "#FFFFFF" }}
        >
          Try Again
        </Button>
      </div>
    </div>
  );
}