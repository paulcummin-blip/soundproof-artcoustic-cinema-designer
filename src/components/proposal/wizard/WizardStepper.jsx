import React from 'react';
import { Check } from 'lucide-react';

/**
 * Step indicator for the Create Proposal wizard.
 * Shows the current step and completed steps.
 */
export default function WizardStepper({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors ${
                  isComplete
                    ? 'bg-[#213428] text-white border-[#213428]'
                    : isCurrent
                      ? 'bg-white text-[#213428] border-[#213428]'
                      : 'bg-white text-[#625143] border-[#DCDBD6]'
                }`}
              >
                {isComplete ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-sm font-medium ${
                  isCurrent ? 'text-[#1B1A1A]' : isComplete ? 'text-[#3E4349]' : 'text-[#625143]'
                }`}
                style={{ fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${isComplete ? 'bg-[#213428]' : 'bg-[#DCDBD6]'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}