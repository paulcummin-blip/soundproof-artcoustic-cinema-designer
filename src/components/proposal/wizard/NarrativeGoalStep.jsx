import React from 'react';
import { Sparkles } from 'lucide-react';
import { NARRATIVE_GOALS } from '@/components/proposal/proposalSections';

/**
 * Step 4 — Choose Narrative Goal.
 * The goal gives the proposal its personality and is the first thing
 * GPT reads during generation.
 */
export default function NarrativeGoalStep({ selectedGoal, onSelect }) {
  return (
    <div>
      <p className="text-xs text-[#625143] mb-4">
        Choose the primary focus of this proposal. This helps shape the narrative, emphasis and
        recommendations throughout the document. You can change this later.
      </p>
      <div className="space-y-2">
        {NARRATIVE_GOALS.map((goal) => {
          const isSelected = selectedGoal === goal.value;
          return (
            <button
              key={goal.value}
              onClick={() => onSelect(goal.value)}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-[#213428] text-white border-[#213428]'
                  : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="font-semibold"
                    style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                  >
                    {goal.label}
                  </div>
                  <div
                    className={`text-sm ${isSelected ? 'text-white/70' : 'text-[#625143]'}`}
                  >
                    {goal.description}
                  </div>
                </div>
                {isSelected && <Sparkles className="w-5 h-5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}