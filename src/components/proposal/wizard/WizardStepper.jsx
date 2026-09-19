import React from 'react';

/**
 * Step indicator for the Create Proposal wizard.
 * Editorial style — restrained numerals and a thin progress line.
 */
export default function WizardStepper({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-3 mb-12">
      {steps.map((step, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs ${isCurrent || isComplete ? 'text-[#1B1A1A]' : 'text-[#C9C3B4]'}`}
                style={{ fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`text-[11px] uppercase tracking-[0.14em] ${
                  isCurrent ? 'text-[#1B1A1A]' : isComplete ? 'text-[#625143]' : 'text-[#C9C3B4]'
                }`}
                style={{ fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${isComplete ? 'bg-[#213428]' : 'bg-[#E5E1D8]'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}