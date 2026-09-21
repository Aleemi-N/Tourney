'use client';

import { useLinkStatus } from 'next/link';

export function OrganizerLinkPending({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent transition-opacity ${
        pending ? 'animate-spin opacity-70' : 'opacity-0'
      } ${className}`}
    />
  );
}
