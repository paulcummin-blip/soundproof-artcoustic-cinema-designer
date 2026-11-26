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
  if (status === 'RECOVER' || status === 'STORAGE_UNAVAILABLE') {
    const recoverable = status === 'RECOVER';
    return (
      <div className="space-y-4 py-4">
        <h3 className="font-bold">{recoverable ? 'Recover your project' : 'Project creation paused'}</h3>
        <p>{recoverable
          ? 'Your last submission is awaiting confirmation. Recover it using the original project details. If recovery stays pending, contact Sound Proof support.'
          : 'Your creation details could not be verified in this session. Contact Sound Proof support before starting again.'}</p>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {recoverable && <Button onClick={onRetry}>Recover project</Button>}
      </div>
    );
  }
  if (status === 'OUT_OF_CAPACITY') {
    return (
      <div className="space-y-6 font-body py-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-[#1B1A1A]">
            You're out of Project Tokens
          </h3>
          <p className="text-sm text-[#3E4349]">
            Purchase additional Project Tokens to start a new cinema project.
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
            Purchase Project Tokens
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

  if (status === 'DEALER_NOT_LINKED') {
    return (
      <div className="space-y-6 font-body py-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-[#1B1A1A]">
            Dealer Account not resolved
          </h3>
          <p className="text-sm text-[#3E4349]">
            Unable to determine your Dealer Account. Please launch Sound Proof
            from your Partner Portal.
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