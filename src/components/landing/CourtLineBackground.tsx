import React from 'react';

export function CourtLineBackground({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className || ''}`}>
      <svg
        className="absolute w-[200%] h-[200%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] text-text-primary"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M 50,0 L 50,100" stroke="currentColor" strokeWidth="0.2" />
        <path d="M 0,50 L 100,50" stroke="currentColor" strokeWidth="0.2" />
        <path d="M 0,33 L 100,33" stroke="currentColor" strokeWidth="0.1" strokeDasharray="1,1" />
        <path d="M 0,67 L 100,67" stroke="currentColor" strokeWidth="0.1" strokeDasharray="1,1" />
        <rect x="10" y="10" width="80" height="80" stroke="currentColor" strokeWidth="0.2" />
      </svg>
    </div>
  );
}
