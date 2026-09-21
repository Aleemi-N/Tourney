import React from 'react';
import { LucideProps } from 'lucide-react';

export function VolleyballIcon(props: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || 24}
      height={props.size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth || 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2c3.5 0 8.5 4.5 8.5 10S15.5 22 12 22" />
      <path d="M12 2C8.5 2 3.5 6.5 3.5 12S8.5 22 12 22" />
      <path d="M2 12h20" />
      <path d="M7 6l10 12" />
      <path d="M17 6L7 18" />
    </svg>
  );
}
