import React, { useId } from 'react';

/** A shaded volleyball illustration in the app icon's style (white panels, indigo seams). Decorative only. */
export function VolleyballBall({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-shade`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#a5b4fc" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${id}-shade)`} />
      <g fill="none" stroke="#3730a3" strokeWidth="3" strokeLinecap="round">
        <circle cx="50" cy="50" r="47" />
        <path d="M50 50 C 40 30, 42 14, 56 4" />
        <path d="M50 50 C 70 46, 86 52, 94 66" />
        <path d="M50 50 C 44 70, 28 84, 12 82" />
        <path d="M38 22 C 24 32, 14 48, 4 52" />
        <path d="M72 30 C 84 22, 92 28, 96 38" />
        <path d="M60 74 C 62 86, 56 94, 46 97" />
      </g>
    </svg>
  );
}
