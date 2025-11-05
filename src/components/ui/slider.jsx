import React, { useCallback, useRef } from 'react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const Slider = React.forwardRef(
  ({ className, min = 0, max = 100, step = 1, value: valueProp, onValueChange, disabled, ...props }, ref) => {
    const trackRef = useRef(null);
    const value = Array.isArray(valueProp) ? valueProp[0] : min;

    const handleValueChange = useCallback(
      (clientX) => {
        if (!trackRef.current || disabled) return;
        const { left, width } = trackRef.current.getBoundingClientRect();
        if (width === 0) return;
        
        const percent = Math.max(0, Math.min(1, (clientX - left) / width));
        
        let newValue = min + percent * (max - min);
        
        if (step) {
          const numSteps = (newValue - min) / step;
          newValue = min + Math.round(numSteps) * step;
        }
        
        const finalValue = Math.max(min, Math.min(max, newValue));
        
        if (onValueChange) {
          onValueChange([finalValue]);
        }
      },
      [min, max, step, onValueChange, disabled]
    );

    const handleMouseMove = useCallback((e) => {
      e.preventDefault();
      handleValueChange(e.clientX);
    }, [handleValueChange]);
    
    const handleTouchMove = useCallback((e) => {
      e.preventDefault();
      handleValueChange(e.touches[0].clientX);
    }, [handleValueChange]);

    const handleInteractionEnd = useCallback(() => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleInteractionEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleInteractionEnd);
    }, [handleMouseMove, handleTouchMove]);

    const handleMouseDown = useCallback((e) => {
      if (disabled) return;
      e.preventDefault();
      handleValueChange(e.clientX);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleInteractionEnd);
    }, [handleValueChange, handleMouseMove, handleInteractionEnd, disabled]);
    
    const handleTouchStart = useCallback((e) => {
      if (disabled) return;
      handleValueChange(e.touches[0].clientX);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleInteractionEnd);
    }, [handleValueChange, handleTouchMove, handleInteractionEnd, disabled]);

    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={cn(
          "relative flex w-full touch-none select-none items-center py-2",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          className
        )}
        {...props}
      >
        <div className="slider-track relative h-1.5 w-full grow overflow-hidden rounded-full">
          <div className="slider-range absolute h-full" style={{ width: `${percentage}%` }} />
        </div>
        <div
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="slider-thumb absolute block h-4 w-4 rounded-full border-2 shadow"
          style={{ 
            left: `calc(${percentage}% - 8px)`,
          }}
        />
      </div>
    );
  }
);

Slider.displayName = "Slider";

export { Slider };